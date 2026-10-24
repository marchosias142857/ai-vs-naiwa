import { z } from 'zod';
import { simSaveFields, type SaveField, type SaveLimits } from '../saveFields';

function schema(field: SaveField): z.ZodType {
  let result: z.ZodType;
  switch (field.type) {
    case 'number': {
      const value = z.number().min(field.min).max(field.max);
      result = field.integer ? value.int() : value;
      break;
    }
    case 'enum':
      result = z.custom((v) => field.values.includes(v as string | boolean | null));
      break;
    case 'array':
      result = z.array(schema(field.item)).min(field.min).max(field.max);
      break;
    case 'object':
      result = z.strictObject(
        Object.fromEntries(Object.entries(field.fields).map(([key, value]) => [key, schema(value)])),
      );
      break;
  }
  return field.nullable ? result.nullable() : result;
}
/** 字段级 zod schema；种子地图、ID 与业务引用的交叉校验由 sim 的解析器负责。 */
export const createSimSnapshotSchema = (limits: SaveLimits): z.ZodType => schema(simSaveFields(limits));
