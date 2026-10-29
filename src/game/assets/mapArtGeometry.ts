import { Random } from '../../sim/core/Random';
import { MAP_ART } from '../../data/mapArt';
import type { RoomTheme } from '../../data/schema/traps';

/** Fit the entire authored model at ONE scale; clip only excess outer pixels. */
export function coverModel(sourceWidth: number, sourceHeight: number, width: number, height: number) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  return {
    x: (width - sourceWidth * scale) / 2,
    y: 0,
    width: sourceWidth * scale,
    height: sourceHeight * scale,
  };
}

/** Coordinate-derived decoration never advances the floor or gameplay streams. */
export function wallVariant(seed: number, theme: RoomTheme['art'], x: number, y: number): 0 | 1 | 2 {
  return new Random(seed).fork(`wall-variants:${theme}:${x}:${y}`).pick(MAP_ART.wallVariants);
}

/** Repeat straight rim spans with a common scale, cropping the final span only. */
export function rimSpan(
  length: number,
  sourceLength: number,
  scale: number,
): { source: number; target: number; offset: number }[] {
  const result = [];
  const step = sourceLength * scale;
  for (let offset = 0; offset < length; offset += step) {
    const target = Math.min(step, length - offset);
    result.push({ source: target / scale, target, offset });
  }
  return result;
}
