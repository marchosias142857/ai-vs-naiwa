# 0013. demo 场景接线与层间升级

- 状态：集成分支试行，待负责人合并 main 批准
- 提出者：GPT
- 批准：负责人（合并即批准）
- 关联：Issue #31、PR #33；集中评审修订

## 背景

房间、输入、反馈和战斗必须接入同一时钟，升级选择时需要暂停。

## 决定

DemoSession 在 PRE_UPDATE 取已有的渲染帧输入，交给 CombatBridge；交互边沿另外锁存到第一个物理步。
在 bridge 之后的 WORLD_STEP 执行 RoomDirector、拾取和门口判定。update 只发布玩家位置、回收表现和刷新地图。
楼层出口要在中心交互；新增 loot schema.upgradeChoices=3，独立 upgrades:${floor} 子流抽取不重复升级。
升级选择期间暂停 Arcade；选择后保留玩家资源并进入下一层，清空输入避免旧按键继续生效。
胜负结果等待原有 deathRestartDelay 后固定，计时仍是 WORLD_STEP；结果界面后续 PR 接入。
DebugTools 改为读取结构化的只读指标源，支持原 CombatRun 与新 DemoSession；功能不变。

## 备选方案

在渲染 update 推进导演：可能同一物理步推进多次；物理步重新采样输入：会丢失渲染帧边沿。

## 后果

保持 ADR 0004；升级候选数量及按钮数量都由 upgradeChoices 驱动。
