import { expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MAP_ART, mapFrameTexture } from '../../src/data/mapArt';
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
        /_(east|west)_/.test(name) ? MAP_ART.textures.sideDoors : MAP_ART.textures.doors,
      );
  }
  for (const frame of [
    'spikes_idle',
    'spikes_warn',
    'spikes_on',
    'current',
    'weed',
    'barrel',
    'barrel_hit',
    'barrel_broken',
    'mine',
    'mine_lit',
  ])
    expect(MAP_ART.frames).toHaveProperty(frame);
});

it('uses dedicated pixel wall parts with a square cap and a 1.2 body ratio, preserving north/south door models', () => {
  expect(MAP_ART.wallPixels).toBe(80);
  expect(MAP_ART.wallFacePixels).toBe(96);
  expect(MAP_ART.wallHeight / MAP_ART.wallWidth).toBe(1.2);
  expect(MAP_ART.doorSize).toEqual({ horizontal: [40, 30], vertical: [13, 38] });
  expect(MAP_ART.southDoorOffset - MAP_ART.doorSize.horizontal[1] * 0.2).toBeCloseTo(-MAP_ART.wallHeight);
  for (const theme of ['temple', 'wreck', 'abyss', 'milk'] as const) {
    expect(mapFrameTexture(`${theme}_wall_top`)).toBe(MAP_ART.textures.walls);
    expect(mapFrameTexture(`${theme}_wall_face`)).toBe(MAP_ART.textures.walls);
    expect(MAP_ART.textures.walls).not.toBe(mapFrameTexture(`${theme}_obstacle`));
  }
});
