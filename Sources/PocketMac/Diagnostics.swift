// 自测与压测：在真实显示系统上跑进入/退出流程，并校验结束后回到进入前的状态
import CoreGraphics
import Foundation

@MainActor
enum Diagnostics {
    private struct Baseline {
        let main = CGMainDisplayID()
        let origins = DisplayConfig.snapshotOrigins()
    }

    private static func sleep(_ seconds: Double) async {
        try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    }

    private static func wait(_ timeout: Double, _ cond: () -> Bool) async -> Bool {
        let start = Date()
        while !cond() {
            if Date().timeIntervalSince(start) > timeout { return false }
            await sleep(0.25)
        }
        return true
    }

    private static func check(_ ok: Bool, _ what: String, _ results: inout [String]) {
        results.append("\(ok ? "✅" : "❌") \(what)")
    }

    /// 退出后应回到基线：无本程序虚拟屏、主屏不变、布局不变
    private static func verifyRestored(_ base: Baseline, _ screen: VirtualScreen, _ results: inout [String]) async {
        check(await wait(30) { screen.phase == .idle }, "回到未开启状态（\(screen.statusText)）", &results)
        // 本进程的显示器列表可能有缓存，再给 5 秒
        let gone = await wait(5) { !DisplayConfig.onlineDisplays().contains(where: DisplayConfig.isOurs) }
        check(gone, "虚拟屏已消失", &results)
        check(await wait(5) { CGMainDisplayID() == base.main }, "主屏恢复为 #\(base.main)", &results)
        check(DisplayConfig.snapshotOrigins() == base.origins, "显示器布局与进入前一致", &results)
        check(!FileManager.default.fileExists(atPath: VirtualScreen.markerURL.path), "布局记录已清除", &results)
    }

    static func selfTest(_ screen: VirtualScreen) async -> Bool {
        _ = await wait(10) { screen.phase == .idle }
        let base = Baseline()
        var results: [String] = []
        for p in Preset.all {
            Log.info("—— 自测：进入 \(p.title)")
            let t0 = Date()
            screen.enter(p)
            let ok = await wait(15) { screen.phase == .active }
            check(ok, "\(p.title)：进入手机模式（\(String(format: "%.1f", Date().timeIntervalSince(t0))) 秒）", &results)
            if ok, let id = screen.activeDisplayID {
                check(DisplayConfig.isMain(id), "\(p.title)：虚拟屏是主屏", &results)
                let m = CGDisplayCopyDisplayMode(id)
                check(m?.width == p.pointWidth && m?.height == p.pointHeight,
                      "\(p.title)：逻辑尺寸 \(m.map { "\($0.width)×\($0.height)" } ?? "?") = \(p.sizeLabel)", &results)
                check(m?.pixelWidth == p.pixelWidth && m?.pixelHeight == p.pixelHeight,
                      "\(p.title)：像素尺寸 \(m.map { "\($0.pixelWidth)×\($0.pixelHeight)" } ?? "?")（HiDPI 2x）", &results)
                DisplayConfig.logAll("\(p.title) 已开启")
                await sleep(3)
            }
            Log.info("—— 自测：退出 \(p.title)")
            let t1 = Date()
            screen.exit()
            await verifyRestored(base, screen, &results)
            Log.info("退出耗时 \(String(format: "%.1f", Date().timeIntervalSince(t1))) 秒")
        }
        return report("自测", results)
    }

    static func stress(_ screen: VirtualScreen, rounds: Int) async -> Bool {
        _ = await wait(10) { screen.phase == .idle }
        let base = Baseline()
        for r in 1...rounds {
            let p = Preset.all.randomElement()!
            Log.info("—— 压测 \(r)/\(rounds)：进入 \(p.title)")
            screen.enter(p)
            await sleep(Double.random(in: 0.3...5))
            if Bool.random() {
                let q = Preset.all.randomElement()!
                Log.info("—— 压测 \(r)/\(rounds)：切换为 \(q.title)")
                screen.enter(q)
                await sleep(Double.random(in: 0.3...4))
            }
            Log.info("—— 压测 \(r)/\(rounds)：退出")
            screen.exit()
            await sleep(Double.random(in: 0.3...5))
            if screen.phase == .wedged { break }
        }
        screen.exit()
        var results: [String] = []
        check(screen.phase != .wedged, "未进入保护状态", &results)
        check(screen.failureCount == 0, "失败次数 \(screen.failureCount)", &results)
        await verifyRestored(base, screen, &results)
        return report("压测 \(rounds) 轮", results)
    }

    private static func report(_ title: String, _ results: [String]) -> Bool {
        let passed = !results.contains { $0.hasPrefix("❌") }
        Log.info("—— \(title)结果：\(passed ? "PASS" : "FAIL")")
        results.forEach { Log.info($0) }
        DisplayConfig.logAll("\(title)结束")
        return passed
    }
}
