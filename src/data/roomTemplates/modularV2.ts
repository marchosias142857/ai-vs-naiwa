/** Axis-aligned graybox contours. Coordinates are local to legacy bounds.
 * Insets avoid existing trap/obstacle footprints; art will consume these same edges.
 */
export const MODULAR_V2 = freeze({
  catalogId: 'modular_v2',
  // Shorter cargo dividers keep player-centre clearance above 80%, including standing barrels.
  cargoDividerWidth: 56,
  cargoBarrelX: 24,
  cargoEdgeBarrelX: -88,
  maxBoundaryBodies: 4,
  spawnGrid: 16,
  spawnMargin: 24,
  interactionRadius: 6,
  shapes: {
    temple: {
      points: [
        [0, 0],
        [224, 0],
        [224, 32],
        [272, 32],
        [272, 176],
        [0, 176],
      ],
      cuts: [[224, 0, 48, 32]],
      northX: 136,
    },
    wreck: {
      points: [
        [0, 0],
        [240, 0],
        [240, 32],
        [272, 32],
        [272, 176],
        [32, 176],
        [32, 144],
        [0, 144],
      ],
      cuts: [
        [240, 0, 32, 32],
        [0, 144, 32, 32],
      ],
      northX: 136,
    },
    abyss: {
      points: [
        [0, 0],
        [104, 0],
        [104, 32],
        [168, 32],
        [168, 0],
        [272, 0],
        [272, 176],
        [0, 176],
      ],
      cuts: [[104, 0, 64, 32]],
      northX: 64,
    },
    milk: {
      points: [
        [0, 0],
        [272, 0],
        [272, 176],
        [0, 176],
      ],
      cuts: [],
      northX: 136,
    },
  },
} as const);

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
