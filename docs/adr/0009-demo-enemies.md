# 0009. 敌方攻击、行为与 Boss 阶段

- 状态：集成分支试行，待集中评审及负责人批准
- 提出者：GPT；关联 #31

EnemyDef 新增可选 attack、desiredRange、dash、phases；攻击表复用 WeaponDef schema。
保留原追击怪，增加侦察、重装、远程、炮台、冲锋及三阶段 Boss。
ActorView 可选 warning 表示冲锋蓄力，给灰盒危险提示使用；不改变 phase 的碰撞语义。
开火和 AI 均在 CombatWorld.step 的物理时钟中推进。敌方复用已有弹丸记录与输出池、共享 fire 上下文。
敌方射击先检查距离和 lineOfSight；玩家死亡后不射击，原有分离运动保持。
Boss 按剩余生命比例切换数据中的攻击与速度，不引入表现层依赖。
所有新角色暂用占位图，危险提示待画面方案；本次只加入规则与回归。
