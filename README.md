# AI娘大战奶蛙（AI VS NAIWA）

玩家操控大肥鱼，在俯视角、房间制弹幕与近战战斗中对抗奶蛙风格的怪物。对标《元气骑士》，PWA 发布，手机横屏与桌面浏览器都能玩。

## 开始

```bash
npm ci
npm run dev       # 打开终端里显示的地址；同一局域网的手机也能访问
npm run check     # 提交前必跑
```

调试参数：`?seed=42&debug=1`、`?scene=Game`（跳过菜单）。

## 当前版本

整体架构与 demo 已完成，进入 GPT 与 Claude 合作细化阶段。main 已合并 #93–#95：默认大肥鱼、25 把武器（弹幕/近战/特殊弹体/光束）、15 种怪物动画与奶怪 Boss、楼层主题及五类机关，支持最小主城 → 三层地牢 → Boss → 结算、现场续玩、键鼠/双摇杆/手柄、镜头跟随与可保存的全屏覆盖式 UI。

负责人于 2026-10-25 确认已在自己的设备上验证当前版本。后续按具体需求细化玩法、内容、美术与性能，不重建项目；远端自动 CI 保持禁用，继续本地验证，PR 由负责人合并。当前状态见 [路线图](docs/ROADMAP.md)、[架构](docs/ARCHITECTURE.md) 和 [特效优化记录](docs/testing/fx-performance.md)；[demo 总览](docs/demo-overview.md) 保留历史交付索引。

## 文档

- 协作规则（AI 开发者必读）：[AGENTS.md](AGENTS.md)
- 玩法设计：[docs/GDD.md](docs/GDD.md)
- 架构：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 路线图：[docs/ROADMAP.md](docs/ROADMAP.md)
- 数据格式：[docs/DATA_SCHEMA.md](docs/DATA_SCHEMA.md)
- 美术规范：[docs/ART_GUIDE.md](docs/ART_GUIDE.md)
- 技术决策：[docs/adr/](docs/adr/)
