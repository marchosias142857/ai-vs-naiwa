/** Frozen at main 0507bed (#127). Never regenerate from the live catalog.
 * Coordinate boxes/traps are relative to the room center; ports/anchors are world positions.
 * Any byte change requires an explicit compatibility review (ADR 0039).
 */
export const LEGACY_V1 = freeze({
  catalogId: 'legacy_v1',
  bounds: {
    x: 104,
    y: 47,
    width: 272,
    height: 176,
  },
  doorRules: {
    doorHalfWidth: 18,
    entranceInset: 24,
    exitReach: 18,
  },
  trapRadii: { mine: 7, barrel: 7 },
  ports: [
    {
      id: 'north',
      direction: {
        x: 0,
        y: -1,
      },
      center: {
        x: 240,
        y: 47,
      },
      entrance: {
        x: 240,
        y: 71,
      },
    },
    {
      id: 'east',
      direction: {
        x: 1,
        y: 0,
      },
      center: {
        x: 376,
        y: 135,
      },
      entrance: {
        x: 352,
        y: 135,
      },
    },
    {
      id: 'south',
      direction: {
        x: 0,
        y: 1,
      },
      center: {
        x: 240,
        y: 223,
      },
      entrance: {
        x: 240,
        y: 199,
      },
    },
    {
      id: 'west',
      direction: {
        x: -1,
        y: 0,
      },
      center: {
        x: 104,
        y: 135,
      },
      entrance: {
        x: 128,
        y: 135,
      },
    },
  ],
  anchors: {
    player: {
      x: 240,
      y: 135,
    },
    chest: {
      x: 240,
      y: 135,
    },
    reward: {
      x: 240,
      y: 135,
    },
    exit: {
      x: 240,
      y: 135,
    },
  },
  layouts: [
    [],
    [
      {
        x: -64,
        y: -36,
        width: 24,
        height: 24,
      },
      {
        x: 64,
        y: 36,
        width: 24,
        height: 24,
      },
    ],
    [
      {
        x: -64,
        y: 36,
        width: 24,
        height: 24,
      },
      {
        x: 64,
        y: -36,
        width: 24,
        height: 24,
      },
    ],
    [
      {
        x: -70,
        y: -40,
        width: 20,
        height: 20,
      },
      {
        x: 70,
        y: -40,
        width: 20,
        height: 20,
      },
      {
        x: -70,
        y: 40,
        width: 20,
        height: 20,
      },
      {
        x: 70,
        y: 40,
        width: 20,
        height: 20,
      },
    ],
    [
      {
        x: 0,
        y: 0,
        width: 28,
        height: 28,
      },
      {
        x: -60,
        y: -40,
        width: 16,
        height: 16,
      },
      {
        x: 60,
        y: 40,
        width: 16,
        height: 16,
      },
    ],
    [
      {
        x: -56,
        y: -34,
        width: 64,
        height: 12,
      },
      {
        x: 56,
        y: -34,
        width: 64,
        height: 12,
      },
      {
        x: -56,
        y: 34,
        width: 64,
        height: 12,
      },
      {
        x: 56,
        y: 34,
        width: 64,
        height: 12,
      },
    ],
    [
      {
        x: 52,
        y: 15,
        width: 14,
        height: 14,
      },
      {
        x: 21,
        y: 37,
        width: 14,
        height: 14,
      },
      {
        x: -21,
        y: 37,
        width: 14,
        height: 14,
      },
      {
        x: -52,
        y: 15,
        width: 14,
        height: 14,
      },
      {
        x: -52,
        y: -15,
        width: 14,
        height: 14,
      },
      {
        x: -21,
        y: -37,
        width: 14,
        height: 14,
      },
      {
        x: 21,
        y: -37,
        width: 14,
        height: 14,
      },
      {
        x: 52,
        y: -15,
        width: 14,
        height: 14,
      },
    ],
    [
      {
        x: -76,
        y: -52,
        width: 48,
        height: 12,
      },
      {
        x: -94,
        y: -34,
        width: 12,
        height: 24,
      },
      {
        x: 76,
        y: 52,
        width: 48,
        height: 12,
      },
      {
        x: 94,
        y: 34,
        width: 12,
        height: 24,
      },
    ],
    [
      {
        x: -70,
        y: -20,
        width: 14,
        height: 14,
      },
      {
        x: -40,
        y: 45,
        width: 14,
        height: 14,
      },
      {
        x: -20,
        y: -50,
        width: 14,
        height: 14,
      },
      {
        x: 30,
        y: 30,
        width: 14,
        height: 14,
      },
      {
        x: 55,
        y: -45,
        width: 14,
        height: 14,
      },
      {
        x: 85,
        y: 40,
        width: 14,
        height: 14,
      },
    ],
  ],
  bossLayout: [
    {
      x: -76,
      y: -42,
      width: 22,
      height: 22,
    },
    {
      x: 76,
      y: -42,
      width: 22,
      height: 22,
    },
    {
      x: -76,
      y: 42,
      width: 22,
      height: 22,
    },
    {
      x: 76,
      y: 42,
      width: 22,
      height: 22,
    },
  ],
  themes: [
    {
      art: 'temple',
      empty: { id: 'legacy_v1/temple/empty', form: 'empty', obstacle: 'wall', mask: 15 },
      boss: { id: 'legacy_v1/temple/boss', form: 'boss', obstacle: 'pillar', mask: 15 },
      plans: [
        {
          id: 'legacy_v1/temple/combat_0',
          form: 'combat',
          obstacle: 'wall',
          mask: 15,
          layout: 0,
          traps: [
            {
              kind: 'weed',
              x: -64,
              y: -44,
              width: 56,
              height: 28,
            },
            {
              kind: 'weed',
              x: 64,
              y: 44,
              width: 56,
              height: 28,
            },
            {
              kind: 'spikes',
              x: 0,
              y: -40,
              width: 48,
              height: 16,
            },
            {
              kind: 'spikes',
              x: 0,
              y: 40,
              width: 48,
              height: 16,
              delay: 1.2,
            },
          ],
        },
        {
          id: 'legacy_v1/temple/combat_1',
          form: 'combat',
          obstacle: 'wall',
          mask: 15,
          layout: 1,
          traps: [
            {
              kind: 'current',
              x: 0,
              y: -30,
              width: 90,
              height: 18,
              angle: 0,
            },
            {
              kind: 'weed',
              x: -20,
              y: 40,
              width: 48,
              height: 24,
            },
          ],
        },
        {
          id: 'legacy_v1/temple/combat_2',
          form: 'combat',
          obstacle: 'wall',
          mask: 15,
          layout: 3,
          traps: [
            {
              kind: 'spikes',
              x: -36,
              y: 0,
              width: 16,
              height: 56,
            },
            {
              kind: 'spikes',
              x: 36,
              y: 0,
              width: 16,
              height: 56,
              delay: 1.1,
            },
            {
              kind: 'weed',
              x: 0,
              y: -44,
              width: 48,
              height: 20,
            },
          ],
        },
        {
          id: 'legacy_v1/temple/combat_3',
          form: 'combat',
          obstacle: 'wall',
          mask: 15,
          layout: 4,
          traps: [
            {
              kind: 'current',
              x: -80,
              y: 0,
              width: 18,
              height: 100,
              angle: 90,
            },
            {
              kind: 'current',
              x: 80,
              y: 0,
              width: 18,
              height: 100,
              angle: 270,
            },
          ],
        },
        {
          id: 'legacy_v1/temple/combat_4',
          form: 'combat',
          obstacle: 'wall',
          mask: 15,
          layout: 6,
          traps: [
            {
              kind: 'weed',
              x: 0,
              y: 0,
              width: 40,
              height: 28,
            },
          ],
        },
      ],
    },
    {
      art: 'wreck',
      empty: { id: 'legacy_v1/wreck/empty', form: 'empty', obstacle: 'wall', mask: 15 },
      boss: { id: 'legacy_v1/wreck/boss', form: 'boss', obstacle: 'pillar', mask: 15 },
      plans: [
        {
          id: 'legacy_v1/wreck/combat_0',
          form: 'combat',
          obstacle: 'wall',
          mask: 15,
          layout: 0,
          traps: [
            {
              kind: 'barrel',
              x: -70,
              y: -45,
            },
            {
              kind: 'barrel',
              x: 70,
              y: 45,
            },
            {
              kind: 'barrel',
              x: -30,
              y: 52,
            },
            {
              kind: 'barrel',
              x: 30,
              y: -52,
            },
            {
              kind: 'spikes',
              x: 0,
              y: 0,
              width: 32,
              height: 16,
            },
          ],
        },
        {
          id: 'legacy_v1/wreck/combat_1',
          form: 'combat',
          obstacle: 'wall',
          mask: 15,
          layout: 5,
          traps: [
            {
              kind: 'current',
              x: 0,
              y: 0,
              width: 110,
              height: 20,
              angle: 180,
            },
            {
              kind: 'barrel',
              x: -40,
              y: -62,
            },
            {
              kind: 'barrel',
              x: 40,
              y: 62,
            },
            {
              kind: 'barrel',
              x: -100,
              y: 62,
            },
          ],
        },
        {
          id: 'legacy_v1/wreck/combat_2',
          form: 'combat',
          obstacle: 'wall',
          mask: 15,
          layout: 7,
          traps: [
            {
              kind: 'barrel',
              x: -16,
              y: -12,
            },
            {
              kind: 'barrel',
              x: 16,
              y: -12,
            },
            {
              kind: 'barrel',
              x: 0,
              y: 14,
            },
            {
              kind: 'spikes',
              x: -80,
              y: 40,
              width: 32,
              height: 16,
            },
            {
              kind: 'spikes',
              x: 80,
              y: -40,
              width: 32,
              height: 16,
              delay: 1,
            },
          ],
        },
        {
          id: 'legacy_v1/wreck/combat_3',
          form: 'combat',
          obstacle: 'wall',
          mask: 15,
          layout: 8,
          traps: [
            {
              kind: 'barrel',
              x: -90,
              y: -50,
            },
            {
              kind: 'barrel',
              x: 90,
              y: -62,
            },
            {
              kind: 'barrel',
              x: -6,
              y: 8,
            },
            {
              kind: 'spikes',
              x: 10,
              y: -28,
              width: 40,
              height: 16,
              delay: 0.6,
            },
          ],
        },
      ],
    },
    {
      art: 'abyss',
      empty: { id: 'legacy_v1/abyss/empty', form: 'empty', obstacle: 'wall', mask: 15 },
      boss: { id: 'legacy_v1/abyss/boss', form: 'boss', obstacle: 'pillar', mask: 15 },
      plans: [
        {
          id: 'legacy_v1/abyss/combat_0',
          form: 'combat',
          obstacle: 'wall',
          mask: 15,
          layout: 0,
          traps: [
            {
              kind: 'mine',
              x: -60,
              y: -40,
            },
            {
              kind: 'mine',
              x: 60,
              y: -40,
            },
            {
              kind: 'mine',
              x: -60,
              y: 40,
            },
            {
              kind: 'mine',
              x: 60,
              y: 40,
            },
            {
              kind: 'current',
              x: 0,
              y: 0,
              width: 24,
              height: 96,
              angle: 90,
            },
          ],
        },
        {
          id: 'legacy_v1/abyss/combat_1',
          form: 'combat',
          obstacle: 'wall',
          mask: 15,
          layout: 3,
          traps: [
            {
              kind: 'current',
              x: 0,
              y: -46,
              width: 90,
              height: 18,
              angle: 0,
            },
            {
              kind: 'current',
              x: 0,
              y: 46,
              width: 90,
              height: 18,
              angle: 180,
            },
            {
              kind: 'mine',
              x: 0,
              y: 0,
            },
            {
              kind: 'mine',
              x: -100,
              y: -62,
            },
            {
              kind: 'mine',
              x: 100,
              y: 62,
            },
          ],
        },
        {
          id: 'legacy_v1/abyss/combat_2',
          form: 'combat',
          obstacle: 'wall',
          mask: 15,
          layout: 6,
          traps: [
            {
              kind: 'mine',
              x: 0,
              y: 0,
            },
            {
              kind: 'spikes',
              x: -80,
              y: -62,
              width: 40,
              height: 14,
            },
            {
              kind: 'spikes',
              x: 80,
              y: 62,
              width: 40,
              height: 14,
              delay: 1,
            },
          ],
        },
        {
          id: 'legacy_v1/abyss/combat_3',
          form: 'combat',
          obstacle: 'wall',
          mask: 15,
          layout: 5,
          traps: [
            {
              kind: 'mine',
              x: -60,
              y: 0,
            },
            {
              kind: 'mine',
              x: 60,
              y: 0,
            },
            {
              kind: 'mine',
              x: -100,
              y: -62,
            },
            {
              kind: 'mine',
              x: 100,
              y: 62,
            },
            {
              kind: 'spikes',
              x: 60,
              y: -62,
              width: 40,
              height: 14,
              delay: 0.8,
            },
          ],
        },
      ],
    },
    {
      art: 'milk',
      empty: { id: 'legacy_v1/milk/empty', form: 'empty', obstacle: 'wall', mask: 15 },
      boss: { id: 'legacy_v1/milk/boss', form: 'boss', obstacle: 'pillar', mask: 15 },
      plans: [
        {
          id: 'legacy_v1/milk/combat_0',
          form: 'combat',
          obstacle: 'wall',
          mask: 15,
          layout: 0,
          traps: [],
        },
      ],
    },
  ],
} as const);

// Freeze nested arrays and records too; TypeScript readonly alone cannot protect runtime data.
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
