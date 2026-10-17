# Security Policy

## 🔒 隐私与安全性声明

**Pocket Mac** 秉持严谨的本地优先与极简安全设计：

1. **零高危系统权限**：
   - 本应用**不需要**「辅助功能（Accessibility）」权限。
   - 本应用**不需要**「屏幕录制（Screen Recording）」权限。
   - 本应用**不需要** root / `sudo` 提权。
2. **纯本地离线运行**：
   - 不包含任何网络请求模块、无埋点、无远程上报、无第三方遥测追踪。
3. **显示拓扑安全**：
   - 本项目绝不调用任何禁用物理屏幕的私有 API。
   - 虚拟屏生命周期依附于当前进程，系统在进程退出时会自动回收释放。

---

## 报告安全漏洞 (Reporting a Vulnerability)

如果您在代码实现中发现了潜在的安全风险或崩溃隐患：

1. 请通过 GitHub Security Advisories 或直接联系 Maintainer 提交私密报告。
2. 请在报告中提供：
   - 您的 macOS 版本与硬件芯片架构（如 M1/M2/M3/M4 / Intel）。
   - 复现步骤及可能的崩溃日志（位于 `~/Library/Logs/PocketMac.log` 或 CrashReporter）。
3. 我们将在 48 小时内确认并评估修复方案。
