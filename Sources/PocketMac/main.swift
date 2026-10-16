// Pocket Mac：一键创建适合 iPhone 竖屏的虚拟屏并设为主屏，退出手机模式时还原
// 调试：PocketMac --selftest                         两档预设各进入/退出一次并校验，退出码 0 = 通过
//      PocketMac --stress <轮数>                      随机进入/切换预设/退出，结束后校验已还原
//      PocketMac --enter <large|standard> [--exit-after <秒>]   启动即进入手机模式（配合 kill -9 测试）
import AppKit
import Carbon.HIToolbox

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let screen = VirtualScreen()
    let exitPanel = ExitButtonPanel()
    var statusBar: StatusBarController?
    private var hotKeyRef: EventHotKeyRef?
    private var terminating = false

    func applicationDidFinishLaunching(_ note: Notification) {
        Log.rotateIfNeeded()
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "dev"
        Log.info("启动 Pocket Mac \(version)，CGVirtualDisplay 可用：\(VirtualScreen.available)")
        if quitIfAlreadyRunning() { return }

        screen.onChange = { [weak self] in self?.stateChanged() }
        exitPanel.onExit = { [weak self] in self?.screen.exit() }
        statusBar = StatusBarController(screen: screen)
        installHotkey()
        observeSystem()
        DisplayConfig.logAll("启动时")
        screen.recoverIfNeeded()

        let args = CommandLine.arguments
        if args.contains("--selftest") {
            Task { exit(await Diagnostics.selfTest(screen) ? 0 : 1) }
        } else if let i = args.firstIndex(of: "--stress"), i + 1 < args.count, let n = Int(args[i + 1]) {
            Task { exit(await Diagnostics.stress(screen, rounds: n) ? 0 : 1) }
        } else if let i = args.firstIndex(of: "--enter"), i + 1 < args.count, let p = Preset.named(args[i + 1]) {
            screen.enter(p)
            if let j = args.firstIndex(of: "--exit-after"), j + 1 < args.count, let s = Double(args[j + 1]) {
                DispatchQueue.main.asyncAfter(deadline: .now() + s) { [weak self] in self?.screen.exit() }
            }
        }
    }

    private func stateChanged() {
        statusBar?.refresh()
        if let id = screen.activeDisplayID { exitPanel.show(on: id) } else { exitPanel.hide() }
    }

    /// 两个实例会各建一块虚拟屏、争抢主屏，只保留先启动的那个（仅 .app 运行时检查）
    private func quitIfAlreadyRunning() -> Bool {
        guard let id = Bundle.main.bundleIdentifier else { return false }
        let others = NSRunningApplication.runningApplications(withBundleIdentifier: id)
            .filter { $0.processIdentifier != getpid() }
        guard !others.isEmpty else { return false }
        Log.info("已有 Pocket Mac 在运行（pid \(others.map(\.processIdentifier))），本实例退出")
        exit(0)
    }

    /// 退出前异步收尾（移除虚拟屏、还原布局）。
    /// .terminateLater 期间主队列的延时任务不会执行，收尾会卡住；所以先取消本次退出，收尾完成后再真正退出。
    /// 最多等 12 秒；超时直接退出也安全：虚拟屏随进程消失，布局由下次启动按记录还原。
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if terminating { return .terminateNow }
        terminating = true
        var done = false
        let finish = {
            guard !done else { return }
            done = true
            Log.info("退出 Pocket Mac")
            NSApp.terminate(nil)
        }
        screen.shutdown(completion: finish)
        DispatchQueue.main.asyncAfter(deadline: .now() + 12, execute: finish)
        return .terminateCancel
    }

    /// 全局快捷键 ⌃⌥⌘9：退出手机模式（Carbon 热键，无需任何权限）
    private func installHotkey() {
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let me = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(GetApplicationEventTarget(), { _, _, ctx in
            guard let ctx else { return noErr }
            let delegate = Unmanaged<AppDelegate>.fromOpaque(ctx).takeUnretainedValue()
            DispatchQueue.main.async {
                Log.info("快捷键：退出手机模式")
                delegate.screen.exit()
            }
            return noErr
        }, 1, &spec, me, nil)
        let id = EventHotKeyID(signature: OSType(0x504D_4143), id: 1)  // 'PMAC'
        let err = RegisterEventHotKey(UInt32(kVK_ANSI_9), UInt32(cmdKey | optionKey | controlKey), id,
                                      GetApplicationEventTarget(), 0, &hotKeyRef)
        Log.info(err == noErr ? "已注册快捷键 ⌃⌥⌘9（退出手机模式）" : "⚠️ 快捷键 ⌃⌥⌘9 注册失败 \(err)")
    }

    /// 第一阶段只记录睡眠/唤醒与屏幕变化前后的显示器状态，为第二阶段的处理收集依据
    private func observeSystem() {
        let ws = NSWorkspace.shared.notificationCenter
        ws.addObserver(forName: NSWorkspace.willSleepNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                Log.info("系统即将睡眠，当前：\(self?.screen.statusText ?? "")")
                DisplayConfig.logAll("睡眠前")
            }
        }
        ws.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                Log.info("系统已唤醒，当前：\(self?.screen.statusText ?? "")")
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) { DisplayConfig.logAll("唤醒 3 秒后") }
            }
        }
        NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification,
                                               object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.stateChanged() }
        }
    }
}

let app = NSApplication.shared
let delegate = MainActor.assumeIsolated { AppDelegate() }  // 顶层代码运行在主线程
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
