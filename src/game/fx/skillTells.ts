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
  if (a.move === 'dash' && a.stage === 'windup' && def.dash) {
    const chaser = a.kind === 'naiwa_chaser';
    const len = def.dash.speed * def.dash.duration * (chaser ? 1 : 0.3 + 0.7 * p);
    for (let i = -1; i <= 1; i++) {
      const x = a.x - cy * i * 3,
        y = a.y + cx * i * 3;
      stroke(g, x, y, x + cx * len, y + cy * len, 0.3 + 0.5 * p * p);
    }
  } else if (a.move === 'lash' && def.lash) {
    if (a.stage === 'windup') {
      for (let i = 1; i <= 4; i++) {
        const d = (i * def.lash.length) / 4;
        g.fillStyle(DARK, 0.8).fillCircle(a.x + cx * d, a.y + cy * d, 2);
        g.fillStyle(CREAM, a.aimLocked ? 1 : 0.4).fillCircle(a.x + cx * d, a.y + cy * d, 1.2);
      }
    } else if (a.stage === 'active' || a.stage === 'recover') {
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
  } else if (a.move === 'hop' && a.stage === 'air') {
    const art = a.kind === 'naiwa_boss' ? NAIGUAI_ART : MONSTER_ART[a.kind as keyof typeof MONSTER_ART];
    const offset = art?.shadowY === undefined ? a.radius : (art.shadowY - art.pivot.y) * art.scale;
    const scale = 1.4 - 0.4 * p;
    landingShadow(
      g,
      a.landX,
      a.landY + offset,
      a.radius * P.shadowWidth * scale,
      a.radius * P.shadowHeight * scale,
      0.35 + 0.4 * p,
    );
  } else if (a.move === 'fuse' && def.fuse) {
    const count = a.stageSpan - a.stageTime <= 0.15 ? 8 : 1 + Math.floor(p * 7);
    for (let i = 0; i < count; i++) {
      const angle = (i * Math.PI) / 4,
        x = Math.cos(angle),
        y = Math.sin(angle);
      const r = def.fuse.radius;
      stroke(g, a.x + x * (r - 2), a.y + y * (r - 2), a.x + x * (r + 3), a.y + y * (r + 3), 0.8);
      stroke(
        g,
        a.x + x * (r + 3),
        a.y + y * (r + 3),
        a.x + x * (r + 5) - y * 2,
        a.y + y * (r + 5) + x * 2,
        0.8,
      );
    }
  } else if (a.move === 'burrow' && (a.stage === 'buried' || a.stage === 'emerge')) {
    g.fillStyle(DARK, 0.65).fillEllipse(a.x, a.y + 2, a.radius * 2.2, a.radius);
    const spread = a.stage === 'emerge' ? 2 + p * a.radius : 2;
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3;
      stroke(g, a.x, a.y, a.x + Math.cos(angle) * spread, a.y + Math.sin(angle) * spread, 0.6);
    }
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

/** 暗影两端留短奶白边，深色地板上也能辨认；属于必要落点提示。 */
export function landingShadow(
  g: GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha: number,
): void {
  g.fillStyle(DARK, alpha).fillEllipse(x, y, width, height);
  g.fillStyle(CREAM, alpha)
    .fillRect(x - width / 2, y - 0.5, 2, 1)
    .fillRect(x + width / 2 - 2, y - 0.5, 2, 1);
}

function stroke(g: GameObjects.Graphics, x: number, y: number, tx: number, ty: number, alpha: number): void {
  g.lineStyle(3, DARK, alpha).lineBetween(x, y, tx, ty);
  g.lineStyle(1, CREAM, alpha).lineBetween(x, y, tx, ty);
}
