// 简易日志：同时输出到 stdout 和 ~/Library/Logs/PocketMac.log（超过 1MB 时轮转为 .old）
import Foundation

enum Log {
    static let url = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("Logs/PocketMac.log")
    private static let maxSize = 1_000_000
    private static let fmt: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS"
        return f
    }()

    static func info(_ msg: String) {
        let line = "[\(fmt.string(from: Date()))] \(msg)\n"
        guard let data = line.data(using: .utf8) else { return }
        FileHandle.standardOutput.write(data)
        if let h = try? FileHandle(forWritingTo: url) {
            h.seekToEndOfFile()
            h.write(data)
            try? h.close()
        } else {
            try? data.write(to: url)
        }
    }

    /// 启动时调用一次
    static func rotateIfNeeded() {
        let size = (try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? Int ?? 0
        guard size > maxSize else { return }
        let old = url.appendingPathExtension("old")
        try? FileManager.default.removeItem(at: old)
        try? FileManager.default.moveItem(at: url, to: old)
    }
}
