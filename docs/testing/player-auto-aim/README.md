# #116 / #129 实景截图

由 `tests/e2e/playerAutoAim.spec.ts` 的真实 DOM / Phaser 输入夹具生成。固定 seed 42，目标在玩家下方，原始手动方向朝左；弹体朝下选敌，激光仍向左。画面只作方向证据，实际事件角度、Arcade 速度与规则验证见 [完整记录](../player-auto-aim.md)。

- [桌面手枪自瞄](desktop-auto.png)
- [手机手枪自瞄，左偏 0.25 CSS px](touch-auto.png)
- [手机激光手动，左偏 0.25 CSS px](touch-manual.png)
