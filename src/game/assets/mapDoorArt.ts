import type { Scene } from 'phaser';
import { MAP_ART, mapFrameTexture } from '../../data/mapArt';
import { coverModel } from './mapArtGeometry';

/** Whole models share one uniform scale; caps/passages are never stretched independently. */
export function installMapDoors(scene: Scene): void {
  const themes = ['temple', 'wreck', 'abyss', 'milk'] as const;
  for (const vertical of [false, true]) {
    const key = vertical ? MAP_ART.doorTextures.vertical : MAP_ART.doorTextures.horizontal;
    if (scene.textures.exists(key)) continue;
    const sources = vertical
      ? [MAP_ART.textures.sideDoors]
      : [MAP_ART.textures.doors, MAP_ART.textures.southDoors];
    if (sources.some((source) => !scene.textures.exists(source))) continue;
    // Ten source pixels/world unit represent 17.6 exactly (8 would round the height).
    const size = vertical ? MAP_ART.doorSize.vertical : MAP_ART.doorSize.horizontal;
    const width = size[0] * 10,
      height = size[1] * 10;
    const texture = scene.textures.createCanvas(key, width * 4, height * 4)!;
    const c = texture.context;
    c.imageSmoothingEnabled = false;
    for (const [row, theme] of themes.entries()) {
      const directions = vertical ? (['east', 'west'] as const) : (['north', 'south'] as const);
      for (let col = 0; col < 4; col++) {
        const name = `${theme}_${directions[Math.floor(col / 2)]!}_${col % 2 ? 'locked' : 'open'}` as const;
        const f = MAP_ART.frames[name];
        const source = scene.textures.get(mapFrameTexture(name)).getSourceImage() as HTMLImageElement;
        const x = col * width,
          y = row * height;
        const fit = coverModel(f[2], f[3], width, height);
        c.save();
        c.beginPath();
        c.rect(x, y, width, height);
        c.clip();
        c.fillStyle = MAP_ART.wallBacking[theme];
        c.fillRect(x, y, width, height);
        c.drawImage(source, f[0], f[1], f[2], f[3], x + fit.x, y + fit.y, fit.width, fit.height);
        c.restore();
        texture.add(name, 0, x, y, width, height);
      }
    }
    texture.setFilter(0);
    texture.refresh();
  }
}
