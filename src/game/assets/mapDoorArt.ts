import type { Scene } from 'phaser';
import { MAP_ART } from '../../data/mapArt';

/** Normalize authored caps and passages once; source PNG/WebP pixels remain untouched. */
export function installMapDoors(scene: Scene): void {
  const themes = ['temple', 'wreck', 'abyss', 'milk'] as const;
  for (const vertical of [false, true]) {
    const sourceKey = vertical ? MAP_ART.textures.sideDoors : MAP_ART.textures.doors;
    const key = vertical ? MAP_ART.doorTextures.vertical : MAP_ART.doorTextures.horizontal;
    if (!scene.textures.exists(sourceKey) || scene.textures.exists(key)) continue;
    const size = vertical ? MAP_ART.doorSize.vertical : MAP_ART.doorSize.horizontal;
    const width = Math.round(size[0] * MAP_ART.density),
      height = Math.round(size[1] * MAP_ART.density);
    const texture = scene.textures.createCanvas(key, width * 4, height * 4)!;
    const c = texture.context;
    const source = scene.textures.get(sourceKey).getSourceImage() as HTMLImageElement;
    c.imageSmoothingEnabled = false;
    for (let row = 0; row < themes.length; row++) {
      const theme = themes[row]!;
      const directions = vertical ? (['east', 'west'] as const) : (['north', 'south'] as const);
      for (let col = 0; col < 4; col++) {
        const name = `${theme}_${directions[Math.floor(col / 2)]!}_${col % 2 ? 'locked' : 'open'}` as const;
        const f = MAP_ART.frames[name];
        const x = col * width,
          y = row * height;
        c.fillStyle = MAP_ART.wallBacking[theme];
        c.fillRect(x, y, width, height);
        const cap = MAP_ART.wallWidth * MAP_ART.density;
        if (vertical) {
          const sourceCap = Math.min(f[2], Math.floor(f[3] / 3));
          const sy = [f[1], f[1] + sourceCap, f[1] + f[3] - sourceCap, f[1] + f[3]];
          const dy = [y, y + cap, y + height - cap, y + height];
          for (let i = 0; i < 3; i++)
            c.drawImage(
              source,
              f[0],
              sy[i]!,
              f[2],
              sy[i + 1]! - sy[i]!,
              x,
              dy[i]!,
              width,
              dy[i + 1]! - dy[i]!,
            );
        } else {
          const sourceCap = Math.round(f[3] * 0.58);
          c.drawImage(source, f[0], f[1], f[2], sourceCap, x, y, width, cap);
          c.drawImage(
            source,
            f[0],
            f[1] + sourceCap,
            f[2],
            f[3] - sourceCap,
            x,
            y + cap,
            width,
            height - cap,
          );
        }
        texture.add(name, 0, x, y, width, height);
      }
    }
    texture.setFilter(0);
    texture.refresh();
  }
}
