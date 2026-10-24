import { z } from 'zod';

/** demo 地牢拓扑；房间是树的节点，只有显式连接的位置开门。 */
export const DungeonDefSchema = z
  .strictObject({
    gridSize: z.int().min(3).max(9),
    mainRooms: z.int().min(3),
    branchRooms: z.int().min(1),
    floors: z.int().min(1),
  })
  .refine((d) => d.mainRooms + d.branchRooms <= d.gridSize ** 2, '房间数不能超过网格');
export type DungeonDef = z.infer<typeof DungeonDefSchema>;
