# 0010. 玩家资源、双武器与原型冲刺

- 状态：集成分支试行，待集中评审及负责人批准
- 提出者：GPT；关联 #31

api 增加可选 playerRules（不传时保留 M1 行为）、resources 只读视图、secondaryWeapon、
takeWeapon、grantPickup、upgrade。新增 player 数据/schema、八种可叠加升级。
护甲先于生命扣除，entity:damaged.amount 仍是本次伤害总量，hp 是扣除护甲后的剩余生命。
修复延迟、间隔、能量与冲刺参数均来自 data；计时随 WORLD_STEP。
有实际弹丸生成才扣能量，burst 每颗单独计费。基础手枪永远保留为第一槽，第二槽替换，防止耗尽能量软锁。
Q / swapPressed 切换两槽；Space / skillPressed 发动沿移动方向（无移动时沿瞄准方向）的原型无敌冲刺。
冲刺仅为可玩的灰盒技能，正式角色技能与视觉待负责人及 Claude 方案。
死亡后拒绝拾取或升级；godMode 不触发护甲消耗。共享契约最终随集成 PR 批准。
