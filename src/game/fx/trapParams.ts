/** 房间机关的视觉参数（ADR 0032）；频率赫兹、尺寸游戏像素，只影响画面。 */
export const TRAP_FX = {
  /** 地刺预警、地雷点燃时的闪烁频率。 */
  warnBlink: 10,
  fuseBlink: 14,
  /** 水流贴图的不透明度。 */
  currentAlpha: 0.75,
  /** 海草丛左右摆动的频率与幅度（贴图像素）。 */
  weedSway: 2.2,
  weedSwayPixels: 2,
  /** 地雷刚爆完、重新布设时的不透明度。 */
  rearmAlpha: 0.15,
  /** 鱼雷桶碰撞方块边长 = 半径 × 这个倍数，比贴图略小，边角不卡人。 */
  barrelBody: 1.7,
} as const;
