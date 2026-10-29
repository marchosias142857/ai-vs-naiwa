import { Game, Scene, AUTO, type Textures } from 'phaser';
import { MAP_ART, mapFrameTexture, mapDoorRect } from '../../src/data/mapArt';
import { installMapDoors } from '../../src/game/assets/mapDoorArt';
import { wallCells } from '../../src/sim/dungeon/wallGeometry';
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
  const boundary = [
    { x: B.x, y: B.y },
    { x, y: B.y },
    { x, y: B.y + h },
    { x: x + w, y: B.y + h },
    { x: x + w, y: B.y },
    { x: B.x + B.width, y: B.y },
    { x: B.x + B.width, y: B.y + B.height },
    { x: B.x, y: B.y + B.height },
  ];
  return {
    bounds: B,
    boundary,
    artBoundary: boundary,
    floorBoundary: boundary,
    wallCells: wallCells(boundary),
    cuts: [{ x: x + w / 2, y: B.y + h / 2, width: w, height: h }],
    obstacles: [],
    spawns: [],
    ports: [
      {
        id: 'north',
        direction: { x: 0, y: -1 },
        center: { x: 304, y: B.y },
        entrance: { x: 304, y: B.y + 24 },
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
    for (const kind of Object.keys(MAP_ART.sources) as (keyof typeof MAP_ART.sources)[])
      this.load.image(MAP_ART.textures[kind], `/assets/demo/${MAP_ART.sources[kind]}`);
  }
  create() {
    for (const [name, frame] of Object.entries(MAP_ART.frames))
      this.textures.get(mapFrameTexture(name)).add(name, 0, frame[0], frame[1], frame[2], frame[3]);
    installMapDoors(this);
    this.cameras.main.setZoom(3).centerOn(240, 135);
    const art = new ModularRoomArt(this);
    const before = { objects: this.children.length, textures: Object.keys(this.textures.list).sort() };
    const rooms = Array.from({ length: 200 }, (_, i) => layout(i));
    const unique = new Set(rooms.map((r) => JSON.stringify(r.boundary))).size;
    const allConnected = rooms.every(connected);
    window.unifiedMapProbe = (theme) => {
      const texture = this.textures.get('modular-ground:ArtMatrix') as Textures.CanvasTexture;
      const traps = [
        { kind: 'weed' as const, x: -64, y: -30, width: 56, height: 28 },
        { kind: 'current' as const, x: 48, y: 0, width: 18, height: 100, angle: 90 },
        { kind: 'spikes' as const, x: -24, y: 48, width: 48, height: 16 },
      ];
      art.show(theme, []);
      const before = texture.context.getImageData(0, 0, texture.width, texture.height).data;
      art.show(theme, [], undefined, traps);
      const after = texture.context.getImageData(0, 0, texture.width, texture.height).data;
      const index = (x: number, y: number) =>
        (Math.floor((y - B.y + MAP_ART.canvasPadding) * MAP_ART.density) * texture.width +
          Math.floor((x - B.x + MAP_ART.canvasPadding) * MAP_ART.density)) *
        4;
      const differs = (x: number, y: number) => {
        const at = index(x, y);
        return before.slice(at, at + 4).some((v, i) => v !== after[at + i]);
      };
      let samples = 0,
        rimGaps = 0,
        holes = 0,
        outsideChanges = 0,
        interiorChanges = 0;
      for (const t of traps) {
        const left = 240 + t.x - t.width / 2,
          top = 135 + t.y - t.height / 2;
        for (let u = -1.5; u <= t.width + 1.5; u += 0.5)
          for (const y of [top - 1.5, top + t.height + 1.5]) {
            if (!differs(left + u, y)) rimGaps++;
            samples++;
          }
        for (let v = -1.5; v <= t.height + 1.5; v += 0.5)
          for (const x of [left - 1.5, left + t.width + 1.5]) {
            if (!differs(x, top + v)) rimGaps++;
            samples++;
          }
        for (let y = top - 5; y <= top + t.height + 5; y += 0.5)
          for (let x = left - 5; x <= left + t.width + 5; x += 0.5) {
            if (after[index(x, y) + 3] !== 255) holes++;
            const inside =
              x > left + 0.5 && x < left + t.width - 0.5 && y > top + 0.5 && y < top + t.height - 0.5;
            const outside =
              x < left - 3.5 || x > left + t.width + 3.5 || y < top - 3.5 || y > top + t.height + 3.5;
            if (inside && differs(x, y)) interiorChanges++;
            if (outside && differs(x, y)) outsideChanges++;
          }
      }
      let doorPixels = 0,
        doorHoles = 0,
        frames = 0;
      for (const key of Object.values(MAP_ART.doorTextures)) {
        const atlas = this.textures.get(key) as Textures.CanvasTexture;
        for (const name of atlas.getFrameNames().filter((n) => n.startsWith(`${theme}_`))) {
          const f = atlas.get(name),
            rgba = atlas.context.getImageData(f.cutX, f.cutY, f.cutWidth, f.cutHeight).data;
          for (let i = 3; i < rgba.length; i += 4) {
            if (rgba[i] !== 255) doorHoles++;
            doorPixels++;
          }
          frames++;
        }
      }
      return { samples, rimGaps, holes, outsideChanges, interiorChanges, frames, doorPixels, doorHoles };
    };
    window.modularArt = (theme) => {
      for (const room of rooms) art.show(theme, [], room, [], room.ports);
      return {
        unique,
        allConnected,
        before,
        after: { objects: this.children.length, textures: Object.keys(this.textures.list).sort() },
      };
    };
    window.obstacleFloorProbe = (theme) => {
      // Exercise a single irregular model and both directions of repeated dividers.
      const boxes = [
        { x: -48, y: 0, width: 16, height: 16 },
        { x: 0, y: 0, width: 48, height: 16 },
        { x: 48, y: 0, width: 16, height: 48 },
      ];
      const texture = this.textures.get('modular-ground:ArtMatrix') as Textures.CanvasTexture;
      art.show(theme, []);
      const floor = texture.context.getImageData(0, 0, texture.width, texture.height).data;
      art.show(theme, boxes);
      const covered = texture.context.getImageData(0, 0, texture.width, texture.height).data;
      let changedFloorPixels = 0,
        holes = 0,
        samples = 0;
      for (const box of boxes)
        for (let y = -box.height / 2 - 2; y < box.height / 2 + 2; y += 0.5)
          for (let x = -box.width / 2 - 2; x < box.width / 2 + 2; x += 0.5) {
            const px = Math.floor((240 + box.x + x - B.x + MAP_ART.canvasPadding) * MAP_ART.density);
            const py = Math.floor((135 + box.y + y - B.y + MAP_ART.canvasPadding) * MAP_ART.density);
            const index = (py * texture.width + px) * 4;
            samples++;
            if (covered[index + 3] !== 255) holes++;
            if (floor.slice(index, index + 4).some((v, i) => v !== covered[index + i])) changedFloorPixels++;
          }
      const frame = MAP_ART.frames[`${theme}_obstacle`];
      const canvas = document.createElement('canvas');
      canvas.width = frame[2];
      canvas.height = frame[3];
      const c = canvas.getContext('2d')!;
      c.drawImage(
        this.textures.get(MAP_ART.textures.blocks).getSourceImage() as HTMLImageElement,
        frame[0],
        frame[1],
        frame[2],
        frame[3],
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const model = c.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparentModelPixels = 0;
      for (let i = 3; i < model.length; i += 4) if (model[i] === 0) transparentModelPixels++;
      return { changedFloorPixels, holes, samples, transparentModelPixels };
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
        const index =
          (Math.floor((y - T + (texture.height / d - B.height) / 2) * d) * texture.width +
            Math.floor((x - L + (texture.width / d - B.width) / 2) * d)) *
          4;
        return data.slice(index, index + 4).join(',');
      };
      art.show(theme, [], rectangle);
      let data = pixels(),
        topDifferences = 0,
        samples = 0;
      // Unrotated top faces remain identical on horizontal and vertical walls. Later rows
      // cover earlier bases; the exposed bases along the north/south rows stay identical too.
      let baseDifferences = 0,
        verticalDifferences = 0;
      for (let i = 0; i < w * d; i++)
        for (let j = d; j < (w - 1) * d; j++) {
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
      for (let i = 0; i < w * d; i++)
        for (let j = 0; j + 0.5 < h * d; j++) {
          const u = (i + 0.5) / d,
            v = (j + 0.5) / d;
          if (pixel(data, L + 64 + u, T - h + v) !== pixel(data, L + 40 + u, D + w - h + v))
            baseDifferences++;
        }
      const floor = ['temple', 'wreck', 'abyss', 'milk'].indexOf(theme) + 1;
      const template = resolveRoomTemplate(
        `designed_v3/${theme}/${floor === 4 ? 'boss' : 'court_0_0'}`,
        theme,
        floor === 4 ? 'boss' : 'combat',
      )!;
      let holes = 0,
        coverage = 0,
        doorWallPixels = 0,
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
              room.ports.some((p) => {
                const r = mapDoorRect(p);
                return x >= r.x - 1 && x <= r.x + r.width + 1 && y >= r.y - 1 && y <= r.y + r.height + 1;
              })
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
          const r = mapDoorRect(p);
          // #133 separates physical centers from projected wall/gate art centers.
          const center = p.artCenter ?? p.center;
          // Sample the full projected gate reservation, including both terminal cap rows.
          for (const tangent of [2, 8, 24, 40, 46])
            for (const normal of [1, 4, 7]) {
              const x = p.direction.x ? center.x + p.direction.x * normal : r.x + tangent;
              const y = p.direction.x ? r.y + tangent : center.y + p.direction.y * normal;
              if (!pixel(data, x + 0.125, y + 0.125).endsWith(',0')) doorWallPixels++;
            }
          if (
            pixel(data, center.x + p.direction.x * 4 + 0.125, center.y + p.direction.y * 4 + 0.125).endsWith(
              ',0',
            )
          )
            openPorts++;
        }
      }
      return {
        topDifferences,
        baseDifferences,
        verticalDifferences,
        samples,
        holes,
        coverage,
        doorWallPixels,
        openPorts,
      };
    };
  }
}
new Game({ type: AUTO, width: 1280, height: 820, backgroundColor: '#000000', scene: ArtScene });
declare global {
  interface Window {
    unifiedMapProbe: (theme: 'temple' | 'wreck' | 'abyss' | 'milk') => {
      samples: number;
      rimGaps: number;
      holes: number;
      outsideChanges: number;
      interiorChanges: number;
      frames: number;
      doorPixels: number;
      doorHoles: number;
    };
    obstacleFloorProbe: (theme: 'temple' | 'wreck' | 'abyss' | 'milk') => {
      changedFloorPixels: number;
      holes: number;
      samples: number;
      transparentModelPixels: number;
    };
    wallArtProbe: (theme: 'temple' | 'wreck' | 'abyss' | 'milk') => {
      topDifferences: number;
      baseDifferences: number;
      verticalDifferences: number;
      samples: number;
      holes: number;
      coverage: number;
      doorWallPixels: number;
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
