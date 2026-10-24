import { PRESENTATION } from '../../src/data/presentation';
import { PresentationSchema } from '../../src/data/schema/art';
import { frameAt } from '../../src/game/entities/artPose';
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOOR_ART, ENEMY_ART, ENVIRONMENT_ART, HERO_ART, HERO_FRAMES, WEAPON_ART } from '../../src/data/art';
import { ENEMIES } from '../../src/data/enemies';
import { WEAPONS } from '../../src/data/weapons';
import { ArtFrameSchema, CharacterArtSchema, WeaponArtSchema } from '../../src/data/schema/art';
import { CHARACTER_ART, characterTexture } from '../../src/data/characterArt';
import { CHARACTERS } from '../../src/data/characters';

const files = ['da-fei-yu', 'da-fei-yu-reactions', 'weapons', 'enemies', 'environment', 'title', 'doors'];
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
  it('全部资源是 PNG，尺寸合法，单文件在离线缓存预算内', () => {
    for (const name of files) expect(dimensions(name)[0]).toBeGreaterThan(0);
    inImage(
      'da-fei-yu',
      [...HERO_ART.idle, ...HERO_ART.run].map((key) => HERO_FRAMES[key].rect),
    );
    inImage(
      'da-fei-yu-reactions',
      [...HERO_ART.hurt, ...HERO_ART.death].map((key) => HERO_FRAMES[key].rect),
    );
    inImage(
      'weapons',
      Object.values(WEAPON_ART).map((f) => f.rect),
    );
    inImage('enemies', Object.values(ENEMY_ART));
    inImage('environment', Object.values(ENVIRONMENT_ART));
    inImage('doors', Object.values(DOOR_ART));
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
    for (const key of Object.keys(ENEMIES)) expect(Object.hasOwn(ENEMY_ART, key)).toBe(true);
  });
});
