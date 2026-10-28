import { MAP_ART_FRAMES } from './mapArtFrames';

/** World sizes are presentation only; collision footprints remain in room templates. */
export const MAP_ART = {
  textures: {
    terrain: 'map_terrain_v1',
    doors: 'map_doors_v1',
    objects: 'map_objects_v1',
    ground: 'map_ground_v2',
    blocks: 'map_blocks_v2',
  },
  sources: {
    terrain: 'map-terrain-v1.webp',
    doors: 'map-doors-v1.webp',
    objects: 'map-objects-v1.webp',
    ground: 'map-ground-v2.webp',
    blocks: 'map-blocks-v2.webp',
  },
  density: 4,
  wallWidth: 8,
  wallHeight: 6,
  // Visible aperture only; leave the wall behind the door atlas's transparent jamb corners.
  doorOpeningHalfWidth: 12,
  blockTopDepth: { temple: 280, wreck: 282, abyss: 238, milk: 286 },
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
  if (frame.endsWith('_ground')) return MAP_ART.textures.ground;
  if (frame.endsWith('_obstacle')) return MAP_ART.textures.blocks;
  return (frame.endsWith('_open') && frame !== 'chest_open') || frame.endsWith('_locked')
    ? MAP_ART.textures.doors
    : /_(floor|cap|face|block)$/.test(frame)
      ? MAP_ART.textures.terrain
      : MAP_ART.textures.objects;
}
