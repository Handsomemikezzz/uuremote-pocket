// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "PocketMac",
    platforms: [.macOS(.v14)],
    targets: [
        // CGVirtualDisplay 私有 API 声明（来自 UUyc companion / FreeDisplay，MIT）
        .target(name: "CGVirtualDisplayBridge"),
        .executableTarget(name: "PocketMac", dependencies: ["CGVirtualDisplayBridge"]),
        // 诊断工具：vdprobe --list 列出显示器；vdprobe <宽> <高> [秒] 独立建屏探测
        .executableTarget(name: "vdprobe", dependencies: ["CGVirtualDisplayBridge"]),
    ]
)
