import { MAP_ART_FRAMES } from './mapArtFrames';

/** World sizes are presentation only; collision footprints remain in room templates. */
export const MAP_ART = {
  textures: {
    rims: 'map_rims_v3',
    doors: 'map_horizontal_v3',
    objects: 'map_mechanisms_v3',
    ground: 'map_ground_v4',
    blocks: 'map_blocks_v3',
    walls: 'map_wall_model_v17',
    sideDoors: 'map_vertical_v3',
    hub: 'map_hub_v3',
    effects: 'map_effects_v3',
  },
  sources: {
    rims: 'map-rims-v3.webp',
    doors: 'map-horizontal-v3.webp',
    objects: 'map-mechanisms-v3.webp',
    ground: 'map-ground-v4.webp',
    blocks: 'map-blocks-v3.webp',
    walls: 'map-wall-model-v17.webp',
    sideDoors: 'map-vertical-v3.webp',
    hub: 'map-hub-v3.webp',
    effects: 'map-effects-v3.webp',
  },
  density: 8,
  // Unequal ashlar rectangles tile a 32-unit torus; no reflected copies or atlas perimeter.
  floorPavers: [
    [0, 0, 8, 8],
    [8, 0, 16, 6],
    [24, 0, 8, 8],
    [0, 8, 8, 8],
    [8, 6, 16, 10],
    [24, 8, 8, 8],
    [0, 16, 16, 6],
    [16, 16, 8, 10],
    [24, 16, 8, 10],
    [0, 22, 8, 10],
    [8, 22, 8, 10],
    [16, 26, 16, 6],
  ],
  // Interior-only material samples retain v3's grain; source grout cannot double the joints.
  floorFaceSamples: [
    [0.05, 0.07, 0.14, 0.14],
    [0.86, 0.1, 0.1, 0.14],
    [0.67, 0.65, 0.1, 0.12],
  ],
  floorPhase: [5, 3],
  floorGroutPixels: 2,
  floorGrout: { temple: '#586471', wreck: '#946b4b', abyss: '#646681', milk: '#a39266' },
  wallWidth: 8,
  wallPixels: 80,
  wallFacePixels: 96,
  wallHeight: (8 * 96) / 80,
  canvasPadding: 20,
  // Six complete 8-unit modules. Projection shifts the entire side opening with the wall caps.
  doorModules: 6,
  doorTextures: { horizontal: 'map_horizontal_modules_v3', vertical: 'map_vertical_modules_v3' },
  doorSize: { horizontal: [48, 17.6], vertical: [8, 48] },
  rimWidth: 3,
  rimSlice: 0.18,
  wallBacking: { temple: '#30445b', wreck: '#513722', abyss: '#192b47', milk: '#928673' },
  floorTile: 32,
  fieldTile: 16,
  naturalFieldTile: 32,
  frames: MAP_ART_FRAMES,
} as const;
export type MapFrame = keyof typeof MAP_ART_FRAMES;

export function mapFrameTexture(frame: string): string {
  if (frame.endsWith('_rim')) return MAP_ART.textures.rims;
  if (frame === 'altar' || frame.startsWith('pickup_')) return MAP_ART.textures.hub;
  if (frame.startsWith('hazard_')) return MAP_ART.textures.effects;
  if (/_(east|west)_(open|locked)$/.test(frame)) return MAP_ART.textures.sideDoors;
  if (/_wall_(top|face)$/.test(frame)) return MAP_ART.textures.walls;
  if (frame.endsWith('_ground')) return MAP_ART.textures.ground;
  if (frame.endsWith('_obstacle')) return MAP_ART.textures.blocks;
  return (frame.endsWith('_open') && frame !== 'chest_open') || frame.endsWith('_locked')
    ? MAP_ART.textures.doors
    : MAP_ART.textures.objects;
}

/** Shared visual reservation and sprite placement; never changes the physical doorway. */
export function mapDoorRect(port: {
  center: { x: number; y: number };
  direction: { x: number; y: number };
}): { x: number; y: number; width: number; height: number } {
  const w = MAP_ART.wallWidth,
    h = MAP_ART.wallHeight;
  if (port.direction.x)
    return {
      x: port.center.x + (port.direction.x < 0 ? -w : 0),
      y: port.center.y - MAP_ART.doorSize.vertical[1] / 2 - h,
      width: MAP_ART.doorSize.vertical[0],
      height: MAP_ART.doorSize.vertical[1],
    };
  return {
    x: port.center.x - MAP_ART.doorSize.horizontal[0] / 2,
    y: port.center.y + (port.direction.y < 0 ? -w : 0) - h,
    width: MAP_ART.doorSize.horizontal[0],
    height: MAP_ART.doorSize.horizontal[1],
  };
}
