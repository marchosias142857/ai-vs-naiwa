import type { EnemyId } from './enemies';
import { MONSTER_ART } from './monsterArt';
import { NAIGUAI_ART } from './naiguaiArt';
import type { MonsterArt } from './schema/art';

/** 怪物逐帧图集的纹理 key 与源文件（ADR 0030）。 */
export const MONSTER_TEXTURES = {
  monsters: { key: 'demo_monsters', source: 'monsters-v2.png' },
  naiguai: { key: 'demo_naiguai', source: 'naiguai-v2.png' },
} as const;
export type MonsterTexture = keyof typeof MONSTER_TEXTURES;

export interface EnemyAnimation {
  texture: MonsterTexture;
  art: Readonly<MonsterArt>;
}

/** 有逐帧动画的怪物；不在表中的怪物沿用旧的单张静态图（ENEMY_ART）。 */
export function enemyAnimation(kind: string): EnemyAnimation | undefined {
  if (kind === 'naiwa_boss') return { texture: 'naiguai', art: NAIGUAI_ART };
  const art = (MONSTER_ART as Readonly<Partial<Record<EnemyId, MonsterArt>>>)[kind as EnemyId];
  return art && { texture: 'monsters', art };
}

/** 图集里一帧的名字。 */
export function monsterFrame(kind: string, action: string, index: number): string {
  return `${kind}:${action}:${index}`;
}

/** 每个动作缺帧时的替补顺序：先找相近的动作，最后都退回待机。 */
export const POSE_FALLBACK: Readonly<Record<string, readonly string[]>> = {
  idle: ['idle'],
  move: ['move', 'idle'],
  windup: ['windup', 'idle'],
  attack: ['attack', 'windup', 'idle'],
  air: ['air', 'attack', 'move', 'idle'],
  recover: ['recover', 'idle'],
  buried: ['buried', 'idle'],
  spin: ['spin', 'attack', 'idle'],
  laugh: ['laugh', 'attack', 'idle'],
  death: ['death', 'windup', 'idle'],
};

/** 死亡演出时长，秒：Boss 用表现层特效演出，普通怪按死亡帧播完。没有逐帧动画时返回 undefined。 */
export function deathSeconds(kind: string): number | undefined {
  if (kind === 'naiwa_boss') return BOSS_DEATH.total;
  const anim = enemyAnimation(kind);
  const frames = anim?.art.frames.death;
  return frames && anim ? frames.length * (anim.art.seconds.death ?? 0.1) : undefined;
}

/** Boss 死亡演出的分段（秒）：定住闪白狂抖 → 捧腹狂笑 → 瘫软碎成像素。只用负责人画的帧加特效。 */
export const BOSS_DEATH = {
  shake: 1.4,
  laugh: 0.8,
  dissolve: 0.8,
  total: 3,
  flashEvery: 0.12,
  shakePixels: 1.5,
  laughShakePixels: 2.5,
  pops: 12,
  shards: 36,
} as const;
