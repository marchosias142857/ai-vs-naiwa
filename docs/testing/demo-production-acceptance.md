# 大肥鱼 demo：制作交付与自审

负责人授权 GPT 独立完成 demo，包括 sim 与共享契约；不等待 Claude 评审或画面方案确认。所有 PR 由负责人合并。**只有负责人宣布 demo 完成后，才进入 GPT 与 Claude 合作细化阶段。** 本文是当前版本入口；旧灰盒验收保留在 demo-acceptance.md。

## 当前可玩内容

- 一局完整流程：菜单、新局/续玩、三层地牢、房间波次、宝箱与掉落、八种升级、Boss、死亡/胜利结算、重来。键鼠、手柄和触屏均可操作。
- 大肥鱼 12 帧：待机、跑步、受击、死亡；身体只留提裙手。十二件武器各用图集中的独立图片，握把自带简洁色块小手；10 把弹幕武器、弯刀、重锤。
- 每帧持握点驱动视觉，左瞄准镜像、绕握把旋转，上举时武器在身体后方。sim 枪口只读固定标准点，动画不改变弹道；身体中心与碰撞圆、输入瞄准坐标一致。
- 近战由 WORLD_STEP 判定范围、扇形、墙体、时长和冷却；同一次挥动不重复伤害同一目标，不借用子弹池。挥动与命中事件驱动弧光、火花与原创合成音效。
- 轮盘按下先等待，拖出死区立即朝拖动方向首发，死区内 120 ms 后朝当前面向首发；每次重新按下重新计时，松手停火。等待期间 InputFrame.fire=false；鼠标和手柄行为保留。
- 海底遗迹地面、墙体、石柱、灯、宝箱与水晶出口；主菜单背景、生命/护甲/能量条、小地图和按设备显示的操作提示。
- 完整现场存档 v2：物理槽位与空闲栈、随机流、飞行子弹、死亡计时、暂停原因与输入清理、入口兜底、三种提示和恢复倒计时。近战剩余挥动和已命中目标同样保存。

## PR 与合并顺序

#66 已合入 main。先合并 [#72](https://github.com/marchosias142857/ai-vs-naiwa/pull/72) 的 AGENTS 更新，再按下列依赖顺序处理功能 PR。每合并一项后，将下一项 rebase / retarget 到更新后的 main，并以更新后的 CI 为准；**不要把子 PR 合入上一个功能分支**。GPT 未合入 main、未部署。

| PR                                                                                                                              | 范围                                                     |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [#68](https://github.com/marchosias142857/ai-vs-naiwa/pull/68) → [#69](https://github.com/marchosias142857/ai-vs-naiwa/pull/69) | 物理快照/槽位/尸体；暂停原因/倒计时/输入清理             |
| [#70](https://github.com/marchosias142857/ai-vs-naiwa/pull/70) → [#71](https://github.com/marchosias142857/ai-vs-naiwa/pull/71) | 存储校验/兜底；完整场景/菜单/同步保存                    |
| [#73](https://github.com/marchosias142857/ai-vs-naiwa/pull/73) → [#74](https://github.com/marchosias142857/ai-vs-naiwa/pull/74) | 轮盘首发；sim 字段校验和正式续玩                         |
| [#75](https://github.com/marchosias142857/ai-vs-naiwa/pull/75) → [#76](https://github.com/marchosias142857/ai-vs-naiwa/pull/76) | 原创图集/持握数据；近战/事件/挥动存档                    |
| [#77](https://github.com/marchosias142857/ai-vs-naiwa/pull/77) → [#78](https://github.com/marchosias142857/ai-vs-naiwa/pull/78) | 身体中心/固定枪口；动作/持握/遮挡/声画反馈               |
| [#79](https://github.com/marchosias142857/ai-vs-naiwa/pull/79) → [#80](https://github.com/marchosias142857/ai-vs-naiwa/pull/80) | 场景与物品；菜单/HUD/设备提示                            |
| 本 PR                                                                                                                           | 最终自审、离线图片断言、真实界面截图、压测证据与文档校正 |

契约变更附 [ADR 0021](../adr/0021-demo-art-anchors.md)、[0022](../adr/0022-melee-combat.md)、[0023](../adr/0023-body-centered-combat.md)，由负责人合并批准。存档遵循已批准的 ADR 0019。

## 验证证据

- 本地 Node 24 + 锁定依赖：`npm run check`，40 文件 / 286 项单测，格式、ESLint、TypeScript、生产构建通过。
- 完整组合浏览器回归：138 通过，8 按设备条件跳过，桌面与 Pixel 7 横屏 Chromium。覆盖四向握持/镜像/遮挡、移动换帧、重锤挥动中暂停→刷新→继续、Boss 实际击杀、死亡结算、完整存档、生命周期、多指、手柄、离线和更新。
- 存档一致性：sim 近战挥动中 JSON 往返后，后续 180 个同输入步的完整状态与事件严格相同；真实 Arcade 场景也有 180 步一致性对照。轻量解析和 zod 共享字段规则并成对测试；运行时 sim 不依赖 zod。
- 生产离线用例在断网关闭后重新打开 Game，检查真实角色视觉存在，并逐一获取五张 PNG，避免仅凭场景成功掩盖缺图回退。
- 所有截图来自浏览器实际运行；既有测试中的 fixture 可保留灰盒，用于物理回归。以下交付截图来自正式入口，不使用 fixture 替代。

### 包体、缓存与对象池

图片合计约 6.50 MiB，单文件均小于 2 MiB；生产预缓存 13 项、约 7.96 MiB（含应用 JS/CSS、图集、标题及图标）。入口 JS gzip 约 401 kB。没有新增运行时依赖、外部音频或网络素材。五张图片均由 Workbox 预缓存。

角色视觉、影子、武器、弧光及掉落对象初始化预热；31 角色、500 子弹、100 瞬时反馈、64 掉落槽和 8 音频声部继续复用。房间只有一张 TileSprite 地面，切房复用墙体、灯和物品。

以下是 GitHub Actions Linux Chromium / SwiftShader 的短时实际绘制记录（#80 的组合版本，约 120 帧），包含角色、独立武器、环境图集及触屏控件。不是手机硬件或 30 分钟稳定性验收。

| 模式                   | 桌面 draw 平均/峰值 | 横屏模拟 draw 平均/峰值 |    显示对象数 |
| ---------------------- | ------------------: | ----------------------: | ------------: |
| 30 怪 / 400 弹固定负载 |               9 / 9 |              15.02 / 16 | 772，始终不变 |
| 正常命中/死亡/补怪战斗 |               9 / 9 |              13.77 / 16 | 772，始终不变 |

原始记录：[桌面固定](performance/art-desktop-capacity.json)、[桌面战斗](performance/art-desktop-combat.json)、[横屏固定](performance/art-mobile-capacity.json)、[横屏战斗](performance/art-mobile-combat.json)。旧灰盒记录未覆盖，保留对照。

## 运行和试玩入口

```bash
npm ci
npm run dev
npm run check
npx playwright install chromium
npm run test:e2e
```

从最新评审分支运行即可试玩整套功能。默认菜单正常游玩；`?seed=42&weapon=cutlass` 或 `?seed=42&weapon=anchor_hammer` 快速试刀/锤，`?scene=Game&seed=42&god=1&debug=1` 查看命中区（F1），`?stress=1&seed=42` 与 `?stress=combat&seed=42` 导出压力记录。调试参数不用于正式难度评价。

桌面 WASD/方向键移动，鼠标瞄准、按住攻击，Space 冲刺、Q 切枪、E 交互、Esc 暂停；触屏左杆移动、右轮盘定向攻击；手柄左杆移动、右杆瞄准、RT 攻击。

## 仍由试玩决定的事项

1. 逐帧肩膀坐标和时长尚未收到精确信息，集中在 `src/data/art.ts` 使用暂定初值。武器握把、枪口及上举阈值都有 schema；后续可只换资源和数据。
2. 120 ms 首发延迟、刀锤范围/时长/冷却、难度与画面比例等待负责人试玩调整。现有怪物 AI 已可游玩，合作细化阶段再一起改进。
3. iOS Safari / Android Chrome 真机的保存总时长、切 App / 系统回收、音频与多指兼容，以及 30 分钟 FPS/内存仍需实际设备验证；浏览器模拟没有证明这些指标。
4. 美术与音效来源见 [制作记录](../../art-src/demo/README.md)。负责人上传的参考原图没有提交到仓库，发布内容只有为游戏新制的图集与代码；当前无背景音乐。
