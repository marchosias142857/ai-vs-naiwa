import { settings } from './settings';

const TONES = {
  shot: { hz: 420, end: 180, duration: 0.035, volume: 0.025, gap: 0.05 },
  hit: { hz: 180, end: 70, duration: 0.05, volume: 0.035, gap: 0.04 },
  hurt: { hz: 110, end: 45, duration: 0.18, volume: 0.055, gap: 0.1 },
  death: { hz: 280, end: 65, duration: 0.25, volume: 0.04, gap: 0.07 },
  reward: { hz: 440, end: 880, duration: 0.22, volume: 0.04, gap: 0.1 },
} as const;
type Tone = keyof typeof TONES;
const voices: { oscillator: OscillatorNode; gain: GainNode }[] = [];
const played: Record<Tone, number> = {
  shot: -Infinity,
  hit: -Infinity,
  hurt: -Infinity,
  death: -Infinity,
  reward: -Infinity,
};
let context: AudioContext | undefined,
  nextVoice = 0,
  paused = false;

/** 仅在用户手势调用；固定 8 个振荡器复用，开火不创建音频节点。 */
export function unlockSound(): void {
  if (!settings.sound) return;
  try {
    if (!context) {
      context = new AudioContext();
      document.addEventListener('pointerup', resumeOnGesture, { capture: true, passive: true });
      document.addEventListener('keydown', resumeOnGesture, { capture: true, passive: true });
      document.addEventListener('visibilitychange', visibilitySound);
      for (let i = 0; i < 8; i++) {
        const oscillator = context.createOscillator(),
          gain = context.createGain();
        oscillator.type = 'triangle';
        gain.gain.value = 0;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        voices.push({ oscillator, gain });
      }
    }
    resumeSound();
  } catch {
    /* 不支持或禁止音频时仍然可玩。 */
  }
}
export function playSound(kind: Tone): void {
  if (!context || context.state !== 'running' || !settings.sound || document.hidden || paused) return;
  const tone = TONES[kind],
    time = context.currentTime;
  if (time - played[kind] < tone.gap) return;
  played[kind] = time;
  const voice = voices[nextVoice++ % voices.length]!;
  voice.oscillator.frequency.cancelScheduledValues(time);
  voice.oscillator.frequency.setValueAtTime(tone.hz, time);
  voice.oscillator.frequency.exponentialRampToValueAtTime(tone.end, time + tone.duration);
  voice.gain.gain.cancelScheduledValues(time);
  voice.gain.gain.setValueAtTime(tone.volume, time);
  voice.gain.gain.linearRampToValueAtTime(0, time + tone.duration);
}

function resumeOnGesture(e: Event): void {
  if (e.isTrusted) resumeSound();
}
function resumeSound(): void {
  if (
    !paused &&
    !document.hidden &&
    settings.sound &&
    context &&
    (context.state === 'suspended' || context.state === 'interrupted')
  )
    void context.resume().catch(() => {});
}
function visibilitySound(): void {
  if (document.hidden) silenceSound();
  else resumeSound();
}
/** 暂停阻止手势提前唤醒音频；恢复后若浏览器拒绝，下一次真实手势再尝试。 */
export function pauseSound(): void {
  paused = true;
  silenceSound();
}
export function continueSound(): void {
  paused = false;
  resumeSound();
}
export function silenceSound(): void {
  if (!context) return;
  for (const voice of voices) {
    voice.gain.gain.cancelScheduledValues(context.currentTime);
    voice.gain.gain.setValueAtTime(0, context.currentTime);
  }
  if (context.state === 'running' || context.state === 'interrupted') void context.suspend().catch(() => {});
}
export function destroySound(): void {
  document.removeEventListener('pointerup', resumeOnGesture, true);
  document.removeEventListener('keydown', resumeOnGesture, true);
  document.removeEventListener('visibilitychange', visibilitySound);
  if (context) void context.close().catch(() => {});
  context = undefined;
  paused = false;
  voices.length = 0;
}
