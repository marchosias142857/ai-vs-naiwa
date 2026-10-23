# 路线图

9 个里程碑：**M4 结束得到可分享的 MVP，M8 发布 1.0**。每个里程碑结束都由负责人在手机上试玩签字，再进入下一个。不写日期，节奏由负责人定。

| 里程碑 | 主要交付 | 验收标准 | 主负责 |
| --- | --- | --- | --- |
| **M0 地基** | 脚手架、Phaser 4 + Vite + TS、ESLint/Prettier、Vitest、Playwright、CI、部署、PWA 外壳、AGENTS.md、docs | 合并 main 后自动部署；手机可「添加到主屏幕」并离线打开；`npm run check` 全绿 | Claude（脚手架/CI）+ GPT（PWA/入口） |
| **M1 手感原型** | 灰盒房间；移动、碰墙；键鼠 + 双摇杆；1 把枪、子弹池；1 种追击怪；受伤、无敌帧、死亡重来 | 手机 60 fps；负责人确认移动和射击手感 OK | Claude（sim 战斗）+ GPT（输入/摇杆） |
| **M2 房间与地牢** | 5×5 地牢生成；走廊；锁门、波次、清房开门；Tiled 模板；小地图；`?seed=` | 同种子同地图（单测）；1000 张图全部连通（单测） | Claude（生成）+ GPT（小地图/镜头） |
| **M3 战斗内容框架** | 武器数据 + 弹道注册表（≥5 种）；AI 状态机（≥4 种行为）；护甲/能量；掉落、宝箱、金币；打击感 | 新增武器只改数据；10 把武器、6 种怪可玩 | Claude（弹道/AI）+ GPT（fx/掉落表现） |
| **M4 MVP 闭环** | 1 个大关（3 关 + Boss）；Boss 多阶段；Buff 3 选 1；HUD；暂停；结算；续玩；设置 | 完整一局零报错；冒烟通过；负责人试玩 5 局 | 双方 |
| **M5 美术接入** | 资源管线 `npm run art`；正式美术；音效音乐 | 零代码换图；包体与帧率达标 | GPT（管线/UI）+ Claude（动画状态机） |
| **M6 局外成长** | 大厅；宝石；3 位 AI 娘及技能；天赋；图鉴；存档迁移 | 存档升级有单测 | GPT（大厅/存档）+ Claude（角色技能） |
| **M7 内容扩充** | 3 生态；6 位 AI 娘；80 武器；36 怪；6 Boss；40 Buff；商店、祝福、精英房 | 数据校验全绿；平衡表评审通过 | 双方 |
| **M8 打磨发布** | 性能；新手引导；多语言；无障碍；崩溃兜底；更新提示 | 达到全部性能指标；中端机连玩 30 分钟不卡不崩 | 双方 |

## 当前：M0 地基

| 任务 | 负责 | 状态 |
| --- | --- | --- |
| 脚手架、目录结构、TS/ESLint/Prettier/Vitest/Playwright 配置 | Claude | 已提交 PR |
| Random、EventBus、调试参数 + 单测；Boot/Preload/Menu/Game 场景空壳 | Claude | 已提交 PR |
| AGENTS.md、CLAUDE.md、docs | Claude | 已提交 PR |
| CI（lint、类型、单测、构建、冒烟）、部署工作流、Issue/PR 模板 | Claude | 已提交 PR |
| 提交 `package-lock.json`；跑 `npm run format` 并把格式检查改为 CI 阻塞项 | GPT | 待开始 |
| PWA：接入 vite-plugin-pwa、manifest、图标（192/512/maskable）、离线预缓存、「有新版本」提示 | GPT | 待开始 |
| 竖屏「请旋转设备」遮罩 + 自动暂停；`visibilitychange` 暂停；iOS 首次触摸解锁音频的钩子 | GPT | 待开始 |
| 部署目标：仓库已公开，使用 GitHub Pages（合并 main 自动部署） | 负责人 | 已决定 |
