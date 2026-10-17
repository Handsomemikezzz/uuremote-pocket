# Changelog

All notable changes to **Pocket Mac** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-10-17

### Added
- **一键手机模式 (One-click Phone Mode)**：
  - 菜单栏原生驻留图标，提供一键进入与退出切换。
  - 支持快捷键 `⌃ control + ⌥ option + ⌘ command + 9` 随时一键撤出。
- **专为 iPhone 比例打磨的双档 HiDPI 预设**：
  - `大字模式 (Large)`：660×1434 pt @2x（物理 1320×2868 px），最高可读性，适合阅读沟通与终端运维。
  - `标准模式 (Standard)`：800×1738 pt @2x（物理 1600×3476 px），高信息密度，支持多窗口并列与全功能网页排版。
- **悬浮退出按钮 (Floating Exit Panel)**：
  - 虚拟屏右上角常驻可拖拽「退出手机模式」悬浮窗。
  - 内置 3 秒二次点击防误触确认机制。
- **安全拓扑状态机 (Safe Display State Machine)**：
  - 基于 `CGVirtualDisplay` 专属 Vendor ID (`0x504D`) 与随机序列号生成。
  - 单向目标状态收敛 (`idle` → `entering` → `active` → `exiting`)，彻底防止连击竞态撕裂。
  - 虚拟屏生命周期与进程严格绑定：异常退出、崩溃或 `kill -9` 强杀时系统内核立即回收虚拟屏，物理显示器瞬间归位至主屏，**零黑屏风险**。
  - **绝不禁用物理屏幕**：避免单显示器 Mac mini 因关闭外接屏导致的死锁。
- **工程化与调试工具链**：
  - 内置 `--selftest` 自动化全功能双档切换校验。
  - 内置 `--stress <N>` 随机进入/切换/退出高频压力测试。
  - 独立命令行探测工具 `vdprobe`。
  - 滚动日志模块，写入 `~/Library/Logs/PocketMac.log`。

### Upstream Heritage
- 显示拓扑核心代码借鉴并深度重构自 [UUyc companion](https://github.com/aoyamashou/UUyc-companion)（MIT License）。
