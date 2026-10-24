import { z } from 'zod';
export const NavigationRulesSchema = z.strictObject({
  cellSize: z.number().positive(),
  radiusCaches: z.int().positive(),
  clearance: z.number().min(0),
  lookahead: z.number().min(1),
  tieEpsilon: z.number().positive(),
});
export type NavigationRules = z.infer<typeof NavigationRulesSchema>;
