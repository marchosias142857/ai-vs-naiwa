import { expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MAP_ART, mapFrameTexture } from '../../src/data/mapArt';
import report from '../../art-src/maps/export-report.json' with { type: 'json' };

it('keeps every module frame inside its source and every lossless runtime asset within PWA budget', () => {
  for (const row of report) {
    const name = row.name as keyof typeof MAP_ART.sources;
    const source = readFileSync(`art-src/maps/sources/${name}-v1.png`);
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
    for (const name of frames) expect(mapFrameTexture(name)).toBe(MAP_ART.textures.doors);
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
