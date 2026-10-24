import { describe, expect, it } from 'vitest';
import { parseDebugParams } from '../../src/debug/params';

describe('parseDebugParams', () => {
  it('没有参数时全部为默认值', () => {
    expect(parseDebugParams('')).toEqual({
      seed: null,
      debug: false,
      stress: null,
      god: false,
      room: null,
      floor: null,
      weapon: null,
      scene: null,
    });
  });

  it('解析种子与开关', () => {
    const p = parseDebugParams('?seed=12345&debug=1&god=true');
    expect(p.seed).toBe(12345);
    expect(p.debug).toBe(true);
    expect(p.god).toBe(true);
  });

  it('非法种子被忽略', () => {
    expect(parseDebugParams('?seed=abc').seed).toBeNull();
    expect(parseDebugParams('?seed=-1').seed).toBeNull();
    expect(parseDebugParams('?seed=99999999999').seed).toBeNull();
  });

  it('ID 类参数只接受安全字符', () => {
    expect(parseDebugParams('?room=boss&floor=1-3&weapon=shotgun_rusty').room).toBe('boss');
    expect(parseDebugParams('?floor=1-3').floor).toBe('1-3');
    expect(parseDebugParams('?weapon=<script>').weapon).toBeNull();
  });
});

it('压测模式只接受明确参数', () => {
  expect(parseDebugParams('?stress=1').stress).toBe('capacity');
  expect(parseDebugParams('?stress=combat').stress).toBe('combat');
  expect(parseDebugParams('?stress=no').stress).toBeNull();
});
