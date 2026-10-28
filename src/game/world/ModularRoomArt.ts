import type { Textures, GameObjects, Scene } from 'phaser';
import { DEPTH } from '../../config';
import { MAP_ART } from '../../data/mapArt';
import { LEGACY_V1 } from '../../data/roomTemplates/legacyV1';
import { MODULAR_V2 } from '../../data/roomTemplates/modularV2';
import { ROOM_RULES } from '../../data/rooms';
import type { RoomTheme, TrapPlacement } from '../../data/schema/traps';
import type { CompiledRoom } from '../../sim/dungeon/compileRoom';
import type { Point } from '../../sim/geometry/RoomGeometry';
import type { RoomArt } from './RoomArt';

const B = MODULAR_V2.bounds,
  PAD = 20;
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
 * Polygon clipping and miter joints use exactly the compiled physics edges, including concave corners.
 */
export class ModularRoomArt implements RoomArt {
  readonly drawsBlocks = true;
  private readonly texture: Textures.CanvasTexture;
  private readonly ground: GameObjects.Image;
  private readonly blocks: GameObjects.TileSprite[] = [];
  private readonly patterns = new Map<string, CanvasPattern>();
  private readonly key: string;
  constructor(private readonly scene: Scene) {
    this.key = `modular-ground:${scene.sys.settings.key}`;
    this.texture = scene.textures.createCanvas(this.key, WIDTH * MAP_ART.density, HEIGHT * MAP_ART.density)!;
    this.texture.setFilter(0); // Phaser FilterMode.NEAREST; keep the adapter importable without a DOM.
    this.ground = scene.add
      .image(LEFT, TOP, this.key)
      .setOrigin(0)
      .setScale(1 / MAP_ART.density)
      .setDepth(DEPTH.floor);
    for (let i = 0; i < 16; i++)
      this.blocks.push(
        scene.add
          .tileSprite(0, 0, 1, 1, MAP_ART.textures.terrain, 'temple_block')
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
    for (const t of traps) {
      if (!t.width || !t.height) continue;
      const x = 240 + t.x - t.width / 2,
        y = 135 + t.y - t.height / 2;
      // Flush inset rims indicate the precise traversable field footprint, never a raised obstacle.
      c.fillStyle = this.pattern(theme, 'face');
      c.fillRect(x - 1, y - 1, t.width + 2, t.height + 2);
      c.strokeStyle = '#101a23';
      c.lineWidth = 0.5;
      c.strokeRect(x, y, t.width, t.height);
    }
    // A narrow ground shadow distinguishes raised blockers from traversable floor/field rims.
    c.fillStyle = 'rgba(3,8,14,0.7)';
    for (const box of boxes)
      c.fillRect(
        240 + box.x - box.width / 2 - 0.5,
        135 + box.y - box.height / 2,
        box.width + 1,
        box.height + 1.5,
      );
    c.restore();
    c.save();
    c.beginPath();
    c.rect(LEFT, TOP, WIDTH, HEIGHT);
    this.path(c, boundary, false);
    c.clip('evenodd');
    this.path(c, boundary);
    c.lineJoin = 'miter';
    c.lineWidth = MAP_ART.wallWidth * 2 + 1;
    c.strokeStyle = '#080e17';
    c.stroke();
    c.lineWidth = MAP_ART.wallWidth * 2;
    c.strokeStyle = this.pattern(theme, 'cap');
    c.stroke();
    for (const p of ports) {
      const h = ROOM_RULES.doorHalfWidth;
      const w = p.direction.x ? MAP_ART.wallWidth * 2 + 2 : h * 2;
      const height = p.direction.y ? MAP_ART.wallWidth * 2 + 2 : h * 2;
      c.clearRect(p.center.x - w / 2, p.center.y - height / 2, w, height);
    }
    c.restore();
    this.texture.refresh();
    const frame = MAP_ART.frames[`${theme}_block`];
    this.blocks.forEach((image, i) => {
      const box = boxes[i];
      if (!box) {
        image.setVisible(false);
        return;
      }
      image
        .setTexture(MAP_ART.textures.terrain, `${theme}_block`)
        .setPosition(240 + box.x, 135 + box.y)
        .setSize(box.width, box.height)
        .setTileScale(MAP_ART.blockTile / frame[2], MAP_ART.blockTile / frame[3])
        .setVisible(true);
    });
  }

  private path(c: CanvasRenderingContext2D, points: readonly Point[], begin = true): void {
    if (begin) c.beginPath();
    c.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) c.lineTo(points[i]!.x, points[i]!.y);
    c.closePath();
  }

  private pattern(theme: RoomTheme['art'], part: 'floor' | 'cap' | 'face'): CanvasPattern {
    const name = `${theme}_${part}` as const;
    const cached = this.patterns.get(name);
    if (cached) return cached;
    const frame = MAP_ART.frames[name],
      size = part === 'floor' ? MAP_ART.floorTile : 24;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size * MAP_ART.density;
    const context = canvas.getContext('2d')!;
    context.imageSmoothingEnabled = false;
    const source = this.scene.textures.get(MAP_ART.textures.terrain).getSourceImage() as HTMLImageElement;
    context.drawImage(source, frame[0], frame[1], frame[2], frame[3], 0, 0, canvas.width, canvas.height);
    const pattern = this.texture.context.createPattern(canvas, 'repeat')!;
    pattern.setTransform(new DOMMatrix().scale(1 / MAP_ART.density));
    this.patterns.set(name, pattern);
    return pattern;
  }

  private readonly destroy = (): void => {
    this.ground.destroy();
    for (const block of this.blocks) block.destroy();
    this.patterns.clear();
    this.scene.textures.remove(this.key);
  };
}
