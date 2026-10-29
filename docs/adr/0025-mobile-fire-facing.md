# ADR 0025：原生多指射击、身体与武器独立朝向

> 更新：攻击轮盘死区/首发等待和弹体选敌规则由 [ADR 0043](0043-projectile-auto-aim.md) 替代；下文保留当时决策，其他输入所有权、布局与身体表现规则继续适用。

- 状态：待负责人合并批准
- 背景：负责人反馈手机无法开火、角色与枪口反向，并明确要求未射击身体随移动、射击身体随枪口，手机右摇杆无输入时枪回到最后移动方向。本决定替代 ADR 0020 对触屏松开瞄准后的规则。

## 决定

- 支持原生 TouchEvent 的设备使用 Touch.identifier 管理左右触点；监听画布 touchstart 和窗口 touchmove/end/cancel。避免触摸被 Pointer Capture 丢失打断，屏蔽同一触摸派生的 PointerEvent。鼠标释放永远不释放原生触点，取消单指不影响另一指。无 TouchEvent 时保留 PointerEvent 路径。
- 开火规则保持：中心按住 120 ms，拖出死区立即开火。触摸仅生成 InputFrame，子弹仍由固定 WORLD_STEP 驱动。
- lastMoveDir 在每次有移动输入时更新，包括同时手动瞄准的情况。触屏 aim 为 null 时，武器始终使用 lastMoveDir；没有历史移动时默认朝右。桌面与手柄的枪口保留原规则。
- CombatWorld 新增只读 playerBodyFacing 表现接口。未开火时取最后移动方向，按住开火、未结束连射或近战期间取武器方向；死亡时冻结。ActorView.facing 继续用于武器、弹道与 dash，身体朝向不改变碰撞或战斗。
- 身体方向不增加存档字段；载入时从已有 lastMoveDir 初始化，下一固定步按输入更新。存档版本不变。
- CharacterArt 新增 nativeFacing（left/right）。大肥鱼源图朝左，因此面向右时翻图；pivot 按实际翻面镜像并继续对齐渲染像素。grip 保持源图坐标，修正到身体前方，再归一到武器方向；固定 standardGrip 与 sim 枪口不变。

## 验证与限制

- DOM 输入测试覆盖原生触摸实际出弹、双指、编号冲突、单指释放/取消、画布外拖动、后台清理和监听销毁；sim 测试覆盖身体/枪口分离、松开瞄准后的方向及存读档。
- 更新 Chromium 多点触屏与 WebKit TouchEvent 浏览器回归。真机表现仍由负责人试玩验收；没有跑过的浏览器检查必须明确记录，不以单测替代。
- 按负责人要求，远端 CI 保持禁用，仅做本地检查；网页发布工作流保持启用。
