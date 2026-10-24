# 0018. demo 集中评审修订：空武器槽、掉落与缓存

- 状态：设计已由负责人拍板，实现待复审
- 提出者：GPT（依据 Claude 评审及负责人决定）
- 批准：负责人（合并即批准）
- 关联：PR #33，负责人决定 issuecomment-6380406678；修订 ADR 0008、0010、0011、0014、0016

## 背景

集中评审发现触屏动作等待 click、菜单静默覆盖检查点两个问题；负责人同时决定只带手枪开局、允许不掉落、换枪时旧枪留地。混合半径导航与楼层续玩的随机流也需要修正。

## 决定

- ActionButtons 使用 pointerdown + preventDefault，仍由渲染帧采样、bridge 锁存边沿，跟随 touchVisible。暂停与物理暂停继续拦截操作。
- 有存档时全局 Enter 继续；新局用明确的二次确认，取消默认获焦；不在确认前删除或覆盖存档。
- CombatWorld.weaponId 收紧为 WeaponId，secondaryWeapon 为 WeaponId | null；开局空槽，空槽切枪无效。拾取通过 LootSystem 原槽置换旧枪，手枪不掉。
- v1 检查点 secondary 允许 null，缺失/未知值拒绝；旧有合法字符串仍兼容，旧手枪第二槽归一为空。version/key 不变，不提前实现完整存档 v2。
- loot schema 增加 noDropChance=0.4（40% 不掉、60% 再按权重抽取），weaponReserve=1；固定槽记录房间编号，武器只在所属房间展示并保留至换层。满额不会消耗旧武器或宝箱。
- upgrades/loot/encounters 按楼层 fork；导航 schema 增加 radiusCaches=4，预热各半径 blocked/流场并有界轮换；目标格直接用坐标计算。
- UpgradeDef 增加 display: number | percent，按钮数量按 upgradeChoices 创建，出口文字走 t()。手柄按钮编号集中到 INPUT_UI。
- 音频在场景/物理暂停和后台 suspend；恢复时尝试 resume，被浏览器拒绝则等下一次真实手势。

## 备选方案

- 换枪额外申请槽位：满池时必须拒绝，原槽置换直接保证旧枪不丢。
- 为每个房间另建掉落对象池：增加表现对象；固定全层槽位只切可见性即可。
- 立即引入完整状态存档：超出本次拍板范围，留给独立 ADR。

## 后果

新增共享字段均带 schema/单测；正常武器交换无额外分配。数据调整与正式视觉仍由负责人确认。浏览器触屏模拟只能验证事件接线，iOS Safari/Android Chrome 真机兼容与帧率/draw call 由 #18 后续记录。
