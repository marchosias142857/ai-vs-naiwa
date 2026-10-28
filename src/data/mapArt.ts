import { MAP_ART_FRAMES } from './mapArtFrames';

/** World sizes are presentation only; collision footprints remain in room templates. */
export const MAP_ART = {
  textures: { terrain: 'map_terrain_v1', doors: 'map_doors_v1', objects: 'map_objects_v1' },
  sources: { terrain: 'map-terrain-v1.webp', doors: 'map-doors-v1.webp', objects: 'map-objects-v1.webp' },
  density: 4,
  wallWidth: 8,
  floorTile: 64,
  blockTile: 16,
  fieldTile: 16,
  frames: MAP_ART_FRAMES,
} as const;
export type MapFrame = keyof typeof MAP_ART_FRAMES;

export function mapFrameTexture(frame: string): string {
  return (frame.endsWith('_open') && frame !== 'chest_open') || frame.endsWith('_locked')
    ? MAP_ART.textures.doors
    : /_(floor|cap|face|block)$/.test(frame)
      ? MAP_ART.textures.terrain
      : MAP_ART.textures.objects;
}
