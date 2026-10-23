import type { Scene } from 'phaser';
import { COLORS, TILE_SIZE } from '../../config';
import { TEX } from './keys';

/**
 * 用代码画占位纹理，美术到位前开发不被阻塞（docs/ART_GUIDE.md）。
 * 正式美术接入后，只要图集里出现同名 key，这里对应的占位就不再生成。
 */
export function createPlaceholderTextures(scene: Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const make = (key: string, w: number, h: number, draw: () => void) => {
    if (scene.textures.exists(key)) return;
    g.clear();
    draw();
    g.generateTexture(key, w, h);
  };

  make(TEX.pixel, 1, 1, () => {
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 1, 1);
  });

  make(TEX.floor, TILE_SIZE, TILE_SIZE, () => {
    g.fillStyle(COLORS.floor, 1).fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    g.fillStyle(0x232a3f, 1).fillRect(0, 0, TILE_SIZE, 1).fillRect(0, 0, 1, TILE_SIZE);
  });

  make(TEX.floorAlt, TILE_SIZE, TILE_SIZE, () => {
    g.fillStyle(COLORS.floorAlt, 1).fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    g.fillStyle(0x262d44, 1).fillRect(0, 0, TILE_SIZE, 1).fillRect(0, 0, 1, TILE_SIZE);
  });

  make(TEX.wall, TILE_SIZE, TILE_SIZE, () => {
    g.fillStyle(COLORS.wall, 1).fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    g.fillStyle(COLORS.wallTop, 1).fillRect(0, 0, TILE_SIZE, 5);
  });

  // 玩家占位：青色圆角方块 + 「眼睛」，代表 AI 娘。
  make(TEX.player, 16, 20, () => {
    g.fillStyle(0x7ee8ff, 1).fillRoundedRect(1, 2, 14, 17, 4);
    g.fillStyle(0x0b0d14, 1).fillRect(5, 8, 2, 3).fillRect(10, 8, 2, 3);
  });

  // 敌人占位：绿色圆形，代表奶蛙风格的怪物。
  make(TEX.enemy, 16, 16, () => {
    g.fillStyle(0x9be86a, 1).fillCircle(8, 9, 7);
    g.fillStyle(0xffffff, 1).fillCircle(5, 5, 2.5).fillCircle(11, 5, 2.5);
    g.fillStyle(0x0b0d14, 1).fillCircle(5, 5, 1).fillCircle(11, 5, 1);
  });

  make(TEX.bulletPlayer, 6, 6, () => {
    g.fillStyle(0xfff3a0, 1).fillCircle(3, 3, 3);
  });

  make(TEX.bulletEnemy, 8, 8, () => {
    g.fillStyle(0xff4d8d, 1).fillCircle(4, 4, 4);
    g.fillStyle(0xffd0e0, 1).fillCircle(4, 4, 1.5);
  });

  g.destroy();
}
