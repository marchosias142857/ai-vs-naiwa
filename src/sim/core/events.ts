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
 * - 同一次命中的事件按固定顺序发出：`entity:damaged` →（致命时）`entity:died` → `bullet:hit`。
 * - 实体的生命周期：`entity:spawned`（进入出场预警）→ `entity:activated`（开始碰撞与行动）→ `entity:died`。
 *   预警计时与激活都由 sim 负责；game 层只按事件显示、开启碰撞。
 */
export interface GameEvents {
  'run:started': { seed: number };
  'run:ended': { victory: boolean };
  'room:entered': { roomId: string };
  'room:cleared': { roomId: string };

  /**
   * 实体已登记，进入出场预警：此时没有碰撞、不能行动，表现层据此显示预警。
   * `kind` 是数据 ID（如 `naiwa_chaser`、`ai_proto`），半径、生命等由表现层按 kind 查只读数据。
   * `telegraph` 是预警时长（秒）；为 0 时，同一帧内紧接着发出 `entity:activated`。
   */
  'entity:spawned': { id: EntityId; team: Team; kind: string; x: number; y: number; telegraph: number };
  /** 预警结束，实体开始有碰撞并能行动。 */
  'entity:activated': { id: EntityId; team: Team; kind: string; x: number; y: number };
  /**
   * 实体受到伤害。无敌帧内的命中不会发出（但子弹仍会消失并发出 `bullet:hit`）。
   * `dirX/dirY` 是被推开的方向；`critical` 由 sim 判定，表现层不要自行推断。
   */
  'entity:damaged': {
    id: EntityId;
    team: Team;
    amount: number;
    critical: boolean;
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
  'weapon:swung': {
    ownerId: EntityId;
    weaponId: string;
    x: number;
    y: number;
    angle: number;
    duration: number;
    range: number;
    arcDegrees: number;
  };
  'melee:hit': { team: Team; x: number; y: number; angle: number; targetId: EntityId; critical: boolean };
  'weapon:fired': { ownerId: EntityId; weaponId: string; x: number; y: number; angle: number };
  /**
   * 子弹命中一个目标或撞墙，命中火花只由这个事件产生。`targetId` 为 `null` 表示打在墙上。
   * 穿透的子弹会对每个命中的目标各发一次（子弹继续飞行）；子弹是否结束以 `hitActor` 的返回值为准。
   * `critical` 与同一次命中的 `entity:damaged.critical` 相同；打墙或命中无敌目标时为 false。
   */
  'bullet:hit': {
    team: Team;
    x: number;
    y: number;
    angle: number;
    targetId: EntityId | null;
    critical: boolean;
  };
}

export type GameEventName = keyof GameEvents;
