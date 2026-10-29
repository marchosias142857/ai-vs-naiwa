/** Axis-aligned graybox contours. Coordinates are local to legacy bounds.
 * Insets avoid existing trap/obstacle footprints; art will consume these same edges.
 */
export const MODULAR_V2 = freeze({
  catalogId: 'modular_v2',
  // Include two extra south wall modules so solid raised tops do not reduce playable area.
  bounds: { x: 96, y: 39, width: 288, height: 208 },
  southApron: 16,
  wall: { width: 8, faceHeight: 9.6 },
  // Shorter cargo dividers keep player-centre clearance above 80%, including standing barrels.
  cargoDividerWidth: 60,
  abyssDividerWidth: 60,
  // Physical spike footprints and their visual cells share this world-space size.
  spikeTile: 16,
  abyssNorthSpikeY: -54,
  cargoBarrelX: 24,
  cargoEdgeBarrelX: -80,
  maxBoundaryBodies: 4,
  spawnGrid: 16,
  spawnMargin: 24,
  interactionRadius: 6,
  shapes: {
    temple: {
      points: [
        [-8, -8],
        [232, -8],
        [232, 24],
        [280, 24],
        [280, 184],
        [-8, 184],
      ],
      cuts: [[232, -8, 48, 32]],
      northX: 136,
    },
    wreck: {
      points: [
        [-8, -8],
        [248, -8],
        [248, 24],
        [280, 24],
        [280, 184],
        [24, 184],
        [24, 152],
        [-8, 152],
      ],
      cuts: [
        [248, -8, 32, 32],
        [-8, 152, 32, 32],
      ],
      northX: 136,
    },
    abyss: {
      points: [
        [-8, -8],
        [104, -8],
        [104, 24],
        [168, 24],
        [168, -8],
        [280, -8],
        [280, 184],
        [-8, 184],
      ],
      cuts: [[104, -8, 64, 32]],
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
