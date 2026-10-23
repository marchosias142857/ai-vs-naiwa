import type { EntityId, Team } from './types';

/**
 * 共享契约：全部游戏事件及其参数类型。
 * 新增或修改事件属于「共享契约变更」，需要 ADR（见 AGENTS.md）。
 * 命名规则：`领域:动作`，动作用过去式或名词（room:cleared、entity:damaged）。
 *
 * 约定（ADR 0002）：
 * - 坐标是世界坐标（像素），方向是单位向量，角度是弧度。
 * - 监听器不能在回调之外保存 payload 引用；发送方以后可能复用 payload 对象来避免分配。
 * - 事件只用于「通知发生了什么」（特效、音效、HUD、统计）；战斗结算不依赖监听器的执行顺序。
 */
export interface GameEvents {
  'run:started': { seed: number };
  'run:ended': { victory: boolean };
  'room:entered': { roomId: string };
  'room:cleared': { roomId: string };

  /** 实体出现在场上。`kind` 是数据 ID（如 `naiwa_chaser`、`ai_proto`）。 */
  'entity:spawned': { id: EntityId; team: Team; kind: string; x: number; y: number };
  /** 实体受到伤害（无敌帧内的命中不会发出）。`dirX/dirY` 是伤害来向的反方向，即被推开的方向。 */
  'entity:damaged': {
    id: EntityId;
    team: Team;
    amount: number;
    hp: number;
    maxHp: number;
    x: number;
    y: number;
    dirX: number;
    dirY: number;
    sourceId: EntityId | null;
  };
  /** 实体死亡，发生在最后一次 `entity:damaged` 之后。 */
  'entity:died': { id: EntityId; team: Team; kind: string; x: number; y: number; killerId: EntityId | null };
  /** 一次开火（多弹丸武器也只发一次）。`angle` 是枪口朝向。 */
  'weapon:fired': { ownerId: EntityId; weaponId: string; x: number; y: number; angle: number };
  /** 子弹命中并消失。`targetId` 为 `null` 表示打在墙上。 */
  'bullet:hit': { team: Team; x: number; y: number; angle: number; targetId: EntityId | null };
}

export type GameEventName = keyof GameEvents;
