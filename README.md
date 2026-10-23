# AI 大战奶蛙（AI VS NAIWA）

玩家操控 AI 娘，在俯视角、房间制弹幕战斗中对抗奶蛙风格的怪物。对标《元气骑士》，PWA 发布，手机横屏与桌面浏览器都能玩。

## 开始

```bash
npm install
npm run dev       # 打开终端里显示的地址；同一局域网的手机也能访问
npm run check     # 提交前必跑
```

调试参数：`?seed=42&debug=1`、`?scene=Game`（跳过菜单）。

## 文档

- 协作规则（AI 开发者必读）：[AGENTS.md](AGENTS.md)
- 玩法设计：[docs/GDD.md](docs/GDD.md)
- 架构：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 路线图：[docs/ROADMAP.md](docs/ROADMAP.md)
- 数据格式：[docs/DATA_SCHEMA.md](docs/DATA_SCHEMA.md)
- 美术规范：[docs/ART_GUIDE.md](docs/ART_GUIDE.md)
- 技术决策：[docs/adr/](docs/adr/)
