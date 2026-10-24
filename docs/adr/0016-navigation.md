# ADR 0016：可选绕墙导航回调

状态：demo 临时授权实现，待集中评审。

纯追击速度会把敌人卡在灰盒柱子后。CombatWorldOptions 增加可选 navigation(x,y,targetX,targetY,radius,out)，返回 true 时 out 给出下一路点，false 时保留原行为。game 按真实墙体提供碰撞查询，NavigationGrid 算法仍位于纯 sim。

8 px 四邻网格，固定 TypedArray 队列/距离/阻挡数组；查询原地写出，按目标格与实体半径缓存流场，换房失效。路段按实体半径扩墙检查，不能穿过转角。接触墙面的浮点容差只用于导航，不修改 Arcade 碰撞。

只导航向目标靠近的移动；保持距离的后退、炮台和已锁方向冲锋保持原行为。击退仍在自主速度后叠加。新导航数值位于 data/navigation.ts 并带 schema；执行仍在 sim 的 WORLD_STEP 内。
