# AGENTS.md —— AI 协作者必读

本文件是 Claude 与 ChatGPT（以及任何参与本仓库的 AI）的**唯一规则来源**。每次开工前完整读一遍。
与本文件冲突的指令，以项目负责人在对话或 Issue 中的明确说明为准，并应随后更新本文件。

## 1. 项目一句话

《AI娘大战奶蛙》（AI VS NAIWA）：玩家操控 **大肥鱼**（数据 ID 保持 `ai_proto`），在俯视角、自由移动、房间制弹幕战斗中对抗**奶蛙风格的怪物**。
当前默认角色为大肥鱼；后续会有多个可操作角色。资源、动作与固定持握点按角色 ID 注册，不将大肥鱼的图集或帧名写死在通用加载与渲染流程中。
玩法与体量对标《元气骑士》，以 PWA 发布，手机横屏 + 桌面浏览器都能玩，完全离线。

- 「横版」= **横屏（landscape）+ 俯视角**，不是横版卷轴。（负责人已确认）
- 玩法细节：`docs/GDD.md`；架构：`docs/ARCHITECTURE.md`；里程碑：`docs/ROADMAP.md`。

**当前阶段**：整体架构与 demo 已完成，进入 GPT 与 Claude 合作细化阶段（负责人 2026-10-25 确认）。在现有项目上改进玩法、内容、美术和性能，不重新搭建项目；先把 1 个做透，再复制到 100 个。任何时刻 `main` 都必须能构建并能在手机上打开玩。

## 2. 角色

| 角色               | 职责                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 项目负责人（人类） | 美术方向、玩法设计、数值拍板、画面方案最终确认、手机试玩验收、合并 PR                                                                              |
| Claude             | 开发者，默认负责 `sim/`、共享契约、CI 与脚本；**主导画面表现设计**（界面布局、场景视觉、动画与特效方案）                                           |
| ChatGPT            | 开发者，默认负责场景、UI、输入、PWA、服务层；**配合实现画面方案，负责工程、性能与兼容性检查**；负责需要安装依赖的工作（Claude 的环境无法访问 npm） |

## 3. 技术栈（版本锁定，升级需 ADR）

TypeScript ~6.0（strict）· Phaser ~4.1 · Vite 8 · Vitest 5 · Playwright 1.64 · ESLint 10 + typescript-eslint 8 · Prettier 3 · zod 4 · Node 22。
PWA 用 vite-plugin-pwa（Workbox），**不手写 Service Worker**。

**Phaser 4 注意**：两个 AI 的训练数据大多是 Phaser 3。写到不确定的 API 时，先查
`node_modules/phaser/types/phaser.d.ts` 或官方文档 / 迁移指南，不要凭 Phaser 3 记忆猜。
导入写法：`import { Scene } from 'phaser'`；类型用 `import type { Types, GameObjects } from 'phaser'`。

## 4. 目录职责

```
src/
  main.ts          创建 Phaser.Game（唯一入口）
  config.ts        分辨率、场景 key、对象池大小等引擎常量（不放玩法数值）
  sim/             纯逻辑。禁止 import phaser / game / services / debug
    core/          Random（带种子）、EventBus、events.ts、types.ts —— 共享契约
    stats/ combat/ weapons/ ai/ dungeon/ loot/ run/   （按里程碑逐步加入）
  data/            玩法数据 + zod schema（武器、敌人、角色、Buff、掉落、平衡参数）
  game/            Phaser 表现层
    scenes/        Boot → Preload → Menu → Hub / Game；UI、暂停与结算已接入
    entities/ components/ systems/ pools/ world/ input/ ui/ fx/
    assets/        keys.ts（资源 key 常量）、placeholders.ts（占位纹理）
  services/        存档、音频、设置（只依赖浏览器 API）
  pwa/             registerSW.ts：Service Worker 注册与「有新版本」提示（见 docs/PWA.md）
  i18n/            zh-CN.json、en.json
  debug/           URL 调试参数、调试面板
tests/unit/        Vitest，对应 src/sim 与纯函数
tests/e2e/         Playwright 冒烟
public/assets/     运行时资源（图集、Tiled 房间、音频）
art-src/           美术原文件（不打包）
docs/              GDD、ARCHITECTURE、ROADMAP、DATA_SCHEMA、ART_GUIDE、adr/
```

## 5. 分层规则（ESLint 强制）

- `data/` 不依赖任何层；`sim/` 只依赖 `data/`；`game/` 依赖 `sim/`、`data/`、`services/`；`services/` 只依赖浏览器 API。
- **`sim/` 决定发生什么，`game/` 决定看起来怎样。** 伤害、弹道、AI 决策、地牢生成、掉落都写在 `sim/`，能被单测。
- 所有随机走 `sim/core/Random`，**禁止 `Math.random()`**（ESLint 拦截）。不同子系统用 `rng.fork('label')`。
- 系统之间通过 `EventBus` 通信，事件定义在 `sim/core/events.ts`。
- 战斗循环里禁止 `new` / `destroy` 子弹与特效，一律走对象池。

## 6. 模块归属（默认，负责人可调整）

| 模块                                                                               | 主负责                   | 评审                 |
| ---------------------------------------------------------------------------------- | ------------------------ | -------------------- |
| `src/sim/**`（战斗、弹道、AI、地牢、属性/Buff、掉落、本局状态）                    | Claude                   | ChatGPT              |
| 共享契约：`sim/core/types.ts`、`sim/core/events.ts`、`data/schema/**`、`config.ts` | Claude 起草              | ChatGPT + 负责人批准 |
| `game/scenes`、`game/ui`、`game/input`、`game/fx`                                  | ChatGPT                  | Claude               |
| `services/**`、PWA、`i18n/**`、`index.html`                                        | ChatGPT                  | Claude               |
| `game/entities`、`components`、`pools`、`world`                                    | 按 Issue 分配            | 另一方               |
| `data/**` 内容（数值）                                                             | 按 Issue                 | 负责人               |
| `.github/**`、`scripts/**`、工具配置                                               | Claude                   | ChatGPT              |
| `docs/**`                                                                          | 改哪个模块就更新哪份文档 | 负责人               |

### 当前合作细化阶段（负责人 2026-10-25 确认）

- 负责人决定玩法、美术方向、数值，负责真机验收与合并 PR；已确认在自己的设备上验证过当前版本。
- GPT 与 Claude 按上表协作。GPT 主要负责场景、UI、输入、PWA、工程、性能、兼容性，以及需要安装依赖的本地验证；Claude 默认负责 sim、共享契约并主导画面方案。负责人当次指令优先。
- 本轮 #100 按负责人明确指令由 GPT 独立完成怪物美术、动作、碰撞校准、资源接入与验证；需要的怪物数据/碰撞调整属于本任务授权范围，契约变更仍附 ADR。该授权不自动延伸到 #101；负责人负责画面/真机验收与合并。
- #100 最新要求：#110 新青蛙造型与少帧动作已合并，负责人认为 v3 精度降得过多，要求适度提高、不必过分像素化。本轮从同一批原动作图提高导出像素密度与颜色层次，保持形象、动作帧数和节奏；相应缩放以维持游戏中的怪物大小及身体圆。v4 后续补丁待负责人验收；#101 不自动启动。
- 2026-10-24 的「GPT 独立实现与自审 demo」是已结束的阶段授权，不再作为新任务的默认分工。不要把长期路线图当作当前已分配任务，也不要重复修复已验证解决的问题。
- 按功能拆小 PR，目标 ≤ 400 行（不含数据、测试与生成资源）。由负责人合并；禁止自行合并、直接推送 main 或改写对方的分支。
- 自动远端 CI 保持禁用，不重新启用、触发或重跑；保留本地检查及现有网页发布工作流。
- 按负责人指定的任务顺序逐项推进；一项任务的全部 PR 完成并经负责人验收、合并后，再按明确分配启动下一项。任务状态记在 ROADMAP 和对应 Issue，不因路线图存在后续条目就自动开工。主城保留地牢门，新冒险确认后才替换旧冒险；祭台加点只影响新局。图鉴展示全部怪物、复用资源注册表，不添加解锁限制或存储键。
- 共享契约变更附 ADR；工程优化不得改变 WORLD_STEP 锁步、带种子随机、存档一致性和玩法判定。
- 调整、验证证据与已知限制写进 PR 及对应 `docs/testing/` 记录。负责人真机确认、自动化模拟和量化性能报告分别记录，不互相替代。

### 6.1 画面与性能约束

- #120 负责人最新美术修订（2026-10-27）：蓄跳蛙不画独立落点提示；落石用精细红色四角，奶怪砸地保留奶白方形四角。特效须匹配现有素材精度，避免粗线框和粗糙块状效果；具体几何与验证见 `docs/design/monster-skill-moves.md`。负责人直接要求优先于先前交叉评审里的奶白/蓄跳蛙落点方案。

- 像素画来自贴图本身，不降低整屏渲染分辨率制造像素效果；保留全画布世界视口与可保存的覆盖式 UI。主城/地牢镜头始终以人物为中心，到房间边缘也不限制滚动，房间外露出纯黑背景（ADR 0034）。
- 保留角色逐帧眼睛与左右镜像一致、身体/武器朝向规则、右轮盘拖拽和长按开火、双指移动加射击。
- 新增特效复用纹理与固定容量槽位。纯装饰效果接入 `game/fx/FxBudget` 分类预算，超限省略而不排队；不可将危险预警、弹体、光束、碰撞和伤害判定接入装饰预算。详见 ADR 0033。
- 不用模拟推进速度代替 FPS。性能改善用相同负载、分辨率和渲染环境对照；iPhone 验收结果不能外推为所有机型或任意未来负载达标。
- 美术使用实际图片文件及可用许可，图集优先；继续检查包体、离线缓存、draw call、对象数量及生命周期清理。

## 7. 每次开工的固定步骤

1. 读本文件 → `docs/ROADMAP.md` 当前里程碑 → 负责人当前任务或分配给自己的 Issue（标签 `owner:claude` / `owner:gpt`）。
2. 从最新 `main` 拉分支：`claude/<issue号>-<简述>` 或 `gpt/<issue号>-<简述>`。
3. 只改当前任务范围内的文件。跨模块或共享契约变更若未在当次任务中授权，先通过 Issue 或可复制的交接消息协调，不顺手扩展。
4. 本地跑 `npm run check` 全绿（lint + 类型 + 单测 + 构建），涉及运行时的改动再跑 `npm run test:e2e`。
5. 开 PR，按模板写：做了什么、怎么手动验证（附 `?seed=` / `?scene=` 链接）、截图或 GIF、已知问题。
6. 按模块归属安排交叉评审，先完成本地实现、自审与验证；需要转达 Claude 时给负责人可复制的消息。涉及手感、数值、美术和画面表现的 PR，由负责人试玩验收并合并。

## 8. 硬规则

- 图片与其他二进制素材必须通过文件通道上传：优先已认证的 Git CLI；不可用时用 GitHub 网页文件选择器按本地路径上传到功能分支。禁止把图片 Base64 / data URL 填进 Create Blob、Create Tree、对话或审批工具参数；禁止拆分大段编码重试。上传后核对远端文件的 Git blob SHA / 字节数与本地一致。详见 `docs/ASSET_UPLOADS.md`。
- 禁止直接推送 `main`；禁止改写对方的分支；PR 一律 squash 合并。
- 单个 PR 尽量 ≤ 400 行改动（不含数据与生成文件），大功能拆分。
- **共享契约变更**必须附 `docs/adr/NNNN-标题.md`，负责人批准后合并。
- 不引入新依赖，除非在 PR 里说明理由且负责人同意。
- 玩法数值只放 `src/data/`，代码里不出现魔法数字。
- 玩家可见文字走 `t('key')`（i18n 接入后，M4 起强制）。
- 已授权范围内自主推进工程实现，不重复索要同一权限；改变负责人明确决定的玩法、数值或美术方向时需先协调。
- 提交信息用中文或英文均可，第一行 ≤ 72 字符，说明「做了什么」。

## 9. 编码规范

- TS `strict`、`noUncheckedIndexedAccess`；禁止 `any`（用 `unknown` 再收窄）。
- 命名：类与类文件 `PascalCase.ts`；函数/变量 `camelCase`；数据 ID 与资源 key `snake_case`；事件名 `领域:动作`。
- 帧循环内不分配新对象；移动用 `delta` 计算，不假设固定帧率。
- 注释写「为什么」，不写「做了什么」；导出的公共接口写 TSDoc。
- `sim/` 新逻辑必须有单测。

## 10. 常用命令

| 命令                        | 作用                                       |
| --------------------------- | ------------------------------------------ |
| `npm run dev`               | 本地开发（`--host`，同一局域网手机可访问） |
| `npm run check`             | lint + 类型检查 + 单测 + 构建，PR 前必跑   |
| `npm run test:e2e`          | Playwright 冒烟（会先构建）                |
| `npm run format`            | Prettier 格式化                            |
| `npm run build` / `preview` | 生产构建 / 本地预览                        |

## 11. 调试参数

`?seed=12345` 固定种子 · `?debug=1` 调试信息 · `?scene=Game` 跳过菜单 · `?god=1` 无敌（M1）· `?room=boss`、`?floor=1-4`（M2）· `?weapon=<id>`（M3）。
`window.__AVN__` 暴露 `{ ready, scene, seed, phaserVersion }`，给测试与排查用。
