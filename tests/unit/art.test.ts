import { PRESENTATION } from '../../src/data/presentation';
import { PresentationSchema } from '../../src/data/schema/art';
import { frameAt } from '../../src/game/entities/artPose';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DOOR_ART, ENEMY_ART, ENVIRONMENT_ART, HERO_ART, HERO_FRAMES, WEAPON_ART } from '../../src/data/art';
import { ENEMIES } from '../../src/data/enemies';
import { MONSTER_TEXTURES, enemyAnimation } from '../../src/data/enemyArt';
import { WEAPONS } from '../../src/data/weapons';
import { ARSENAL_SHOT_ART } from '../../src/data/arsenalArt';
import { ROOM_ART } from '../../src/data/roomArt';
import { ROOM_THEMES } from '../../src/data/traps';
import type { WeaponDef } from '../../src/data/schema';
import {
  ArtFrameSchema,
  CharacterArtSchema,
  MonsterArtSchema,
  WeaponArtSchema,
  type WeaponArt,
} from '../../src/data/schema/art';
import { CHARACTER_ART, characterTexture } from '../../src/data/characterArt';
import { CHARACTERS } from '../../src/data/characters';

const files = [
  'da-fei-yu-pixel-v2',
  'da-fei-yu-pixel-reactions-v1',
  'weapons',
  'enemies',
  'environment',
  'doors',
  'monsters-v1',
  'naiguai-v1',
  'arsenal-v1',
  'rooms-v1',
];
function dimensions(name: string) {
  const file = `public/assets/demo/${name}.png`,
    buffer = readFileSync(file);
  expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(statSync(file).size).toBeLessThan(2 * 1024 * 1024);
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)] as const;
}
function inImage(file: string, rects: readonly (readonly number[])[]) {
  const [width, height] = dimensions(file);
  for (const [x, y, w, h] of rects) {
    expect(x! + w!).toBeLessThanOrEqual(width);
    expect(y! + h!).toBeLessThanOrEqual(height);
  }
}
describe('真实 PNG 图集与持握数据', () => {
  it('待机行走逐字节保留负责人参考图 2，角色新版本不复用旧缓存 URL', () => {
    expect(
      createHash('sha256')
        .update(readFileSync(`public/assets/demo/${HERO_ART.source}`))
        .digest('hex'),
    ).toBe('5c4403dc7535f67f21ccef0da864e4042aaff4f24fcc68af90f0e9c9437731f7');
    expect(HERO_ART.source).not.toBe('da-fei-yu.png');
    expect(HERO_ART.reactionSource).not.toBe('da-fei-yu-reactions.png');
    for (const action of ['hurt', 'death'] as const) {
      let elapsed = 0;
      for (const name of HERO_ART[action]) {
        expect(frameAt(action, elapsed + HERO_FRAMES[name].seconds / 2)).toBe(name);
        elapsed += HERO_FRAMES[name].seconds;
      }
    }
  });
  it('全部可玩角色注册资源，独立动作名称、计时和反应图集可扩展', () => {
    expect(Object.keys(CHARACTER_ART).sort()).toEqual(Object.keys(CHARACTERS).sort());
    for (const art of Object.values(CHARACTER_ART)) {
      expect(CharacterArtSchema.safeParse(art).success).toBe(true);
      for (const action of ['idle', 'run', 'hurt', 'death'] as const)
        for (const name of art[action]) expect(art.frames).toHaveProperty(name);
    }
    const other = {
      ...HERO_ART,
      texture: 'second_body',
      reactionTexture: 'second_reactions',
      frames: {
        rest_a: { ...HERO_FRAMES.idle_0, seconds: 0.15 },
        rest_b: { ...HERO_FRAMES.idle_1, seconds: 0.25 },
      },
      idle: ['rest_a', 'rest_b'],
      run: ['rest_b'],
      hurt: ['rest_a'],
      death: ['rest_b'],
    };
    expect(frameAt('idle', 0.2, other)).toBe('rest_b');
    expect(frameAt('idle', 0.41, other)).toBe('rest_a');
    expect(frameAt('death', 10, other)).toBe('rest_b');
    expect(characterTexture(other, 'idle')).toBe('second_body');
    expect(characterTexture(other, 'hurt')).toBe('second_reactions');
  });
  it('视觉参数通过 schema，跑步循环、死亡停在末帧', () => {
    expect(PresentationSchema.safeParse(PRESENTATION).success).toBe(true);
    expect(frameAt('run', 0)).toBe('run_0');
    expect(frameAt('run', 0.11)).toBe('run_1');
    expect(frameAt('run', 0.61)).toBe('run_0');
    expect(frameAt('death', 10)).toBe('death_3');
  });
  it('PNG 图集尺寸合法，单文件在离线缓存预算内', () => {
    for (const name of files) expect(dimensions(name)[0]).toBeGreaterThan(0);
    inImage('da-fei-yu-pixel-v2', [
      HERO_ART.face.rect,
      ...[...HERO_ART.idle, ...HERO_ART.run].map((key) => HERO_FRAMES[key].rect),
    ]);
    inImage(
      'da-fei-yu-pixel-reactions-v1',
      [...HERO_ART.hurt, ...HERO_ART.death].map((key) => HERO_FRAMES[key].rect),
    );
    const weaponArt: readonly WeaponArt[] = Object.values(WEAPON_ART);
    inImage(
      'weapons',
      weaponArt.filter((f) => !f.texture).map((f) => f.rect),
    );
    // ADR 0031：新武器与弹体在独立图集里。
    inImage('arsenal-v1', [
      ...weaponArt.filter((f) => f.texture === 'demo_arsenal').map((f) => f.rect),
      ...Object.values(ARSENAL_SHOT_ART),
    ]);
    // ADR 0032：楼层主题与机关图集。
    inImage('rooms-v1', Object.values(ROOM_ART));
    inImage('enemies', Object.values(ENEMY_ART));
    inImage('environment', Object.values(ENVIRONMENT_ART));
    inImage('doors', Object.values(DOOR_ART));
  });
  it('固定面部可从所有待机与行走帧中完整裁出，受击死亡仍使用独立原图', () => {
    for (const key of [...HERO_ART.idle, ...HERO_ART.run]) {
      const f = HERO_FRAMES[key];
      const x = f.pivot.x - HERO_ART.face.pivot.x;
      const y = f.pivot.y - HERO_ART.face.pivot.y;
      expect(x).toBeGreaterThan(0);
      expect(y).toBeGreaterThan(0);
      expect(x + HERO_ART.face.rect[2]).toBeLessThan(f.rect[2]);
      expect(y + HERO_ART.face.rect[3]).toBeLessThan(f.rect[3]);
    }
  });
  it('新开屏采用无损 WebP，纳入离线缓存且旧图已移除', () => {
    const file = 'public/assets/demo/title-confrontation-v1.webp';
    const buffer = readFileSync(file);
    expect(buffer.subarray(0, 4).toString()).toBe('RIFF');
    expect(buffer.subarray(8, 16).toString()).toBe('WEBPVP8L');
    expect(statSync(file).size).toBeLessThan(2 * 1024 * 1024);
    expect(readFileSync('vite.config.ts', 'utf8')).toContain('webp');
    expect(() => statSync('public/assets/demo/title.png')).toThrow();
  });
  it('朝左原图的握持点在身体前方；逐帧换向不会改变固定标准握持距离', () => {
    expect(HERO_ART.nativeFacing).toBe('left');
    for (const action of ['idle', 'run', 'hurt', 'death'] as const) {
      const scale = action === 'hurt' || action === 'death' ? HERO_ART.reactionScale : HERO_ART.scale;
      for (const key of HERO_ART[action]) {
        const f = HERO_FRAMES[key];
        expect(f.grip.x).toBeLessThan(f.pivot.x);
        expect(Math.abs((f.pivot.x - f.grip.x) * scale - HERO_ART.standardGrip.x)).toBeLessThan(0.05);
        expect(Math.abs((f.grip.y - f.pivot.y) * scale - HERO_ART.standardGrip.y)).toBeLessThan(0.05);
      }
    }
  });
  it('动作和武器数据通过 schema，逐帧 pivot / grip 在帧内，所有当前武器和怪物都有贴图', () => {
    expect(CharacterArtSchema.safeParse(HERO_ART).success).toBe(true);
    for (const key of [...HERO_ART.idle, ...HERO_ART.run, ...HERO_ART.hurt, ...HERO_ART.death]) {
      const f = HERO_FRAMES[key];
      expect(ArtFrameSchema.safeParse(f).success).toBe(true);
      for (const p of [f.grip, f.pivot]) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(f.rect[2]);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThan(f.rect[3]);
      }
    }
    for (const f of Object.values(WEAPON_ART)) expect(WeaponArtSchema.safeParse(f).success).toBe(true);
    for (const key of Object.keys(WEAPONS)) expect(Object.hasOwn(WEAPON_ART, key)).toBe(true);
    // 特殊弹体与分裂小弹的贴图都在新武器图集里（ADR 0031）。
    for (const w of Object.values(WEAPONS) as readonly WeaponDef[])
      for (const sprite of [w.shot?.sprite, w.shot?.split?.sprite])
        if (sprite) expect(Object.hasOwn(ARSENAL_SHOT_ART, sprite), sprite).toBe(true);
    // 每个新主题都有地砖、嵌花、墙砖与障碍块（ADR 0032）；第 1 层沿用原有石殿图。
    for (const { art } of ROOM_THEMES)
      if (art !== 'temple')
        for (const part of ['floor', 'floor_alt', 'wall', 'block'])
          expect(Object.hasOwn(ROOM_ART, `${art}_${part}`), `${art}_${part}`).toBe(true);
    // 旧的单张静态图只是逐帧动画缺失时的替补（ADR 0030）。
    for (const key of Object.keys(ENEMIES))
      expect(Object.hasOwn(ENEMY_ART, key) || enemyAnimation(key) !== undefined).toBe(true);
  });
  it('每种怪物都有逐帧动画，帧在图集内，pivot 在帧内，必备动作齐全（ADR 0030）', () => {
    for (const kind of Object.keys(ENEMIES)) {
      const anim = enemyAnimation(kind);
      expect(anim, kind).toBeDefined();
      const art = anim!.art;
      expect(MonsterArtSchema.safeParse(art).success).toBe(true);
      const [w, h] = art.size;
      expect(art.pivot.x).toBeGreaterThan(0);
      expect(art.pivot.x).toBeLessThan(w);
      expect(art.pivot.y).toBeGreaterThan(0);
      expect(art.pivot.y).toBeLessThan(h);
      for (const action of ['idle', 'death'])
        expect(art.frames[action]?.length, `${kind} ${action}`).toBeGreaterThan(0);
      for (const action of Object.keys(art.frames))
        expect(art.seconds[action], `${kind} ${action}`).toBeGreaterThan(0);
      const file = MONSTER_TEXTURES[anim!.texture].source.replace(/\.png$/, '');
      inImage(
        file,
        Object.values(art.frames).flatMap((corners) => corners.map(([x, y]) => [x, y, w, h])),
      );
    }
  });
});
