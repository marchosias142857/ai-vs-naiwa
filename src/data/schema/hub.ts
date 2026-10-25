import { z } from 'zod';
import { PositiveNumber } from './common';
const Point = z.strictObject({ x: PositiveNumber, y: PositiveNumber });
/** 大厅布局与交互距离，世界坐标。 */
export const HubSchema = z.strictObject({ spawn: Point, door: Point, altar: Point, reach: PositiveNumber });
export type HubDef = z.infer<typeof HubSchema>;
