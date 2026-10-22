// 显示器查询与配置事务（源自 UUyc companion 的 PhysicalDisplays.swift / DisplayManager.swift，MIT）
import CoreGraphics
import Foundation

enum DisplayConfig {
    /// 同步执行一次显示器配置事务。GUI 进程中不可在主线程调用（会与自身重配置通知死锁）
    @discardableResult
    static func apply(_ body: (CGDisplayConfigRef?) -> Void) -> CGError {
        var cfg: CGDisplayConfigRef?
        guard CGBeginDisplayConfiguration(&cfg) == .success else { return .failure }
        body(cfg)
        let err = CGCompleteDisplayConfiguration(cfg, .forSession)
        if err != .success { CGCancelDisplayConfiguration(cfg) }
        return err
    }

    static func onlineDisplays() -> [CGDirectDisplayID] {
        var count: UInt32 = 0
        CGGetOnlineDisplayList(0, nil, &count)
        var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
        CGGetOnlineDisplayList(count, &ids, &count)
        return Array(ids.prefix(Int(count)))
    }

    /// 本程序创建的虚拟屏（按 vendorID 识别）
    static func isOurs(_ id: CGDirectDisplayID) -> Bool { CGDisplayVendorNumber(id) == VirtualScreen.vendorID }

    static func isMain(_ id: CGDirectDisplayID) -> Bool { CGDisplayIsMain(id) != 0 || CGDisplayBounds(id).origin == .zero }

    /// 除本程序虚拟屏之外的各屏原点
    static func snapshotOrigins() -> [CGDirectDisplayID: CGPoint] {
        Dictionary(uniqueKeysWithValues: onlineDisplays().filter { !isOurs($0) }.map { ($0, CGDisplayBounds($0).origin) })
    }

    /// 当前模式是否为预设的 HiDPI 模式
    static func hasMode(_ id: CGDirectDisplayID, _ p: Preset) -> Bool {
        guard let m = CGDisplayCopyDisplayMode(id) else { return false }
        return m.width == p.pointWidth && m.height == p.pointHeight && m.pixelWidth == p.pixelWidth && m.pixelHeight == p.pixelHeight
    }

    private static func hiDPIMode(_ id: CGDirectDisplayID, _ p: Preset) -> CGDisplayMode? {
        let opts = [kCGDisplayShowDuplicateLowResolutionModes: kCFBooleanTrue] as CFDictionary
        let modes = (CGDisplayCopyAllDisplayModes(id, opts) as? [CGDisplayMode]) ?? []
        return modes.first {
            $0.width == p.pointWidth && $0.height == p.pointHeight && $0.pixelWidth == p.pixelWidth && $0.pixelHeight == p.pixelHeight
        }
    }

    /// 只切换模式（临时宽屏 ↔ 预设）。须在后台队列调用
    static func setMode(_ id: CGDirectDisplayID, _ p: Preset) -> CGError {
        guard let mode = hiDPIMode(id, p) else {
            Log.info("⚠️ 找不到 \(p.sizeLabel)pt HiDPI 模式")
            return .failure
        }
        return apply { cfg in CGConfigureDisplayWithDisplayMode(cfg, id, mode, nil) }
    }

    /// 一次事务完成：切到预设的 HiDPI 模式（setMode 时）+ 把 target 移到 (0,0) 成为主屏，其余屏整体平移保持相对布局。
    /// 实测（macOS 26.5）：竖屏宽度低于约 1440px 时系统默认选 1x 原生模式（画面发糊），需要显式切到 HiDPI。
    /// 须在后台队列调用
    static func activate(_ target: CGDirectDisplayID, _ p: Preset, setMode: Bool) -> CGError {
        let mode = setMode ? hiDPIMode(target, p) : nil
        if setMode {
            Log.info(mode == nil ? "⚠️ 找不到 \(p.sizeLabel)pt HiDPI 模式" : "切换到 HiDPI 模式 \(p.sizeLabel)pt / \(p.pixelWidth)×\(p.pixelHeight)px")
        }
        let online = onlineDisplays()
        let t = CGDisplayBounds(target).origin
        return apply { cfg in
            if let mode { CGConfigureDisplayWithDisplayMode(cfg, target, mode, nil) }
            for d in online {
                let o = CGDisplayBounds(d).origin
                CGConfigureDisplayOrigin(cfg, d, Int32(o.x - t.x), Int32(o.y - t.y))
            }
        }
    }

    /// 还原原点；已一致（例如只有一块物理屏且已回到 (0,0)）时不做事务。须在后台队列调用
    static func restoreOrigins(_ origins: [CGDirectDisplayID: CGPoint]) -> CGError {
        let online = Set(onlineDisplays())
        let targets = origins.filter { online.contains($0.key) && CGDisplayBounds($0.key).origin != $0.value }
        guard !targets.isEmpty else {
            Log.info("✅ 显示器布局与进入前一致，无需还原")
            return .success
        }
        let err = apply { cfg in
            for (id, o) in targets { CGConfigureDisplayOrigin(cfg, id, Int32(o.x), Int32(o.y)) }
        }
        Log.info(err == .success ? "✅ 已还原显示器布局" : "⚠️ 还原布局 CGError=\(err.rawValue)")
        return err
    }

    static func describe(_ id: CGDirectDisplayID) -> String {
        let b = CGDisplayBounds(id)
        let mode = CGDisplayCopyDisplayMode(id)
        let size = mode.map { "\($0.width)×\($0.height)pt / \($0.pixelWidth)×\($0.pixelHeight)px" } ?? "\(Int(b.width))×\(Int(b.height))pt"
        let tags = [isOurs(id) ? "Pocket Mac" : nil, CGDisplayIsMain(id) != 0 ? "主屏" : nil].compactMap { $0 }
        return "#\(id) \(size) @(\(Int(b.origin.x)),\(Int(b.origin.y)))\(tags.isEmpty ? "" : " [\(tags.joined(separator: ","))]")"
    }

    static func logAll(_ reason: String) {
        Log.info("显示器（\(reason)）：" + onlineDisplays().map(describe).joined(separator: "；"))
    }
}
