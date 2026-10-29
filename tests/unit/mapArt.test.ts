import { expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MAP_ART, mapFrameTexture, mapDoorRect } from '../../src/data/mapArt';
import { MODULAR_V2 } from '../../src/data/roomTemplates/modularV2';
import { compileRoom } from '../../src/sim/dungeon/compileRoom';
import { DESIGNED_V3 } from '../../src/data/roomTemplates/designedV3';
import report from '../../art-src/maps/export-report.json' with { type: 'json' };

it('keeps every module frame inside its source and every lossless runtime asset within PWA budget', () => {
  for (const row of report) {
    const name = row.name as keyof typeof MAP_ART.sources;
    const source = readFileSync(`art-src/maps/sources/${row.sourceFile}`);
    const runtime = `public/assets/demo/${MAP_ART.sources[name]}`;
    expect([source.readUInt32BE(16), source.readUInt32BE(20)]).toEqual(row.size);
    expect(createHash('sha256').update(source).digest('hex')).toBe(row.sourceSha256);
    expect(createHash('sha256').update(readFileSync(runtime)).digest('hex')).toBe(row.runtimeSha256);
    expect(statSync(runtime).size).toBeLessThan(2 * 1024 * 1024);
    expect(row.decodedRGBAIdentical).toBe(true);
    for (const [frame, [x, y, w, h]] of Object.entries(MAP_ART.frames)) {
      if (mapFrameTexture(frame) !== MAP_ART.textures[name]) continue;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThan(0);
      expect(x + w).toBeLessThanOrEqual(row.size[0]!);
      expect(y + h).toBeLessThanOrEqual(row.size[1]!);
    }
  }
});

it('provides distinct four-direction door states and all trap states without rotating frontal art', () => {
  for (const theme of ['temple', 'wreck', 'abyss', 'milk']) {
    const frames = ['north', 'east', 'south', 'west'].flatMap((direction) =>
      ['open', 'locked'].map((state) => `${theme}_${direction}_${state}`),
    );
    expect(
      new Set(frames.map((name) => JSON.stringify(MAP_ART.frames[name as keyof typeof MAP_ART.frames]))).size,
    ).toBe(8);
    for (const name of frames)
      expect(mapFrameTexture(name)).toBe(
        /_(east|west)_/.test(name)
          ? MAP_ART.textures.sideDoors
          : name.includes('_south_')
            ? MAP_ART.textures.southDoors
            : MAP_ART.textures.doors,
      );
  }
  for (const frame of ['current', 'weed', 'barrel', 'barrel_hit', 'barrel_broken', 'mine', 'mine_lit'])
    expect(MAP_ART.frames).toHaveProperty(frame);
});

it('keeps wall cap/body ratios and reserves six whole modules for both gate orientations', () => {
  expect(MAP_ART.wallPixels).toBe(80);
  expect(MAP_ART.wallFacePixels).toBe(96);
  expect(MAP_ART.wallHeight / MAP_ART.wallWidth).toBe(1.2);
  expect(MAP_ART.doorSize.horizontal[0] / MAP_ART.wallWidth).toBe(6);
  expect(MAP_ART.doorSize.vertical[1] / MAP_ART.wallWidth).toBe(6);
  expect(mapDoorRect({ center: { x: 240, y: 39 }, direction: { x: 0, y: -1 } })).toEqual({
    x: 216,
    y: 21.4,
    width: 48,
    height: 17.6,
  });
  expect(mapDoorRect({ center: { x: 96, y: 135 }, direction: { x: -1, y: 0 } })).toEqual({
    x: 88,
    y: 101.4,
    width: 8,
    height: 48,
  });
  for (const theme of ['temple', 'wreck', 'abyss', 'milk'] as const) {
    for (const variant of MAP_ART.wallVariants)
      expect(mapFrameTexture(`${theme}_wall_${variant}`)).toBe(MAP_ART.textures.walls);
    expect(MAP_ART.textures.walls).not.toBe(mapFrameTexture(`${theme}_obstacle`));
  }
});

it('aligns every supported room gate to complete wall cells after projection', () => {
  let ports = 0;
  for (const template of DESIGNED_V3) {
    for (const port of compileRoom(template).ports) {
      const r = mapDoorRect(port);
      expect((r.x - MODULAR_V2.bounds.x) / 8).toBeCloseTo(Math.round((r.x - MODULAR_V2.bounds.x) / 8), 8);
      const y = (r.y + MAP_ART.wallHeight - MODULAR_V2.bounds.y) / 8;
      expect(y).toBeCloseTo(Math.round(y), 8);
      expect(port.direction.x ? r.height : r.width).toBe(48);
      ports++;
    }
  }
  expect(ports).toBe(DESIGNED_V3.length * 4);
});

it('provides ten square source cells per theme and uses exactly one wall-width floor module', () => {
  expect(MAP_ART.floorTile).toBe(MAP_ART.wallWidth);
  expect(MAP_ART.floorVariants).toHaveLength(10);
  for (const theme of ['temple', 'wreck', 'abyss', 'milk'] as const) {
    const rectangles = MAP_ART.floorVariants.map((i) => MAP_ART.frames[`${theme}_ground_${i}`]);
    expect(new Set(rectangles.map((f) => JSON.stringify(f))).size).toBe(10);
    for (const [i, f] of rectangles.entries()) {
      expect(Math.abs(f[2] - f[3])).toBeLessThanOrEqual(1);
      expect(mapFrameTexture(`${theme}_ground_${i}`)).toBe(MAP_ART.textures[`${theme}Ground`]);
    }
  }
});
