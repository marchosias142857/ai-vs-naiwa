import { z } from 'zod';
const point = z.strictObject({ x: z.number().finite(), y: z.number().finite() });
export const ArtFrameSchema = z.strictObject({
  rect: z.tuple([z.int().nonnegative(), z.int().nonnegative(), z.int().positive(), z.int().positive()]),
  pivot: point,
  grip: point,
  seconds: z.number().positive(),
});
export const CharacterArtSchema = z.strictObject({
  texture: z.string().min(1),
  source: z.string().min(1),
  reactionTexture: z.string().min(1),
  reactionSource: z.string().min(1),
  frames: z.record(z.string(), ArtFrameSchema),
  scale: z.number().positive(),
  reactionScale: z.number().positive(),
  standardGrip: point,
  behindUpDegrees: z.number().min(0).max(90),
  idle: z.array(z.string()).min(1).readonly(),
  run: z.array(z.string()).min(1).readonly(),
  hurt: z.array(z.string()).min(1).readonly(),
  death: z.array(z.string()).min(1).readonly(),
});
export const WeaponArtSchema = z.strictObject({
  rect: ArtFrameSchema.shape.rect,
  grip: point,
  /** 相对握把的源图像素偏移；乘 scale 才是 sim 的游戏像素。 */
  muzzle: point,
  scale: z.number().positive(),
});
export type ArtFrame = z.infer<typeof ArtFrameSchema>;
export type CharacterArt = z.infer<typeof CharacterArtSchema>;
export type CharacterAction = 'idle' | 'run' | 'hurt' | 'death';
export type WeaponArt = z.infer<typeof WeaponArtSchema>;
export const PresentationSchema = z.strictObject({
  shadowColor: z.int().nonnegative(),
  shadowAlpha: z.number().min(0).max(1),
  shadowWidth: z.number().positive(),
  shadowHeight: z.number().positive(),
  enemySize: z.number().positive(),
  bobPixels: z.number().nonnegative(),
  bobSpeed: z.number().positive(),
  invulnerableAlpha: z.number().min(0).max(1),
  deathSeconds: z.number().positive(),
  deathAngle: z.number().finite(),
  hurtSeconds: z.number().positive(),
  weaponDepth: z.number().positive(),
  arcWidth: z.number().positive(),
  arcColor: z.int().nonnegative(),
  arcAlpha: z.number().min(0).max(1),
});
export type Presentation = z.infer<typeof PresentationSchema>;
