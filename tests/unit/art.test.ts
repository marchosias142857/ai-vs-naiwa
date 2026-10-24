import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENEMY_ART, ENVIRONMENT_ART, HERO_ART, HERO_FRAMES, WEAPON_ART } from '../../src/data/art';
import { ENEMIES } from '../../src/data/enemies';
import { WEAPONS } from '../../src/data/weapons';
import { ArtFrameSchema, CharacterArtSchema, WeaponArtSchema } from '../../src/data/schema/art';

const files = ['da-fei-yu', 'weapons', 'enemies', 'environment', 'title'];
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
  it('全部资源是 PNG，尺寸合法，单文件在离线缓存预算内', () => {
    for (const name of files) expect(dimensions(name)[0]).toBeGreaterThan(0);
    inImage(
      'da-fei-yu',
      Object.values(HERO_FRAMES).map((f) => f.rect),
    );
    inImage(
      'weapons',
      Object.values(WEAPON_ART).map((f) => f.rect),
    );
    inImage('enemies', Object.values(ENEMY_ART));
    inImage('environment', Object.values(ENVIRONMENT_ART));
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
