// 手机模式期间虚拟屏上的退出入口（类似 iOS「辅助触控」小圆点）：
// 虚拟屏逻辑宽度窄，菜单栏图标可能被系统隐藏，这里保证从手机上总有退出入口；
// 平时只是贴边的 32pt 半透明圆点，尽量不挡应用。
// 点圆点 → 展开一个胶囊：左半蓝色「临时宽屏 / 切回」，右半红色「退出」（4 秒无操作自动收起）→ 再点才生效，防止误触。
// 临时宽屏用于放下保存/打开面板这类比竖屏更宽的系统窗口。
// 拖动圆点可换位置，松手吸附到最近的左/右边缘，位置会记住。
import AppKit

final class ExitButtonPanel: NSObject {
    var onExit: (() -> Void)?
    var onToggleWide: (() -> Void)?

    private enum Side: String { case left, right }
    private static let handleSize: CGFloat = 32
    private static let gap: CGFloat = 6
    private static let margin: CGFloat = 4
    private static let collapseAfter: TimeInterval = 4
    private static let sideKey = "exitHandle.side"
    private static let yKey = "exitHandle.yRatio"

    private var panel: NSPanel?
    private var handle: HandleView?
    private var confirm: NSButton?
    private var wideButton: NSButton?
    /// 装着「临时宽屏」和「退出」两半的胶囊
    private var capsule: NSView?
    private var divider: NSView?
    private var screen: NSScreen?
    private var laidOutScreenFrame: NSRect?
    private var wideTitle = ""
    private var expanded = false
    private var wasExpandedOnPress = false
    private var collapseTimer: Timer?

    private var side: Side {
        get { Side(rawValue: UserDefaults.standard.string(forKey: Self.sideKey) ?? "") ?? .left }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: Self.sideKey) }
    }

    /// 圆点中心在可用区域中的纵向比例（0 = 底，1 = 顶）
    private var yRatio: CGFloat {
        get { CGFloat(UserDefaults.standard.object(forKey: Self.yKey) as? Double ?? 0.55) }
        set { UserDefaults.standard.set(Double(min(max(newValue, 0), 1)), forKey: Self.yKey) }
    }

    func show(on displayID: CGDirectDisplayID) {
        guard let screen = NSScreen.screens.first(where: {
            ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == displayID
        }) else { return }
        self.screen = screen
        let panel = self.panel ?? makePanel()
        // 首次显示、屏幕尺寸变了（切换宽屏）或不在虚拟屏上时按记住的位置摆放；否则不动
        if !panel.isVisible || screen.frame != laidOutScreenFrame || !screen.frame.intersects(panel.frame) { layout() }
        if !panel.isVisible { panel.orderFrontRegardless() }
    }

    func hide() {
        setExpanded(false)
        panel?.orderOut(nil)
    }

    /// 更新「临时宽屏 / 切回预设」按钮文字
    func update(wide: Bool, presetTitle: String) {
        let title = wide ? "切回\(presetTitle)" : "临时宽屏"
        guard title != wideTitle, let wideButton else { return }
        wideTitle = title
        Self.style(wideButton, title: title, color: .systemBlue)
        layoutCapsule()
        if expanded { layout() }
    }

    /// 调试：在当前主屏上依次展开左/右侧浮窗、切换宽屏文字，打印各状态的尺寸后回调（不改记住的位置）
    func preview(done: @escaping () -> Void) {
        guard let id = NSScreen.main?.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else { return done() }
        let savedSide = UserDefaults.standard.string(forKey: Self.sideKey)
        let savedY = UserDefaults.standard.object(forKey: Self.yKey)
        let steps: [(String, () -> Void)] = [
            ("左侧收起", { self.side = .left; self.show(on: id.uint32Value); self.layout() }),
            ("左侧展开", { self.setExpanded(true) }),
            ("左侧展开·宽屏中", { self.update(wide: true, presetTitle: "大字") }),
            ("右侧展开", { self.update(wide: false, presetTitle: "大字"); self.side = .right; self.setExpanded(true) }),
            ("右侧收起", { self.setExpanded(false) }),
        ]
        var i = 0
        func next() {
            guard i < steps.count else {
                self.hide()
                UserDefaults.standard.set(savedSide, forKey: Self.sideKey)
                UserDefaults.standard.set(savedY, forKey: Self.yKey)
                return done()
            }
            steps[i].1()
            let name = steps[i].0
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                let f = self.panel?.frame ?? .zero, c = self.capsule?.frame ?? .zero
                print("\(name)：面板 x=\(Int(f.minX)) w=\(Int(f.width)) h=\(Int(f.height))；胶囊 \(self.capsule?.isHidden == false ? "x=\(Int(c.minX)) w=\(Int(c.width))" : "隐藏")；宽屏键「\(self.wideTitle)」宽 \(Int(self.wideButton?.frame.width ?? 0))，退出键宽 \(Int(self.confirm?.frame.width ?? 0))")
                i += 1
                next()
            }
        }
        next()
    }

    // MARK: - 布局

    private var expandedWidth: CGFloat { Self.handleSize + Self.gap + (capsule?.frame.width ?? 160) }

    /// 胶囊内部：[临时宽屏 │ 退出]，两半顺序固定，不随圆点在左/右而变
    private func layoutCapsule() {
        guard let capsule, let divider, let wideButton, let confirm else { return }
        let ww = wideButton.frame.width, cw = confirm.frame.width, s = Self.handleSize
        wideButton.frame.origin = .zero
        divider.frame = NSRect(x: ww, y: 0, width: 1, height: s)
        confirm.frame.origin = NSPoint(x: ww + 1, y: 0)
        capsule.frame.size = NSSize(width: ww + 1 + cw, height: s)
    }

    private func layout() {
        guard let panel, let handle, let capsule, let screen else { return }
        laidOutScreenFrame = screen.frame
        let vf = screen.visibleFrame
        let s = Self.handleSize
        let w = expanded ? expandedWidth : s
        let cy = min(max(vf.minY + vf.height * yRatio, vf.minY + s / 2), vf.maxY - s / 2)
        let x = side == .left ? vf.minX + Self.margin : vf.maxX - Self.margin - w
        panel.setFrame(NSRect(x: x, y: cy - s / 2, width: w, height: s), display: true)
        // 圆点固定在靠边的一端，胶囊向屏幕内侧展开：左侧 [圆点][胶囊]，右侧 [胶囊][圆点]
        if side == .left {
            handle.frame.origin = .zero
            capsule.frame.origin = NSPoint(x: s + Self.gap, y: 0)
        } else {
            capsule.frame.origin = .zero
            handle.frame.origin = NSPoint(x: w - s, y: 0)
        }
        capsule.isHidden = !expanded
    }

    private func setExpanded(_ on: Bool) {
        collapseTimer?.invalidate()
        collapseTimer = nil
        guard expanded != on || on else { return }
        expanded = on
        if on {
            collapseTimer = Timer.scheduledTimer(withTimeInterval: Self.collapseAfter, repeats: false) { [weak self] _ in
                self?.setExpanded(false)
            }
        }
        layout()
    }

    // MARK: - 交互

    private func pressed() {
        wasExpandedOnPress = expanded
        // 展开时按住圆点：先收起，再开始可能的拖动
        if expanded { setExpanded(false) }
    }

    private func tapped() {
        if !wasExpandedOnPress { setExpanded(true) }
    }

    private func dragEnded() {
        guard let panel, let screen else { return }
        let vf = screen.visibleFrame
        let c = NSPoint(x: panel.frame.midX, y: panel.frame.midY)
        side = c.x < vf.midX ? .left : .right
        yRatio = (c.y - vf.minY) / vf.height
        layout()
    }

    @objc private func wideTapped() {
        setExpanded(false)
        Log.info("浮窗按钮：\(wideTitle)")
        onToggleWide?()
    }

    @objc private func confirmTapped() {
        setExpanded(false)
        Log.info("浮窗按钮：确认退出手机模式")
        onExit?()
    }

    private func makePanel() -> NSPanel {
        let s = Self.handleSize
        let handle = HandleView(frame: NSRect(x: 0, y: 0, width: s, height: s))
        handle.onPress = { [weak self] in self?.pressed() }
        handle.onTap = { [weak self] in self?.tapped() }
        handle.onDragEnded = { [weak self] in self?.dragEnded() }

        let confirm = FirstMouseButton(title: "", target: self, action: #selector(confirmTapped))
        Self.style(confirm, title: "退出", color: .systemRed)
        let wideButton = FirstMouseButton(title: "", target: self, action: #selector(wideTapped))
        wideTitle = "临时宽屏"
        Self.style(wideButton, title: wideTitle, color: .systemBlue)
        let divider = NSView()
        divider.wantsLayer = true
        divider.layer?.backgroundColor = NSColor.white.withAlphaComponent(0.7).cgColor

        let capsule = NSView()
        capsule.wantsLayer = true
        capsule.layer?.cornerRadius = s / 2
        capsule.layer?.masksToBounds = true
        capsule.addSubview(wideButton)
        capsule.addSubview(divider)
        capsule.addSubview(confirm)
        capsule.isHidden = true

        let content = NSView(frame: NSRect(x: 0, y: 0, width: s, height: s))
        content.addSubview(capsule)
        content.addSubview(handle)

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
        self.panel = panel
        self.handle = handle
        self.confirm = confirm
        self.wideButton = wideButton
        self.capsule = capsule
        self.divider = divider
        layoutCapsule()
        return panel
    }

    private static func style(_ b: NSButton, title: String, color: NSColor) {
        b.isBordered = false
        b.attributedTitle = NSAttributedString(string: title, attributes: [
            .foregroundColor: NSColor.white, .font: NSFont.systemFont(ofSize: 13, weight: .semibold),
        ])
        b.wantsLayer = true
        b.layer?.backgroundColor = color.cgColor
        b.frame.size = NSSize(width: b.intrinsicContentSize.width + 28, height: handleSize)
    }
}

/// 非激活面板里第一次点击就生效（App 不在前台时也一样）
private final class FirstMouseButton: NSButton {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

/// 贴边小圆点：轻点 = onTap；移动超过 4pt = 拖动面板，松手 onDragEnded
private final class HandleView: NSView {
    var onPress: (() -> Void)?
    var onTap: (() -> Void)?
    var onDragEnded: (() -> Void)?

    private var start = NSPoint.zero
    private var origin = NSPoint.zero
    private var dragging = false

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.cornerRadius = frame.width / 2
        layer?.backgroundColor = NSColor.black.withAlphaComponent(0.5).cgColor
        layer?.borderColor = NSColor.white.withAlphaComponent(0.7).cgColor
        layer?.borderWidth = 1
        let icon = NSImageView(frame: bounds.insetBy(dx: 8, dy: 8))
        icon.image = NSImage(systemSymbolName: "rectangle.portrait.and.arrow.right", accessibilityDescription: "退出手机模式")
        icon.contentTintColor = .white
        icon.imageScaling = .scaleProportionallyUpOrDown
        addSubview(icon)
        toolTip = "退出手机模式"
    }

    required init?(coder: NSCoder) { nil }

    override func hitTest(_ point: NSPoint) -> NSView? { frame.contains(point) ? self : nil }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func mouseDown(with event: NSEvent) {
        onPress?()
        start = NSEvent.mouseLocation
        origin = window?.frame.origin ?? .zero
        dragging = false
    }

    override func mouseDragged(with event: NSEvent) {
        let p = NSEvent.mouseLocation
        let dx = p.x - start.x, dy = p.y - start.y
        if !dragging && hypot(dx, dy) < 4 { return }
        dragging = true
        window?.setFrameOrigin(NSPoint(x: origin.x + dx, y: origin.y + dy))
    }

    override func mouseUp(with event: NSEvent) {
        if dragging { onDragEnded?() } else { onTap?() }
    }
}
