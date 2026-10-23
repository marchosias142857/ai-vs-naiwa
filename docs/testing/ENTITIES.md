# M1 实体与对象池（#14）

基于 main 中已合并的 PR #23 / ADR 0003。这里不调用尚未实现的工厂，不修改 sim；`CombatBridge(scene, combatWorld)` 接收接口实例。#24 实现合并后由 #15 创建真实世界并接线。

1. `createCombatWorld` 显式传 `maxBullets: POOL_SIZES.bullets`，与 500 发预热池一致。
2. 战斗场景 PRE_UPDATE 每渲染帧调用 `controls.sample(player.x, player.y)` 后 `bridge.setInput(frame)`。bridge 复制向量和标量，锁存所有 Pressed 边沿；0 物理步留到下一帧，多步仅第一步消费。Arcade WORLD_STEP 按秒执行：bullets.tick → syncPositions（body.center）→ sim.step → 清除边沿 → actors.apply → 消费 spawns → 记下 bridge.playerDead。删除了渲染 update 入口，不保存 sim 复用的数组或视图；Arcade 使用固定 60 Hz。
3. 碰撞只调用 hitActor/hitWall/contact；命中返回 true 才回收，寿命到期调用 releaseBullet。寿命按 Arcade worldstep 的秒数计时，与实际飞行一致，不受 sim 的 MAX_DT 单独截断影响。
4. telegraph 隐藏贴图，激活后可见；红圈与出场动画由特效 Issue 负责。仅 active 开物理体。死亡时立即禁用碰撞、保留可见对象，表现播放完调用 `bridge.actors.finishDeath(id)`，最后 removeActor。#16 负责死亡动画；本模块不决定动画时长。
5. 角色预热 31 个槽位（M1 方案最多 30 怪 + 1 玩家），子弹预热 500；战斗中不创建或销毁这些对象。池耗尽：子弹退回 sim 编号，角色明确报错，避免静默遗漏玩法实体。
6. M1 房间无内墙，使用与灰盒墙面内沿一致的 Arcade 世界边界；即使一物理步跨过墙宽也会钳制。M2 内墙需要 Tilemap collider，不能把当前外边界方案当成任意地图的防穿透算法。高速弹丸对小实体的连续碰撞不在本 PR 范围，M1 默认弹速按固定物理步进工作。
7. `bridge.inspect()` 按需返回容量、活跃子弹数和角色数，供 #17/#18 的测试钩子接入；不要每帧调用这个分配快照的方法。

自动化使用独立构建的 `tests/fixtures/combat.html`：真实 Phaser/Arcade + 实现 CombatWorld 的 FakeWorld，不会进入生产构建。覆盖 500/501 容量、寿命与复用、body 实时坐标、极端速度外墙钳制、0/1/2 物理步边沿消费、输入向量复制、预警隐藏且不碰撞、激活后命中、死亡回收。`npm run test:e2e` 包含该套件；本地临时 Chromium 153，CI 使用 Playwright 配套浏览器。

仍待：#24 实现合并后加真实 sim + Arcade 的击退距离 e2e（误差 < 0.5 px）；#15 游戏接线；负责人真机手感验收。按队伍拆分碰撞组暂不包含在本轮；当前先由 sim/bridge 的队伍过滤保证语义，性能采样后再调整分组。
