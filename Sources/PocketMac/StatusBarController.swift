// 菜单栏：状态 / 进入手机模式（大字、标准）或 退出手机模式 / 打开日志 / 退出
import AppKit

final class StatusBarController: NSObject, NSMenuDelegate {
    private let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    private let screen: VirtualScreen

    init(screen: VirtualScreen) {
        self.screen = screen
        super.init()
        let menu = NSMenu()
        menu.delegate = self
        menu.autoenablesItems = false
        item.menu = menu
        refresh()
    }

    func refresh() {
        let on = screen.phase.isOn
        let image = NSImage(systemSymbolName: on ? "iphone.circle.fill" : "iphone", accessibilityDescription: "Pocket Mac")
        image?.isTemplate = true
        item.button?.image = image
        item.button?.toolTip = "Pocket Mac：\(screen.statusText)"
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        let status = NSMenuItem(title: screen.statusText, action: nil, keyEquivalent: "")
        status.isEnabled = false
        menu.addItem(status)
        menu.addItem(.separator())

        switch screen.phase {
        case .idle, .failed:
            for p in Preset.all {
                let it = action("进入手机模式 · \(p.title)（\(p.sizeLabel)）", #selector(enter(_:)))
                it.representedObject = p.id
                menu.addItem(it)
            }
        case .entering, .active:
            if screen.phase == .active {
                let title = screen.wide ? "切回\(screen.current?.title ?? "")" : "临时宽屏（\(Preset.wide.sizeLabel)，放得下保存/打开面板）"
                menu.addItem(action(title, #selector(toggleWide)))
            }
            let it = action("退出手机模式", #selector(exitPhoneMode), key: "9")
            it.keyEquivalentModifierMask = [.control, .option, .command]
            menu.addItem(it)
        case .exiting:
            let it = NSMenuItem(title: "正在退出手机模式…", action: nil, keyEquivalent: "")
            it.isEnabled = false
            menu.addItem(it)
        case .wedged:
            break
        }

        menu.addItem(.separator())
        menu.addItem(action("打开日志", #selector(openLog)))
        menu.addItem(action("退出 Pocket Mac", #selector(quit), key: "q"))
    }

    private func action(_ title: String, _ sel: Selector, key: String = "") -> NSMenuItem {
        let it = NSMenuItem(title: title, action: sel, keyEquivalent: key)
        it.target = self
        return it
    }

    @objc private func enter(_ sender: NSMenuItem) {
        guard let id = sender.representedObject as? String, let p = Preset.named(id) else { return }
        Log.info("菜单：进入手机模式 \(p.title)")
        screen.enter(p)
    }

    @objc private func toggleWide() {
        Log.info("菜单：\(screen.wide ? "切回预设" : "临时宽屏")")
        screen.setWide(!screen.wide)
    }

    @objc private func exitPhoneMode() {
        Log.info("菜单：退出手机模式")
        screen.exit()
    }

    @objc private func openLog() { NSWorkspace.shared.open(Log.url) }

    @objc private func quit() { NSApp.terminate(nil) }
}
