/**
 * 共享契约：基础类型。修改本文件属于「共享契约变更」，需要 ADR（见 AGENTS.md）。
 */
export interface Vec2 {
  x: number;
  y: number;
}

export type Team = 'player' | 'enemy';

/** 本局唯一标识随机来源的种子（32 位无符号整数）。 */
export type Seed = number;
