import { POSE_FALLBACK } from '../../data/enemyArt';
import type { MonsterArt } from '../../data/schema/art';
import type { ActorView } from '../../sim/combat/api';

/** 可复用的表现结果；只有画面读它，物理代理不随形变移动。 */
export interface SkillPose {
  action: string;
  frame: number;
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  cream: boolean;
}

/** 只读存档可恢复的阶段，不记录技能起始时间，读档首帧和连续播放完全相同。 */
export function skillPose(a: ActorView, art: Readonly<MonsterArt>, out: SkillPose): boolean {
  if (a.stage === 'ready' || a.phase !== 'active') return false;
  const p = Math.max(0, Math.min(1, a.stageSpan > 0 ? a.stageTime / a.stageSpan : 0));
  const boss = a.kind === 'naiwa_boss';
  let action: string = a.stage;
  let progress = p;
  let recoil = 0;
  out.dx = out.dy = 0;
  out.sx = out.sy = 1;
  out.cream = false;
  if (a.stage === 'active' || a.stage === 'dash') action = 'attack';
  else if (a.stage === 'stun') action = 'recover';
  else if (a.stage === 'emerge') action = 'windup';
  if (a.move === 'burrow' && a.stage === 'active') {
    action = a.stageTime < 0.3 ? 'attack' : 'idle';
    progress = Math.min(1, a.stageTime / 0.3);
  }
  if (a.move === 'hop' && a.stage === 'recover') {
    action = a.stageTime < 0.2 ? 'attack' : 'recover';
    progress = a.stageTime < 0.2 ? a.stageTime / 0.2 : (a.stageTime - 0.2) / (a.stageSpan - 0.2);
  }
  if (a.stage === 'windup') {
    switch (a.move) {
      case 'dash': {
        const chaser = a.kind === 'naiwa_chaser';
        out.sy = 1 - 0.15 * p;
        recoil = (chaser ? 2 : 3) * p;
        const shake = chaser ? Number(a.stageSpan - a.stageTime < 0.15) : Math.round(p);
        out.dx = Math.round(Math.sin(a.stageTime * 70) * shake);
        break;
      }
      case 'hop':
        out.sy = 1 - (boss ? 0.18 : 0.2) * p;
        out.sx = 1 + 0.1 * p;
        break;
      case 'fuse': {
        out.sx = out.sy = 1 + 0.25 * p;
        // 对逐渐加快的频率积分，避免直接除以变化周期造成跳帧；只依赖阶段时间。
        const cycles = (-a.stageSpan / 0.18) * Math.log(1 - 0.75 * p);
        progress = Math.floor(cycles) % 2;
        out.cream = cycles % 1 < 0.35;
        break;
      }
      case 'lash':
        recoil = 2 * p;
        out.sy = 1 + 0.08 * p;
        break;
      case 'bump':
        recoil = 3 * p;
        progress = Number(a.aimLocked);
        break;
      case 'summon':
        if (boss) out.sy = 1 + 0.06 * Math.abs(Math.sin(p * Math.PI * 2));
        else out.dx = Math.round(Math.sin(a.stageTime * 70) * p);
        break;
      case 'rain':
        out.dy = -3 * p;
        break;
      case 'none':
        out.sy = 1 + 0.1 * p;
        break;
    }
  } else if (a.stage === 'dash') out.sx = 1.15;
  else if (a.stage === 'active' && a.move === 'none') recoil = 1 - p;
  out.dx -= Math.cos(a.aim) * recoil;
  out.dy -= Math.sin(a.aim) * recoil;
  for (const key of (POSE_FALLBACK[action] ?? POSE_FALLBACK.idle)!) {
    if (!art.frames[key]?.length) continue;
    out.action = key;
    break;
  }
  const count = art.frames[out.action]!.length;
  const loop = a.stage === 'spin' || a.stage === 'buried' || action === 'idle';
  out.frame = loop
    ? Math.floor(a.stageTime / (art.seconds[out.action] ?? 0.1)) % count
    : Math.min(count - 1, Math.floor(Math.max(0, progress) * count));
  return true;
}
