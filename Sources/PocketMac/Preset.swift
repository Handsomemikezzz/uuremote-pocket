// 手机模式的两档显示预设（按 iPhone 16 Pro Max 1320×2868 的竖屏比例）
// HiDPI：逻辑尺寸 = 像素 / 2。逻辑宽度越小，手机上的字越大，但部分应用窗口可能放不下。
struct Preset: Equatable {
    let id: String
    let title: String
    let pixelWidth: Int
    let pixelHeight: Int

    var pointWidth: Int { pixelWidth / 2 }
    var pointHeight: Int { pixelHeight / 2 }
    var sizeLabel: String { "\(pointWidth)×\(pointHeight)" }

    static let large = Preset(id: "large", title: "大字", pixelWidth: 1320, pixelHeight: 2868)
    static let standard = Preset(id: "standard", title: "标准", pixelWidth: 1600, pixelHeight: 3476)
    static let all = [large, standard]

    static func named(_ id: String) -> Preset? { all.first { $0.id == id } }
}
