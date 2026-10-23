import { Scene } from 'phaser';
import { SCENES } from '../../config';

/**
 * 启动场景：只做最基础的设置，然后进入资源加载。
 * 多指触控数量在 main.ts 的 input.activePointers 里配置。
 */
export class BootScene extends Scene {
  constructor() {
    super(SCENES.boot);
  }

  create(): void {
    this.scene.start(SCENES.preload);
  }
}
