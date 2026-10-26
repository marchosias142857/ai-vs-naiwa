import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ATTACKS, type AttackId } from '../../../src/data/attacks';
import { BESTIARY } from '../../../src/data/bestiary';
import { DUNGEON } from '../../../src/data/dungeon';
import { ENEMIES, type EnemyId } from '../../../src/data/enemies';
import { ENCOUNTERS } from '../../../src/data/loot';
import type { EnemyDef } from '../../../src/data/schema';
import { BestiaryEntrySchema } from '../../../src/data/schema/bestiary';
import en from '../../../src/i18n/en.json';
import zh from '../../../src/i18n/zh-CN.json';
import { bestiaryCards, bestiaryLabel } from '../../../src/sim/meta/bestiary';

const IDS = Object.keys(ENEMIES) as EnemyId[];
const DEF: Readonly<Record<EnemyId, EnemyDef>> = ENEMIES;
const text = (lang: Record<string, string>, key: string) => lang[key];
/** PNG 文件头里的宽高（IHDR 固定在第 16–24 字节）。 */
function pngSize(file: string): [number, number] {
  const b = readFileSync(new URL(`../../../public/assets/demo/${file}`, import.meta.url));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe('图鉴数据', () => {
  it('每种怪物都有条目；编号为正整数且互不重复；字段符合 schema', () => {
    expect(Object.keys(BESTIARY).sort()).toEqual([...IDS].sort());
    const numbers = Object.values(BESTIARY).map((e) => e.no);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const [id, entry] of Object.entries(BESTIARY)) {
      const r = BestiaryEntrySchema.safeParse(entry);
      expect(r.success, `${id}: ${r.error?.message ?? ''}`).toBe(true);
      expect(entry.attack).toBe(`bestiary.${id}.attack`);
      expect(entry.desc).toBe(`bestiary.${id}.desc`);
    }
  });
  it('分类与数据一致：小怪只由其他怪产生且不在遭遇表；首领有阶段；其余都在遭遇表里', () => {
    const listed = new Set(ENCOUNTERS.floors.flat() as string[]);
    const spawned = new Set(IDS.flatMap((id) => [DEF[id].split?.kind, DEF[id].summon?.kind]).filter(Boolean));
    for (const id of IDS) {
      const role = BESTIARY[id].role;
      if (role === 'boss') expect(DEF[id].phases?.length, id).toBeGreaterThan(0);
      else if (role === 'minion') {
        expect(spawned.has(id), id).toBe(true);
        expect(listed.has(id), id).toBe(false);
      } else expect(listed.has(id), id).toBe(true);
    }
  });
  it('静态帧来自现有资源注册表，且落在图集图片范围内', () => {
    const sizes = new Map<string, [number, number]>();
    for (const card of bestiaryCards()) {
      const [w, h] = sizes.get(card.frame.source) ?? pngSize(card.frame.source);
      sizes.set(card.frame.source, [w, h]);
      expect(card.frame.width).toBeGreaterThan(0);
      expect(card.frame.x + card.frame.width, card.id).toBeLessThanOrEqual(w);
      expect(card.frame.y + card.frame.height, card.id).toBeLessThanOrEqual(h);
    }
  });
  it('中英文名称、攻击方式、简介齐全；说明不写阿拉伯数字（数值由界面从 data 读取）', () => {
    const ui = [
      'bestiary.title',
      'bestiary.count',
      'bestiary.role.common',
      'bestiary.role.minion',
      'bestiary.role.boss',
      'bestiary.fact.hp',
      'bestiary.fact.speed',
      'bestiary.fact.contact',
      'bestiary.fact.floors',
      'bestiary.floor',
      'bestiary.bossFloor',
      'bestiary.spawnedBy',
      'bestiary.still',
      'bestiary.freezeImmune',
      'bestiary.attackTitle',
      'bestiary.descTitle',
    ];
    for (const key of ui) for (const lang of [zh, en]) expect(text(lang, key), key).toBeDefined();
    for (const card of bestiaryCards())
      for (const lang of [zh, en])
        for (const key of [card.name, card.attack, card.desc]) {
          const value = text(lang, key);
          expect(value, key).toBeDefined();
          if (key !== card.name) expect(/\d/.test(value!), `${key} 含数字`).toBe(false);
        }
  });
});

describe('图鉴目录', () => {
  it('按编号排序，三位编号；出没楼层与产生者由数据推导', () => {
    const cards = bestiaryCards();
    expect(cards.map((c) => c.no)).toEqual([...cards.map((c) => c.no)].sort((a, b) => a - b));
    expect(cards[0]!.label).toBe('001');
    expect(bestiaryLabel(1234)).toBe('1234');
    const by = Object.fromEntries(cards.map((c) => [c.id, c]));
    expect(by.naiwa_chaser!.floors).toEqual([1, 2]);
    expect(by.naiwa_boss!.floors).toEqual([DUNGEON.floors + 1]);
    expect(by.naiwa_tadpole!.spawnedBy).toEqual(['naiwa_splitter', 'naiwa_brood', 'naiwa_boss']);
    expect(by.naiwa_tadpole!.floors).toEqual([2, 3, DUNGEON.floors + 1]);
    expect(by.naiwa_boss!.freezeImmune).toBe(true);
    expect(by.naiwa_boss!.frame.source).toBe('naiguai-v1.png');
    expect(by.naiwa_chaser!.frame.source).toBe('monsters-v1.png');
    expect(bestiaryCards()).toBe(cards);
  });
  it('不走动的怪移动速度记为 0：炮台、只会跳的、只会原地蓄力冲锋的', () => {
    const by = Object.fromEntries(bestiaryCards().map((c) => [c.id, c]));
    for (const id of ['naiwa_turret', 'naiwa_hopper', 'naiwa_charger']) expect(by[id]!.speed, id).toBe(0);
    expect(by.naiwa_chaser!.speed).toBe(DEF.naiwa_chaser.moveSpeed);
  });
});

/**
 * 文案与 AI 对照：每条断言对应说明里的一句话。改了怪物数据导致这里失败时，请同步修改
 * src/i18n 里的 bestiary.<id>.attack / desc，再更新断言。
 */
describe('说明与实际 AI 一致', () => {
  const radial = (id: string | undefined) => ATTACKS[id as AttackId]?.pattern === 'radial';
  it('普通怪', () => {
    // 大头蛙：追到近处才蓄力扑咬；腿蛙、铁桶蛙：只追着撞。
    expect(DEF.naiwa_chaser.behavior).toBe('charge_dash');
    expect(DEF.naiwa_chaser.dash?.trigger).toBeGreaterThan(0);
    expect(DEF.naiwa_scout.behavior).toBe('chase');
    expect(DEF.naiwa_tank.behavior).toBe('chase');
    // 腿蛙：普通怪里跑得最快。
    const common = IDS.filter((i) => BESTIARY[i].role === 'common');
    expect(DEF.naiwa_scout.moveSpeed).toBe(Math.max(...common.map((i) => DEF[i].moveSpeed)));
    // 喇叭蛙：保持距离单发；盆栽蛙：原地扇形。
    expect(DEF.naiwa_spitter.behavior).toBe('keep_distance');
    expect(ATTACKS[DEF.naiwa_spitter.attack as AttackId].pellets).toBe(1);
    expect(DEF.naiwa_turret.behavior).toBe('turret');
    expect(ATTACKS[DEF.naiwa_turret.attack as AttackId].pattern).toBe('spread');
    // 弹簧蛙：只跳，落地一圈；保龄球蛙：没有触发距离，原地蓄力冲撞。
    expect(DEF.naiwa_hopper.behavior).toBe('hop');
    expect(radial(DEF.naiwa_hopper.hop?.landAttack)).toBe(true);
    expect(DEF.naiwa_charger.behavior).toBe('charge_dash');
    expect(DEF.naiwa_charger.dash?.trigger).toBeUndefined();
    // 放屁蛙：持续伤害的毒气；叠罗汉蛙：死亡分裂成蝌蚪崽。
    expect(DEF.naiwa_gasser.gas?.damage).toBeGreaterThan(0);
    expect(DEF.naiwa_splitter.split?.kind).toBe('naiwa_tadpole');
    // 舌头蛙：命中拉人；炸弹蛙：撞人不疼，爆炸 + 一圈弹幕。
    expect(DEF.naiwa_tongue.lash?.pull).toBeGreaterThan(0);
    expect(DEF.naiwa_bomber.contactDamage).toBe(0);
    expect(DEF.naiwa_bomber.fuse?.damage).toBeGreaterThan(0);
    expect(radial(DEF.naiwa_bomber.fuse?.attack)).toBe(true);
    // 蛙卵团：远离并召唤，有上限；地洞蛙：出土一圈；街舞蛙：横移 + 旋转射击。
    expect(DEF.naiwa_brood.behavior).toBe('summoner');
    expect(DEF.naiwa_brood.summon?.max).toBeGreaterThan(0);
    expect(radial(DEF.naiwa_burrower.burrow?.attack)).toBe(true);
    expect(DEF.naiwa_dancer.behavior).toBe('strafe');
    expect(DEF.naiwa_dancer.spin?.step).toBeGreaterThan(0);
    // 蝌蚪崽：不掉落。
    expect(DEF.naiwa_tadpole.loot).toBe(0);
    expect(DEF.naiwa_tadpole.behavior).toBe('chase');
  });
  it('首领奶怪', () => {
    const boss = DEF.naiwa_boss;
    expect(boss.freezeImmune).toBe(true);
    expect(boss.bump?.bonus).toBeGreaterThan(1);
    expect(boss.hop?.puddle).toBeDefined();
    expect(boss.hop?.rocks).toBeGreaterThan(0);
    expect(radial(boss.hop?.landAttack)).toBe(true);
    expect(radial(boss.spin?.attack)).toBe(true);
    expect(new Set(boss.specials)).toEqual(new Set(['bump', 'hop', 'spin']));
    // 「约三分之二」「约三分之一」两个阶段。
    const [second, third] = boss.phases!;
    expect(Math.abs(second!.belowHp - 2 / 3)).toBeLessThan(0.02);
    expect(Math.abs(third!.belowHp - 1 / 3)).toBeLessThan(0.02);
    expect(radial(second!.attack)).toBe(true);
    expect(second!.specials).toContain('summon');
    expect(second!.speedScale).toBeGreaterThan(1);
    expect(third!.speedScale).toBeGreaterThan(second!.speedScale!);
    expect(third!.specials).toContain('rain');
    expect(third!.specials!.join(',')).toContain('bump,bump');
    expect(ATTACKS[third!.attack as AttackId].pellets).toBeGreaterThan(
      ATTACKS[second!.attack as AttackId].pellets,
    );
  });
});
