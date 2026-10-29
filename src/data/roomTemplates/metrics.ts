/** Shared world-space limits for authored rooms, rendering, collision and navigation. */
export const ROOM_METRICS = {
  center: { x: 240, y: 135 },
  bounds: { x: 48, y: -9, width: 384, height: 288 },
  wall: { width: 8, faceHeight: 9.6 },
  spikeTile: 16,
  rim: 3,
  placementGap: 8,
  maxBoundaryBodies: 96,
  spawnGrid: 16,
  spawnMargin: 24,
  interactionRadius: 6,
  mineRadius: 7,
  barrelRadius: 7,
} as const;

export const ROOM_PORTS = [
  { id: 'north', direction: { x: 0, y: -1 } },
  { id: 'east', direction: { x: 1, y: 0 } },
  { id: 'south', direction: { x: 0, y: 1 } },
  { id: 'west', direction: { x: -1, y: 0 } },
] as const;
