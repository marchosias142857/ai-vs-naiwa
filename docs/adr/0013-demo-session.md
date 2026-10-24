# 0013. demo 场景接线与层间升级

- 状态：集成分支试行，待集中评审及负责人批准
- 提出者：GPT；关联 #31

DemoSession 在 PRE_UPDATE 取已有的渲染帧输入，交给 CombatBridge；交互边沿另外锁存到第一个物理步。
在 bridge 之后的 WORLD_STEP 执行 RoomDirector、拾取和门口判定。update 只发布玩家位置、回收表现和刷新地图。
楼层出口要在中心交互；新增 loot schema.upgradeChoices=3，独立 upgrades 子流抽取不重复升级。
升级选择期间暂停 Arcade；选择后保留玩家资源并进入下一层，清空输入避免旧按键继续生效。
胜负结果等待原有 deathRestartDelay 后固定，计时仍是 WORLD_STEP；结果界面后续 PR 接入。
DebugTools 改为读取结构化的只读指标源，支持原 CombatRun 与新 DemoSession；功能不变。
