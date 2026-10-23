# AGENTS.md —— AI 协作者必读

本文件是 Claude 与 ChatGPT（以及任何参与本仓库的 AI）的**唯一规则来源**。每次开工前完整读一遍。
与本文件冲突的指令，以项目负责人在对话或 Issue 中的明确说明为准，并应随后更新本文件。

## 1. 项目一句话

《AI 大战奶蛙》（AI VS NAIWA）：玩家操控 **AI 娘**，在俯视角、自由移动、房间制弹幕战斗中对抗**奶蛙风格的怪物**。
玩法与体量对标《元气骑士》，以 PWA 发布，手机横屏 + 桌面浏览器都能玩，完全离线。

- 「横版」= **横屏（landscape）+ 俯视角**，不是横版卷轴。（负责人已确认）
- 玩法细节：`docs/GDD.md`；架构：`docs/ARCHITECTURE.md`；里程碑：`docs/ROADMAP.md`。

**最高原则**：先能玩，再好看；先灰盒，再美术；先把 1 个做透，再复制到 100 个。任何时刻 `main` 都必须能构建并能在手机上打开玩。

## 2. 角色

| 角色 | 职责 |
| --- | --- |
| 项目负责人（人类） | 美术方向、玩法设计、数值拍板、手机试玩验收、合并 PR |
| Claude | 开发者，默认负责 `sim/`、共享契约、CI 与脚本 |
| ChatGPT | 开发者，默认负责场景、UI、输入、PWA、服务层 |

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

| 模块 | 主负责 | 评审 |
| --- | --- | --- |
| `src/sim/**`（战斗、弹道、AI、地牢、属性/Buff、掉落、本局状态） | Claude | ChatGPT |
| 共享契约：`sim/core/types.ts`、`sim/core/events.ts`、`data/schema/**`、`config.ts` | Claude 起草 | ChatGPT + 负责人批准 |
| `game/scenes`、`game/ui`、`game/input`、`game/fx` | ChatGPT | Claude |
| `services/**`、PWA、`i18n/**`、`index.html` | ChatGPT | Claude |
| `game/entities`、`components`、`pools`、`world` | 按 Issue 分配 | 另一方 |
| `data/**` 内容（数值） | 按 Issue | 负责人 |
| `.github/**`、`scripts/**`、工具配置 | Claude | ChatGPT |
| `docs/**` | 改哪个模块就更新哪份文档 | 负责人 |

## 7. 每次开工的固定步骤

1. 读本文件 → `docs/ROADMAP.md` 当前里程碑 → 分配给自己的 Issue（标签 `owner:claude` / `owner:gpt`）。
2. 从最新 `main` 拉分支：`claude/<issue号>-<简述>` 或 `gpt/<issue号>-<简述>`。
3. 只改 Issue 范围内的文件。需要改对方模块或共享契约时，先在 Issue 里提出，不要顺手改。
4. 本地跑 `npm run check` 全绿（lint + 类型 + 单测 + 构建），涉及运行时的改动再跑 `npm run test:e2e`。
5. 开 PR，按模板写：做了什么、怎么手动验证（附 `?seed=` / `?scene=` 链接）、截图或 GIF、已知问题。
6. 另一个 AI 评审。涉及手感、数值、美术的 PR，必须负责人在手机上试玩后才合并。

## 8. 硬规则

- 禁止直接推送 `main`；禁止改写对方的分支；PR 一律 squash 合并。
- 单个 PR 尽量 ≤ 400 行改动（不含数据与生成文件），大功能拆分。
- **共享契约变更**必须附 `docs/adr/NNNN-标题.md`，负责人批准后合并。
- 不引入新依赖，除非在 PR 里说明理由且负责人同意。
- 玩法数值只放 `src/data/`，代码里不出现魔法数字。
- 玩家可见文字走 `t('key')`（i18n 接入后，M4 起强制）。
- 遇到设计问题（手感、数值、美术、世界观）不自行决定：在 Issue 里 @ 负责人，并给出 2–3 个选项。
- 提交信息用中文或英文均可，第一行 ≤ 72 字符，说明「做了什么」。

## 9. 编码规范

- TS `strict`、`noUncheckedIndexedAccess`；禁止 `any`（用 `unknown` 再收窄）。
- 命名：类与类文件 `PascalCase.ts`；函数/变量 `camelCase`；数据 ID 与资源 key `snake_case`；事件名 `领域:动作`。
- 帧循环内不分配新对象；移动用 `delta` 计算，不假设固定帧率。
- 注释写「为什么」，不写「做了什么」；导出的公共接口写 TSDoc。
- `sim/` 新逻辑必须有单测。

## 10. 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 本地开发（`--host`，同一局域网手机可访问） |
| `npm run check` | lint + 类型检查 + 单测 + 构建，PR 前必跑 |
| `npm run test:e2e` | Playwright 冒烟（会先构建） |
| `npm run format` | Prettier 格式化 |
| `npm run build` / `preview` | 生产构建 / 本地预览 |

## 11. 调试参数

`?seed=12345` 固定种子 · `?debug=1` 调试信息 · `?scene=Game` 跳过菜单 · `?god=1` 无敌（M1）· `?room=boss`、`?floor=1-3`（M2）· `?weapon=<id>`（M3）。
`window.__AVN__` 暴露 `{ ready, scene, seed, phaserVersion }`，给测试与排查用。
