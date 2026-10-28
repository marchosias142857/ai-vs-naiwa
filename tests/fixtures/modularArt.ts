import { Game, Scene, AUTO } from 'phaser';
import { MAP_ART, mapFrameTexture } from '../../src/data/mapArt';
import { ModularRoomArt } from '../../src/game/world/ModularRoomArt';
import { MODULAR_V2 } from '../../src/data/roomTemplates/modularV2';
import { RoomGeometry, createGeometryHit, GeometryMask } from '../../src/sim/geometry/RoomGeometry';
import type { CompiledRoom } from '../../src/sim/dungeon/compileRoom';

const B = MODULAR_V2.bounds;
function layout(i: number): CompiledRoom {
  const x = 128 + Math.floor(i / 25) * 8,
    w = 16 + (i % 5) * 8,
    h = 8 + (Math.floor(i / 5) % 5) * 8;
  return {
    bounds: B,
    boundary: [
      { x: B.x, y: B.y },
      { x, y: B.y },
      { x, y: B.y + h },
      { x: x + w, y: B.y + h },
      { x: x + w, y: B.y },
      { x: B.x + B.width, y: B.y },
      { x: B.x + B.width, y: B.y + B.height },
      { x: B.x, y: B.y + B.height },
    ],
    cuts: [{ x: x + w / 2, y: B.y + h / 2, width: w, height: h }],
    obstacles: [],
    spawns: [],
    ports: [
      {
        id: 'north',
        direction: { x: 0, y: -1 },
        center: { x: 300, y: B.y },
        entrance: { x: 300, y: B.y + 24 },
      },
    ],
    anchors: {
      player: { x: 240, y: 135 },
      chest: { x: 240, y: 135 },
      reward: { x: 240, y: 135 },
      exit: { x: 240, y: 135 },
    },
  };
}
function connected(room: CompiledRoom): boolean {
  const q = new RoomGeometry(room.boundary, [], 0),
    hit = createGeometryHit();
  const step = 8,
    cols = B.width / step,
    rows = B.height / step;
  const point = (id: number) => ({
    x: B.x + ((id % cols) + 0.5) * step,
    y: B.y + (Math.floor(id / cols) + 0.5) * step,
  });
  const free = new Set<number>();
  for (let id = 0; id < cols * rows; id++) if (q.canOccupy(point(id), 14.02, 'walk')) free.add(id);
  const reached = new Set([free.values().next().value!]),
    queue = [...reached];
  for (let i = 0; i < queue.length; i++) {
    const a = queue[i]!;
    for (const b of [a - 1, a + 1, a - cols, a + cols]) {
      if (!free.has(b) || reached.has(b) || Math.abs((a % cols) - (b % cols)) > 1) continue;
      q.sweepCircle(point(a), point(b), 14, GeometryMask.walk, hit);
      if (hit.hit && hit.t < 1) continue;
      reached.add(b);
      queue.push(b);
    }
  }
  return reached.size === free.size;
}
class ArtScene extends Scene {
  constructor() {
    super('ArtMatrix');
  }
  preload() {
    for (const kind of ['terrain', 'doors', 'objects'] as const)
      this.load.image(MAP_ART.textures[kind], `/assets/demo/${MAP_ART.sources[kind]}`);
  }
  create() {
    for (const [name, frame] of Object.entries(MAP_ART.frames))
      this.textures.get(mapFrameTexture(name)).add(name, 0, frame[0], frame[1], frame[2], frame[3]);
    this.cameras.main.setZoom(4).centerOn(240, 135);
    const art = new ModularRoomArt(this);
    const before = { objects: this.children.length, textures: Object.keys(this.textures.list).sort() };
    const rooms = Array.from({ length: 200 }, (_, i) => layout(i));
    const unique = new Set(rooms.map((r) => JSON.stringify(r.boundary))).size;
    const allConnected = rooms.every(connected);
    window.modularArt = (theme) => {
      for (const room of rooms) art.show(theme, [], room, [], room.ports);
      return {
        unique,
        allConnected,
        before,
        after: { objects: this.children.length, textures: Object.keys(this.textures.list).sort() },
      };
    };
  }
}
new Game({ type: AUTO, width: 1280, height: 820, backgroundColor: '#000000', scene: ArtScene });
declare global {
  interface Window {
    modularArt: (theme: 'temple' | 'wreck' | 'abyss' | 'milk') => {
      unique: number;
      allConnected: boolean;
      before: { objects: number; textures: string[] };
      after: { objects: number; textures: string[] };
    };
  }
}
