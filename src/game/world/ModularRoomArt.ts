import type { Textures, GameObjects, Scene } from 'phaser';
import { DEPTH } from '../../config';
import { MAP_ART, mapDoorRect } from '../../data/mapArt';
import { LEGACY_V1 } from '../../data/roomTemplates/legacyV1';
import { MODULAR_V2 } from '../../data/roomTemplates/modularV2';
import type { RoomTheme, TrapPlacement } from '../../data/schema/traps';
import type { CompiledRoom } from '../../sim/dungeon/compileRoom';
import type { Point } from '../../sim/geometry/RoomGeometry';
import { Random } from '../../sim/core/Random';
import { coverModel, rimSpan, wallVariant } from '../assets/mapArtGeometry';
import type { RoomArt } from './RoomArt';

const B = MODULAR_V2.bounds,
  PAD = MAP_ART.canvasPadding;
const LEFT = B.x - PAD,
  TOP = B.y - PAD;
const WIDTH = B.width + PAD * 2,
  HEIGHT = B.height + PAD * 2;
const RECT = LEGACY_V1.bounds;
const DEFAULT_BOUNDARY = [
  { x: RECT.x, y: RECT.y },
  { x: RECT.x + RECT.width, y: RECT.y },
  { x: RECT.x + RECT.width, y: RECT.y + RECT.height },
  { x: RECT.x, y: RECT.y + RECT.height },
];

/** One reusable baked ground texture; no per-room source art or per-frame canvas work.
 * Wall footprints follow the compiled contour; cuboids are painted back-to-front at room entry.
 */
export class ModularRoomArt implements RoomArt {
  readonly drawsBlocks = true;
  private readonly texture: Textures.CanvasTexture;
  private readonly ground: GameObjects.Image;
  private readonly blocks: GameObjects.TileSprite[] = [];
  private readonly floorTiles = new Map<string, HTMLCanvasElement>();
  private readonly key: string;
  private readonly wallCanvas = document.createElement('canvas');
  private readonly modules = new Map<string, HTMLCanvasElement>();
  constructor(private readonly scene: Scene) {
    this.key = `modular-ground:${scene.sys.settings.key}`;
    this.texture = scene.textures.createCanvas(this.key, WIDTH * MAP_ART.density, HEIGHT * MAP_ART.density)!;
    this.wallCanvas.width = this.texture.width;
    this.wallCanvas.height = this.texture.height;
    this.texture.setFilter(0); // Phaser FilterMode.NEAREST; keep the adapter importable without a DOM.
    this.ground = scene.add
      .image(LEFT, TOP, this.key)
      .setOrigin(0)
      .setScale(1 / MAP_ART.density)
      .setDepth(DEPTH.floor);
    for (let i = 0; i < 16; i++)
      this.blocks.push(
        scene.add
          .tileSprite(0, 0, 1, 1, MAP_ART.textures.blocks, 'temple_obstacle')
          .setDepth(DEPTH.obstacles)
          .setVisible(false),
      );
    this.show('temple', [], undefined, [], [LEGACY_V1.ports[0]!]);
    scene.events.once('shutdown', this.destroy);
  }

  show(
    theme: RoomTheme['art'],
    boxes: readonly { x: number; y: number; width: number; height: number }[],
    room?: CompiledRoom,
    traps: readonly TrapPlacement[] = [],
    ports: CompiledRoom['ports'] = [],
    floorSeed = 0,
  ): void {
    const boundary = room?.artBoundary ?? DEFAULT_BOUNDARY;
    const c = this.texture.context,
      d = MAP_ART.density;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.texture.width, this.texture.height);
    c.setTransform(d, 0, 0, d, -LEFT * d, -TOP * d);
    c.imageSmoothingEnabled = false;
    c.save();
    this.path(c, boundary);
    c.clip();
    // Fixed grid/order and a private visual stream keep revisits/restores identical.
    // Neither room shape, obstacles nor trap state consume gameplay randomness.
    const rng = new Random(floorSeed).fork(`floor-tiles:${theme}`);
    for (let y = B.y; y < B.y + B.height; y += MAP_ART.floorTile)
      for (let x = B.x; x < B.x + B.width; x += MAP_ART.floorTile)
        c.drawImage(
          this.floorTile(theme, rng.pick(MAP_ART.floorVariants)),
          x,
          y,
          MAP_ART.floorTile,
          MAP_ART.floorTile,
        );
    for (const t of traps) {
      if (!t.width || !t.height) continue;
      const x = 240 + t.x - t.width / 2,
        y = 135 + t.y - t.height / 2;
      this.drawRim(c, theme, x, y, t.width, t.height);
    }
    // Keep the floor intact under irregular obstacle silhouettes. Their source art owns
    // the contact shading; a rectangular backing would show through transparent corners.
    c.restore();
    const wall = this.wallCanvas.getContext('2d')!;
    wall.setTransform(1, 0, 0, 1, 0, 0);
    wall.clearRect(0, 0, this.wallCanvas.width, this.wallCanvas.height);
    wall.setTransform(d, 0, 0, d, -LEFT * d, -TOP * d);
    wall.imageSmoothingEnabled = false;
    // One y/x ordering for every orientation: the next top covers the previous cuboid's face.
    for (const cell of wallCells(boundary))
      wall.drawImage(
        this.wallModule(theme, wallVariant(floorSeed, theme, cell.x, cell.y)),
        cell.x,
        cell.y - MAP_ART.wallHeight,
        MAP_ART.wallWidth,
        MAP_ART.wallWidth + MAP_ART.wallHeight,
      );
    for (const p of ports) {
      const r = mapDoorRect(p);
      wall.clearRect(r.x, r.y, r.width, r.height);
    }
    // Clear openings on the staging layer, preserving the floor beneath raised tops and doors.
    c.drawImage(this.wallCanvas, LEFT, TOP, WIDTH, HEIGHT);
    this.texture.refresh();
    const frame = MAP_ART.frames[`${theme}_obstacle`];
    this.blocks.forEach((image, i) => {
      const box = boxes[i];
      if (!box) {
        image.setVisible(false);
        return;
      }
      const unit = Math.min(box.width, box.height);
      // Repeat square models at one scale; clip the final tile instead of deforming it.
      image
        .setTexture(MAP_ART.textures.blocks, `${theme}_obstacle`)
        .setPosition(240 + box.x, 135 + box.y)
        .setSize(box.width, box.height)
        .setTileScale(unit / frame[2])
        .setVisible(true);
    });
  }

  private path(c: CanvasRenderingContext2D, points: readonly Point[], begin = true): void {
    if (begin) c.beginPath();
    c.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) c.lineTo(points[i]!.x, points[i]!.y);
    c.closePath();
  }

  private wallModule(theme: RoomTheme['art'], variant: 0 | 1 | 2): HTMLCanvasElement {
    const name = `${theme}_wall_${variant}` as const;
    const cached = this.modules.get(name);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = MAP_ART.wallPixels;
    canvas.height = MAP_ART.wallPixels + MAP_ART.wallFacePixels;
    const c = canvas.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    c.fillStyle = MAP_ART.wallBacking[theme];
    c.fillRect(0, 0, canvas.width, canvas.height);
    const source = this.scene.textures.get(MAP_ART.textures.walls).getSourceImage() as HTMLImageElement;
    const frame = MAP_ART.frames[name];
    const fit = coverModel(frame[2], frame[3], canvas.width, canvas.height);
    // One complete selected model: cap/body can never come from different variants.
    c.drawImage(source, frame[0], frame[1], frame[2], frame[3], fit.x, fit.y, fit.width, fit.height);
    this.modules.set(name, canvas);
    return canvas;
  }

  /** Nine-slice inset: the inner edge follows the exact field, the floor remains below every pixel. */
  private drawRim(
    c: CanvasRenderingContext2D,
    theme: RoomTheme['art'],
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const f = MAP_ART.frames[`${theme}_rim`];
    const source = this.scene.textures.get(MAP_ART.textures.rims).getSourceImage() as HTMLImageElement;
    const sx = Math.round(f[2] * MAP_ART.rimSlice),
      sy = Math.round(f[3] * MAP_ART.rimSlice),
      r = MAP_ART.rimWidth;
    const xs = [f[0], f[0] + sx, f[0] + f[2] - sx, f[0] + f[2]];
    const ys = [f[1], f[1] + sy, f[1] + f[3] - sy, f[1] + f[3]];
    const dx = [x - r, x, x + width, x + width + r],
      dy = [y - r, y, y + height, y + height + r];
    const scale = r / sx;
    // Square corners at one scale. Straight runs repeat at that same scale.
    for (const row of [0, 2])
      for (const col of [0, 2]) c.drawImage(source, xs[col]!, ys[row]!, sx, sy, dx[col]!, dy[row]!, r, r);
    for (const span of rimSpan(width, f[2] - sx * 2, scale))
      for (const row of [0, 2])
        c.drawImage(source, xs[1]!, ys[row]!, span.source, sy, x + span.offset, dy[row]!, span.target, r);
    for (const span of rimSpan(height, f[3] - sy * 2, scale))
      for (const col of [0, 2])
        c.drawImage(source, xs[col]!, ys[1]!, sx, span.source, dx[col]!, y + span.offset, r, span.target);
  }

  private floorTile(
    theme: RoomTheme['art'],
    variant: (typeof MAP_ART.floorVariants)[number],
  ): HTMLCanvasElement {
    const name = `${theme}_ground_${variant}` as const;
    const cached = this.floorTiles.get(name);
    if (cached) return cached;
    const frame = MAP_ART.frames[name];
    const canvas = document.createElement('canvas');
    const size = MAP_ART.floorTile * MAP_ART.density,
      edge = MAP_ART.floorBorderPixels,
      inset = MAP_ART.floorSourceInset;
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d')!;
    context.imageSmoothingEnabled = false;
    const source = this.scene.textures
      .get(MAP_ART.textures[`${theme}Ground`])
      .getSourceImage() as HTMLImageElement;
    context.fillStyle = MAP_ART.floorBorder[theme];
    context.fillRect(0, 0, size, size);
    context.drawImage(
      source,
      frame[0] + inset,
      frame[1] + inset,
      frame[2] - inset * 2,
      frame[3] - inset * 2,
      edge,
      edge,
      size - edge * 2,
      size - edge * 2,
    );
    this.floorTiles.set(name, canvas);
    return canvas;
  }

  private readonly destroy = (): void => {
    this.ground.destroy();
    for (const block of this.blocks) block.destroy();
    this.floorTiles.clear();
    this.modules.clear();
    this.wallCanvas.width = 0;
    this.wallCanvas.height = 0;
    this.scene.textures.remove(this.key);
  };
}

/** Raster footprints for the supported grid-aligned contours; physical boundaries are unchanged. */
export function wallCells(boundary: readonly Point[]): Point[] {
  const size = MAP_ART.wallWidth;
  if (
    boundary.some((a, i) => {
      const b = boundary[(i + 1) % boundary.length]!;
      return (a.x !== b.x && a.y !== b.y) || (a.x - B.x) % size !== 0 || (a.y - B.y) % size !== 0;
    })
  )
    throw new RangeError('wall contour must use the supported axis-aligned module grid');
  const cells: Point[] = [];
  const inside = (x: number, y: number) => {
    let result = false;
    for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
      const a = boundary[i]!,
        b = boundary[j]!;
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
  };
  for (let y = B.y - size; y <= B.y + B.height; y += size)
    for (let x = B.x - size; x <= B.x + B.width; x += size) {
      const cx = x + size / 2,
        cy = y + size / 2;
      if (inside(cx, cy)) continue;
      const near = boundary.some((a, i) => {
        const b = boundary[(i + 1) % boundary.length]!;
        const dx = Math.max(Math.min(a.x, b.x) - cx, 0, cx - Math.max(a.x, b.x));
        const dy = Math.max(Math.min(a.y, b.y) - cy, 0, cy - Math.max(a.y, b.y));
        return Math.max(dx, dy) < size;
      });
      if (near) cells.push({ x, y });
    }
  return cells;
}
