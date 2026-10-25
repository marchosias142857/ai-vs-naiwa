import type { Scene } from 'phaser';
import { RENDER_SCALE } from '../config';

/** 左上角为相机原点，让画布像素与逻辑世界解耦；UI 与鼠标逆变换共用它。 */
export function configureCamera(scene: Scene): void {
  scene.cameras.main
    .setViewport(0, 0, scene.scale.width, scene.scale.height)
    .setOrigin(0, 0)
    .setScroll(0, 0)
    .setZoom(RENDER_SCALE)
    .setRoundPixels(false);
}
