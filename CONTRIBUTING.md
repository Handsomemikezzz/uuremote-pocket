# Contributing to Pocket Mac

感谢你对 **Pocket Mac** 的关注与支持！我们欢迎所有形式的贡献，包括但不限于报告 Bug、提出新功能建议、改进文档、优化预设分辨率或贡献代码。

---

## 🎯 设计原则与底线

在提交 Pull Request 之前，请务必了解 Pocket Mac 的核心设计哲学：

1. **绝对安全（Zero-Risk）**：
   - 绝不禁用物理显示器，绝不冒让用户主屏幕变黑的风险。
   - 虚拟屏生命周期严格依附于进程；退出/崩溃/强杀时，必须依赖系统内核自动销毁，主屏无缝回弹。
2. **零权限与纯本地（Zero-Permission & Privacy First）**：
   - 不依赖 Accessibility（辅助功能）权限，不申请屏幕录制权限，不需要 root/sudo。
   - 纯本地运行，不含任何数据统计、网络请求或远程回传。
3. **极简主义（Minimalism）**：
   - 聚焦于「一键为 iPhone 提供 HiDPI 竖屏工作区」这一核心场景。
   - 保持极低的内存与 CPU 占用，不引入沉重的第三方外部依赖。

---

## 🛠️ 本地开发环境

- **操作系统**：macOS 14.0 (Sonoma) 或更高版本（支持 Apple Silicon 与 Intel 架构）
- **开发工具**：
  - Xcode 15+ 或 Swift 6.0+ 工具链
  - `git`
- **构建测试**：
  ```bash
  # 1. 克隆代码仓库
  git clone https://github.com/Handsomemikezzz/uuremote-pocket.git
  cd uuremote-pocket

  # 2. 编译调试版
  swift build

  # 3. 运行自动化自检（会真实切换两档显示器各约 20 秒并校验）
  .build/debug/PocketMac --selftest

  # 4. 运行独立显示器诊断工具
  .build/debug/vdprobe --list
  ```

---

## 📦 打包构建 App

本项目提供了一键打包脚本：

```bash
# 生成 build/Pocket Mac.app
scripts/build-app.sh

# 打包并安装到 /Applications 并立即运行测试
scripts/build-app.sh --install
```

---

## 🔍 代码结构概览

```
Sources/
├── PocketMac/
│   ├── main.swift                 # 程序入口、CLI 模式分发 (--selftest, --stress 等)
│   ├── VirtualScreen.swift        # 核心：虚拟显示器状态机 (idle / entering / active / exiting)
│   ├── DisplayConfig.swift        # CoreGraphics 拓扑原点平移与还原事务
│   ├── Preset.swift               # iPhone 竖屏 HiDPI 分辨率预设定义
│   ├── StatusBarController.swift  # 原生系统菜单栏常驻图标与菜单管理
│   ├── ExitButtonPanel.swift      # 虚拟屏右上角常驻可拖拽浮窗退出按钮
│   ├── Diagnostics.swift          # 自检与压力测试套件
│   └── Log.swift                  # 滚动日志记录 (~/Library/Logs/PocketMac.log)
├── CGVirtualDisplayBridge/        # macOS CoreGraphics 私有 API 桥接头文件
└── vdprobe/                       # 独立命令行显示器探测工具
```

---

## 📝 提交 Pull Request 流程

1. **Fork** 本仓库并创建特性分支：
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. 进行修改并确保通过编译与本地测试：
   ```bash
   swift build && .build/debug/PocketMac --selftest
   ```
3. 提交 Commit（推荐采用语义化 Commit Message，如 `feat:`, `fix:`, `docs:`, `perf:` 等）。
4. 推送分支并提交 PR，在 PR 描述中清晰说明改动背景、验证方式及对显示拓扑的影响。

---

## 💬 疑问与讨论

若对架构改动或适配新设备有疑问，欢迎随时在 GitHub Issues 中发起讨论！
