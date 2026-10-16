// 手机模式期间浮在虚拟屏上的「退出手机模式」按钮：
// 虚拟屏逻辑宽度窄，菜单栏图标可能被系统隐藏，这里保证从手机上总有退出入口。
// 点一次变为「再点一次确认」，3 秒内再点才退出，防止误触。可拖动。
import AppKit

final class ExitButtonPanel: NSObject {
    var onExit: (() -> Void)?

    private var panel: NSPanel?
    private var button: NSButton?
    private var confirmTimer: Timer?
    private static let normalTitle = "退出手机模式"
    private static let confirmTitle = "再点一次确认退出"

    func show(on displayID: CGDirectDisplayID) {
        guard let screen = NSScreen.screens.first(where: {
            ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == displayID
        }) else { return }
        let panel = self.panel ?? makePanel()
        // 首次显示或不在虚拟屏上（屏幕变化后）时放到右上角；否则保留用户拖动后的位置
        if !panel.isVisible || !screen.frame.intersects(panel.frame) {
            let vf = screen.visibleFrame
            panel.setFrameOrigin(NSPoint(x: vf.maxX - panel.frame.width - 12, y: vf.maxY - panel.frame.height - 12))
        }
        if !panel.isVisible { panel.orderFrontRegardless() }
    }

    func hide() {
        resetConfirm()
        panel?.orderOut(nil)
    }

    private func makePanel() -> NSPanel {
        let button = NSButton(title: ExitButtonPanel.normalTitle, target: self, action: #selector(clicked))
        button.bezelStyle = .rounded
        button.controlSize = .large
        button.font = .systemFont(ofSize: 14, weight: .semibold)
        button.sizeToFit()
        let width = max(button.frame.width, 170) + 20
        let height = button.frame.height + 16

        let content = NSVisualEffectView(frame: NSRect(x: 0, y: 0, width: width, height: height))
        content.material = .hudWindow
        content.state = .active
        content.wantsLayer = true
        content.layer?.cornerRadius = 10
        button.frame = NSRect(x: 10, y: 8, width: width - 20, height: button.frame.height)
        content.addSubview(button)

        let panel = NSPanel(contentRect: content.frame, styleMask: [.borderless, .nonactivatingPanel],
                            backing: .buffered, defer: false)
        panel.contentView = content
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        panel.hidesOnDeactivate = false
        panel.isFloatingPanel = true
        panel.becomesKeyOnlyIfNeeded = true
        panel.isMovableByWindowBackground = true
        self.panel = panel
        self.button = button
        return panel
    }

    @objc private func clicked() {
        if confirmTimer != nil {
            resetConfirm()
            Log.info("浮窗按钮：确认退出手机模式")
            onExit?()
            return
        }
        button?.title = ExitButtonPanel.confirmTitle
        confirmTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: false) { [weak self] _ in self?.resetConfirm() }
    }

    private func resetConfirm() {
        confirmTimer?.invalidate()
        confirmTimer = nil
        button?.title = ExitButtonPanel.normalTitle
    }
}
