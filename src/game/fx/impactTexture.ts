import type { Scene } from 'phaser';

export const IMPACT_TEXTURE = 'fx_impact';
/** 小圆只在首次进入战斗时栅格化一次；100 个火花复用纹理并走 Image 批处理。 */
export function impactTexture(scene: Scene): string {
  if (!scene.textures.exists(IMPACT_TEXTURE)) {
    const g = scene.make.graphics({}, false);
    g.fillStyle(0xffffff).fillCircle(16, 16, 15).generateTexture(IMPACT_TEXTURE, 32, 32);
    g.destroy();
  }
  return IMPACT_TEXTURE;
}
