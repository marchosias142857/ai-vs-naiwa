# M1 实体与对象池（#14）

依赖 PR #23 的 ADR 0003。这里不调用尚未实现的工厂，不修改 sim；`CombatBridge(scene, combatWorld)` 接收接口实例。#24 实现合并后由 #15 创建真实世界并接线。

1. `createCombatWorld` 显式传 `maxBullets: POOL_SIZES.bullets`，与 500 发预热池一致。
2. 战斗场景 update 调 `bridge.update(delta / 1000, input)`。内部读取 body.center 写回脚底世界坐标，再 step，然后设置期望速度、消费 bulletSpawns。只复制标量，不保存 sim 复用的数组或视图。
3. 碰撞只调用 hitActor/hitWall/contact；命中返回 true 才回收，寿命到期调用 releaseBullet。寿命按 Arcade worldstep 的秒数计时，与实际飞行一致，不受 sim 的 MAX_DT 单独截断影响。
4. 仅 active 开物理体。死亡时立即禁用碰撞、保留可见对象，表现播放完调用 `bridge.actors.finishDeath(id)`，最后 removeActor。#16 负责死亡动画；本模块不决定动画时长。
5. 角色预热 31 个槽位（M1 方案最多 30 怪 + 1 玩家），子弹预热 500；战斗中不创建或销毁这些对象。池耗尽：子弹退回 sim 编号，角色明确报错，避免静默遗漏玩法实体。
6. M1 房间无内墙，使用与灰盒墙面内沿一致的 Arcade 世界边界；即使一物理步跨过墙宽也会钳制。M2 内墙需要 Tilemap collider，不能把当前外边界方案当成任意地图的防穿透算法。高速弹丸对小实体的连续碰撞不在本 PR 范围，M1 默认弹速按固定物理步进工作。
7. `bridge.inspect()` 按需返回容量、活跃子弹数和角色数，供 #17/#18 的测试钩子接入；不要每帧调用这个分配快照的方法。

自动化使用独立构建的 `tests/fixtures/combat.html`：真实 Phaser/Arcade + 实现 CombatWorld 的 FakeWorld，不会进入生产构建。覆盖 500/501 容量、寿命与复用、body 实时坐标、极端速度外墙钳制、预警不碰撞、激活后命中、死亡回收。`npm run test:e2e` 包含该套件；本地临时 Chromium 153，CI 使用 Playwright 配套浏览器。

仍待：#23 批准/合并后改 base 为 main；#24 实现合并后真实 sim 集成；#15 游戏接线；负责人真机手感验收。此 PR 为接口适配草稿，不应直接合并到接口分支。
