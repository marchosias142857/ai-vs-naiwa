import { MAP_ART_FRAMES } from './mapArtFrames';
import { MODULAR_V2 } from './roomTemplates/modularV2';

/** World sizes are presentation only; collision footprints remain in room templates. */
export const MAP_ART = {
  textures: {
    rims: 'map_rims_v4',
    doors: 'map_north_gates_v4b',
    southDoors: 'map_south_gates_v4b',
    spikes: 'map_spikes_themes_v4',
    crystals: 'map_crystals_themes_v4',
    objects: 'map_mechanisms_v4',
    templeGround: 'map_ground_temple_v7',
    wreckGround: 'map_ground_wreck_v7',
    abyssGround: 'map_ground_abyss_v7',
    milkGround: 'map_ground_milk_v7',
    blocks: 'map_blocks_v4',
    walls: 'map_wall_variants_v19',
    sideDoors: 'map_side_gates_v4d',
    hub: 'map_hub_v4',
    effects: 'map_effects_v4c',
  },
  sources: {
    rims: 'map-rims-v4.webp',
    doors: 'map-north-gates-v4b.webp',
    southDoors: 'map-south-gates-v4b.webp',
    spikes: 'map-spikes-themes-v4.webp',
    crystals: 'map-crystals-themes-v4.webp',
    objects: 'map-mechanisms-v4.webp',
    templeGround: 'map-ground-temple-v7.webp',
    wreckGround: 'map-ground-wreck-v7.webp',
    abyssGround: 'map-ground-abyss-v7.webp',
    milkGround: 'map-ground-milk-v7.webp',
    blocks: 'map-blocks-v4.webp',
    walls: 'map-wall-variants-v19-approved.webp',
    sideDoors: 'map-side-gates-v4d-approved.webp',
    hub: 'map-hub-v4.webp',
    effects: 'map-effects-v4c.webp',
  },
  density: 8,
  wallWidth: MODULAR_V2.wall.width,
  wallPixels: 80,
  wallFacePixels: 96,
  wallVariants: [0, 1, 2],
  wallHeight: MODULAR_V2.wall.faceHeight,
  canvasPadding: 20,
  // Six complete 8-unit modules. Projection shifts the entire side opening with the wall caps.
  doorModules: 6,
  doorTextures: { horizontal: 'map_horizontal_modules_v4', vertical: 'map_vertical_modules_v4' },
  doorSize: { horizontal: [48, 17.6], vertical: [8, 48] },
  rimWidth: 3,
  rimSlice: 0.18,
  wallBacking: { temple: '#30445b', wreck: '#513722', abyss: '#192b47', milk: '#928673' },
  floorTile: MODULAR_V2.wall.width,
  floorVariants: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  // Exclude the generated atlas grid; rebuild one exact material-colored pixel per edge.
  floorSourceInset: 8,
  floorBorderPixels: 1,
  floorBorder: { temple: '#4a5761', wreck: '#624c40', abyss: '#3c4154', milk: '#685947' },
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
  if (/_wall_[0-2]$/.test(frame)) return MAP_ART.textures.walls;
  if (frame.includes('_spikes_')) return MAP_ART.textures.spikes;
  if (frame.endsWith('_crystal')) return MAP_ART.textures.crystals;
  if (/_(south)_(open|locked)$/.test(frame)) return MAP_ART.textures.southDoors;
  for (const theme of ['temple', 'wreck', 'abyss', 'milk'] as const)
    if (frame.startsWith(`${theme}_ground_`)) return MAP_ART.textures[`${theme}Ground`];
  if (frame.endsWith('_obstacle')) return MAP_ART.textures.blocks;
  return (frame.endsWith('_open') && frame !== 'chest_open') || frame.endsWith('_locked')
    ? MAP_ART.textures.doors
    : MAP_ART.textures.objects;
}

/** Shared visual reservation and sprite placement; never changes the physical doorway. */
export function mapDoorRect(port: {
  center: { x: number; y: number };
  artCenter?: { x: number; y: number };
  direction: { x: number; y: number };
}): { x: number; y: number; width: number; height: number } {
  const w = MAP_ART.wallWidth,
    h = MAP_ART.wallHeight,
    center = port.artCenter ?? port.center;
  if (port.direction.x)
    return {
      x: center.x + (port.direction.x < 0 ? -w : 0),
      y: center.y - MAP_ART.doorSize.vertical[1] / 2 - h,
      width: MAP_ART.doorSize.vertical[0],
      height: MAP_ART.doorSize.vertical[1],
    };
  return {
    x: center.x - MAP_ART.doorSize.horizontal[0] / 2,
    y: center.y + (port.direction.y < 0 ? -w : 0) - h,
    width: MAP_ART.doorSize.horizontal[0],
    height: MAP_ART.doorSize.horizontal[1],
  };
}
