import type { GameObjects } from 'phaser';
import { ENEMIES, type EnemyId } from '../../data/enemies';
import { MONSTER_ART } from '../../data/monsterArt';
import { NAIGUAI_ART } from '../../data/naiguaiArt';
import { PRESENTATION as P } from '../../data/presentation';
import type { EnemyDef } from '../../data/schema';
import type { ActorView } from '../../sim/combat/api';
import { HAZARD_FX as H } from './hazardParams';

const CREAM = 0xfff1c2;
const DARK = 0x07111e;

/** 必要提示直接读 sim，不经过装饰预算；没有事件和全局时钟，冻结、读档均保持同一几何形状。 */
export function drawSkillTell(g: GameObjects.Graphics, a: ActorView): void {
  if (a.team !== 'enemy' || a.phase !== 'active') return;
  const def: Readonly<EnemyDef> = ENEMIES[a.kind as EnemyId];
  const p = Math.max(0, Math.min(1, a.stageSpan > 0 ? a.stageTime / a.stageSpan : 0));
  const cx = Math.cos(a.aim),
    cy = Math.sin(a.aim);
  // 普通怪用身体动作预告；这里只画真实舌头、地下土包与 Boss 提示。
  if (a.move === 'lash' && def.lash) {
    if (a.stage === 'active' || a.stage === 'recover') {
      const length = def.lash.length * (a.stage === 'recover' ? 1 - p : 1);
      const tx = a.x + cx * length,
        ty = a.y + cy * length;
      g.lineStyle(def.lash.width + 1, H.tongueDark).lineBetween(a.x, a.y, tx, ty);
      g.lineStyle(def.lash.width - 1, H.tongueColor).lineBetween(a.x, a.y, tx, ty);
      g.fillStyle(H.tongueColor).fillCircle(tx, ty, def.lash.width * 0.8 * (length > 0 ? 1 : 0));
    }
  } else if (a.move === 'bump' && a.stage === 'windup') {
    for (let i = 1; i <= 3; i++) {
      const d = (H.bumpTell * i) / 3;
      const x = a.x + cx * d,
        y = a.y + cy * d;
      const alpha = p >= (i - 1) / 3 ? (a.aimLocked ? 1 : 0.7) : 0.2;
      stroke(g, x - cx * 8 - cy * 6, y - cy * 8 + cx * 6, x, y, alpha);
      stroke(g, x, y, x - cx * 8 + cy * 6, y - cy * 8 - cx * 6, alpha);
    }
  } else if (a.kind === 'naiwa_boss' && a.move === 'hop' && a.stage === 'air') {
    const art = a.kind === 'naiwa_boss' ? NAIGUAI_ART : MONSTER_ART[a.kind as keyof typeof MONSTER_ART];
    const offset = art?.shadowY === undefined ? a.radius : (art.shadowY - art.pivot.y) * art.scale;
    const scale = 1.3 - 0.3 * p;
    landingShadow(
      g,
      a.landX,
      a.landY + offset,
      a.radius * P.shadowWidth * scale,
      a.radius * P.shadowHeight * scale,
      0.35 + 0.4 * p,
    );
    // 砸地范围围绕身体圆心，不随脚底影子偏移或压扁；蓄跳蛙按负责人要求不画落点提示。
    const side = Math.max(a.radius, 6) * 3;
    landingBoundary(g, a.landX, a.landY, side, side, p);
  } else if (a.move === 'burrow' && (a.stage === 'buried' || a.stage === 'emerge')) {
    g.fillStyle(DARK, 0.65).fillEllipse(a.x, a.y + 2, a.radius * 2.2, a.radius);
  }
  if (a.stage === 'stun') {
    const art = a.kind === 'naiwa_boss' ? NAIGUAI_ART : MONSTER_ART[a.kind as keyof typeof MONSTER_ART];
    const y = a.y - (art ? art.pivot.y * art.scale + 2 : a.radius * 1.6);
    for (let k = 0; k < 3; k++) {
      const angle = a.stageTime * H.starSpeed + (k * Math.PI * 2) / 3;
      g.fillStyle(H.starColor).fillRect(a.x + Math.cos(angle) * 8 - 1, y + Math.sin(angle) * 2.5 - 1, 2, 2);
    }
  }
}

/** 暗影填充与高对比边界分开，后者从首步起保持可辨认。 */
export function landingShadow(
  g: GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha: number,
): void {
  g.fillStyle(DARK, alpha).fillEllipse(x, y, width, height);
}

/** 四角框外接落点范围，从 1.3 倍收到 1 倍；细描边与短切角保持原生渲染精度。 */
export function landingBoundary(
  g: GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  color = CREAM,
): void {
  const scale = 1.3 - 0.3 * Math.max(0, Math.min(1, progress));
  const rx = (width / 2) * scale;
  const ry = (height / 2) * scale;
  const bevel = Math.min(rx, ry) * 0.08;
  for (let i = 0; i < 4; i++) {
    const sx = i % 2 ? 1 : -1;
    const sy = i < 2 ? -1 : 1;
    const cx = x + sx * rx,
      cy = y + sy * ry;
    // 细深色底线兼顾浅色地砖；主线固定 0.9 透明度。切角仍触及 ±rx/ry。
    for (let layer = 0; layer < 2; layer++) {
      g.lineStyle(layer ? 0.7 : 1.25, layer ? color : DARK, 0.9);
      g.lineBetween(cx - sx * rx * 0.42, cy, cx - sx * bevel, cy);
      g.lineBetween(cx - sx * bevel, cy, cx, cy - sy * bevel);
      g.lineBetween(cx, cy - sy * bevel, cx, cy - sy * ry * 0.42);
    }
  }
}

function stroke(g: GameObjects.Graphics, x: number, y: number, tx: number, ty: number, alpha: number): void {
  g.lineStyle(3, DARK, alpha).lineBetween(x, y, tx, ty);
  g.lineStyle(1, CREAM, alpha).lineBetween(x, y, tx, ty);
}
