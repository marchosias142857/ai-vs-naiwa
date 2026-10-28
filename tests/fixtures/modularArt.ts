import { Game, Scene, AUTO, type Textures } from 'phaser';
import { MAP_ART, mapFrameTexture } from '../../src/data/mapArt';
import { ModularRoomArt } from '../../src/game/world/ModularRoomArt';
import { MODULAR_V2 } from '../../src/data/roomTemplates/modularV2';
import { RoomGeometry, createGeometryHit, GeometryMask } from '../../src/sim/geometry/RoomGeometry';
import { compileRoom, type CompiledRoom } from '../../src/sim/dungeon/compileRoom';
import { resolveRoomTemplate } from '../../src/sim/dungeon/roomCatalog';

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
    for (const kind of ['terrain', 'doors', 'objects', 'ground', 'blocks'] as const)
      this.load.image(MAP_ART.textures[kind], `/assets/demo/${MAP_ART.sources[kind]}`);
  }
  create() {
    for (const [name, frame] of Object.entries(MAP_ART.frames))
      this.textures.get(mapFrameTexture(name)).add(name, 0, frame[0], frame[1], frame[2], frame[3]);
    this.cameras.main.setZoom(3).centerOn(240, 135);
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
    window.wallArtProbe = (theme) => {
      const d = MAP_ART.density,
        w = MAP_ART.wallWidth,
        h = MAP_ART.wallHeight;
      const L = B.x,
        T = B.y,
        R = B.x + B.width,
        D = B.y + B.height;
      const rectangle = {
        ...rooms[0]!,
        boundary: [
          { x: L, y: T },
          { x: R, y: T },
          { x: R, y: D },
          { x: L, y: D },
        ],
        ports: [],
      };
      const texture = this.textures.get('modular-ground:ArtMatrix') as Textures.CanvasTexture;
      const pixels = () => texture.context.getImageData(0, 0, texture.width, texture.height).data;
      const pixel = (data: Uint8ClampedArray, x: number, y: number) => {
        const index = (Math.floor((y - T + 20) * d) * texture.width + Math.floor((x - L + 20) * d)) * 4;
        return data.slice(index, index + 4).join(',');
      };
      art.show(theme, [], rectangle);
      let data = pixels(),
        topDifferences = 0,
        seams = 0,
        samples = 0;
      // Unrotated top faces remain identical on horizontal and vertical walls. Later rows
      // cover earlier bases; the exposed bases along the north/south rows stay identical too.
      let baseDifferences = 0,
        verticalDifferences = 0;
      for (let i = 0; i < 32; i++)
        for (let j = 4; j < 28; j++) {
          const u = (i + 0.5) / d,
            v = (j + 0.5) / d;
          const reference = pixel(data, L + 64 + u, T - w - h + v);
          for (const [x, y] of [
            [R + u, T + 64 - h + v],
            [L + 40 + u, D - h + v],
            [L - w + u, T + 64 - h + v],
          ]) {
            if (pixel(data, x!, y!) !== reference) topDifferences++;
            samples++;
          }
          if (pixel(data, L - w + u, T + 72 - h + v) !== reference) verticalDifferences++;
        }
      for (let i = 0; i < 32; i++)
        for (let j = 0; j < h * d; j++) {
          const u = (i + 0.5) / d,
            v = (j + 0.5) / d;
          if (pixel(data, L + 64 + u, T - h + v) !== pixel(data, L + 40 + u, D + w - h + v))
            baseDifferences++;
        }
      // A 64-world-unit source cell uses a mirrored repeat: there must be no pixel jump at a seam.
      for (let i = 0; i < 80; i++) {
        const p = 160 + (i + 0.5) / d;
        if (pixel(data, 128 - 0.125, p) !== pixel(data, 128 + 0.125, p)) seams++;
        if (pixel(data, p, 128 - 0.125) !== pixel(data, p, 128 + 0.125)) seams++;
      }
      const floor = ['temple', 'wreck', 'abyss', 'milk'].indexOf(theme) + 1;
      const template = resolveRoomTemplate(
        `modular_v2/${theme}/${floor === 4 ? 'boss' : 'combat_0'}`,
        floor,
        floor === 4 ? 'boss' : 'combat',
      )!;
      let holes = 0,
        coverage = 0,
        jambHoles = 0,
        openPorts = 0;
      for (const room of [compileRoom(template), rooms[199]!]) {
        art.show(theme, [], room, [], room.ports);
        data = pixels();
        const inside = (x: number, y: number) => {
          let result = false;
          for (let i = 0, j = room.boundary.length - 1; i < room.boundary.length; j = i++) {
            const a = room.boundary[i]!,
              b = room.boundary[j]!;
            if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) result = !result;
          }
          return result;
        };
        for (let y = T - 7.5; y < D + 8; y++)
          for (let x = L - 7.5; x < R + 8; x++) {
            if (
              inside(x, y) ||
              room.ports.some((p) =>
                p.direction.x ? Math.abs(y - p.center.y) < 19 : Math.abs(x - p.center.x) < 19,
              )
            )
              continue;
            const near = room.boundary.some((a, i) => {
              const b = room.boundary[(i + 1) % room.boundary.length]!;
              const dx = Math.max(Math.min(a.x, b.x) - x, 0, x - Math.max(a.x, b.x));
              const dy = Math.max(Math.min(a.y, b.y) - y, 0, y - Math.max(a.y, b.y));
              return Math.max(dx, dy) < 7.5;
            });
            if (near) {
              coverage++;
              if (!pixel(data, x, y).endsWith(',255')) holes++;
            }
          }
        for (const p of room.ports) {
          // The atlas has transparent corners: retain opaque wall behind both jamb ends.
          for (const tangent of [-16, 16])
            for (const normal of [1, 4, 7]) {
              const x = p.center.x + p.direction.x * normal + p.direction.y * tangent;
              const y = p.center.y + p.direction.y * normal + p.direction.x * tangent;
              if (!pixel(data, x + 0.125, y + 0.125).endsWith(',255')) jambHoles++;
            }
          if (
            pixel(
              data,
              p.center.x + p.direction.x * 4 + 0.125,
              p.center.y + p.direction.y * 4 + 0.125,
            ).endsWith(',0')
          )
            openPorts++;
        }
      }
      return {
        topDifferences,
        baseDifferences,
        verticalDifferences,
        seams,
        samples,
        holes,
        coverage,
        jambHoles,
        openPorts,
      };
    };
  }
}
new Game({ type: AUTO, width: 1280, height: 820, backgroundColor: '#000000', scene: ArtScene });
declare global {
  interface Window {
    wallArtProbe: (theme: 'temple' | 'wreck' | 'abyss' | 'milk') => {
      topDifferences: number;
      baseDifferences: number;
      verticalDifferences: number;
      seams: number;
      samples: number;
      holes: number;
      coverage: number;
      jambHoles: number;
      openPorts: number;
    };
    modularArt: (theme: 'temple' | 'wreck' | 'abyss' | 'milk') => {
      unique: number;
      allConnected: boolean;
      before: { objects: number; textures: string[] };
      after: { objects: number; textures: string[] };
    };
  }
}
