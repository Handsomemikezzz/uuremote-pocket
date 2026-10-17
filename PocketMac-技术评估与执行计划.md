# Pocket Mac：基于 UUyc companion 的技术评估与执行计划

> [!TIP]
> **项目现状**：本评估与执行计划第一阶段目标（v0.1.0）已完成开发并通过自检与压测验证。用户操作手册与项目概览请参阅 [README.md](README.md)。

> 调研对象：`upstream-UUyc-companion/`（https://github.com/aoyamashou/UUyc-companion ，HEAD `f5e45dc` v1.1.3）
> 调研环境：本机 macOS 26.5.2 (25F84)、Apple M4、单台外接 4K 显示器 U2790R3B（主屏）、Swift 6.2.4、Xcode 已装；同时装有 UURemote.app、BetterDisplay.app
> 本文所有代码位置均相对 `upstream-UUyc-companion/`。本轮未修改任何代码。

证据等级标注：
- **【证实】**：读代码或本机命令/日志可以直接确认
- **【迹象】**：有日志或间接证据，但根因未复现
- **【待测】**：只能通过实机测试确认的假设

---

## 0. 一页结论

1. **核心可复用，外围大幅删减。** 真正值钱的是 `DisplayManager.swift`（330 行）中通过踩坑总结出的显示配置执行器：「目标状态 + 一次一步 + 每步等待稳定 + 虚拟屏最短存活 2.5 秒 + 事务超时进入保护状态」。其余约 75% 的代码（UU 识别、设备列表、设置/向导/导览/权限/关于窗口、看门狗）在「手动一键手机模式」下都可以删除。
2. **删除「关闭物理屏」后，看门狗可以整体删除。** 看门狗只负责恢复被禁用的物理屏（`Watchdog.swift:48`），而虚拟屏本身随进程退出自动消失（`docs/PLAN.md` P0 表「进程退出/被杀 ✅ 虚拟屏立即消失，主屏自动回原屏」）。不禁用物理屏，最危险的那条失败路径（屏幕全黑）也就不存在了。你的 Mac mini 只有一块物理屏，更不应该禁用它。
3. **改为手动模式后，"切换不稳定"的一个可能来源也随之消失。** 你本机日志里出现过「UU 断开 → 13–23 ms 后又连入」的抖动（15:37:36、19:25:19）。如果控制端是已配置分辨率的手机，这种抖动会触发「删虚拟屏 → 重建虚拟屏」，正好把你刚在 UU 里选中的那块屏删掉。**【迹象】**，需复现确认。手动模式不监听 UU，这条路径不存在了。
4. **上游源码目前无法直接构建。** `Package.swift:12` 依赖 `aoyamashou/AboutKit`，`git ls-remote` 返回 *Repository not found*，README 也写了"目前只有作者本人能从源码完整构建"。**【证实】** 所以推荐：新建精简包，选择性移植，而不是 fork 后逐个删文件。
5. **竖屏本身已在你这台机器上跑通过。** 日志显示今天 09:22–09:40 两次创建 `1320×2868 高清`（逻辑 660×1434pt）虚拟屏，设为主屏、移除、还原布局都成功了。**【证实】** 剩下的关键未知数是体验类的：660pt 宽的完整 macOS 桌面是否好用，以及 UU iPhone 端在竖屏下的表现。

---

## 1. 现有架构概览

### 1.1 模块与依赖

```
main.swift (AppDelegate, 342 行)  ── 启动/退出收尾/热键/心跳/各种调试 CLI 模式
 ├─ StatusBarController (72)      ── 菜单：状态 / 远程时只保留虚拟屏 / 设置 / 退出      依赖 AboutKit(DebugLabels)
 ├─ SettingsWindow (574) / SetupWizard (253) / Tour (309) / PermissionsWindow (185) / AboutWindow (37)
 │                                  依赖 PermissionFlow、TourKit（Vendor 内置）、AboutKit（不可获取）
 └─ Coordinator (167)              ── 连入 → 读控制端名 → 查设备配置 → DisplayManager.create / remove
     ├─ UUMonitor (84) + UUConnectionState (31)   ── 0.5s 轮询：UURemoteServer 覆盖窗口 + AX 读表格，1.5s 断开防抖
     │    └─ UUReader (131)                        ── AX 遍历 UU 主窗口（需要辅助功能权限）
     ├─ ConfigStore/DeviceConfig (89)              ── ~/Library/Application Support/UUDisplay/config.json
     └─ DisplayManager (330)       ── ★ 显示拓扑执行器
          ├─ CGVirtualDisplayBridge (ObjC 头文件, 私有 API CGVirtualDisplay)
          └─ PhysicalDisplays (61) ── applyDisplayConfig() + 私有 API CGSConfigureDisplayEnabled（dlsym）
Watchdog.swift (160)               ── 同一二进制以 --watchdog 运行，由 LaunchAgent(KeepAlive) 托管
独立工具：vdprobe（建屏探测）、dispoff（禁用物理屏探测）、uuprobe/uuwatch（UU 信号探测）
```

### 1.2 虚拟显示器：创建、配置、销毁

| 环节 | 位置 | 做法 |
|---|---|---|
| 私有 API 声明 | `Sources/CGVirtualDisplayBridge/include/CGVirtualDisplay.h:7-38` | `CGVirtualDisplayDescriptor/Mode/Settings/CGVirtualDisplay`，**未声明 `terminationHandler`** |
| 创建 | `DisplayManager.createDisplay` `DisplayManager.swift:274-306` | vendorID `0x5555`；**每次随机 serialNum**（`:284`，原因是与残留屏同序列号会返回 nil）；物理尺寸按 220ppi 推算 |
| 分辨率/HiDPI | `:291-294` | **只给一个模式**：HiDPI 时逻辑尺寸 = 像素/2，60Hz；创建后永不改模式（`PLAN.md`「否则可能无法移除」） |
| 配置失败 | `:295-300` | `applySettings` 失败的屏不立即释放，放进 `broken`，满足存活条件后再释放（立即释放曾导致 WindowServer 崩溃） |
| 销毁 | `release` `:308-313` | 置空引用、`autoreleasepool` 释放对象，虚拟屏即消失 |
| 销毁前提 | `readyToRelease` `:146-156` | 必须已上线且存活 ≥ 2.5s（`minLifetime :46`），最多等 8s |

### 1.3 主显示器切换
`DisplayManager.step` `:222-247`：等虚拟屏出现在 `CGGetOnlineDisplayList`（每 0.25s 查一次，最多 20 次）后，在 `cgQueue` 上执行一次配置事务，把所有屏的原点平移，使虚拟屏位于 (0,0)。macOS 中位于 (0,0) 的屏就是主屏。事务为 `.forSession`（`PhysicalDisplays.swift:15`）。

### 1.4 物理屏禁用与恢复
`PhysicalDisplays.swift:20-60`：通过 `dlsym` 获取 `CGSConfigureDisplayEnabled`。**先把要禁用的 ID 写入 `disabled-displays.json`，再禁用**（`:37-45`）。恢复时按记录重新启用，成功后删除记录（`:49-60`）。禁用状态不受 `.forAppOnly` 约束，进程退出后不会自动恢复（`:3`），所以需要看门狗/热键/启动恢复这几层兜底。

### 1.5 UU 连接检测与自动切换
- 连入信号：`UUMonitor.overlayPresent` `UUMonitor.swift:29-32`，看是否存在 owner 为 `UURemoteServer` 的屏上窗口（不需要权限）。
- 控制端名：`UUReader.readControllers` `UUReader.swift:112-130`，通过 AX 读「本机被控中」表格（需要辅助功能权限）。
- 合并与防抖：`UUConnectionState.update` `UUConnectionState.swift:11-30`，两种信号都消失超过 1.5s 才判断为断开。
- 切换：`Coordinator.handleConnect → pollName → resolve → apply → display.create`（`Coordinator.swift:49-128`）；断开时调用 `display.remove()`（`:63-69`）。

### 1.6 恢复机制总览

| 层 | 位置 | 恢复的对象 |
|---|---|---|
| 执行器「目标=无」路径 | `DisplayManager.swift:175-207` | 恢复物理屏 → 释放虚拟屏 → 还原布局，按顺序逐步执行 |
| 启动恢复 | `recoverIfNeeded :97-109` + `session.json`（`writeMarker :326-329`） | 上次异常退出残留的布局与物理屏禁用 |
| 退出收尾 | `main.swift:156-169` | 先取消退出（`.terminateLater` 期间主队列延时任务不执行），收尾后再退出，最多等 8s |
| 热键 ⌃⌥⌘9 | `main.swift:185-198`（Carbon，无需权限） | 只恢复物理屏 |
| 保护状态 wedged | `:133, 139-143, 160-165` | 事务返回 1014/cannotComplete 后停止一切拓扑操作，只尝试恢复物理屏 |
| 看门狗 | `Watchdog.swift:41-69` + LaunchAgent `:75-160` | **只在有禁用记录时工作**：主程序不在、心跳超过 10s（先 SIGKILL）或 UU 断开 5s 时恢复物理屏 |

---

## 2. 问题与风险分析

### 2.1 代码层面可证实的问题

| # | 问题 | 位置 | 依据与后果 |
|---|---|---|---|
| A1 | 源码无法构建 | `Package.swift:12`、`Package.resolved` | AboutKit 仓库不存在（本机 `git ls-remote` 已验证）。`swift build` 解析依赖图时就会失败，连 `vdprobe` 也构建不了 |
| A2 | **虚拟屏上线超时被当成成功处理** | `DisplayManager.swift:224-229` | 等待 5s 仍未上线时只记录日志，然后设置 `mainSet = true` 继续执行。之后 `:256-265` 会把"所有非虚拟的在线屏"全部禁用，而此时虚拟屏并不在线。在单显示器的 Mac mini 上，结果是没有任何可用屏幕（系统会生成一块 1920×1080 占位屏，见 `PhysicalDisplays.swift:5`）。只有开启"关闭物理屏"时才会触发，但这是最危险的组合 |
| A3 | 设主屏失败既不重试，也不在界面上体现 | `:235-246` | 事务执行前就设了 `mainSet = true`，失败只写一行日志。状态栏仍显示「虚拟屏已匹配」（`Coordinator.swift:41-43`） |
| A4 | 建屏失败后静默停止 | `:211, :218` | 设置 `failedCfg` 后，目标不变就不再重试；界面只显示「虚拟屏没有调整」，用户分不清是失败还是没匹配到配置 |
| A5 | 布局快照取得太晚 | `:230-233` | "原布局"是在虚拟屏**已上线后**才记录的。如果 macOS 插入新屏时移动了物理屏的原点，记录下来的就已经不是原始布局。（这是代码事实；macOS 是否真的会移动物理屏需要实测） |
| A6 | 完全不感知系统事件 | 全仓 grep：没有任何 `NSWorkspace` 睡眠/唤醒通知、`CGDisplayRegisterReconfigurationCallback`、`didChangeScreenParameters` | 执行器对 `vd / mainSet / current` 的判断从不重新校验。睡眠唤醒、拔插显示器、系统回收虚拟屏之后，App 仍会认为"已开启" |
| A7 | 无法得知虚拟屏被系统终止 | `CGVirtualDisplay.h:7-20` | 没有声明 `terminationHandler`（Chromium/DeskPad 的声明里有这个属性） |
| A8 | 小问题 | `Log.swift:13-24`；`main.swift:57-58` | 日志无限增长；每秒写一次心跳文件（只有看门狗用得到） |
| A9 | 与其他虚拟屏工具共用标识 | `DisplayManager.swift:14, 62` | 只靠 `vendorID == 0x5555` 判断是不是"自己的虚拟屏"。如果 UUyc companion 和 Pocket Mac 同时运行，会互相把对方的屏当成自己的处理 |

### 2.2 有迹象、但根因尚未确认的风险

- **B1：UU 信号抖动引发虚拟屏被重建。** 你本机 `~/Library/Logs/UUDisplay.log` 第 15:37:36.292 → .305、19:25:19.785 → .808 两处出现「检测到 UU 断开」后十几毫秒又「检测到 UU 连入」。断开只有在两种信号都消失超过 1.5s 后才会触发，说明 UU 的覆盖窗口和表格确实同时消失了一段时间。一个合理的猜测是：在 UU 里切换显示屏时，覆盖窗口会重建。如果此时控制端是手机，就会执行 `remove()`（释放虚拟屏）再 `create()`，UU 当前正在显示的那块屏会被删掉再重建，看起来就是"反复切换异常"。**复现方法**：iPhone 连入、虚拟屏建好后，在 UU 里切换显示屏，同时 `tail -f` 日志观察。手动模式下这条路径不存在。
- **B2：你遇到的"恢复异常"在现有日志里找不到。** 这份日志只有今天 69 行，没有任何 ⚠️/❌/⛔，每次移除和还原布局都成功了。需要你描述当时的具体现象（见第 6 节问题 F）。

### 2.3 需要实测验证的假设

| # | 假设 | 为什么重要 |
|---|---|---|
| C1 | UU iPhone 端能稳定以竖屏全屏显示竖屏虚拟屏（不加黑边、不强制横屏，手势和键盘正常） | **决定整个方向是否成立** |
| C2 | 660pt 逻辑宽度下，你常用的应用（Finder、浏览器、IDE、系统设置）窗口放得下，菜单栏不会把重要图标挤掉 | 决定两档预设怎么定 |
| C3 | UU 正在显示虚拟屏时移除它，UU 会自动回到物理屏且不断线 | 决定退出流程是否顺滑 |
| C4 | macOS 26.5 上 `kill -9` 后虚拟屏立即消失、主屏回到 4K 屏、窗口迁回 | 这是"不需要看门狗"的前提（上游只在 macOS 27 上验证过） |
| C5 | 睡眠/唤醒、锁屏后，虚拟屏仍在线、仍是主屏、UU 仍能选择它 | 决定第二阶段的唤醒处理逻辑 |
| C6 | BetterDisplay 运行时不会干预新出现的虚拟屏（自动排列、设主屏、改 HiDPI） | 本机装有 BetterDisplay，可能产生冲突 |
| C7 | 随机 serial 会让 WindowServer 的显示器偏好文件不断累积条目 | 影响长期使用；可以对比固定 serial 的效果 |
| C8 | 4K 显示器关机或待机时，它仍然在线，不影响虚拟屏 | Mac mini 远程场景下常见 |

### 2.4 私有 API 兼容性
- 一共两个私有 API：`CGVirtualDisplay`（必需）和 `CGSConfigureDisplayEnabled`（Pocket Mac 第一版不使用）。去掉后者，私有 API 只剩一个。
- 没有降级方案：如果某个 macOS 版本里 `CGVirtualDisplay` 不可用，Pocket Mac 就无法工作。应该在启动时用 `NSClassFromString("CGVirtualDisplay")` 做可用性检查，不可用时在菜单里明确提示，而不是等到建屏失败才发现。

---

## 3. Pocket Mac 最小功能范围

### 3.1 保留并移植

| 来源 | 处理方式 |
|---|---|
| `CGVirtualDisplayBridge/`（38 行） | 原样移植，第二阶段视实测情况补上 `terminationHandler` |
| `DisplayManager.swift` | **移植执行器骨架**（kick/step/finish/runCG/readyToRelease/broken/wedged/cgQueue/marker），删掉物理屏相关分支，并修复 A2–A5 |
| `PhysicalDisplays.swift:11-18` `applyDisplayConfig` | 只保留这个函数 |
| `Log.swift` | 保留，加大小上限（例如超过 1MB 就轮转） |
| `main.swift:156-169` 退出收尾 | 原样保留这个模式 |
| `main.swift:185-198` 全局热键 | 保留，含义改为"退出手机模式" |
| `main.swift:277-335` `--stress / --simulate` | 改为随机进入/退出的压测，这是验收的主要工具 |
| `vdprobe` | 保留为诊断工具 |
| `scripts/build-app.sh` | 精简（去掉看门狗、AboutKit、Tour 资源），换用新的 Bundle ID |
| `SettingsWindow.swift:80` 的 `SMAppService.mainApp` | 第二阶段的"开机启动"开关直接复用 |

### 3.2 删除

UUReader、UUMonitor、UUConnectionState 及其测试、Coordinator（换成约 40 行的 PhoneMode）、DeviceConfig 设备列表、SettingsWindow、SetupWizard、Tour + TourKit、PermissionsWindow + PermissionFlow、AboutWindow + AboutKit、uuprobe、uuwatch、Assets/Tour、文案.md。
→ **不再需要辅助功能权限**，首次启动也不需要任何引导。

### 3.3 暂缓（不移植，但保留设计记录）

| 能力 | 暂缓理由 | 将来做的前提 |
|---|---|---|
| 关闭物理屏 + 看门狗 + 心跳 + 禁用记录 | 你只有一块物理屏，禁用它会带来全黑屏风险 | 如果要做，必须把 `PhysicalDisplays` + `Watchdog` + 记录文件 + 热键作为一个整体移植，**不能只移植禁用部分** |
| UU 断开后自动退出手机模式 | 不属于第一阶段重点 | 只用覆盖窗口检测（不需要权限），并加一个分钟级的宽限期，避免 B1 那种抖动 |
| 多设备、按设备配置分辨率 | 你主要用 iPhone 16 Pro Max | 在预设里加一档即可 |

### 3.4 第一版用户界面（菜单栏）
```
● 手机模式：已开启（大字 · 660×1434）      ← 状态（进入中 / 已开启 / 退出中 / 失败：原因 / 保护状态）
进入手机模式 ▸ 大字 / 标准                ← 已开启时变为「退出手机模式  ⌃⌥⌘9」
───
开机启动（第二阶段）
退出 Pocket Mac
```

---

## 4. 推荐的技术改造方案

### 4.1 形态：新建精简包，选择性移植（不 fork 后删除）
理由：A1 导致上游无法构建；删除的代码超过 75%，fork 后逐个删文件，留下的历史和配置残留（Bundle ID `com.corndog.uudisplay`、配置目录 `UUDisplay`、LaunchAgent 标签）反而容易和已安装的 UUyc companion 混在一起。新包保留 MIT LICENSE 和致谢即可。预计源码约 550 行，不依赖任何第三方库。

```
PocketMac/
  Package.swift                       无外部依赖，macOS 14+
  Sources/CGVirtualDisplayBridge/     原样移植
  Sources/PocketMac/
    main.swift                        AppDelegate：菜单栏、热键、退出收尾、--stress
    VirtualScreen.swift               ← 由 DisplayManager 精简而来（核心）
    DisplayConfig.swift               applyDisplayConfig / onlineDisplays / restoreOrigins
    Presets.swift                     两档预设
    StatusBarController.swift
    Log.swift
  Sources/vdprobe/
  scripts/build-app.sh
```

### 4.2 显示状态管理：沿用"目标状态收敛"，只做局部修正
**不需要重新设计架构。** 这个执行器天然能应对"快速连点进入/退出"：每次点击只修改 `desired`，执行器一次只走一步，每步之后等待稳定，并发点击会被自然合并。这正是你要的稳定性。需要做的局部修改：

1. **删除分支**：`shouldDisablePhysical / physicalOverride / physicalOff / restorePhysicalNow / disablePhysicalIfNeeded` 及 `step()` 中 `:162, :177-179, :256-269`。
2. **去掉 `retiring`**：手动模式下不存在"换设备时先建新屏再删旧屏"的场景。切换预设走"先释放（受 minLifetime 保护）→ 再创建"的顺序即可（也可以只允许退出后再切换预设，见决策 D）。
3. **修复 A5**：在 `createDisplay` **之前**记录物理屏原点并写入 marker。
4. **修复 A2**：上线超时视为失败，把虚拟屏放进 `broken` 走正常的释放流程，状态改为 `failed("虚拟屏未能上线")`，不再继续执行后面的步骤。
5. **修复 A3**：设主屏的事务完成后，用 `CGMainDisplayID() == vd.displayID` 校验结果；失败时重试一次，仍失败就进入 `failed`，并主动释放虚拟屏回到干净状态。半成功的状态不可接受。
6. **修复 A4**：失败后不再静默停止。`failed` 状态在菜单中显示，用户再次点击「进入」时清除 `failedCfg` 并重试。
7. **对外暴露显式状态** `phase: idle / entering / active / exiting / failed(String) / wedged`，由 `desired` 和实际状态推导，菜单直接显示。
8. **换掉标识**：vendorID 改成另一个值（例如 `0x504D`），名称改为 `Pocket Mac`，以免和 UUyc companion、BetterDisplay 混淆（A9）。

### 4.3 能否减少显示配置操作的次数？可以
每次进入/退出手机模式，只涉及 **3 次拓扑变化**：建屏（含 applySettings）→ 一次原点事务（设主屏）→ 释放屏 + 一次原点事务（还原）。相比上游，去掉了禁用物理屏、恢复物理屏、换设备重建这些操作。可以进一步讨论的一点：

- **还原布局的事务能不能省？** 虚拟屏释放后，macOS 会自动选一个新的主屏。你只有一块物理屏，它必然成为主屏，原点也会自动归零。所以对你的机器来说，还原原点很可能是空操作。建议保留这段代码（多显示器时需要），但当只有一块物理屏、而且它已经位于 (0,0) 时跳过这次事务（`restoreOrigins` 中加一个判断）。

### 4.4 缩放与预设（基于 iPhone 16 Pro Max：1320×2868 px，逻辑 440×956pt）
macOS 没有全局 UI 缩放。唯一稳定、可恢复的手段是**调整虚拟屏的逻辑分辨率**（HiDPI 下逻辑尺寸 = 像素 ÷ 2）。不建议修改系统的辅助功能字号等全局设置：这些设置不会随进程退出恢复，违背"可恢复"原则。

| 预设 | 帧缓冲（px） | 逻辑尺寸（pt） | Mac 13pt 文字在手机上约等于 | 说明 |
|---|---|---|---|---|
| 大字 | 1320×2868 | 660×1434 | 8.7 iOS pt | 你今天已经用过；部分应用可能放不下（C2） |
| 标准 | 1600×3476 | 800×1738 | 7.2 iOS pt | 应用兼容性更好；字号已接近手机横屏看普通桌面的效果 |

**对你设想的一个提醒**：竖屏的优势只体现在"逻辑宽度很窄"时。逻辑宽度一旦超过约 850pt，竖屏手机上的字号就和横屏看普通桌面差不多了。所以两档预设都要压在 650–820pt 宽度之间，具体数值以阶段 0 的实测为准。

### 4.5 退出入口：手机上必须始终能退出
主屏是 660pt 宽时，菜单栏右侧的状态图标可能被 macOS 隐藏，你就点不到 Pocket Mac 了。可用的退出入口：
1. 菜单栏图标（可能被挤掉）
2. 热键 ⌃⌥⌘9（UU iPhone 的虚拟键盘能否发出这个组合，需要实测）
3. 在 UU 里切回 4K 屏，从那块屏的菜单栏退出（「显示器具有单独的空间」开启时，每块屏都有菜单栏）
4. **建议新增**：在虚拟屏角落放一个可拖动的小浮窗按钮「退出手机模式」（NSPanel，约 60 行），见决策 C。

---

## 5. 分阶段执行计划

### 阶段 0：验证关键假设（不写产品代码）
做法：在临时目录复制一份上游代码，删掉 AboutKit 依赖后只构建 `vdprobe`（`swift build --product vdprobe`）。或者直接用 BetterDisplay 建一块同尺寸的竖屏，来测试 UU 侧的表现（C1、C3 和虚拟屏的实现方式无关）。

| 测试 | 命令/操作 | 通过标准 |
|---|---|---|
| T1 竖屏 + 设主屏 + 释放 | `vdprobe 1320 2868 120` | 虚拟屏上线并成为主屏；释放后 4K 屏恢复主屏、原点为 (0,0) |
| T2 UU 竖屏体验（C1） | T1 停留期间在 iPhone 的 UU 里选择这块屏，把手机竖过来 | 全屏无黑边；点击、滚动、键盘正常 |
| T3 两档对比（C2） | `vdprobe 1600 3476 300` 对照 T1 | 选定两档最终尺寸；列出放不下的应用 |
| T4 显示中移除（C3） | UU 正在显示虚拟屏时让 vdprobe 结束 | UU 自动回到 4K 屏，连接不断 |
| T5 强杀（C4） | vdprobe 停留期间 `kill -9` | 虚拟屏立即消失，主屏和窗口都回到 4K 屏 |
| T6 睡眠/锁屏（C5、C8） | 停留期间 `pmset sleepnow` 后唤醒；锁屏；4K 显示器关机 | 记录虚拟屏是否在线、是否仍是主屏、UU 是否仍能选择 |
| T7 BetterDisplay（C6） | BetterDisplay 运行与退出各做一次 T1 | 确认是否需要在使用期间退出 BetterDisplay |

**闸门**：T2 或 T4 不通过时，先停下来重新评估方向，不进入阶段 1。

### 阶段 1：最小可运行闭环（MVP）
内容：新建包；移植 Bridge 和执行器（按 4.2 的 1–8 修改）；菜单栏的进入/退出/两档预设/退出 App；热键；启动时按 marker 恢复残留；退出收尾；`--stress N`；（可选）浮窗退出按钮。

验收标准：
1. 点「进入」后 5 秒内虚拟屏上线并成为主屏；点「退出」后 5 秒内虚拟屏消失、4K 屏恢复主屏、布局与进入前一致。
2. `--stress 50`（随机进入/退出/切换预设，间隔 0.3–6 秒）：日志中没有 ⚠️❌⛔，没有进入 wedged；结束后在线屏只有 4K 屏、它是主屏、原点为 (0,0)。
3. 在"进入中 / 已开启 / 退出中"三个阶段各 `kill -9` 至少 3 次：重新启动后 5 秒内回到干净状态（也就是即使不重新启动，显示状态也已经是干净的）。
4. 在"进入中"时选择「退出 Pocket Mac」：干净退出，不残留虚拟屏。
5. 不申请任何权限；只有 UUyc companion 和 BetterDisplay 都没有运行时，才进入真实的 UU 使用测试。
6. 用 UU iPhone 实际使用一整天，没有出现需要重启才能恢复的情况。

### 阶段 2：稳健性
内容：
- 监听 `NSWorkspace.didWakeNotification / screensDidWakeNotification`，并注册 `CGDisplayRegisterReconfigurationCallback`。这两处都只调用 `kick()` 触发一次重新校验：虚拟屏丢了就进入 `failed("系统回收了虚拟屏")`，等用户手动重新进入（**不自动重建**，避免抖动）；主屏丢了就重新设置一次。
- 如果 `respondsToSelector(terminationHandler)` 可用，就补上声明并接入。
- 启动时检查私有 API 是否可用；日志轮转；开机启动开关。
- 根据 T6 的结果决定是否在睡眠前主动退出手机模式。

验收标准：开启手机模式后连续睡眠/唤醒 10 次、锁屏/解锁 10 次、4K 显示器开关机 5 次，每次结束时的状态要么是"已开启且是主屏"，要么是"失败并已回到干净状态"。不允许出现"App 显示已开启，但实际上虚拟屏已经没了"。

### 阶段 3（暂缓，按需开启）
UU 断开后自动退出（只用覆盖窗口检测 + 宽限期）；更多设备预设；物理屏遮挡（如果确实需要，优先考虑可逆的方案，例如只调暗亮度，而不是禁用）。

---

## 6. 需要你确认的关键决策

**A. 方向闸门。** 今天用 UUyc companion 建出 1320×2868 竖屏后，你在 iPhone 上实际用起来怎么样？UU 是否正常竖屏全屏显示？660pt 宽的桌面能不能接受？这个回答会决定阶段 0 是只补测几项，还是全量测试。

**B. 虚拟屏是否设为主屏？** 推荐设为主屏：菜单栏、Dock、新打开的窗口都会出现在手机屏上。代价是坐在 Mac 前的人会看到 Dock 和新窗口"跑到看不见的屏上"，直到退出手机模式。不设主屏可以少一次显示配置操作，但在手机上操作 Dock 和新窗口会很别扭。

**C. 是否在虚拟屏上加一个浮窗退出按钮？** 推荐加，放在阶段 1。理由是第 4.5 节：要保证"从手机上总能退出"。

**D. 手机模式开启时，能否直接切换预设？** 推荐不能：开启时预设菜单置灰，需要先退出再进入，这样可以少一条"在线重建"路径。如果你经常需要在大字和标准之间来回切换，可以改成允许（执行器本身支持，只是多一次释放和重建）。

**E. App 崩溃或重启后，是否自动恢复手机模式？** 推荐不恢复：重新启动后保持关闭，只清理残留。自动恢复会让"崩溃 → 重建 → 再次崩溃"变成循环。

**F. 请描述你遇到过的"切换不稳定、恢复异常"的具体表现**（例如：屏幕全黑？被注销？窗口位置乱掉？UU 画面卡住？），以及当时是否开启了「远程时关闭除虚拟屏之外的所有屏幕」（你的 config.json 里目前是 `disablePhysical: true`）。如果是黑屏或注销，那和 A2 以及物理屏禁用有关，Pocket Mac 第一版的设计已经绕开了。

另外两点（不需要决策，但需要你知道）：
- 开发和测试 Pocket Mac 期间，**请退出并停用 UUyc companion**（它会在 UU 连入时自己建屏、设主屏，和 Pocket Mac 冲突），**测试时也先退出 BetterDisplay**，等 T7 确认两者没有冲突后再一起用。
- 一个值得考虑的替代方案：BetterDisplay 本身就能创建竖屏 HiDPI 虚拟屏，也能用快捷键开关。Pocket Mac 相对它的价值在于：一键进入/退出、虚拟屏生命周期绑定进程（App 一退出就保证干净）、零配置、零权限。如果你在阶段 0 发现 BetterDisplay 已经够用，Pocket Mac 也可以不做。

---

## 7. 进度记录

### 2026-10-16 阶段 1 MVP 完成（本机自动化验证部分）

已确认的决策：B 设为主屏 ✅；C 加浮窗退出按钮 ✅；D 开启时不能切换预设 ✅；E 崩溃后不自动恢复 ✅。

实现：根目录 SwiftPM 包 `PocketMac`（无第三方依赖），`Sources/PocketMac/` 共 7 个文件；`scripts/build-app.sh --install` 生成 `/Applications/Pocket Mac.app`（ad-hoc 签名，Bundle ID `local.pocketmac.app`，vendorID `0x504D`）。

**新发现：「糊」的根因（问题 A 的回答）【证实】**
在 macOS 26.5 上，带 `hiDPI = true` 的竖屏虚拟屏会同时生成 1x 原生模式和 2x 模式。系统默认选哪一个，取决于像素宽度：

| 像素宽度 | 系统默认模式 |
|---|---|
| 1320 / 1360 / 1400 | **1x 原生**（例如 1320×2868pt / 1320×2868px，看起来糊、字很小） |
| 1440 / 1520 / 1600 | 2x HiDPI（例如 800×1738pt / 1600×3476px） |

UUyc companion 给 iPhone 16 Pro Max 用的 1320×2868 正好落在 1x 区间。Pocket Mac 的处理办法：虚拟屏上线后，检查当前模式是否就是预设的 HiDPI 模式；如果不是，就在设主屏的**同一次配置事务里**用 `CGConfigureDisplayWithDisplayMode` 切到 HiDPI 模式。实测切换后虚拟屏仍能干净释放。

**本机验收结果（BetterDisplay 运行中）**
- `--selftest`：PASS。两档都是 HiDPI 2x（660×1434@2x、800×1738@2x）；进入约 3.2 秒，退出约 1.6 秒；退出后主屏、布局都与进入前一致。
- `kill -9`：在进入中、已开启（大字/标准）、退出中各测一次，虚拟屏都立即消失，4K 屏回到主屏 (0,0)。下次启动会按记录收尾（单屏时无需额外的显示配置事务）。
- `--stress 40`：PASS。创建/移除虚拟屏各 43 次（其中 13 次需要切到 HiDPI），没有出现 ⚠️/❌/⛔，没有失败，没有进入保护状态。
- 浮窗按钮：通过窗口列表确认它位于虚拟屏右上角（宽 190pt，在 660pt 宽度以内）。

**尚未验证（需要你用 iPhone 实测）**：UU 竖屏显示与清晰度、在 UU 里切换到虚拟屏（问题 F）、在手机上点击浮窗按钮、⌃⌥⌘9 热键、睡眠/唤醒（目前只记录日志，不做处理）。

### 关于"手机连上后无法切换到虚拟屏"（问题 F）的推测
1. 【迹象】UUyc companion 的 UU 连接检测会抖动：在 UU 里切换显示屏时，它可能误判为"断开"，于是删掉虚拟屏再重建，你刚选中的那块屏就没了。Pocket Mac 不监听 UU，这条路径不存在。
2. 【待测】UU 可能只在连接建立时读取一次显示屏列表。如果是这样，连上之后才新建的虚拟屏要断开重连才会出现。Pocket Mac 的手机模式和 UU 连接无关，可以先进入手机模式再连接；而且虚拟屏是主屏，UU 连上时很可能默认就显示它。
