# 0010. 玩家资源、双武器与原型冲刺

- 状态：集成分支试行，待负责人合并 main 批准
- 提出者：GPT
- 批准：负责人（合并即批准）
- 关联：Issue #31、PR #33；集中评审修订

## 背景

完整一局需要资源管理、技能与武器槽，且能量耗尽后仍可继续战斗。

## 决定

api 增加可选 playerRules（不传时保留 M1 行为）、resources 只读视图、secondaryWeapon、
takeWeapon、grantPickup、upgrade。新增 player 数据/schema、八种可叠加升级。
护甲先于生命扣除，entity:damaged.amount 仍是本次伤害总量，hp 是扣除护甲后的剩余生命。
修复延迟、间隔、能量与冲刺参数均来自 data；计时随 WORLD_STEP。
有实际弹丸生成才扣能量，burst 每颗单独计费。基础手枪永远保留为第一槽，第二槽替换，防止耗尽能量软锁。
开局仅第一槽手枪，secondaryWeapon: WeaponId | null 初始为 null。第二槽为空时 Q / Y / swapPressed 无效；有枪时切换两槽。
Space / skillPressed 发动沿移动方向（无移动时沿瞄准方向）的原型无敌冲刺。
冲刺仅为可玩的灰盒技能，正式角色技能与视觉待负责人及 Claude 方案。
死亡后拒绝拾取或升级；godMode 不触发护甲消耗。共享契约最终随集成 PR 批准。
升级 schema 新增 display（number / percent），UI 按数据格式化，不再维护属性白名单。

## 备选方案

开局携带步枪：负责人决定只带手枪；手枪也能被换掉：可能导致能量软锁。

## 后果

第二槽可空，调用方必须判空；旧枪的地面交接由 LootSystem 原槽置换负责，不能只调用 takeWeapon 丢弃旧枪。
