# AI 大战奶蛙（AI VS NAIWA）

玩家操控大肥鱼，在俯视角、房间制弹幕与近战战斗中对抗奶蛙风格的怪物。对标《元气骑士》，PWA 发布，手机横屏与桌面浏览器都能玩。

## 开始

```bash
npm ci
npm run dev       # 打开终端里显示的地址；同一局域网的手机也能访问
npm run check     # 提交前必跑
```

调试参数：`?seed=42&debug=1`、`?scene=Game`（跳过菜单）。

## 可玩 demo

当前完整评审分支为 `gpt/demo-delivery`：三层地牢 + Boss、12 把武器（10 把弹幕武器、弯刀和重锤）、6 种普通怪、8 种升级、掉落与补给、完整胜负结算、现场存档续玩、键鼠/触屏/手柄、中英文与反馈设置。大肥鱼动画、独立持握武器、海底遗迹场景、菜单与 HUD 使用实际图集，音效由项目代码合成。

合并顺序、截图、验证证据与真机待验事项见 [当前 demo 交付](docs/testing/demo-production-acceptance.md)，模块说明见 [demo 总览](docs/demo-overview.md)。本阶段由 GPT 独立实现和自审；负责人合并 PR、试玩，并宣布何时进入 GPT 与 Claude 合作细化阶段。评审分支的功能不代表已经发布到 main 对应的网站。

## 文档

- 协作规则（AI 开发者必读）：[AGENTS.md](AGENTS.md)
- 玩法设计：[docs/GDD.md](docs/GDD.md)
- 架构：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 路线图：[docs/ROADMAP.md](docs/ROADMAP.md)
- 数据格式：[docs/DATA_SCHEMA.md](docs/DATA_SCHEMA.md)
- 美术规范：[docs/ART_GUIDE.md](docs/ART_GUIDE.md)
- 技术决策：[docs/adr/](docs/adr/)
