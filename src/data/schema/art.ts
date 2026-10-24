import { z } from 'zod';
const point = z.strictObject({ x: z.number().finite(), y: z.number().finite() });
export const ArtFrameSchema = z.strictObject({
  rect: z.tuple([z.int().nonnegative(), z.int().nonnegative(), z.int().positive(), z.int().positive()]),
  pivot: point,
  grip: point,
  seconds: z.number().positive(),
});
export const CharacterArtSchema = z.strictObject({
  scale: z.number().positive(),
  standardGrip: point,
  behindUpDegrees: z.number().min(0).max(90),
  idle: z.array(z.string()).min(1),
  run: z.array(z.string()).min(1),
  hurt: z.array(z.string()).min(1),
  death: z.array(z.string()).min(1),
});
export const WeaponArtSchema = z.strictObject({
  rect: ArtFrameSchema.shape.rect,
  grip: point,
  /** 相对握把的源图像素偏移；乘 scale 才是 sim 的游戏像素。 */
  muzzle: point,
  scale: z.number().positive(),
});
export type ArtFrame = z.infer<typeof ArtFrameSchema>;
export type WeaponArt = z.infer<typeof WeaponArtSchema>;
