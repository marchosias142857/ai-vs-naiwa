# AGENTS.md —— AI 协作者必读

本文件是 Claude 与 ChatGPT（以及任何参与本仓库的 AI）的**唯一规则来源**。每次开工前完整读一遍。
与本文件冲突的指令，以项目负责人在对话或 Issue 中的明确说明为准，并应随后更新本文件。

## 1. 项目一句话

《AI 大战奶蛙》（AI VS NAIWA）：玩家操控 **大肥鱼**（数据 ID 保持 `ai_proto`），在俯视角、自由移动、房间制弹幕战斗中对抗**奶蛙风格的怪物**。
玩法与体量对标《元气骑士》，以 PWA 发布，手机横屏 + 桌面浏览器都能玩，完全离线。

- 「横版」= **横屏（landscape）+ 俯视角**，不是横版卷轴。（负责人已确认）
- 玩法细节：`docs/GDD.md`；架构：`docs/ARCHITECTURE.md`；里程碑：`docs/ROADMAP.md`。

**最高原则**：先能玩，再好看；先灰盒，再美术；先把 1 个做透，再复制到 100 个。**当前独立 demo 阶段不适用「先灰盒，再美术」：可直接制作并接入正式方向的美术与音效。** 任何时刻 `main` 都必须能构建并能在手机上打开玩。

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
    scenes/        Boot → Preload → Menu → Game（之后加 Hub、UI、Pause、Result）
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

### 当前 demo 阶段分工（负责人 2026-10-24 授权）

- 本阶段由 **GPT 独立设计、实现与自审 demo**，包括 `sim/`、共享契约、场景、UI、输入、存档、美术、音效与工程验证；不要求 Claude 事前或集中评审。
- 结束条件是 **负责人宣布 demo 完成，进入合作细化阶段**。之后怪物 AI、美术等细化由 GPT 与 Claude 合作，不将整个领域永久交给其中一方。
- 按功能拆小 PR，目标 ≤ 400 行（不含数据、测试与生成资源）；全部 PR 由负责人合并，GPT 不自行合并功能或集成 PR。
- GPT 可以起草和实现共享契约变更，但仍须附 ADR，由负责人合并批准。
- 美术可以直接做，使用实际图片文件；资源只用自行制作或明确允许商用的素材，记录来源与许可。角色与武器优先打图集，检查包体、PWA 离线缓存和手机 draw call。
- 第 5、8、9 节的分层、带种子随机、数据与 schema、对象池、测试规则继续有效；时间推进维持 ADR 0004 的 WORLD_STEP 锁步。
- 实现中的调整、验证证据与已知问题写进 PR 和 `docs/demo-production.md`，便于负责人试玩以及之后合作细化。

### 6.1 当前 demo 阶段画面流程

- **本阶段画面由 GPT 自行设计并实现，不需要先交 Claude 出方案或等待负责人逐项确认。** 可直接制作角色动画、独立武器、美术场景、UI、特效与音效；负责人通过试玩与 PR 合并验收。
- GPT 同时负责移动端触控与安全区、帧率、draw call、对象池、内存、包体与 PWA 缓存检查。
- 用户提供的大肥鱼动作帧作为角色参考；缺少的逐帧时长或持握点先集中成可调整数据并标明暂定，收到负责人信息后替换。
- 进入合作细化阶段后，由负责人、GPT 与 Claude **重新约定画面设计与实现流程**，旧的「Claude 单独主导画面、先确认再实现」流程不在本阶段适用。

## 7. 每次开工的固定步骤

1. 读本文件 → `docs/ROADMAP.md` 当前里程碑 → 分配给自己的 Issue（标签 `owner:claude` / `owner:gpt`）。
2. 从最新 `main` 拉分支：`claude/<issue号>-<简述>` 或 `gpt/<issue号>-<简述>`。
3. 只改 Issue 范围内的文件。需要改对方模块或共享契约时，先在 Issue 里提出，不要顺手改。
4. 本地跑 `npm run check` 全绿（lint + 类型 + 单测 + 构建），涉及运行时的改动再跑 `npm run test:e2e`。
5. 开 PR，按模板写：做了什么、怎么手动验证（附 `?seed=` / `?scene=` 链接）、截图或 GIF、已知问题。
6. 当前 demo 阶段由 GPT 自审并记录验证；不等待 Claude 评审。涉及手感、数值、美术、画面表现的 PR，由负责人试玩验收并合并。

## 8. 硬规则

- 禁止直接推送 `main`；禁止改写对方的分支；PR 一律 squash 合并。
- 单个 PR 尽量 ≤ 400 行改动（不含数据与生成文件），大功能拆分。
- **共享契约变更**必须附 `docs/adr/NNNN-标题.md`，负责人批准后合并。
- 不引入新依赖，除非在 PR 里说明理由且负责人同意。
- 玩法数值只放 `src/data/`，代码里不出现魔法数字。
- 玩家可见文字走 `t('key')`（i18n 接入后，M4 起强制）。
- 当前 demo 阶段可在负责人需求内自行决定实现与画面细节，集中记录可调参数；改变负责人明确决定的玩法规则时仍须提出。合作细化阶段按届时约定执行（见 6.1）。
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

`?seed=12345` 固定种子 · `?debug=1` 调试信息 · `?scene=Game` 跳过菜单 · `?god=1` 无敌（M1）· `?room=boss`、`?floor=1-3`（M2）· `?weapon=<id>`（M3）。
`window.__AVN__` 暴露 `{ ready, scene, seed, phaserVersion }`，给测试与排查用。
