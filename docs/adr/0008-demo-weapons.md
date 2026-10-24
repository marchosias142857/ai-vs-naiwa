# 0008. demo 武器与弹道装备

- 状态：集成分支试行，待集中评审及负责人批准
- 提出者：GPT；关联 #31

api 新增只读 weaponId 与 equipWeapon；装备不清空已有冷却，取消上一把武器的待发连射。
schema 新增 radial / twin 弹道枚举与可选 burstInterval。十把武器使用五类已实现弹道：
single 随机散布、spread 均匀扇形、radial 环形、twin 平行多枪口、burst 按物理步计时连射。
FireContext 增加可选 pelletCount，连射复用同一上下文而不创建临时武器数据。
新数据均为 demo 初值，沿用占位纹理，正式枪械视觉待画面方案。
能量消费与双武器携带在后续资源 PR 接入；本 PR 只增加弹道与切换接口。
