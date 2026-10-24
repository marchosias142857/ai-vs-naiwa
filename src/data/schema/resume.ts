import { z } from 'zod';
/** ADR 0019：恢复界面等待时间，不参与 sim 时钟。 */
export const ResumeRulesSchema = z.strictObject({ countdown: z.number().positive() });
export type ResumeRules = z.infer<typeof ResumeRulesSchema>;
