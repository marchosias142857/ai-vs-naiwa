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

/** 实体编号：本局内唯一的正整数，由 sim 在生成实体或子弹时分配（ADR 0003）。0 保留为「无」。 */
export type EntityId = number;

/** 产生输入的设备；UI 据此显示按键提示。 */
export type InputSource = 'keyboard' | 'touch' | 'gamepad';

/**
 * 每帧一份的输入快照，由 `game/input` 生成，玩家实体与 `sim/` 只读（docs/ARCHITECTURE.md「输入抽象」）。
 *
 * 约定（ADR 0002）：
 * - `move`：长度在 0–1 之间，已处理死区与斜向归一化（键盘斜向的长度也是 1，不会更快）。
 * - `aim`：手动单位方向；触屏任意非零偏移有效，正中心为 null，手柄保留硬件死区。弹体攻击时由 sim 优先选敌，激光/近战及无目标时使用手动/最后移动方向（ADR 0043）。
 * - `fire`：开火键是否按住，持续为真。
 * - `*Pressed`：本帧刚按下（边沿触发），每次按下只在一帧中为真。
 * - 生成方每帧复用同一个对象以避免分配；消费方不能跨帧保存这个引用，需要时自行拷贝字段。
 */
export interface InputFrame {
  move: Vec2;
  aim: Vec2 | null;
  fire: boolean;
  skillPressed: boolean;
  swapPressed: boolean;
  interactPressed: boolean;
  pausePressed: boolean;
  source: InputSource;
}

/** 新建一个「无输入」的 InputFrame。只在初始化时调用，帧循环中请复用并用 `resetInputFrame` 清空。 */
export function createInputFrame(source: InputSource = 'keyboard'): InputFrame {
  return {
    move: { x: 0, y: 0 },
    aim: null,
    fire: false,
    skillPressed: false,
    swapPressed: false,
    interactPressed: false,
    pausePressed: false,
    source,
  };
}

/** 把复用中的 InputFrame 清回「无输入」，不分配新对象（保留 `source`）。 */
export function resetInputFrame(frame: InputFrame): InputFrame {
  frame.move.x = 0;
  frame.move.y = 0;
  frame.aim = null;
  frame.fire = false;
  frame.skillPressed = false;
  frame.swapPressed = false;
  frame.interactPressed = false;
  frame.pausePressed = false;
  return frame;
}
