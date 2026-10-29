import { expect, it } from 'vitest';
import { MAP_ART, mapFrameTexture } from '../../src/data/mapArt';
import { coverModel, rimSpan, wallVariant } from '../../src/game/assets/mapArtGeometry';
import { Random } from '../../src/sim/core/Random';

it('fits all selected wall and gate models with one uniform scale and limited edge cropping', () => {
  for (const [name, frame] of Object.entries(MAP_ART.frames)) {
    const wall = /_wall_/.test(name),
      vertical = /_(east|west)_/.test(name);
    if (!wall && !/_(north|south|east|west)_/.test(name)) continue;
    const width = wall || vertical ? 80 : 480,
      height = vertical ? 480 : 176;
    const fit = coverModel(frame[2], frame[3], width, height);
    expect(fit.width / frame[2]).toBeCloseTo(fit.height / frame[3], 12);
    expect(fit.width).toBeGreaterThanOrEqual(width - 1e-8);
    expect(fit.height).toBeGreaterThanOrEqual(height - 1e-8);
    expect(Math.max(fit.width / width, fit.height / height)).toBeLessThan(1.1);
  }
});

it('provides theme-specific crystals and all three spike states in consistent logical frames', () => {
  for (const theme of ['temple', 'wreck', 'abyss', 'milk'] as const) {
    const crystal = `${theme}_crystal` as const;
    expect(mapFrameTexture(crystal)).toBe(MAP_ART.textures.crystals);
    expect(MAP_ART.frames[crystal][2] / MAP_ART.frames[crystal][3]).toBe(28 / 30);
    for (const state of ['idle', 'warn', 'on'] as const) {
      const name = `${theme}_spikes_${state}` as const;
      expect(mapFrameTexture(name)).toBe(MAP_ART.textures.spikes);
      expect(MAP_ART.frames[name].slice(2)).toEqual([280, 280]);
    }
  }
  for (const [name, ratio] of [
    ['barrel', 18 / 23],
    ['barrel_hit', 18 / 23],
    ['barrel_broken', 21 / 13],
    ['chest', 24 / 25],
    ['chest_open', 24 / 25],
    ['hazard_milk', 22 / 15],
    ['hazard_poison', 1],
    ['altar', 1],
    ['pickup_health', 1],
    ['pickup_energy', 1],
  ] as const) {
    const frame = MAP_ART.frames[name];
    expect(frame[2] / frame[3]).toBeCloseTo(ratio, 12);
  }
});

it('keeps wall selection stable across render order without advancing any shared random stream', () => {
  const parent = new Random(42),
    before = parent.snapshot;
  const seed = parent.fork('map-floor:1:4').snapshot;
  const cells = Array.from({ length: 100 }, (_, i) => [96 + i * 8, 31] as const);
  const variants = cells.map(([x, y]) => wallVariant(seed, 'temple', x, y));
  expect(new Set(variants).size).toBe(3);
  expect(
    cells
      .toReversed()
      .map(([x, y]) => wallVariant(seed, 'temple', x, y))
      .reverse(),
  ).toEqual(variants);
  expect(cells.map(([x, y]) => wallVariant(77, 'temple', x, y))).not.toEqual(variants);
  expect(parent.snapshot).toBe(before);
});

it('repeats rim middles without stretching and crops only the final partial span', () => {
  const spans = rimSpan(57, 80, 0.1);
  expect(spans.reduce((n, span) => n + span.target, 0)).toBe(57);
  expect(spans.at(-1)?.target).toBe(1);
  for (const span of spans) expect(span.target / span.source).toBeCloseTo(0.1, 12);
});
