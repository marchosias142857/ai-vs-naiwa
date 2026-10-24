# AI 大战奶蛙：demo 架构与集中评审入口

本项目是《AI 大战奶蛙》（AI VS NAIWA），与《奶蛙大战 AI》区分。此分支交付可完整游玩的一局：菜单 → 三层地牢 → Boss → 胜利/死亡结算 → 重来/返回菜单。视觉、图标与声音仍为灰盒占位，正式画面由 Claude 设计、负责人确认。

## 分支与评审方法

`gpt/demo` 从包含 #30 的 main 建立。功能 PR 已按负责人授权 squash 到集成分支；[集成 PR #33](https://github.com/marchosias142857/ai-vs-naiwa/pull/33) 不由 GPT 合入 main。请先读本文，再按下表顺序阅读各 PR 的独立 diff。共享契约 ADR 0006–0018 等待负责人随集成评审批准。

| 顺序 | PR                                                             | 内容                                    |
| ---- | -------------------------------------------------------------- | --------------------------------------- |
| 1    | [#32](https://github.com/marchosias142857/ai-vs-naiwa/pull/32) | AGENTS demo 分工与评审约定              |
| 2    | [#34](https://github.com/marchosias142857/ai-vs-naiwa/pull/34) | 确定性地牢与数据 schema                 |
| 3    | [#35](https://github.com/marchosias142857/ai-vs-naiwa/pull/35) | 房间、楼层、波次与胜负状态              |
| 4    | [#36](https://github.com/marchosias142857/ai-vs-naiwa/pull/36) | 10 把武器、5 种弹道、切枪               |
| 5    | [#37](https://github.com/marchosias142857/ai-vs-naiwa/pull/37) | 6 种普通敌人与三阶段 Boss               |
| 6    | [#38](https://github.com/marchosias142857/ai-vs-naiwa/pull/38) | 护甲、能量、冲刺、8 种升级              |
| 7    | [#39](https://github.com/marchosias142857/ai-vs-naiwa/pull/39) | 固定掉落槽、宝箱、刷怪导演              |
| 8    | [#40](https://github.com/marchosias142857/ai-vs-naiwa/pull/40) | Arcade 内墙、视线、门与位置同步         |
| 9    | [#41](https://github.com/marchosias142857/ai-vs-naiwa/pull/41) | DemoSession 场景接线与完整物理流程      |
| 10   | [#42](https://github.com/marchosias142857/ai-vs-naiwa/pull/42) | 手机技能/切枪/交互与手柄动作            |
| 11   | [#43](https://github.com/marchosias142857/ai-vs-naiwa/pull/43) | 默认 demo 入口、HUD、小地图、升级与结算 |
| 12   | [#44](https://github.com/marchosias142857/ai-vs-naiwa/pull/44) | 预警、命中、死亡反馈池                  |
| 13   | [#45](https://github.com/marchosias142857/ai-vs-naiwa/pull/45) | 楼层检查点验证与恢复 API                |
| 14   | [#46](https://github.com/marchosias142857/ai-vs-naiwa/pull/46) | 菜单、继续、战绩与持久化接线            |
| 15   | [#47](https://github.com/marchosias142857/ai-vs-naiwa/pull/47) | 暂停退出、手柄菜单与焦点释放            |
| 16   | [#48](https://github.com/marchosias142857/ai-vs-naiwa/pull/48) | 中英文、闪光与音效设置                  |
| 17   | [#49](https://github.com/marchosias142857/ai-vs-naiwa/pull/49) | 合成音效、固定声部与手势解锁            |
| 18   | [#50](https://github.com/marchosias142857/ai-vs-naiwa/pull/50) | 金币补给、武器信息、真实 Boss 通关验收  |
| 19   | [#51](https://github.com/marchosias142857/ai-vs-naiwa/pull/51) | 固定数组网格绕墙                        |
| 20   | [#52](https://github.com/marchosias142857/ai-vs-naiwa/pull/52) | 规则实体池、同步回收隔离、压力测试      |
| 21   | [#53](https://github.com/marchosias142857/ai-vs-naiwa/pull/53) | 输入隔离、结算控件、存储降级与全量验收  |

PR 中的验证结果反映各自提交；最终集成结果以本文末尾验收记录与集成 PR 最新 CI 为准。#52 同时修复 #51 fixture 的 prefer-const 检查。

## 实际可玩内容

- 三层普通地牢，每层 5×5 网格中的 8 个房间：安全入口、有限波次战斗、宝箱支线与出口；第四层为 Boss。小地图显示已探索房间与相邻连接。
- 10 把武器，单发/扇射/定时连发/双发/环射 5 种弹道，包含穿透与击退。开局只有免费手枪，第二槽为空；宝箱拾取第二把，替换时旧枪落在脚下，地面武器按房间保留到本层结束。
- 追击、快速追击、重装追击、保持距离射击、炮台、蓄力冲锋共 6 种普通怪；Boss 按生命阈值切换扇射、环射、密集环射。
- 生命、先吸收伤害的护甲、延迟护甲回复、有限能量、冲刺无敌；8 种升级每层出口三选一。金币可在出口换取生命/能量。
- 怪物有 40% 概率不掉落，另有清房奖励、宝箱武器，自动拾取物资/显式拾取武器；刷怪预警、冲锋危险提示、命中闪白、生命条、死亡回收、音效。
- 暂停、继续、楼层入口检查点、累计战绩、死亡/胜利结算、重玩；中英文、音效与受击闪光设置。保持已有离线 PWA 与更新提示机制。

## 模块与文件

| 责任               | 入口与关键文件                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 玩法数值/schema    | `src/data/{dungeon,rooms,layouts,weapons,attacks,enemies,player,loot,navigation}.ts`；`src/data/schema/`          |
| 地牢拓扑           | `src/sim/dungeon/generate.ts`                                                                                     |
| 几何与绕墙         | `src/sim/dungeon/{geometry,NavigationGrid}.ts`                                                                    |
| 局内状态与刷怪     | `src/sim/run/{DungeonRun,RoomDirector}.ts`                                                                        |
| 战斗 API/结算      | `src/sim/combat/{api,CombatWorld}.ts`                                                                             |
| 弹道与 AI          | `src/sim/weapons/patterns.ts`；`src/sim/ai/{brain,chase}.ts`                                                      |
| 资源/掉落/存档验证 | `src/sim/stats/PlayerResources.ts`；`src/sim/loot/LootSystem.ts`；`src/sim/run/checkpoint.ts`                     |
| 物理与池           | `src/game/world/{CombatBridge,RoomArena}.ts`；`src/game/entities/CombatActors.ts`；`src/game/pools/BulletPool.ts` |
| 一局接线           | `src/game/systems/{DemoSession,RunPersistence}.ts`                                                                |
| 菜单与战斗场景     | `src/game/scenes/{MenuScene,GameScene}.ts`；`M1Scene.ts` 仅用于回归入口                                           |
| 采样与操作         | `src/game/input/`；`src/game/ui/{InputScene,ActionButtons,MenuNavigation}.ts`                                     |
| HUD/交互           | `src/game/ui/{DemoHud,MenuPanel,PausePanel,SettingsControls}.ts`；`src/game/world/DemoObjects.ts`                 |
| 反馈               | `src/game/fx/{CombatFeedback,CombatAudio,params}.ts`                                                              |
| 浏览器服务         | `src/services/{storage,profile,settings,Sound,LifecycleService}.ts`                                               |
| 语言               | `src/i18n/{t.ts,zh-CN.json,en.json}`                                                                              |
| 读探针/调试        | `src/game/testHooks.ts`；`src/debug/DebugTools.ts`                                                                |

## 关键设计决定

### 时间与物理

输入层每个渲染帧只采样一次；PRE_UPDATE 将帧交给 bridge。桥接器锁存 `*Pressed`：0 个物理步不丢失，多步只消费一次。输入瞄准原点由本帧物理后的 GameScene.update 发布，保持 ADR 0004 与 #28 的采样顺序。

每个 WORLD_STEP：子弹寿命 → 同步真实 body.center → sim.step → 清边沿 → 应用速度/阶段 → 消费 BulletSpawn → 反馈计时 → 房间导演。Arcade 在此之前完成本步移动和重叠。掉落、波次、技能、无敌、反馈时长均按物理 dt 推进；HUD 文本按 4 Hz 刷新，小地图只在房间状态变化时重画。

sim 不依赖 Phaser/game/services，规则只决定速度与事实；game 提供墙体、视线和导航查询。ActorView/BulletSpawn/StepResult 都是当帧只读复用视图，表现层只复制标量。

### 随机与房间

所有玩法随机走 Random，各自 fork：地图、布局、刷怪种类/位置、武器散布、暴击、掉落、升级。地图连接是显式树边，网格相邻不自动连门；1000 个种子测试覆盖相同种子一致、全部连通与双向门。灰盒内墙使用 schema 校验的矩形模板，尚未引入 Tiled 资源。

门只有在波次清空后允许通过，进入时清除旧房弹丸和尸体并按脚底物理圆心放置玩家；身体位置始终是唯一位置依据。导航是固定数组 BFS，四组半径缓存分别保存阻挡与流场，目标格由坐标计算；按角色半径扩墙，碰撞仍由 Arcade 裁决。

### 资源与对象生命周期

预热 500 子弹、31 角色记录/物理对象、100 瞬时反馈、64 掉落槽/表现对象、8 个内墙对象；音频预热 8 个声部。满额明确拒绝生成或丢弃次要反馈，不允许无限增长。预警不依赖瞬时反馈池，因此火花满额不会隐藏危险提示。

死亡立即停碰撞，怪物反馈计时结束后 `finishDeath`；玩家保留读视图供结算。同步事件内退休的实体记录隔离到外层调用返回，避免新实体覆盖仍被命中处理读取的旧记录。

关闭场景时释放 WORLD_STEP/PRE_UPDATE/EventBus、DOM/输入/手柄菜单、对象池与墙体回调；重来新建 CombatWorld。InputScene 的场景实例可复用，布局缓存每次 create 重置。

### 检查点与离线

localStorage 保存 version=1 的楼层入口：种子、升级序列、装备、生命/护甲/能量/金币与累计成绩。继续会从本层入口重开，**不恢复房内战况、弹丸与逐帧随机流**；因此这不是录像回放或任意时刻快照。地图仍由同种子同楼层生成；upgrades/loot/encounters 按楼层 fork，使这三条流在继续与不中断的同一楼层入口一致。死亡/胜利清除检查点，成绩只写一次。

存储损坏、未知版本、未知 ID、非法数字被拒绝；存储禁用不会阻止游玩。PWA 沿用 Workbox，首次联网加载完成后可离线打开，更新须用户点击刷新，避免战斗中自动重载。

## 运行与操作

```bash
npm ci
npm run dev
npm run check
npx playwright install chromium
npm run test:e2e
```

桌面：WASD/方向键移动，鼠标瞄准与按住射击，Space 冲刺，Q 切枪，E 交互，Esc 暂停。触屏：左摇杆移动、右圆按钮自动瞄准射击、下方动作按钮。手柄：左杆移动、右杆可选手动瞄准、RT 射击、B 冲刺、Y 切枪、A 交互、Start 暂停；菜单用方向/A/RT。进入弹窗须先松开确认键，避免连射直接跳过选择。

`?scene=Game&seed=42` 跳过菜单，`&god=1` 无敌，`&debug=1` 面板/F1 碰撞框/F2 清房，`&weapon=shotgun_fan` 指定武器。`?scene=Game&room=arena` 保留旧 M1 回归场景。

## 验收证据与边界

2026-10-24：`npm run check` 全绿，29 个单测文件 / **181 项单测通过**；全量 Playwright **72 项通过、2 项按设备跳过**（桌面触屏用例、手机鼠标用例），包括离线与连续 Service Worker 更新。未放宽超时、未使用重试掩盖失败。核心用例明确区分：

- 地牢全流程 fixture 通过真实 Arcade 走门、波次与升级，使用 F2 同源的调试清怪推进三个普通楼层。
- Boss 用例通过真实自动瞄准射击与 Arcade overlap 击杀，不使用清怪；玩家 god 模式仅隔离难度因素。
- 击退在 1/60、1/120 秒物理步长下与相同步数的不开火对照组比较，误差 <0.5 px。
- 100 秒压力用例加速推进 6000 个真实物理步，持续补到 30 怪并射击，检查池上限和对象身份；它不代表真机 60 fps 或 30 分钟内存验收。

详细记录与截图见 [demo 验收记录](testing/demo-acceptance.md)。

## 已知范围与后续

1. 正式角色/场景美术、正式音效音乐、动画与 HUD 视觉方案仍待 Claude/负责人确认；目前是灰盒可玩版。
2. 当前按 MVP 体量实现 1 角色、10 武器、6 普通怪、1 Boss、8 升级；GDD 的 1.0 长期目标（6 角色、80 武器、多生态、局外成长）没有被本轮伪装成已完成。
3. 房间之间直接换房，灰盒布局来自 data 矩形，不包含正式走廊/Tiled 地图资产。
4. 按队伍拆分物理碰撞组仍依负责人要求暂缓；相同队伍/预警/死者的伤害过滤由 sim 执行。
5. 设置语言覆盖正常 demo 界面；工程调试面板与 M1 回归场景保留原文案。
6. 还需要 Claude 按 PR 顺序评审、负责人在 iOS Safari/Android Chrome 真机试玩并确定数值与手感；浏览器模拟不能代替真机。

## 集中评审修订

负责人确认的空武器槽、40% 不掉落、旧枪落地跨房保留已纳入 ADR 0018。动作改为 pointerdown；有存档时全局 Enter 继续，新局需二次确认。AGENTS 临时 sim 分工在 #33 合入 main 时结束；完整现场存档 v2 等 Claude 独立 ADR，真机性能/兼容性记录到 #18。
