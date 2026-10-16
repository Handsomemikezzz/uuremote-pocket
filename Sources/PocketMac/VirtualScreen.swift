// 手机模式虚拟屏：目标状态 + 逐步收敛（执行器源自 UUyc companion 的 DisplayManager，MIT）
// 调用方只声明「应该是什么样」（desired），执行器一次只做一步拓扑变化，每步之后等待系统稳定再做下一步。
// 沿用上游实测得出的规则：
//   - 虚拟屏尚未上线或存活不足 2.5 秒就释放，会让 WindowServer 显示配置卡死 → 释放前必须已上线且存活 ≥ 2.5 秒
//   - applySettings 失败的屏不能立即释放（曾触发 WindowServer 崩溃）→ 放入 broken，稳定后再释放
//   - 事务超时（CGError 1014 / cannotComplete）→ 进入保护状态，不再做任何拓扑变化
//   - 虚拟屏只给一个模式且创建后不改；GUI 主线程不能调 CGCompleteDisplayConfiguration（放 cgQueue）
// 相对上游的修改：不禁用物理屏；建屏前记录布局；上线超时、设主屏失败都视为失败并清理回干净状态。
// 虚拟屏生命周期绑定本进程：进程退出或被杀时系统自动移除虚拟屏，主屏回到物理屏。
import CGVirtualDisplayBridge
import CoreGraphics
import Foundation

final class VirtualScreen {
    enum Phase: Equatable {
        case idle, entering, active, exiting, failed(String), wedged

        var isOn: Bool { self == .entering || self == .active }
    }

    static let vendorID: UInt32 = 0x504D  // "PM"，与 UUyc companion（0x5555）区分
    static let minLifetime: TimeInterval = 2.5
    static let available = NSClassFromString("CGVirtualDisplay") != nil

    /// 每走一步（或状态可能变化）后回调
    var onChange: (() -> Void)?

    // 目标状态
    private var desired: Preset?
    private var shutdownCompletion: (() -> Void)?

    // 实际状态
    private var vd: CGVirtualDisplay?
    private(set) var current: Preset?
    private var mainSet = false
    /// 配置失败或上线失败的虚拟屏，稳定后再释放
    private var broken: [CGVirtualDisplay] = []
    /// 进入前各屏原点，用于还原（同时写盘，供异常退出后的下次启动还原）
    private var savedOrigins: [CGDirectDisplayID: CGPoint] = [:]
    private var failure: String?
    private(set) var failureCount = 0

    // 执行器
    private var busy = false
    /// 启动时先把上次残留的布局还原，期间忽略目标
    private var recovering = false
    private var waitOnlineTries = 0
    private var mainTries = 0
    private var bornAt: [CGDirectDisplayID: Date] = [:]
    private var releaseWaitStart: Date?
    private(set) var wedged = false
    private var lastPhase: Phase = .idle
    private let cgQueue = DispatchQueue(label: "pocketmac.display-config")

    static let markerURL: URL = {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PocketMac", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("session.json")
    }()

    // MARK: - 对外状态

    var phase: Phase {
        if wedged { return .wedged }
        if let failure { return .failed(failure) }
        if let desired, !recovering {
            return (vd != nil && mainSet && current == desired) ? .active : .entering
        }
        return (vd != nil || !broken.isEmpty || !savedOrigins.isEmpty || recovering) ? .exiting : .idle
    }

    /// 手机模式已就绪时的虚拟屏
    var activeDisplayID: CGDirectDisplayID? { phase == .active ? vd?.displayID : nil }

    /// 清理是否已完成（失败状态下用于提示）
    var isClean: Bool { vd == nil && broken.isEmpty && savedOrigins.isEmpty && !recovering }

    var statusText: String {
        switch phase {
        case .idle: return "手机模式未开启"
        case .entering: return "正在进入手机模式（\(desired?.title ?? "")）…"
        case .active: return "手机模式已开启 · \(current?.title ?? "") \(current?.sizeLabel ?? "")"
        case .exiting: return "正在退出手机模式…"
        case .failed(let why): return "进入失败：\(why)\(isClean ? "（已恢复原桌面）" : "，正在清理…")"
        case .wedged: return "⛔️ 显示服务无响应：请退出 Pocket Mac，必要时注销"
        }
    }

    // MARK: - 对外接口：只改目标状态

    func enter(_ preset: Preset) {
        guard VirtualScreen.available else {
            failure = "本系统不支持虚拟屏（CGVirtualDisplay 不可用）"
            notify()
            return
        }
        failure = nil
        desired = preset
        kick()
    }

    func exit() {
        desired = nil
        kick()
    }

    /// App 退出前：撤销一切，完成后回调
    func shutdown(completion: @escaping () -> Void) {
        desired = nil
        shutdownCompletion = completion
        kick()
    }

    /// 启动时：读回上次未收尾的布局记录并还原
    func recoverIfNeeded() {
        if let data = try? Data(contentsOf: VirtualScreen.markerURL),
           let dict = try? JSONSerialization.jsonObject(with: data) as? [String: [Double]] {
            for (k, v) in dict where v.count == 2 {
                if let id = UInt32(k) { savedOrigins[id] = CGPoint(x: v[0], y: v[1]) }
            }
        }
        if !savedOrigins.isEmpty {
            Log.info("发现上次未收尾的手机模式记录，先还原显示器布局")
            recovering = true
        }
        kick()
    }

    // MARK: - 执行器

    private func kick() {
        guard !busy else { return notify() }
        step()
    }

    private func step() {
        advance()
        notify()
    }

    private func notify() {
        let p = phase
        if p != lastPhase {
            Log.info("状态：\(statusText)")
            lastPhase = p
        }
        onChange?()
    }

    /// 完成一步后等待 settle 秒再评估下一步
    private func finish(settle: TimeInterval) {
        busy = true
        DispatchQueue.main.asyncAfter(deadline: .now() + settle) { [weak self] in
            guard let self else { return }
            self.busy = false
            self.step()
        }
    }

    /// 在 cgQueue 执行配置事务，回到主线程后进入稳定等待；事务超时则进入保护状态
    private func runCG(settle: TimeInterval, _ work: @escaping () -> CGError) {
        busy = true
        cgQueue.async {
            let err = work()
            DispatchQueue.main.async {
                if err == .cannotComplete || err.rawValue == 1014 { self.enterWedged(err) }
                self.finish(settle: settle)
            }
        }
    }

    private func enterWedged(_ err: CGError) {
        guard !wedged else { return }
        wedged = true
        Log.info("⛔️ WindowServer 显示配置无响应（CGError=\(err.rawValue)），停止一切显示操作；退出 Pocket Mac 后虚拟屏会随进程消失，必要时注销")
    }

    private func fail(_ why: String) {
        failureCount += 1
        failure = why
        desired = nil
        Log.info("❌ \(why)，撤销手机模式")
    }

    /// 释放前确认每块屏已上线且存活足够久；最多等 8 秒
    private func readyToRelease(_ displays: [CGVirtualDisplay]) -> Bool {
        let online = Set(DisplayConfig.onlineDisplays())
        let young = displays.contains { d in
            !online.contains(d.displayID) || Date().timeIntervalSince(bornAt[d.displayID] ?? .distantPast) < VirtualScreen.minLifetime
        }
        guard young else { releaseWaitStart = nil; return true }
        let start = releaseWaitStart ?? Date()
        releaseWaitStart = start
        if Date().timeIntervalSince(start) > 8 { releaseWaitStart = nil; return true }
        return false
    }

    /// 释放当前虚拟屏（满足存活条件时），返回 true 表示本步已有动作
    private func releaseCurrent() -> Bool {
        guard let d = vd else { return false }
        guard readyToRelease([d]) else { finish(settle: 0.5); return true }
        var all = [d]
        vd = nil
        current = nil
        mainSet = false
        release(&all)
        finish(settle: 1.5)
        return true
    }

    private func advance() {
        guard !busy else { return }
        if wedged {
            // 保护状态：不做任何拓扑变化；退出时直接放行（虚拟屏随进程消失）
            if let done = shutdownCompletion { shutdownCompletion = nil; done() }
            return
        }

        // 1. 失败的屏：稳定后释放
        if !broken.isEmpty {
            guard readyToRelease(broken) else { return finish(settle: 0.5) }
            release(&broken)
            return finish(settle: 1.5)
        }

        guard let want = recovering ? nil : desired else {
            // 目标=无：释放虚拟屏 → 还原布局
            if releaseCurrent() { return }
            if !savedOrigins.isEmpty {
                let origins = savedOrigins
                savedOrigins = [:]
                try? FileManager.default.removeItem(at: VirtualScreen.markerURL)
                return runCG(settle: 0.5) { DisplayConfig.restoreOrigins(origins) }
            }
            if recovering {
                recovering = false
                Log.info("残留状态已处理")
                if desired != nil { return advance() }
            }
            if let done = shutdownCompletion {
                shutdownCompletion = nil
                done()
            }
            return
        }

        // 目标=某预设的虚拟屏
        if vd != nil, current != want {
            // 切换预设：先释放旧屏（受存活时间保护），再建新屏
            if releaseCurrent() { return }
        }

        if vd == nil {
            if savedOrigins.isEmpty {
                // 建屏之前记录布局，避免记录到已被新屏打乱的布局
                savedOrigins = DisplayConfig.snapshotOrigins()
                writeMarker()
            }
            waitOnlineTries = 0
            mainTries = 0
            if !createDisplay(want) { fail("创建虚拟屏失败") }
            return finish(settle: 1.0)
        }

        if !mainSet, let d = vd {
            let id = d.displayID
            guard DisplayConfig.onlineDisplays().contains(id) else {
                waitOnlineTries += 1
                if waitOnlineTries > 20 {
                    vd = nil
                    current = nil
                    broken.append(d)
                    fail("虚拟屏 5 秒内没有上线")
                    return advance()
                }
                return finish(settle: 0.25)
            }
            let modeOK = DisplayConfig.hasMode(id, want)
            if DisplayConfig.isMain(id) && modeOK {
                mainSet = true
                Log.info("✅ 虚拟屏已就绪：\(DisplayConfig.describe(id))")
                return
            }
            guard mainTries < 3 else {
                if DisplayConfig.isMain(id) {
                    // 主屏已到位，只是没能切到 HiDPI：可用但会偏糊，不撤销
                    mainSet = true
                    Log.info("⚠️ 未能切换到 HiDPI 模式，继续使用：\(DisplayConfig.describe(id))")
                    return
                }
                fail("无法把虚拟屏设为主屏")
                return advance()
            }
            mainTries += 1
            return runCG(settle: 0.8) {
                let err = DisplayConfig.activate(id, want, setMode: !modeOK)
                if err != .success { Log.info("⚠️ 设主屏/切模式 CGError=\(err.rawValue)") }
                return err
            }
        }
    }

    // MARK: - 单步操作

    private func createDisplay(_ p: Preset) -> Bool {
        let desc = CGVirtualDisplayDescriptor()
        desc.name = "Pocket Mac"  // 显示在 UU 的显示屏列表、系统显示器设置中
        desc.maxPixelsWide = UInt32(p.pixelWidth)
        desc.maxPixelsHigh = UInt32(p.pixelHeight)
        desc.sizeInMillimeters = CGSize(width: Double(p.pixelWidth) / 220 * 25.4, height: Double(p.pixelHeight) / 220 * 25.4)
        desc.vendorID = VirtualScreen.vendorID
        desc.productID = 0x0001
        // 每次随机序列号：与残留虚拟屏同序列号时 CGVirtualDisplay 会返回 nil
        desc.serialNum = UInt32.random(in: 1...0xFFFF_FFF0)

        let created: CGVirtualDisplay? = autoreleasepool { CGVirtualDisplay(descriptor: desc) }
        guard let display = created else {
            Log.info("❌ CGVirtualDisplay 返回 nil")
            return false
        }
        bornAt[display.displayID] = Date()
        let settings = CGVirtualDisplaySettings()
        settings.hiDPI = true
        settings.modes = [CGVirtualDisplayMode(width: UInt(p.pointWidth), height: UInt(p.pointHeight), refreshRate: 60)]
        guard autoreleasepool(invoking: { display.apply(settings) }) else {
            Log.info("❌ 虚拟屏 applySettings 失败，稳定后释放")
            broken.append(display)
            return false
        }
        vd = display
        current = p
        Log.info("✅ 已创建虚拟屏 #\(display.displayID) \(p.title) \(p.sizeLabel)pt / \(p.pixelWidth)×\(p.pixelHeight)px")
        return true
    }

    private func release(_ displays: inout [CGVirtualDisplay]) {
        guard !displays.isEmpty else { return }
        let ids = displays.map { "#\($0.displayID)" }.joined(separator: " ")
        autoreleasepool { displays.removeAll() }
        Log.info("✅ 已移除虚拟屏 \(ids)")
    }

    private func writeMarker() {
        let dict = Dictionary(uniqueKeysWithValues: savedOrigins.map { ("\($0.key)", [$0.value.x, $0.value.y]) })
        try? JSONSerialization.data(withJSONObject: dict).write(to: VirtualScreen.markerURL, options: .atomic)
    }
}
