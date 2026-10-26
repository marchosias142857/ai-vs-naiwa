import type { EnemyId } from './enemies';
import type { BestiaryEntry } from './schema/bestiary';

/**
 * 怪物图鉴（ADR 0036）。编号按首次出现的楼层排定：第 1 层 001–005、第 2 层新怪 006–011、第 3 层新怪 012–014，
 * 之后是小怪与首领。编号一经分配就不再改动；新增怪物取当前最大编号 + 1，删除的编号保留不复用。
 * `Record<EnemyId, …>` 保证每种怪物都有条目：新增怪物忘记登记会直接编译失败。
 */
export const BESTIARY = {
  naiwa_chaser: {
    no: 1,
    role: 'common',
    frame: { action: 'idle', index: 0 },
    attack: 'bestiary.naiwa_chaser.attack',
    desc: 'bestiary.naiwa_chaser.desc',
  },
  naiwa_scout: {
    no: 2,
    role: 'common',
    frame: { action: 'idle', index: 0 },
    attack: 'bestiary.naiwa_scout.attack',
    desc: 'bestiary.naiwa_scout.desc',
  },
  naiwa_spitter: {
    no: 3,
    role: 'common',
    frame: { action: 'idle', index: 0 },
    attack: 'bestiary.naiwa_spitter.attack',
    desc: 'bestiary.naiwa_spitter.desc',
  },
  naiwa_hopper: {
    no: 4,
    role: 'common',
    frame: { action: 'idle', index: 0 },
    attack: 'bestiary.naiwa_hopper.attack',
    desc: 'bestiary.naiwa_hopper.desc',
  },
  naiwa_gasser: {
    no: 5,
    role: 'common',
    frame: { action: 'idle', index: 0 },
    attack: 'bestiary.naiwa_gasser.attack',
    desc: 'bestiary.naiwa_gasser.desc',
  },
  naiwa_tank: {
    no: 6,
    role: 'common',
    frame: { action: 'idle', index: 0 },
    attack: 'bestiary.naiwa_tank.attack',
    desc: 'bestiary.naiwa_tank.desc',
  },
  naiwa_turret: {
    no: 7,
    role: 'common',
    frame: { action: 'idle', index: 0 },
    attack: 'bestiary.naiwa_turret.attack',
    desc: 'bestiary.naiwa_turret.desc',
  },
  naiwa_charger: {
    no: 8,
    role: 'common',
    frame: { action: 'idle', index: 0 },
    attack: 'bestiary.naiwa_charger.attack',
    desc: 'bestiary.naiwa_charger.desc',
  },
  naiwa_splitter: {
    no: 9,
    role: 'common',
    frame: { action: 'idle', index: 0 },
    attack: 'bestiary.naiwa_splitter.attack',
    desc: 'bestiary.naiwa_splitter.desc',
  },
  naiwa_tongue: {
    no: 10,
    role: 'common',
    frame: { action: 'idle', index: 0 },
    attack: 'bestiary.naiwa_tongue.attack',
    desc: 'bestiary.naiwa_tongue.desc',
  },
  naiwa_bomber: {
    no: 11,
    role: 'common',
    frame: { action: 'idle', index: 0 },
    attack: 'bestiary.naiwa_bomber.attack',
    desc: 'bestiary.naiwa_bomber.desc',
  },
  naiwa_brood: {
    no: 12,
    role: 'common',
    frame: { action: 'idle', index: 0 },
    attack: 'bestiary.naiwa_brood.attack',
    desc: 'bestiary.naiwa_brood.desc',
  },
  naiwa_burrower: {
    no: 13,
    role: 'common',
    frame: { action: 'idle', index: 0 },
    attack: 'bestiary.naiwa_burrower.attack',
    desc: 'bestiary.naiwa_burrower.desc',
  },
  naiwa_dancer: {
    no: 14,
    role: 'common',
    frame: { action: 'idle', index: 0 },
    attack: 'bestiary.naiwa_dancer.attack',
    desc: 'bestiary.naiwa_dancer.desc',
  },
  naiwa_tadpole: {
    no: 15,
    role: 'minion',
    frame: { action: 'idle', index: 0 },
    attack: 'bestiary.naiwa_tadpole.attack',
    desc: 'bestiary.naiwa_tadpole.desc',
  },
  naiwa_boss: {
    no: 16,
    role: 'boss',
    frame: { action: 'idle', index: 0 },
    attack: 'bestiary.naiwa_boss.attack',
    desc: 'bestiary.naiwa_boss.desc',
  },
} as const satisfies Record<EnemyId, BestiaryEntry>;
