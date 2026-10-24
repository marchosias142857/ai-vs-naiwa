import { z } from 'zod';

export const RoomRulesSchema = z.strictObject({
  waves: z.array(z.int().min(1).max(20)).min(1).readonly(),
  waveDelay: z.number().min(0),
  floorExtra: z.int().min(0),
  doorHalfWidth: z.number().positive(),
  entranceInset: z.number().positive(),
  exitReach: z.number().positive(),
});
export type RoomRules = z.infer<typeof RoomRulesSchema>;
