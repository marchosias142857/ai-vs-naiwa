# 0005. 战斗 sim 的调试钩子：godMode 与 debugKillEnemies

- 状态：提议
- 提出者：Claude
- 批准：负责人（合并即批准）
- 关联：Issue #17（调试工具）、ADR 0003

## 背景

#17 要求 `?god=1` 无敌、调试模式下 F2 清房。伤害与死亡由 sim 决定（ADR 0003），game 层没有办法让玩家不受伤，也没有办法杀死怪物；绕过 sim 直接改表现层会让画面与规则不一致。

## 决定

在 `src/sim/combat/api.ts` 增加两项，都是可选或附加的，不改变已有成员：

1. `CombatWorldOptions.godMode?: boolean`（默认 false）：玩家不受任何伤害，也不进入受伤无敌帧。
   - 接触伤害直接忽略。
   - 打到玩家的子弹按「命中无敌目标」处理：子弹消失，发出 `critical: false` 的 `bullet:hit`，不发 `entity:damaged`。
   - 只在创建时设置，本局内不切换；重来时按 URL 参数重新决定。
2. `CombatWorld.debugKillEnemies(): void`：立即杀死全部怪物，包括出场预警中的。
   - 每只按正常死亡顺序发出 `entity:damaged` → `entity:died`，`sourceId` 与 `killerId` 为 null。
   - 之后照常由 game 层在死亡表现结束后调用 `removeActor`。

两者只供 `src/debug/` 使用：`godMode` 只在 URL 带 `?god=1` 时打开；`debugKillEnemies` 只在 `?debug=1` 时由 F2 调用。正式玩法代码不调用。

## 后果

- 调试路径与正式路径共用同一套伤害与死亡逻辑，特效、HUD、统计不需要为调试单独处理。
- `CombatWorld` 的其他实现（测试里的假对象）需要补上 `debugKillEnemies`。
- 「清房」以后（M2 起）如果变成房间级的概念，比如还要清掉怪物子弹，在这个方法里扩展即可，签名不变。
