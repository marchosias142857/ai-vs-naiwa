/**
 * 共享契约：全部游戏事件及其参数类型。
 * 新增或修改事件属于「共享契约变更」，需要 ADR（见 AGENTS.md）。
 * 命名规则：`领域:动作`，动作用过去式或名词（room:cleared、entity:damaged）。
 */
export interface GameEvents {
  'run:started': { seed: number };
  'run:ended': { victory: boolean };
  'room:entered': { roomId: string };
  'room:cleared': { roomId: string };
}

export type GameEventName = keyof GameEvents;
