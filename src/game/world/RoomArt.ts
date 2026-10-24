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
  for (const x of [B.x + TILE_SIZE, B.x + B.width - TILE_SIZE])
    scene.add
      .image(x, B.y - TILE_SIZE / 2, ART.environment, 'lantern')
      .setDisplaySize(10, 17)
      .setDepth(DEPTH.wallTops);
  return true;
}
