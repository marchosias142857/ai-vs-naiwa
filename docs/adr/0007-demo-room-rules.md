# 0007. 有限房间流程与楼层规则

- 状态：集成分支试行，待集中评审及负责人批准
- 提出者：GPT；关联 #31

新增 data/schema/rooms.ts：波次数量、间隔、楼层增量与门口判定距离。
DungeonRun 是纯 sim，WORLD_STEP 在 CombatWorld 之后调用，输入为存活数与玩家死亡标志。
战斗房锁门；波次全部结束才清房；回访不重复刷怪；出口显式交互进入下一层。
普通三层后进入独立 Boss 层，Boss 清空即胜利；同一步死亡优先于胜利。
沿用现有 room:entered、room:cleared、run:ended，不扩充事件契约。
spawnCount 是当步命令，game 在返回后立即消费；不能漏消费后继续调用 step。
房间地图与随机流只在换层时创建，战斗计时不依赖渲染帧率。
