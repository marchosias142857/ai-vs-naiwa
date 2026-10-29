import type { GameObjects, Scene } from 'phaser';
import { DEPTH, TILE_SIZE } from '../../config';
import { ART } from '../assets/demoArt';
import { ENVIRONMENT_ART } from '../../data/art';
import { ROOM_ART, ROOM_ART_SCALE } from '../../data/roomArt';
import type { RoomTheme } from '../../data/schema/traps';
import { GRAYBOX_BOUNDS as B } from './graybox';
import { MAP_ART } from '../../data/mapArt';
import { ModularRoomArt } from './ModularRoomArt';
import type { CompiledRoom } from '../../sim/dungeon/compileRoom';
import type { TrapPlacement } from '../../data/schema/traps';

type ThemeArt = RoomTheme['art'];
type RoomFrame = keyof typeof ROOM_ART;
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 内墙最多的块数，与 RoomArena 的墙体槽位一致。 */
export const ROOM_BLOCKS = 16;
/** 每个主题的小摆设与摆放位置（相对房间中心）；避开四个门口和中央出生点。 */
const DECOR: Readonly<Record<Exclude<ThemeArt, 'temple'>, readonly RoomFrame[]>> = {
  wreck: ['wreck_rope', 'wreck_coins', 'wreck_plank'],
  abyss: ['abyss_kelp', 'abyss_skull', 'abyss_bubbles'],
  milk: ['milk_puddle', 'milk_flower', 'milk_coin'],
};
const DECOR_SPOTS: readonly (readonly [number, number])[] = [
  [-118, -72],
  [112, -70],
  [-104, 74],
  [118, 66],
  [-44, -76],
  [52, 78],
];

/**
 * 房间美术（ADR 0032 起按楼层换主题）。地面、边墙、嵌花、摆设和内墙贴图都在初始化时预热，
 * 换房只换贴图与位置，不增删对象。`temple` 是原有的海底石殿画面。
 */
export interface RoomArt {
  readonly drawsBlocks: boolean;
  show(
    theme: ThemeArt,
    boxes: readonly Box[],
    room?: CompiledRoom,
    traps?: readonly TrapPlacement[],
    ports?: CompiledRoom['ports'],
  ): void;
}
export class LegacyRoomArt implements RoomArt {
  private readonly floor: GameObjects.TileSprite;
  private readonly inlays: GameObjects.Image[] = [];
  private readonly walls: GameObjects.Image[] = [];
  private readonly decor: GameObjects.Image[] = [];
  private readonly blocks: GameObjects.TileSprite[] = [];
  private theme: ThemeArt = 'temple';

  constructor(private readonly scene: Scene) {
    this.floor = scene.add
      .tileSprite(B.x, B.y, B.width, B.height, ART.environment, 'floor')
      .setOrigin(0)
      .setDepth(DEPTH.floor);
    // 嵌花保留原图细节，避免整间房间重复同一块地砖。
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 8; col++)
        if ((row * 3 + col * 5) % 7 === 0)
          this.inlays.push(
            scene.add
              .image(B.x + 16 + col * 32, B.y + 16 + row * 32, ART.environment, 'floor_alt')
              .setDepth(DEPTH.floor + 0.1),
          );
    scene.add
      .graphics()
      .setDepth(DEPTH.floor + 0.2)
      .lineStyle(3, 0x07111e, 0.65)
      .strokeRect(B.x + 2, B.y + 2, B.width - 4, B.height - 4)
      .lineStyle(0.35, 0xb6a77c, 0.55)
      .strokeRect(B.x + 5, B.y + 5, B.width - 10, B.height - 10);
    for (let x = B.x - TILE_SIZE; x <= B.x + B.width; x += TILE_SIZE)
      for (const y of [B.y - TILE_SIZE, B.y + B.height]) this.walls.push(this.wallTile(x, y));
    for (let y = B.y; y < B.y + B.height; y += TILE_SIZE)
      for (const x of [B.x - TILE_SIZE, B.x + B.width]) this.walls.push(this.wallTile(x, y));
    for (const x of [B.x + TILE_SIZE, B.x + B.width - TILE_SIZE]) {
      for (const radius of [12, 18, 25])
        scene.add.ellipse(x, B.y + 3, radius * 2, radius, 0xe9b657, 0.035).setDepth(DEPTH.floorDecals);
      scene.add
        .image(x, B.y - TILE_SIZE / 2, ART.environment, 'lantern')
        .setDisplaySize(10, 17)
        .setDepth(DEPTH.wallTops);
    }
    for (const [x, y] of DECOR_SPOTS)
      this.decor.push(
        scene.add
          .image(B.x + B.width / 2 + x, B.y + B.height / 2 + y, ART.environment, 'floor')
          .setDepth(DEPTH.floorDecals)
          .setVisible(false),
      );
    for (let i = 0; i < ROOM_BLOCKS; i++)
      this.blocks.push(
        scene.add
          .tileSprite(0, 0, 1, 1, ART.environment, 'pillar')
          .setDepth(DEPTH.wallTops)
          .setVisible(false),
      );
    this.apply();
  }

  /** 原有画面（海底石殿）的内墙由 RoomArena 的墙体贴图自己画；新主题由这里平铺障碍块。 */
  get drawsBlocks(): boolean {
    return this.theme !== 'temple';
  }

  /** 换主题与本房间内墙；主题不变时只更新内墙。 */
  show(wanted: ThemeArt, boxes: readonly Box[]): void {
    // 新图集没加载成功时退回原有画面，不显示缺图方块。
    const theme = this.scene.textures.exists(ART.rooms) ? wanted : 'temple';
    if (theme !== this.theme) {
      this.theme = theme;
      this.apply();
    }
    const frame = `${theme}_block` as RoomFrame;
    for (let i = 0; i < this.blocks.length; i++) {
      const block = this.blocks[i]!,
        box = boxes[i];
      if (!box || theme === 'temple') {
        block.setVisible(false);
        continue;
      }
      // 每块按短边铺满一格：细长的墙变成一排箱子或一串礁石，而不是被拉长的一张图。
      const tile = Math.min(box.width, box.height) / ROOM_ART[frame][2];
      block
        .setTexture(ART.rooms, frame)
        .setPosition(B.x + B.width / 2 + box.x, B.y + B.height / 2 + box.y)
        .setSize(box.width, box.height)
        .setTileScale(tile, tile)
        .setVisible(true);
    }
  }

  private wallTile(x: number, y: number): GameObjects.Image {
    return this.scene.add
      .image(x, y, ART.environment, 'wall')
      .setOrigin(0)
      .setDisplaySize(TILE_SIZE, TILE_SIZE)
      .setDepth(DEPTH.floor);
  }

  private apply(): void {
    const t = this.theme;
    if (t === 'temple') {
      const f = ENVIRONMENT_ART.floor;
      this.floor
        .setTexture(ART.environment, 'floor')
        .setTileScale((TILE_SIZE * 2) / f[2], (TILE_SIZE * 2) / f[3]);
      for (const inlay of this.inlays)
        inlay.setTexture(ART.environment, 'floor_alt').setDisplaySize(32, 32).setAlpha(0.65);
      for (const wall of this.walls)
        wall.setTexture(ART.environment, 'wall').setDisplaySize(TILE_SIZE, TILE_SIZE);
      for (const d of this.decor) d.setVisible(false);
      return;
    }
    this.floor.setTexture(ART.rooms, `${t}_floor`).setTileScale(ROOM_ART_SCALE, ROOM_ART_SCALE);
    for (const inlay of this.inlays)
      inlay.setTexture(ART.rooms, `${t}_floor_alt`).setDisplaySize(32, 32).setAlpha(1);
    for (const wall of this.walls)
      wall.setTexture(ART.rooms, `${t}_wall`).setDisplaySize(TILE_SIZE, TILE_SIZE);
    const decor = DECOR[t];
    this.decor.forEach((d, i) => {
      const frame = decor[i % decor.length]!;
      d.setTexture(ART.rooms, frame).setScale(ROOM_ART_SCALE).setVisible(true);
    });
  }
}

/** 房间共用一套地面与边墙；没有正式图集时返回 null，调用方退回灰盒画法。 */
export function createRoomArt(scene: Scene, modularOnly = false): RoomArt | null {
  if (Object.values(MAP_ART.textures).every((key) => scene.textures.exists(key)))
    return new ModularRoomArt(scene);
  if (modularOnly) return null;
  if (!scene.textures.exists(ART.environment)) return null;
  return new LegacyRoomArt(scene);
}
