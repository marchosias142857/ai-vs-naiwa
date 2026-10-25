// 由 art-src/naiguai/import_naiguai.py 生成，不要手改；源图为负责人绘制的奶怪动作表。
import type { MonsterArt } from './schema/art';

/**
 * 最终 Boss 奶怪的逐帧动画（ADR 0028）。只用负责人画的 12 帧：行走 8 帧、待机、捧腹、弯腰捧腹。
 * 受击闪白、眩晕星星与死亡演出由表现层的特效补足，不另画奶怪帧。
 */
export const NAIGUAI_ART = {
  size: [83, 109],
  pivot: { x: 41.5, y: 68 },
  scale: 0.5,
  facing: 'left',
  frames: {
    idle: [[0, 222], [255, 222]],
    move: [[0, 0], [85, 0], [170, 0], [255, 0], [0, 111], [85, 111], [170, 111], [255, 111]],
    windup: [[170, 222]],
    attack: [[85, 222]],
    air: [[85, 222]],
    recover: [[0, 222]],
    spin: [[85, 222], [170, 222]],
    death: [[170, 222]],
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
