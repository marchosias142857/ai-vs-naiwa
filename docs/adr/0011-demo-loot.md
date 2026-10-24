# 0011. 固定槽位掉落与房间刷怪数据

- 状态：集成分支试行，待集中评审及负责人批准
- 提出者：GPT；关联 #31

新增 loot schema：有界掉落槽位、拾取距离、权重/数量、清房奖励、每层敌人表。
LootSystem 使用独立 loot 子流；RoomDirector 分别 fork enemy-kinds / enemy-positions。
游戏层只把死亡与清房事件接入规则方法，拾取结果由 sim 决定。
血量/能量满时补给留在原地；金币自动收集，武器靠近后显式交互。
槽位满额时丢弃新掉落；换房清空，未拾取补给不跨房保存。宝箱房保证一把武器。
RoomDirector 必须紧接 bridge 的 WORLD_STEP 消费 spawnCount，出生检测由地图适配层提供。
game 为每个掉落槽位预热一个表现对象，不在死亡回调 new/destroy。
