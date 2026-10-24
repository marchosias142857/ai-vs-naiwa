import { z } from 'zod';

export const RoomLayoutsSchema = z
  .array(
    z
      .array(
        z.strictObject({
          x: z.number(),
          y: z.number(),
          width: z.number().positive(),
          height: z.number().positive(),
        }),
      )
      .max(8)
      .readonly(),
  )
  .min(1)
  .readonly();
export type RoomLayouts = z.infer<typeof RoomLayoutsSchema>;
