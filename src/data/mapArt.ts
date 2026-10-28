import { MAP_ART_FRAMES } from './mapArtFrames';

/** World sizes are presentation only; collision footprints remain in room templates. */
export const MAP_ART = {
  textures: {
    terrain: 'map_terrain_v1',
    doors: 'map_doors_v1',
    objects: 'map_objects_v1',
    ground: 'map_ground_v2',
    blocks: 'map_blocks_v2',
    walls: 'map_wall_model_v17',
    sideDoors: 'map_side_doors_v2',
  },
  sources: {
    terrain: 'map-terrain-v1.webp',
    doors: 'map-doors-v1.webp',
    objects: 'map-objects-v1.webp',
    ground: 'map-ground-v2.webp',
    blocks: 'map-blocks-v2.webp',
    walls: 'map-wall-model-v17.webp',
    sideDoors: 'map-side-doors-v2.webp',
  },
  density: 8,
  wallWidth: 8,
  wallPixels: 80,
  wallFacePixels: 96,
  wallHeight: (8 * 96) / 80,
  canvasPadding: 20,
  // North/south models stay unchanged; new narrow side frames align their caps with the wall.
  doorSize: { horizontal: [40, 30], vertical: [13, 38] },
  sideDoorOffset: 6,
  // South gate cap begins at the same y as the adjacent wall cap (9.6 above the port).
  southDoorOffset: -3.6,
  wallBacking: { temple: '#30445b', wreck: '#513722', abyss: '#192b47', milk: '#928673' },
  wallTile: 32,
  // Use only the continuous top course. The rest of each square cap frame is a frontal wall face.
  wallTopDepth: { temple: 74, wreck: 66, abyss: 74, milk: 74 },
  floorTile: 64,
  fieldTile: 16,
  naturalFieldTile: 32,
  frames: MAP_ART_FRAMES,
} as const;
export type MapFrame = keyof typeof MAP_ART_FRAMES;

export function mapFrameTexture(frame: string): string {
  if (/_(east|west)_(open|locked)$/.test(frame)) return MAP_ART.textures.sideDoors;
  if (/_wall_(top|face)$/.test(frame)) return MAP_ART.textures.walls;
  if (frame.endsWith('_ground')) return MAP_ART.textures.ground;
  if (frame.endsWith('_obstacle')) return MAP_ART.textures.blocks;
  return (frame.endsWith('_open') && frame !== 'chest_open') || frame.endsWith('_locked')
    ? MAP_ART.textures.doors
    : /_(floor|cap|face|block)$/.test(frame)
      ? MAP_ART.textures.terrain
      : MAP_ART.textures.objects;
}
