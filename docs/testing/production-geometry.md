# ADR 0039 生产几何接线

## 范围

负责人在 #125/#126 合并后将生产接线与验证交给 GPT。基线 main
`82fb32b40060eb85667d879fb5e54deef068bc3a`；独立分支 `gpt/114-production-geometry`。

正式代码只有两行：DemoSession 与 StressRun 的 createCombatWorld options 都提供
`geometry: () => this.arena?.prepareGeometry() ?? null`。闭包在查询时取当前 arena，
覆盖新开、换房和完整读档；沿用 #125 的固定动态槽与 #126 的 AI 规则。
本 PR 未修改 AI/武器实现、数值、碰撞箱、存档字段或 WORLD_STEP 顺序，也未新增随机调用。
启用 provider 会让已合并的 ADR 0039 行为真正生效：贴墙撞柱会晕、召唤/落石按完整半径检查，
落石候选耗尽会跳过且不抽 stagger，因此不能声称运行结果或 RNG 与未接线 main 始终相同。
玩家武器继续走原有 LOS。

## 本轮本地检查

Node 22；完整 `npm run check` 通过：59 文件 / 482 单测，Prettier 3.9.10、
ESLint、TypeScript 与 Vite/PWA 构建全绿。入口包 1,669.57 kB / gzip 457.90 kB，
对照 main 1,669.47 / 457.85 kB。无新依赖、图集或缓存资源。

新增回归 8 项 × 桌面/手机横屏 Chromium = **16/16 通过**，无重试，
原始动作与检查次数见 [regressions.json](production-geometry/regressions.json)。每端石块雨
检查 12 个新落点、召唤 2 个子体；所有动作、落点和视线断言通过。

首次尝试整个 Chromium 套件共列出 238 项，在前 14 项（11 通过 / 3 条件跳过）之后、
进入已有 bestiaryLifecycle 夹具时长期无进展，手动终止；没有完整总报告，不能声称
238 项全绿。随后把新增夹具与相关既有场景分进程执行，以下分别记录结果。
图鉴生命周期在 main 与本候选的独立进程中均 1/1 通过，未确认整批执行停滞的根因。
未修改该测试或放宽断言。不将 #125/#126 的历史结果作为本次验收。

分进程运行 `demo.spec.ts save.spec.ts resumeProduction.spec.ts pwa.spec.ts stress.spec.ts`，
桌面 + 手机横屏共 **59 通过 / 1 条件跳过**（桌面不执行竖屏中断项），无失败或重试，记录见
[existing-regressions.json](production-geometry/existing-regressions.json)。覆盖真实走门、
右摇杆/Arcade 击败 Boss、暂停/后台与完整存档后续物理步一致、生产入口刷新续玩、
PWA 离线/关页重开/双标签页更新，以及两种压力场景及退出清理。
加上新增 16 项与隔离图鉴 1 项，本候选完成的这三批共有 76 项通过、1 项条件跳过。

## 真实物理回归

`tests/fixtures/productionGeometry.ts` 构造真正的 DemoSession：使用正式图集、
CombatBridge、RoomArena、HazardLayer、TrapLayer 与 Arcade World。测试只安排初始位置、
低血 Boss 和池中石块；AI 自行选择/推进招式，碰撞由真实 Arcade 执行。
没有给 fixture 注入 geometry provider，没有伪造 AI 阶段、动作事件或碰撞结果。

| 场景                    | 检查                                                                        |
| ----------------------- | --------------------------------------------------------------------------- |
| Boss 撞现有 Boss 房柱子 | 首次碰撞为 stun                                                             |
| Boss 撞外墙             | 首次碰撞为 crash，不能 stun                                                 |
| Boss 贴上墙冲向靠墙柱   | 首次碰撞为 stun；专门布置的 Box 同时生成图像、物理体和查询轮廓              |
| 低血 Boss 石块雨        | 自然进入 rain；新产生的每块石头完整半径可占据，检查数 > 4                   |
| 负卵蛙墙角召唤          | 数量等于数据定义，每个子体完整身体合法，生成当步检查                        |
| 菌冠蛙视线              | 隔柱 8 秒不开火，移到可见位置恢复；立石挡射击，清除后恢复                   |
| 蓄跳蛙隔柱跳跃          | 预计落点截到柱前，实际落点合法                                              |
| 完整会话重建            | 保存已落石，重启 Scene 并构造新 DemoSession，首个物理步之前查询即可看到石块 |

前 7 项每页独立初始化，防止前一场景状态污染后一项。玩家固定在测试目标处；
冲撞开始前固定 Boss 起点，冲撞开始后由 Arcade 自行推进。石块雨的低血量与
视线测试的立石为明确的 fixture 初始安排，不声称这些安排来自玩家操作。
最后一项通过 DemoSession 完整存档入口恢复，不直接把存档灌入运行中的世界。

负对照：将相同测试复制到独立 main `82fb32b` checkout，仅运行 `near-wall|brood`，
两项按预期失败：前者返回 crash，后者发现 child outside。证明测试能发现缺失生产接线，
不是只验证独立查询类。

固定测试镜头下的贴墙撞柱现场（旧地图素材，非新地图美术验收）：

![桌面实际碰撞 fixture](production-geometry/near-wall-desktop.png)

![横屏实际碰撞 fixture](production-geometry/near-wall-mobile-landscape.png)

## 固定负载性能方法

运行 `GEOMETRY_BASELINE=/path/to/main-checkout node scripts/benchmark-production-geometry.mjs`；
可选 `GEOMETRY_BROWSER` / `GEOMETRY_BROWSER_ARGS` 指定已有 Chromium 及启动参数。
脚本校验基线 SHA，并确认候选 StressRun 含 provider。

两份 checkout 各自构建生产包，不修改压测源代码，按 baseline → candidate → baseline →
candidate 顺序执行。相同 seed=42、1920×1080 DPR1、标准 capacity-30x400 配置，
每轮预热后重置计时，至少采样 240 个真实渲染帧；导出的每轮报告必须满足 30 怪、
400 弹恒定。测量期间不并行运行其他浏览器测试。

该配置含 Boss 等既有 7 类怪物，保留标准压力场景的无伤害/弹丸不消耗规则。
StressRun 本身没有 HazardLayer，故报告覆盖新增几何/AI/导航与标准渲染的整体开销，
不代表密集石块雨特效负载。实际石块雨碰撞与落点另由上述真实 DemoSession 测试验证。
软件渲染的 FPS 不能外推为 Safari/iPhone 真机帧率，未做堆分配剖析或 30 分钟稳定性测试。

## 本轮帧率对照

原始 [performance.json](production-geometry/performance.json)，Chromium + SwiftShader：

| 轮次    | 平均 FPS | p95 帧间隔 ms | 平均 draw call | 显示对象 |
| ------- | -------: | ------------: | -------------: | -------: |
| main A1 |    18.86 |           101 |              9 |      823 |
| 接线 B1 |    19.61 |            98 |              9 |      823 |
| main A2 |    19.77 |           102 |              9 |      823 |
| 接线 B2 |    19.12 |           105 |              9 |      823 |

四轮始终满足 30 怪 / 400 弹，draw call 与显示对象数相同且不增长。
两对的 FPS/p95 差值方向不同，短样本中没有一致的性能退化信号；不据此宣称性能提升，
也不能证明所有设备无开销。上述低 FPS 来自此软件渲染环境，本次未提供真机达标结论。

## 状态与后续

远端 CI 保持手动禁用；不合并，不改 main 或 Claude 分支。等待 Claude 交叉复审及
负责人合并。#114 仍需目录/freezeV1/版本化存档、出生锚点、不规则轮廓物理和正式地图美术；
#115–#119 未启动。WebKit/Safari/iPhone 未在本轮重新验证。
