import type { Scene } from 'phaser';
import type { BestiaryCard } from '../../sim/meta/bestiary';

interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
  sheetWidth: number;
  sheetHeight: number;
}
const crops = new Map<string, Crop>();
/** 只缓存裁剪坐标；共享已加载图集，不复制位图或创建 Phaser 纹理。 */
export function bestiaryPortrait(scene: Scene, card: BestiaryCard): HTMLElement {
  const f = card.frame;
  let crop = crops.get(card.id);
  if (!crop) {
    const source = scene.textures.get(f.texture).getSourceImage() as HTMLImageElement;
    const canvas = document.createElement('canvas');
    canvas.width = f.width;
    canvas.height = f.height;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(source, f.x, f.y, f.width, f.height, 0, 0, f.width, f.height);
    const pixels = context.getImageData(0, 0, f.width, f.height).data;
    let left = f.width,
      top = f.height,
      right = -1,
      bottom = -1;
    for (let y = 0; y < f.height; y++)
      for (let x = 0; x < f.width; x++) {
        if (!pixels[(y * f.width + x) * 4 + 3]) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    crop = {
      x: f.x + (right < 0 ? 0 : left),
      y: f.y + (right < 0 ? 0 : top),
      width: right < 0 ? f.width : right - left + 1,
      height: right < 0 ? f.height : bottom - top + 1,
      sheetWidth: source.width,
      sheetHeight: source.height,
    };
    crops.set(card.id, crop);
    canvas.width = canvas.height = 0;
  }
  const box = document.createElement('span'),
    art = document.createElement('span');
  box.className = 'bestiary-portrait';
  box.setAttribute('aria-hidden', 'true');
  art.className = 'bestiary-art';
  const { x, y, width, height, sheetWidth, sheetHeight } = crop;
  Object.assign(art.style, {
    width: `${(width / Math.max(width, height)) * 100}%`,
    height: `${(height / Math.max(width, height)) * 100}%`,
    backgroundImage: `url("${import.meta.env.BASE_URL}assets/demo/${f.source}")`,
    backgroundSize: `${(sheetWidth / width) * 100}% ${(sheetHeight / height) * 100}%`,
    backgroundPosition: `${sheetWidth === width ? 0 : (x / (sheetWidth - width)) * 100}% ${sheetHeight === height ? 0 : (y / (sheetHeight - height)) * 100}%`,
    transform: f.facing === 'left' ? 'scaleX(-1)' : '',
  });
  box.append(art);
  return box;
}
