# #114 三项基础交付验证

基线 main `60c35eb`（#131 合并）。本批连续实施更新存档边界、模板锚点/RoomDirector、非矩形灰盒物理；契约见 [ADR 0040](../adr/0040-map-foundations.md)。运行代码为 `3df2e55ce33dc04744e0e671305944be71073b9e`；其后仅文档、报告和截图变动。待 Claude 交叉复审及负责人合并。

首轮 88 项 Chromium：82 通过、1 桌面竖屏条件跳过、5 失败。两个 Boss 击杀时限失败；PWA 横屏项目在测试切到竖屏之后重载，启动仍被横屏遮罩挡住；两个档案保护样本使用了不存在的 vitality 天赋 ID，在新局读档时触发了既有损坏修复。后两类修正测试样本/操作顺序，不放宽断言或超时。初始结果保留，不写成全绿。

候选接线自审发现静态枪口/近战回调被改为包含动态落石，额外改变了旧武器语义；修复为静态轮廓查询，并新增单测保证完整 AI provider 仍包含落石。原 main 同一 Boss 用例独立桌面/横屏 2/2 通过；候选诊断采样版本桌面 1/1 通过，诊断读取不能代替原用例的最终复跑。中间修正批有一次浏览器启动 SIGSEGV（未进入游戏）和一次 Boss 超时，另四项通过。最终结果另记。

数值几何以半径 6 玩家与各楼层实际普通怪半径（Boss 14）验证；保留所有未破桶。采样中心额外加 CONTACT_EPSILON 保守净空，避免将可离开但不能再次进入的接触容差薄层误当作独立可达区域。连边仍用实际半径的 sweepCircle，八邻接不能穿角。2 单位全目录扫描，最紧沉船布局另做 0.5 单位扫描。旧沉船三桶对半径 9 的真正封闭口袋在新目录展开两侧桶后消除。

限制：本批为灰盒，不是正式地图美术；不声称 WebKit/Safari/iPhone 真机或新 FPS A/B 已验收。压力场景仅功能检查。没有改 AI 技能/武器机制/碰撞半径、WORLD_STEP 或后续排队任务。CI 网页已只读确认手动 Disabled。

## 最终验证（UTC 2026-10-28）

- Node 22 完整 `npm run check`：62 文件 / 516 单测，格式、ESLint、TypeScript、Vite/PWA 构建全部通过。
- 筛选 legacyCatalog、updateBoundary、save、resumeProduction、productionGeometry、demo、pwa、stress 八个 spec，桌面/Pixel 7 横屏 Chromium，单 worker、零重试：96 项中 94 通过、1 桌面竖屏条件跳过、1 横屏 Boss 击杀在原 35 秒等待内超时，耗时 11.0 分钟。
- 同一最终代码、原用例、原断言与超时，横屏 Boss 隔离进程复跑 1/1 通过（24.3 秒）；不是单次整批全绿。整批间歇超时根因未确认，保留为复审关注点；不据此声称已经证明纯环境问题。初次/中间/基线/诊断/最终/隔离结果均保存在 [逐项报告](map-foundations/report.json)。
- 新增真实 Arcade 检查：模板可连接门双向进出、缺角实体阻挡与子弹、浅凹口视线阻断、潜地怪绕行及出土净空。四层桌面/横屏生产截图均通过。更新检查从带 Game 参数的 URL 仍回 Menu，天赋点、合法已购天赋、备份与模拟未来资源逐字节保全；再次同版本 reload 恢复 Game。既有完整快照物理步/随机状态、离线重开及实际 SW 更新接受流程通过。

## 面积、连通性和包体

[全目录 2 单位采样](map-foundations/clearance.json)覆盖 19 种形式、64 个房型/半径组合，全部单连通分量；所有门、交互和最大怪物出生候选净空通过。全目录地形可通行比例最低 93.30%，玩家中心相对同轮廓空房最低 80.47%。

最紧的 wreck/combat_1 [0.5 单位复核](map-foundations/clearance-fine.json)：地形可通行比例 **93.13%**，玩家中心相对同轮廓空房 **80.39%**，相对完整室内面积 **71.24%**。80% 目标采用前两项口径，不将绝对玩家中心比例写成 80%。所有适用普通怪半径仍为单连通；怪物中心面积不套用玩家 80% 指标。采样不等于连续解析证明。

同依赖独立构建 main 对比：[包体记录](map-foundations/build-comparison.json)。game JS 1,673,203 → 1,678,378 字节（+5,175）；gzip level 9 为 452,154 → 453,875（+1,721）。全部 16 个 public 文件逐字节相同，预缓存仍 20 项；没有资源删减或包体优化承诺。

## 复现与截图

运行 `npm run check`；浏览器命令为 `npx playwright test tests/e2e/{legacyCatalog,updateBoundary,save,resumeProduction,productionGeometry,demo,pwa,stress}.spec.ts --project=desktop --project=mobile-landscape --workers=1`。本机临时配置只替换 Chromium 路径/启动参数、报告路径并复用先前 check 的生产构建，不修改单项超时/断言。独立 Boss 复跑添加 `--grep '右摇杆瞄准与 Arcade' --project=mobile-landscape`。

灰盒试玩：本地 preview 的 `/?scene=Game&seed=42&god=1&floor=1`，分别换 floor=2/3/4；实际走门进入战斗、保存退出后同版本继续。验证更新请用隔离浏览器测试档，执行 updateBoundary/PWA 测试。

![第一层宽 L 灰盒](foundations-floor1-desktop.png)
![第三层浅凹灰盒](foundations-floor3-desktop.png)
![第三层手机横屏](foundations-floor3-mobile.png)

三张截图通过 GitHub 网页文件选择器上传到本功能分支，fetch 后核对远端 Git blob 与原始字节完全一致。它们展示生产灰盒；正式模块美术仍待本批复审、合并后实施。
