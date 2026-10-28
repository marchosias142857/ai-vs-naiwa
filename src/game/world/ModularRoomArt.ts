import type { Textures, GameObjects, Scene } from 'phaser';
import { DEPTH } from '../../config';
import { MAP_ART } from '../../data/mapArt';
import { LEGACY_V1 } from '../../data/roomTemplates/legacyV1';
import { MODULAR_V2 } from '../../data/roomTemplates/modularV2';
import type { RoomTheme, TrapPlacement } from '../../data/schema/traps';
import type { CompiledRoom } from '../../sim/dungeon/compileRoom';
import type { Point } from '../../sim/geometry/RoomGeometry';
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
  private readonly patterns = new Map<string, CanvasPattern>();
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
          .setDepth(DEPTH.wallTops)
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
  ): void {
    const boundary = room?.boundary ?? DEFAULT_BOUNDARY;
    const c = this.texture.context,
      d = MAP_ART.density;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.texture.width, this.texture.height);
    c.setTransform(d, 0, 0, d, -LEFT * d, -TOP * d);
    c.imageSmoothingEnabled = false;
    c.save();
    this.path(c, boundary);
    c.clip();
    c.fillStyle = this.pattern(theme, 'floor');
    c.fillRect(LEFT, TOP, WIDTH, HEIGHT);
    // Keep cream boss indicators distinct from the sanctuary's limestone floor.
    c.fillStyle = theme === 'milk' ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.12)';
    c.fillRect(LEFT, TOP, WIDTH, HEIGHT);
    this.path(c, boundary);
    c.lineJoin = 'miter';
    c.strokeStyle = 'rgba(3,8,14,0.26)';
    c.lineWidth = 8;
    c.stroke();
    c.strokeStyle = 'rgba(3,8,14,0.32)';
    c.lineWidth = 3;
    c.stroke();
    for (const t of traps) {
      if (!t.width || !t.height) continue;
      const x = 240 + t.x - t.width / 2,
        y = 135 + t.y - t.height / 2;
      // Flush inset rims indicate the precise traversable field footprint, never a raised obstacle.
      c.strokeStyle = this.pattern(theme, 'cap');
      c.lineWidth = 4;
      c.strokeRect(x - 1, y - 1, t.width + 2, t.height + 2);
      c.strokeStyle = '#101a23';
      c.lineWidth = 0.5;
      c.strokeRect(x, y, t.width, t.height);
    }
    // Keep the floor intact under irregular obstacle silhouettes. Their source art owns
    // the contact shading; a rectangular backing would show through transparent corners.
    c.restore();
    const wall = this.wallCanvas.getContext('2d')!;
    wall.setTransform(1, 0, 0, 1, 0, 0);
    wall.clearRect(0, 0, this.wallCanvas.width, this.wallCanvas.height);
    wall.setTransform(d, 0, 0, d, -LEFT * d, -TOP * d);
    wall.imageSmoothingEnabled = false;
    const module = this.wallModule(theme);
    // One y/x ordering for every orientation: the next top covers the previous cuboid's face.
    for (const cell of wallCells(boundary))
      wall.drawImage(
        module,
        cell.x,
        cell.y - MAP_ART.wallHeight,
        MAP_ART.wallWidth,
        MAP_ART.wallWidth + MAP_ART.wallHeight,
      );
    for (const p of ports) {
      const w = p.direction.x ? PAD * 2 : MAP_ART.doorSize.horizontal[0];
      const height = p.direction.y ? PAD * 2 : MAP_ART.doorSize.vertical[1];
      wall.clearRect(p.center.x - w / 2, p.center.y - height / 2, w, height);
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
      // Fit whole squat obstacles along each divider; never clip a partial crate at an end.
      const columns = Math.ceil(box.width / unit),
        rows = Math.ceil(box.height / unit);
      image
        .setTexture(MAP_ART.textures.blocks, `${theme}_obstacle`)
        .setPosition(240 + box.x, 135 + box.y)
        .setSize(box.width, box.height)
        .setTileScale(box.width / columns / frame[2], box.height / rows / frame[3])
        .setVisible(true);
    });
  }

  private path(c: CanvasRenderingContext2D, points: readonly Point[], begin = true): void {
    if (begin) c.beginPath();
    c.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) c.lineTo(points[i]!.x, points[i]!.y);
    c.closePath();
  }

  private wallModule(theme: RoomTheme['art']): HTMLCanvasElement {
    const cached = this.modules.get(theme);
    if (cached) return cached;
    const size = MAP_ART.wallPixels,
      faceHeight = MAP_ART.wallFacePixels;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size + faceHeight;
    const c = canvas.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    c.fillStyle = MAP_ART.wallBacking[theme];
    c.fillRect(0, 0, canvas.width, canvas.height);
    const source = this.scene.textures.get(MAP_ART.textures.walls).getSourceImage() as HTMLImageElement;
    // Normalize the cap and body regions of the connected wall model to an exact 80×80 cap and 80×96 body.
    // Square opaque bounds keep all ornament inside the cap; nearest sampling preserves pixels.
    for (const part of ['top', 'face'] as const) {
      const frame = MAP_ART.frames[`${theme}_wall_${part}`];
      c.drawImage(
        source,
        frame[0],
        frame[1],
        frame[2],
        frame[3],
        0,
        part === 'top' ? 0 : size,
        size,
        part === 'top' ? size : faceHeight,
      );
    }
    this.modules.set(theme, canvas);
    return canvas;
  }

  private pattern(theme: RoomTheme['art'], part: 'floor' | 'cap' | 'face'): CanvasPattern {
    const name = `${theme}_${part === 'floor' ? 'ground' : part}` as const;
    const cached = this.patterns.get(name);
    if (cached) return cached;
    const frame = MAP_ART.frames[name];
    const width = part === 'floor' ? MAP_ART.floorTile : part === 'cap' ? MAP_ART.wallTile : 24;
    const height = part === 'cap' ? MAP_ART.wallWidth : width;
    const canvas = document.createElement('canvas');
    const mirrored = part === 'floor';
    const cellWidth = width * MAP_ART.density,
      cellHeight = height * MAP_ART.density;
    canvas.width = cellWidth * (mirrored ? 2 : 1);
    canvas.height = cellHeight * (mirrored ? 2 : 1);
    const context = canvas.getContext('2d')!;
    context.imageSmoothingEnabled = false;
    const source = this.scene.textures
      .get(part === 'floor' ? MAP_ART.textures.ground : MAP_ART.textures.terrain)
      .getSourceImage() as HTMLImageElement;
    context.drawImage(
      source,
      frame[0],
      frame[1],
      frame[2],
      part === 'cap' ? MAP_ART.wallTopDepth[theme] : frame[3],
      0,
      0,
      cellWidth,
      cellHeight,
    );
    if (mirrored) {
      // Matched edge pixels remove the hard atlas-repeat seam without blurred blending.
      context.save();
      context.translate(cellWidth * 2, 0);
      context.scale(-1, 1);
      context.drawImage(canvas, 0, 0, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight);
      context.restore();
      context.save();
      context.translate(0, cellHeight * 2);
      context.scale(1, -1);
      context.drawImage(canvas, 0, 0, canvas.width, cellHeight, 0, 0, canvas.width, cellHeight);
      context.restore();
    }
    const pattern = this.texture.context.createPattern(canvas, 'repeat')!;
    pattern.setTransform(new DOMMatrix().scale(1 / MAP_ART.density));
    this.patterns.set(name, pattern);
    return pattern;
  }

  private readonly destroy = (): void => {
    this.ground.destroy();
    for (const block of this.blocks) block.destroy();
    this.patterns.clear();
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
