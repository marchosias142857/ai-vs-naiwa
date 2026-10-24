# 存档 v2：game 接线与评审入口

按已批准的 [ADR 0019](adr/0019-run-snapshot.md) 实现，依赖 sim PR #66。
本说明覆盖 game 的实现与测试边界；sim 字段校验由 Claude 后续提供。

## 分 PR 评审

| 顺序 | PR    | 范围                                                     |
| ---- | ----- | -------------------------------------------------------- |
| 1    | #68   | 角色与子弹原槽位、空闲栈、物理体与尸体计时的保存 / 恢复  |
| 2    | #69   | 暂停原因集合、灰盒倒计时、生命周期、三处输入清理         |
| 3    | #70   | v2 存储、版本与数据指纹、game 字段及交叉校验、入口兜底   |
| 4    | 本 PR | DemoSession / GameScene 恢复，保存时机、菜单和浏览器验收 |

这些 PR 逐层依赖；合并依赖后再把下一项 rebase / retarget 到 main。
没有修改 Claude 的 sim 实现或分支。

## 文件与状态

- `game/world/bodySnapshot.ts`：保存物理体左上角、实际速度、半径和贴图坐标。使用原始左上角避免圆心加减半径的浮点往返损失。贴图坐标也必须保存：新子弹在同一步末尾创建，贴图与 body 尚未完全同步，下一次 Arcade preUpdate 会读取贴图。
- `game/entities/CombatActors.ts`、`game/pools/BulletPool.ts`：恢复原槽位与空闲栈顺序，保留重叠回调顺序。初次绑定角色圆形物理体后同步 prev / prevFrame；预警体启用当步没有 preUpdate，不能让 postUpdate 补出旧矩形坐标造成的偏移。
- `game/fx/CombatFeedback.ts`：保存每个尸体原始累计计时 `elapsed`，与剩余表现时间等价。避免「累计 → 剩余 → 累计」的浮点误差改变回收步。瞬时闪光、弹壳、音频不参与结果，不保存。
- `game/save/RunSnapshot.ts`：`entry + sim + game`，game 包括 `physics / deaths / endTime`。
- `game/save/parseGameSnapshot.ts`：有限数字、合法负坐标与速度、半径、容量、槽位编号一一对应、空闲栈、尸体列表校验，不修补、不重排。
- `game/save/version.ts`：构建文件路径（生产构建带内容 hash）和显式列举的玩法数据指纹。任一变化走入口兜底；不把保存时间作为逻辑输入。

## 恢复与保存顺序

菜单只把校验后的 `SessionSnapshot` 交给 GameScene。DemoSession 新建空 CombatWorld，以 DungeonRun.restore 重建地图，再 loadSim、重建墙体、恢复池、尸体与结算计时。恢复不执行出生、loot.enterRoom、teleport、claim 或 run:started。

完成上述步骤后才绑定 RunPersistence 并允许写盘。楼层入口 `entry` 是独立副本，只有真正换层时更新；局内资源变化不会改写它。导演在 bridge 后生成预警怪物，必须在该步结束前绑定槽位，保证保存边界上 sim 与物理体一一对应。

`RunPersistence.save` 是唯一同步保存入口：手动暂停、暂停菜单退出、hidden、pagehide、新楼层都调用它。取齐全部字段后单次 setItem；失败保留旧档，成功才删 v1。终局只清档且成绩只记一次；BFCache pageshow 复用原局，不重新 load。

## 暂停与输入

`PauseState` 持有 manual / lifecycle / upgrade / finished / restore。物理只在集合为空时恢复。lifecycle 汇总后台、pagehide 与触屏竖屏；解除一个浏览器原因时仍检查其他原因。

restore 按真实时间显示 3 秒灰盒数字，不推进任何 sim 或物理计时。其他暂停原因中断它时，所有原因解除后从 3 重来。生命周期回调在 loop.wake 前同步重置时限、清掉 Arcade 累加器和三处输入锁存。手柄继续使用「先中立，再接受输入」。UI 和暂停菜单仍然可用。

Arcade 4.1 没有公开的累加器重置方法，`resetPhysicsClock` 把私有 `_elapsed` 的访问集中到一处。升级 Phaser 时必须复核此处。

## 等 Claude 的接口

`SimDecoder = (value: unknown, seed: number) => SimSnapshot | null`。seed 用于生成地图并校验房间范围、数组长度等不变量。将 `pendingSimDecoder` 换成 Claude 的正式解析器；game 随后校验物理池、尸体和 entry 的交叉关系。

当前正式入口使用拒绝解析的占位实现，安全地走「存档异常，从本层入口继续」。**完整恢复接线 PR 保持 draft，正式解析器接入并验证前不能作为完成版存档上线。** 不会把外部 JSON 直接强转交给 sim.load。

`tests/fixtures/save.ts` 只对自己生成的 save() 结果注入可信测试 decoder，从而在 sim 解析器到位前验证真实场景、Arcade 和 UI 接线；这不证明 sim 字段校验正确。接入正式解析器后，还需在普通入口跑同样的保存 / 继续流程。

## 验证与限制

- 单元测试：game 字段异常、三个兜底分支、合法负值、旧档迁移、写入失败、终局、暂停原因与 wake 前重置。
- `entities.spec.ts`：真实 sim + Arcade，混合子弹半径、满池重分配、尸体回收、瞬移实际速度；完整快照与后续事件严格相等。
- `save.spec.ts`：完整 DemoSession JSON 往返和后续 180 个同输入物理步；不重放业务事件；三种生命周期保存顺序、重复进出、BFCache 事件路径、终局、三种提示、升级界面、倒计时手动 / 后台 / 竖屏中断、输入边沿与手柄中立。
- 浏览器自动化覆盖桌面和 Pixel 7 横屏视口。模拟 pagehide/pageshow 不等于浏览器实际 BFCache 驻留；iOS Safari / Android Chrome 真机还需检查完整保存时长（含取快照、序列化、setItem，目标 < 10 ms）、切 App / 系统回收 / 返回页面与音频恢复。
- 倒计时只用灰盒数字，正式视觉待 Claude 画面方案。进程未触发任何生命周期回调就被杀时无法保证最后一刻已保存。
