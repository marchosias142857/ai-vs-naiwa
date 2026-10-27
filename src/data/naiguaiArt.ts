// 由 art-src/naiguai/import_naiguai.py 生成，不要手改；源图为负责人绘制的奶怪动作表。
import type { MonsterArt } from './schema/art';

/**
 * 最终 Boss 奶怪的逐帧动画（ADR 0030）。只用负责人画的 12 帧：行走 8 帧、待机、捧腹、弯腰捧腹。
 * 受击闪白、眩晕星星与死亡演出由表现层的特效补足，不另画奶怪帧。
 */
export const NAIGUAI_ART = {
  size: [89, 114],
  pivot: { x: 32, y: 62 },
  shadowY: 111,
  scale: 0.5,
  facing: 'left',
  frames: {
    idle: [
      [0, 232],
      [273, 232],
    ],
    move: [
      [0, 0],
      [91, 0],
      [182, 0],
      [273, 0],
      [0, 116],
      [91, 116],
      [182, 116],
      [273, 116],
    ],
    windup: [[182, 232]],
    attack: [[91, 232]],
    air: [[91, 232]],
    recover: [[0, 232]],
    spin: [
      [91, 232],
      [182, 232],
    ],
    death: [[182, 232]],
  },
  seconds: {
    idle: 0.45,
    move: 0.085,
    windup: 0.2,
    attack: 0.1,
    air: 0.2,
    recover: 0.3,
    spin: 0.12,
    death: 1,
  },
} as const satisfies MonsterArt;
