import type { Scene } from 'phaser';
import { DEPTH, TILE_SIZE } from '../../config';
import { ART } from '../assets/demoArt';
import { ENVIRONMENT_ART } from '../../data/art';
import { GRAYBOX_BOUNDS as B } from './graybox';

/** 房间共用一个地面 TileSprite；边墙与灯在初始化预热，切房不增删对象。 */
export function createRoomArt(scene: Scene): boolean {
  if (!scene.textures.exists(ART.environment)) return false;
  const floor = ENVIRONMENT_ART.floor;
  scene.add
    .tileSprite(B.x, B.y, B.width, B.height, ART.environment, 'floor')
    .setOrigin(0)
    .setTileScale((TILE_SIZE * 2) / floor[2], (TILE_SIZE * 2) / floor[3])
    .setDepth(DEPTH.floor);
  // 嵌花保留原图细节，避免整间房间重复同一块地砖。
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 8; col++)
      if ((row * 3 + col * 5) % 7 === 0)
        scene.add
          .image(B.x + 16 + col * 32, B.y + 16 + row * 32, ART.environment, 'floor_alt')
          .setDisplaySize(32, 32)
          .setAlpha(0.65)
          .setDepth(DEPTH.floor + 0.1);
  scene.add
    .graphics()
    .setDepth(DEPTH.floor + 0.2)
    .lineStyle(3, 0x07111e, 0.65)
    .strokeRect(B.x + 2, B.y + 2, B.width - 4, B.height - 4)
    .lineStyle(0.35, 0xb6a77c, 0.55)
    .strokeRect(B.x + 5, B.y + 5, B.width - 10, B.height - 10);
  for (let x = B.x - TILE_SIZE; x <= B.x + B.width; x += TILE_SIZE) {
    for (const y of [B.y - TILE_SIZE, B.y + B.height])
      scene.add
        .image(x, y, ART.environment, 'wall')
        .setOrigin(0)
        .setDisplaySize(TILE_SIZE, TILE_SIZE)
        .setDepth(DEPTH.floor);
  }
  for (let y = B.y; y < B.y + B.height; y += TILE_SIZE)
    for (const x of [B.x - TILE_SIZE, B.x + B.width])
      scene.add
        .image(x, y, ART.environment, 'wall')
        .setOrigin(0)
        .setDisplaySize(TILE_SIZE, TILE_SIZE)
        .setDepth(DEPTH.floor);
  for (const x of [B.x + TILE_SIZE, B.x + B.width - TILE_SIZE]) {
    for (const radius of [12, 18, 25])
      scene.add.ellipse(x, B.y + 3, radius * 2, radius, 0xe9b657, 0.035).setDepth(DEPTH.floorDecals);
    scene.add
      .image(x, B.y - TILE_SIZE / 2, ART.environment, 'lantern')
      .setDisplaySize(10, 17)
      .setDepth(DEPTH.wallTops);
  }
  return true;
}
