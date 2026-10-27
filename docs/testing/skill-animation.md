# #101 第 3 步：技能动作与必要提示接入

基线 main `ce358318f1c5c836983d7bde7d4fe467445ab43f`；依赖 Claude #113 的 `42d3840bb6c95b5412041a85ff2f63256c2bc545`。按[定稿方案](../design/monster-skill-moves.md)接入，来源分类继续沿用 [#112 审计](https://github.com/marchosias142857/ai-vs-naiwa/pull/112)。#112/#113 均未由 GPT 合并；ROADMAP/AGENTS 状态更新仍由 #112 维护，避免重复改写。

## 改动

- `skillPose` 只读阶段、进度、锁定方向；一次性动作按阶段比例选帧，旋转/地下按 `stageTime` 循环。原图保持 v4 造型、精度与帧数，压身、后坐、伸展、膨胀只作用于独立图片。
- 技能不再使用观察时钟；待机、移动、死亡仍沿用原时钟。受击不遮盖前摇/腾空；冰蓝优先于受击闪白。石雨跺脚和放毒鼓动是预算控制的短装饰，读档不补播。
- 必要 Graphics：巨爪爪痕、角冲擦痕、舌击口水点、冲撞人字箭头、跳跃落点影子、自爆八道范围刻度、地下土包/出土裂缝、眩晕星星、全下落时段的落石影子。暗影两端保留短奶白边，使深色地板上也能认出位置。
- 必要提示没有 FxBudget 准入；冻结后保持阶段、形变和几何，不使用全局脉动。落石末段尘点、事件扬尘与短装饰动作仍受预算控制。
- 同 PR 移除通用技能圈、舌击红虚线、冲撞红通道、自爆圈及落石红圈/填充。出生红圈、毒气/奶潭、机关、弹体、光束、实际爆炸保留。舌头收回只有画面，不延长伤害。
- 中英文图鉴同步，明确普通射击在准备就绪后可以直接开火；没有为旋转、放毒或石雨新增 sim 阶段。
- `HazardLayer` / `CombatFeedback` 显式销毁释放自身对象并解除 shutdown 监听，重复构建不保留旧提示。

## #113 review 与兼容补丁

在指定 head 的隔离检出运行完整 `npm run check`：Prettier **3.9.10**、ESLint、TypeScript、55 个单测文件 / **428 项单测**和 Vite 生产构建全部通过。[review](https://github.com/marchosias142857/ai-vs-naiwa/pull/113#pullrequestreview-5670768558) 已附发现和复现，未写 Claude 分支。

旧冲锋档 `brain.span=0` 时，原实现每步用递减的 `time` 作为总时长，使 `stageTime` 整段保持零。补丁仅从同一份 `ENEMIES[kind].dash` 恢复旧档阶段总时长；不修改存档、随机、攻击时间、冷却、伤害或身体圆。新增前摇/冲刺/收招三个中途旧档的推进、冻结和再次读档回归；ADR 0038 修正兼容性说明。

## 关键帧与状态证据

[采样元数据](skill-animation/samples.json)记录每格的 stage/time/span/lock。样本由真实 AI 以 1/60 秒运行产生，使用真实图集和实际 EnemyArt/HazardLayer/CombatFeedback 渲染。画面是隔离验证场景，使用游戏地板纹理；不是负责人手机实测。没有对应阶段时表格明确留空，不虚构前摇或收招。

| 图                                          | 覆盖                                                     |
| ------------------------------------------- | -------------------------------------------------------- |
| [关键帧 1](skill-animation/keyframes-1.png) | 巨爪、角冲、蓄跳、膨爆、围舌                             |
| [关键帧 2](skill-animation/keyframes-2.png) | 负卵、鼓腮、菌冠、铲爪、鳍舞                             |
| [关键帧 3](skill-animation/keyframes-3.png) | 放毒、Boss 冲撞/跳跃/召唤/石雨                           |
| [关键帧 4](skill-animation/keyframes-4.png) | Boss 旋转/射击、撞柱眩晕、落石首步/落地/崩解             |
| [冻结](skill-animation/frozen.png)          | 30 怪同组样本；普通怪冰蓝且提示保留，Boss 按既有规则免疫 |
| [读档首帧](skill-animation/load.png)        | 不等待事件重放的身体与必要提示                           |
| [装饰预算为零](skill-animation/zero.png)    | 30 怪与落石，`admit` 全部拒绝，必要提示仍存在            |

活跃事件样本的生效首步回放该步记录的事件，以显示原有爆炸/落地扬尘；读档和零预算模式不补这些事件。冻结检查在真实 sim 冻结状态下推进十个物理步，对比图片帧/变换和提示命令缓冲。落石独立于施法者，施法者冻结或死亡不会抹掉已经生成的石块。

## 本地验证（PR #120）

完整 `npm run check` 已通过：Prettier 3.9.10、ESLint、TypeScript、55 个文件 / 430 项单测、Vite 生产构建。技能验证包含 70 个真实阶段样本、38 个冻结检查、25 个必要提示检查；重建前后显示对象 730 个、纹理 22 张，未增长。

构建前清空生成目录，PWA 预缓存保持 20 项（11533.75 KiB）。相对 #113，主 JS 从 1,657,451 增至 1,662,098 字节（+4,647）；相同 Python gzip 方法从 446,809 增至 448,495 字节（+1,686）。没有新增运行时图片。[完整性记录](skill-animation/integrity.json)包含 7 张已上传图片的字节数、SHA-256、Git blob SHA 和远端一致性。

全量 Chromium E2E（桌面 + Pixel 7 横屏、单 worker、零重试）：**202 通过、18 个原有设备条件跳过、零失败**，20.4 分钟完成。[逐项结果](skill-animation/e2e.json)保留名称、状态、耗时与跳过条件。两端均通过真实子路径 manifest/安装条件、断网刷新、关闭重开、图鉴资源离线、连续两次更新及跨标签页不强制刷新；新技能专项、正式续玩/冻结倒计时、输入与对象池压力也均通过。

本机使用仓库配置的两套 Chromium 项目，只替换浏览器可执行路径、启动参数、预览端口与 reporter。原配置另外 6 项 WebKit 测试受下述系统依赖限制，未计入 18 个条件跳过；不能将本结果称为包含 WebKit 的完整 `npm run test:e2e` 全绿。

[性能原始数据](skill-animation/performance.json)：独立完成 ABAB 四轮，seed 42、1920×1080 / DPR 1，每轮预热后至少 240 个实际渲染帧。两版都在原 StressRun 加入 HazardLayer 和相同的 13 种怪物；固定容量模式对两版统一禁用石块重叠回调的弹丸消耗，并断言实测始终为 30 怪 / 400 弹。此处理仅存在于脚本生成的测量副本，正式游戏与碰撞回归保持原样。

| 轮次    | #113 基线 FPS / p95 | 本 PR FPS / p95 | draw call | 显示对象       |
| ------- | ------------------- | --------------- | --------- | -------------- |
| A1 / B1 | 13.96 / 98 ms       | 14.50 / 83 ms   | 均为 9    | 均为 849 → 849 |
| A2 / B2 | 15.25 / 77 ms       | 15.68 / 73 ms   | 均为 9    | 均为 849 → 849 |

两轮均值为 14.60 → 15.09 FPS，本次环境未观察到回退；两轮不足以声称普遍性能改善。这里是云端 SwiftShader 软件渲染数据，不能作为 iPhone 帧率或硬件达标证明。必要提示的生命周期/纹理数量另由 70 个样本的重建审计覆盖。

WebKit 浏览器下载成功，但宿主缺少 GTK/GStreamer 等动态库；`playwright install-deps webkit` 因宿主 setgroups/seteuid 权限限制失败，不能把手机尺寸 Chromium 当作 Safari 验证。

复现命令（Node 22，仓库锁定依赖；不新增依赖）：

```sh
npm run check
npm run test:e2e
node scripts/capture-skill-animation.mjs
SKILL_BASELINE=/path/to/isolated-pr113 node scripts/benchmark-skill-animation.mjs
```

证据脚本支持 `SKILL_BROWSER` / `SKILL_BROWSER_ARGS` 指定现有 Chromium；执行时还需浏览器的字体配置。浏览器测试覆盖桌面与 Pixel 7 横屏；这不等于 iPhone 真机验收。

## 交付边界

远端 CI 继续关闭；没有合并、改写 main 或 Claude 分支。必要反馈与旧提示删除按负责人要求放在同一 PR。新 PNG 全为测试证据，不加入运行时包与 PWA 预缓存；游戏沿用两张 v4 怪物图集。#101 保持打开，待 Claude 交叉评审、负责人真机确认可读性与合并。#114–#119 只保持已登记队列，不在本 PR 开工。
