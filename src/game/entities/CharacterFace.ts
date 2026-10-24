import type { GameObjects, Scene } from 'phaser';
import type { ArtFrame, CharacterArt } from '../../data/schema/art';
import { CHARACTER_ART, DEFAULT_CHARACTER_ART } from '../../data/characterArt';

interface FaceSurround {
  name: string;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
}

/** 一份面部 + 原帧四周分片；不叠画旧脸，受伤半透明时也不会透出第二双眼睛。 */
export class CharacterFace {
  readonly image: GameObjects.Image;
  private readonly surround: GameObjects.Image[];
  private readonly frames = new Map<ArtFrame, FaceSurround[]>();
  constructor(scene: Scene) {
    const make = () =>
      scene.add.image(0, 0, DEFAULT_CHARACTER_ART.texture, DEFAULT_CHARACTER_ART.idle[0]).setVisible(false);
    this.image = make();
    this.surround = [make(), make(), make()];
    for (const art of Object.values(CHARACTER_ART)) {
      if (!art.face) continue;
      const texture = scene.textures.get(art.texture);
      for (const key of [...art.idle, ...art.run]) {
        const f = art.frames[key]!,
          x = f.pivot.x - art.face.pivot.x,
          y = f.pivot.y - art.face.pivot.y,
          w = art.face.rect[2],
          h = art.face.rect[3];
        const rects = [
          [0, y + h, f.rect[2], f.rect[3] - y - h],
          [0, y, x, h],
          [x + w, y, f.rect[2] - x - w, h],
        ] as const;
        this.frames.set(
          f,
          rects.map(([left, top, width, height], index) => {
            const name = `__face_surround_${key}_${index}`;
            if (!texture.has(name)) texture.add(name, 0, f.rect[0] + left, f.rect[1] + top, width, height);
            return { name, width, height, pivotX: f.pivot.x - left, pivotY: f.pivot.y - top };
          }),
        );
      }
    }
  }
  hide(): void {
    this.image.setVisible(false);
    for (const part of this.surround) part.setVisible(false);
  }
  apply(body: GameObjects.Image, frame: ArtFrame, art: CharacterArt): void {
    const face = art.face;
    if (!face) return;
    const y = frame.pivot.y - face.pivot.y,
      w = face.rect[2],
      h = face.rect[3],
      width = frame.rect[2];
    body.setCrop(0, 0, width, y);
    const slices = this.frames.get(frame)!;
    // 左右分片用真实子帧，避免 Phaser setCrop 在 flipX 时改变取样区域。
    for (let i = 0; i < this.surround.length; i++) {
      const part = this.surround[i]!,
        slice = slices[i]!;
      part
        .setTexture(body.texture.key, slice.name)
        .setPosition(body.x, body.y)
        .setOrigin(
          body.flipX ? 1 - slice.pivotX / slice.width : slice.pivotX / slice.width,
          slice.pivotY / slice.height,
        )
        .setScale(body.scaleX, body.scaleY)
        .setFlipX(body.flipX)
        .setAlpha(body.alpha)
        .setDepth(body.depth)
        .setVisible(true);
    }
    this.image
      .setTexture(art.texture, face.frame)
      .setPosition(body.x, body.y)
      .setOrigin(body.flipX ? 1 - face.pivot.x / w : face.pivot.x / w, face.pivot.y / h)
      .setScale(body.scaleX, body.scaleY)
      .setFlipX(body.flipX)
      .setAlpha(body.alpha)
      .setDepth(body.depth)
      .setVisible(true);
  }
  inspect() {
    const image = this.image;
    return {
      visible: image.visible,
      x: image.x - image.displayOriginX * image.scaleX,
      y: image.y - image.displayOriginY * image.scaleY,
      width: image.displayWidth,
      height: image.displayHeight,
    };
  }
  destroy(): void {
    this.image.destroy();
    for (const part of this.surround) part.destroy();
  }
}
