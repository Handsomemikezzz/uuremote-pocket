# Pocket Mac

一键在 Mac 上开启「手机模式」：创建一块适合 iPhone 竖屏的 HiDPI 虚拟屏并设为主屏，手机通过 UU远程 选择这块屏即可操作完整的 macOS 桌面；退出手机模式时还原原有显示配置。

- 不禁用物理屏、不需要任何系统权限、不联网
- 虚拟屏的生命周期绑定在 Pocket Mac 进程上：App 退出、崩溃或被强制结束时，虚拟屏由系统立即移除，主屏回到物理屏
- 显示配置代码源自 [UUyc companion](https://github.com/aoyamashou/UUyc-companion)（MIT）

## 使用

菜单栏 iPhone 图标：

| 菜单项 | 说明 |
|---|---|
| 进入手机模式 · 大字（660×1434） | 1320×2868px @2x，字最大，部分应用窗口可能放不下 |
| 进入手机模式 · 标准（800×1738） | 1600×3476px @2x，应用兼容性更好 |
| 退出手机模式 | 移除虚拟屏，主屏与布局恢复原样 |

退出手机模式的几种方式（任何一种都可以）：
1. 虚拟屏右上角的浮窗按钮「退出手机模式」（点一次后需在 3 秒内再点一次确认，可拖动）
2. 菜单栏图标 › 退出手机模式
3. 快捷键 ⌃ control + ⌥ option + ⌘ command + 9
4. 退出 Pocket Mac（虚拟屏随进程消失）

日志：`~/Library/Logs/PocketMac.log`（菜单 › 打开日志）

## 构建

```bash
scripts/build-app.sh --install
```

## 调试与验收

```bash
swift build && .build/debug/PocketMac --selftest      # 两档各进入/退出一次并校验（会真实切换显示器约 20 秒）
.build/debug/PocketMac --stress 40                     # 随机进入/切换/退出压测
.build/debug/PocketMac --enter large --exit-after 5    # 配合 kill -9 测试异常退出
.build/debug/vdprobe --list                            # 在独立进程中列出当前显示器
```

注意：不要和 UUyc companion 同时运行（两者都会建虚拟屏、抢主屏）。
