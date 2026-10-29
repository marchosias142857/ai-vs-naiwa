import { writeFileSync, mkdirSync } from 'node:fs';
import { format } from 'prettier';
import { log } from 'node:console';
import { PLANS } from './room-catalog-plans.mjs';

// Offline authoring only. Four circulation plans per shell, independently furnished by style.
// All combat envelopes are 368 × 272: changing room width cannot inflate the count.
const styles = { temple: 'spikes', wreck: 'current', abyss: 'weed', milk: 'spikes' };
const families = [
  'court',
  'cloister',
  'corner_hall',
  'side_galleries',
  'north_terrace',
  'offset_wings',
  'south_hall',
  'long_octagon',
];
const D = (size) => ['diagonal', size, size];
const S = (width, height) => ['step', width, height];
const N = (depth, half = 48) => [[-half, half, depth]];
// NW, NE, SE, SW corners; then north and south recesses. Each entry is an authored silhouette.
const profiles = [
  [[0, 0, 0, 0]],
  [[0, 0, 0, 0], N(24)],
  [[0, 0, 0, 0], N(24), N(32, 64)],
  [
    [0, 0, 0, 0],
    [
      [-128, -80, 24],
      [80, 128, 24],
    ],
  ],
  [[D(32), D(32), D(32), D(32)]],
  [[D(32), D(64), D(32), D(64)]],
  [[D(48), 0, D(48), 0]],
  [[D(48), D(48), D(48), D(48)], N(24)],
  [[D(64), 0, 0, 0]],
  [[S(64, 48), 0, 0, 0]],
  [[S(64, 80), 0, 0, 0]],
  [[D(64), 0, S(48, 64), 0]],
  [[S(32, 80), S(32, 80), S(32, 80), S(32, 80)]],
  [[S(32, 80), S(32, 80), S(64, 48), S(64, 48)]],
  [[S(48, 64), S(48, 64), S(48, 64), S(48, 64)], N(24)],
  [[S(64, 80), S(32, 48), S(64, 80), S(32, 48)]],
  [[D(32), D(32), 0, 0], N(40, 64)],
  [[S(48, 48), S(48, 48), 0, 0], N(32)],
  [
    [0, 0, 0, 0],
    [
      [-136, -64, 40],
      [64, 136, 40],
    ],
  ],
  [[D(32), 0, D(64), 0], N(32)],
  [[S(48, 32), 0, S(32, 64), 0]],
  [[S(64, 64), 0, 0, S(32, 32)]],
  [[D(48), S(32, 64), 0, S(64, 32)]],
  [[S(48, 64), D(32), S(32, 48), D(64)]],
  [[0, 0, S(64, 64), S(64, 64)], [], N(24)],
  [[D(48), 0, 0, 0], [], N(48, 64)],
  [
    [0, 0, 0, 0],
    N(24),
    [
      [-128, -64, 32],
      [64, 128, 32],
    ],
  ],
  [[S(32, 48), 0, D(64), D(32)], [], N(32)],
  [[D(32), D(48), D(64), D(48)]],
  [[D(64), D(32), D(48), D(32)], N(24)],
  [[D(48), D(64), D(32), D(64)], [], N(32)],
  [[D(64), D(48), D(64), D(32)], N(24), N(24)],
];
function outline([corners, north = [], south = []]) {
  const [nw, ne, se, sw] = corners.map((c) => c || ['step', 0, 0]);
  const w = 184,
    h = 136,
    p = [];
  const add = (x, y) => p.push([x, y]);
  add(-w + nw[1], -h);
  for (const [a, b, d] of north) {
    add(a, -h);
    add(a, -h + d);
    add(b, -h + d);
    add(b, -h);
  }
  add(w - ne[1], -h);
  if (ne[0] === 'step') add(w - ne[1], -h + ne[2]);
  add(w, -h + ne[2]);
  add(w, h - se[2]);
  if (se[0] === 'step') add(w - se[1], h - se[2]);
  add(w - se[1], h);
  for (const [a, b, d] of [...south].reverse()) {
    add(b, h);
    add(b, h - d);
    add(a, h - d);
    add(a, h);
  }
  add(-w + sw[1], h);
  if (sw[0] === 'step') add(-w + sw[1], h - sw[2]);
  add(-w, h - sw[2]);
  add(-w, -h + nw[2]);
  if (nw[0] === 'step') add(-w + nw[1], -h + nw[2]);
  return p.filter((a, i) => a[0] !== p[(i + 1) % p.length][0] || a[1] !== p[(i + 1) % p.length][1]);
}
const shells = Object.fromEntries(
  profiles.map((profile, i) => [`${families[Math.floor(i / 4)]}_${i % 4}`, outline(profile)]),
);
function inside([x, y], polygon) {
  let yes = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) yes = !yes;
  }
  return yes;
}
function footprint(p) {
  const rim = p.kind ? 3 : 0;
  return {
    x: p.x,
    y: p.y,
    w: (p.width ?? 24) + 2 * rim,
    h: (p.height ?? 28) + 2 * rim,
    blocking: !p.kind || p.kind === 'barrel',
  };
}
function canPlace(p, placed, polygon) {
  const a = footprint(p),
    margin = p.kind && p.kind !== 'barrel' ? 12 : 22;
  const ys = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    if ((a[0] <= 0 && b[0] > 0) || (b[0] <= 0 && a[0] > 0))
      ys.push(a[1] + ((b[1] - a[1]) * -a[0]) / (b[0] - a[0]));
  }
  const entrances = [
    [-160, 0],
    [160, 0],
    [0, Math.min(...ys) + 24],
    [0, Math.max(...ys) - 9.6 - 24],
  ];
  if (
    entrances.some(
      ([x, y]) =>
        Math.hypot(Math.max(0, Math.abs(x - a.x) - a.w / 2), Math.max(0, Math.abs(y - a.y) - a.h / 2)) < 14.1,
    )
  )
    return false;
  // Keep the central reward zone and the lateral entrances clear; other routes may bend.
  if (Math.abs(a.x) - a.w / 2 < 32 && Math.abs(a.y) - a.h / 2 < 28) return false;
  if (Math.abs(a.x) + a.w / 2 > 136 && Math.abs(a.y) - a.h / 2 < 28) return false;
  for (let y = a.y - a.h / 2 - margin; y <= a.y + a.h / 2 + margin; y += 4)
    for (let x = a.x - a.w / 2 - margin; x <= a.x + a.w / 2 + margin; x += 4)
      if (!inside([x, y], polygon) || !inside([x, y + 10], polygon)) return false;
  return placed.every((b) => {
    const gap = a.blocking && b.blocking ? 22 : 8;
    return Math.abs(a.x - b.x) >= (a.w + b.w) / 2 + gap || Math.abs(a.y - b.y) >= (a.h + b.h) / 2 + gap;
  });
}
function make(theme, field, shell, index, variation, attempt) {
  const polygon = shells[shell],
    boxes = [],
    traps = [],
    placed = [];
  const put = (p, target) => {
    if (!canPlace(p, placed, polygon)) return false;
    if (
      p.kind === 'barrel' &&
      boxes.some(
        (b) =>
          Math.hypot(
            Math.max(0, Math.abs(p.x - b.x) - b.width / 2),
            Math.max(0, Math.abs(p.y - b.y) - b.height / 2),
          ) < 29,
      )
    )
      return false;
    target.push(p);
    placed.push(footprint(p));
    return true;
  };
  // Ordered plan parameters move whole cover groups by two modules, never scatter individuals.
  // A bounded alternate is used only when a particular silhouette excludes a perimeter niche.
  const motif = (index % 8) * 2 + (variation % 2);
  const plan = Math.floor(index / 8) * 2 + Math.floor(variation / 2);
  const [design, authored] = PLANS[theme][motif];
  const groups = authored.map((g) => [...g]);
  const turn = (i) => {
    const b = groups[i];
    if (b[2] === b[3]) {
      b[2] = 16;
      b[3] = 32;
    } else [b[2], b[3]] = [b[3], b[2]];
  };
  // These alternatives change cover roles/counts and the route around them,
  // not only positions. Missing groups deliberately make exposed firing lanes.
  const additions = [];
  if (plan === 1) groups.pop();
  if (plan === 2) turn(0);
  if (plan === 3) {
    groups.shift();
    additions.push([16, 16]);
  }
  if (plan === 4) {
    groups.splice(-2);
    additions.push([32, 32]);
  }
  if (plan === 5) {
    turn(groups.length - 1);
    additions.push([16, 16]);
  }
  if (plan === 6) {
    groups.splice(1, 1);
    additions.push(theme === 'wreck' ? [16, 48] : [48, 16]);
  }
  if (plan === 7) {
    groups.splice(0, 2);
    additions.push([16, 16], [16, 16]);
  }
  // Eight circulation alternatives: alternate groups change lanes independently.
  // Attempts enumerate bounded authored offsets, not arbitrary random placement.
  const code = (plan * 73 + attempt * 37) % 4096;
  for (const [q, [bx, by, width, height]] of groups.entries()) {
    const first = (code >> (q * 2)) % 25;
    let placedGroup = false;
    for (let alternative = 0; alternative < 25; alternative++) {
      const choice = (first + alternative) % 25;
      const dx = (choice % 5) * 8 - 24;
      const dy = (Math.floor(choice / 5) * 8 - 24) * (Math.abs(bx) < 64 ? 2 : 1);
      const x = bx + (bx < 0 ? -dx : dx),
        y = by + (by < 0 ? -dy : dy);
      if (put({ x, y, width, height }, boxes)) {
        placedGroup = true;
        break;
      }
    }
    if (!placedGroup && Math.abs(bx) < 64) {
      for (const x of [-56, 56, -40, 40])
        for (const inset of [16, 32]) {
          if (placedGroup) continue;
          const y = by - Math.sign(by) * inset;
          if (put({ x, y, width, height }, boxes)) placedGroup = true;
        }
    }
    if (!placedGroup) return null;
  }
  // Additional cover occupies a designed flank/shoulder niche, with style-specific ordering.
  const flankNiches = [
    [-56, 0],
    [56, 0],
    [-80, -48],
    [80, 48],
    [-80, 48],
    [80, -48],
    [-104, 0],
    [104, 0],
    [-104, -56],
    [104, 56],
    [-64, 64],
    [64, -64],
    [-40, 72],
    [40, -72],
    [-112, 48],
    [112, -48],
  ];
  for (const [width, height] of additions) {
    const start = (Object.keys(styles).indexOf(theme) * 3 + plan) % flankNiches.length;
    if (
      !flankNiches.some((_, i) => {
        const [x, y] = flankNiches[(i + start) % flankNiches.length];
        return put({ x, y, width, height }, boxes);
      })
    )
      return null;
  }
  const candidates = [];
  for (const y of [-88, -72, -56, 56, 72, 88])
    for (const x of [-144, -128, -112, -96, -80, -64, 64, 80, 96, 112, 128, 144]) {
      const horizontal = (variation + index) % 2 === 0;
      const p = {
        kind: field,
        x,
        y,
        width: horizontal ? 32 : 16,
        height: horizontal ? 16 : 32,
        ...(field === 'current' ? { angle: variation * 90 } : {}),
        ...(field === 'spikes' ? { delay: variation * 0.25 } : {}),
      };
      const clearance = Math.min(...placed.map((b) => Math.hypot(x - b.x, y - b.y)));
      candidates.push({
        p,
        score:
          (theme === 'abyss' ? -Math.abs(clearance - 64) : clearance) +
          Math.abs(x) * 0.15 +
          Math.abs(y) * 0.15 +
          (Math.sign(x) === (plan & 1 ? 1 : -1) ? 24 : 0) +
          (Math.sign(y) === (plan & 2 ? 1 : -1) ? 16 : 0),
      });
    }
  candidates.sort((a, b) => b.score - a.score || a.p.y - b.p.y || a.p.x - b.p.x);
  for (const { p } of candidates) {
    if (traps.length === 2 + ([1, 3, 7].includes(plan) ? 1 : 0)) break;
    put(p, traps);
  }
  if (traps.length < 2 + ([1, 3, 7].includes(plan) ? 1 : 0)) return null;
  if (variation === 1 || variation === 3) {
    const kind = variation === 1 ? 'mine' : 'barrel';
    const niches = [
      [-136, 40],
      [136, -40],
      [-136, -40],
      [136, 40],
      [-112, 0],
      [112, 0],
      [-144, 80],
      [144, -80],
      [144, 80],
      [-144, -80],
      [-48, 80],
      [48, -80],
      [-48, -80],
      [48, 80],
    ];
    if (!niches.some(([x, y]) => put({ kind, x, y }, traps))) return null;
  }
  return {
    id: `designed_v3/${theme}/${shell}_${variation}`,
    theme,
    form: 'combat',
    family: shell.replace(/_\d+$/, ''),
    obstacle: 'wall',
    mask: 15,
    outline: polygon,
    boxes,
    traps,
    design: `${design}:${plan}`,
  };
}
// Ignore theme/hazard semantics. Normalize translation, winding, rotations and reflections.
function signature(room, mode) {
  const keys = [];
  for (const flip of [-1, 1])
    for (let turn = 0; turn < 4; turn++) {
      const point = ([x, y]) => {
        x *= flip;
        for (let i = 0; i < turn; i++) [x, y] = [-y, x];
        return mode === 'coarse' ? [Math.round(x / 32) * 32, Math.round(y / 32) * 32] : [x, y];
      };
      const points = room.outline.map(point);
      const pieces = (items) =>
        items.map((p) => [
          ...point([p.x, p.y]),
          ...(turn % 2 ? [p.height ?? 28, p.width ?? 24] : [p.width ?? 24, p.height ?? 28]),
        ]);
      const boxes = pieces(room.boxes),
        traps = pieces(room.traps);
      const origin = mode === 'shell' ? points : [...boxes, ...traps];
      const ox = Math.min(...origin.map((p) => p[0])),
        oy = Math.min(...origin.map((p) => p[1]));
      const w = Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0]));
      const h = Math.max(...points.map((p) => p[1])) - Math.min(...points.map((p) => p[1]));
      const norm = (p) => [
        mode === 'shell' ? (p[0] - ox) / w : p[0] - ox,
        mode === 'shell' ? (p[1] - oy) / h : p[1] - oy,
        ...p.slice(2),
      ];
      const sorted = (items) => items.map(norm).map(JSON.stringify).sort();
      keys.push(JSON.stringify(mode === 'shell' ? sorted(points) : [sorted(boxes), sorted(traps)]));
    }
  return keys.sort()[0];
}
const shellKeys = new Set(
  Object.values(shells).map((p) => signature({ outline: p, boxes: [], traps: [] }, 'shell')),
);
if (shellKeys.size !== 32) throw Error(`only ${shellKeys.size} distinct normalized shells`);
const catalog = [],
  rooms = {},
  allInteriors = new Set(),
  stats = {};
for (const [theme, field] of Object.entries(styles)) {
  rooms[theme] = [];
  const unique = new Set(),
    coarse = new Set();
  for (const [index, [shell]] of Object.entries(shells)
    .filter(([key]) => /_[0-3]$/.test(key))
    .entries())
    for (let variation = 0; variation < 4; variation++) {
      let accepted = null;
      for (let attempt = 0; attempt < 4096; attempt++) {
        const room = make(theme, field, shell, index, variation, attempt);
        if (!room) continue;
        const key = signature(room, 'interior'),
          broad = signature(room, 'coarse');
        if (unique.has(key) || allInteriors.has(key) || coarse.has(broad)) continue;
        coarse.add(broad);
        unique.add(key);
        allInteriors.add(key);
        accepted = room;
        break;
      }
      if (!accepted) throw Error(`no distinct valid plan ${theme}/${shell}/${variation}`);
      catalog.push(accepted);
      rooms[theme].push([
        accepted.id.split('/').at(-1),
        shell,
        accepted.boxes.map((b) => [b.x, b.y, b.width, b.height]),
        accepted.traps,
        accepted.design,
      ]);
    }
  stats[theme] = {
    combat: unique.size,
    normalizedShells: shellKeys.size,
    distinctInteriors: unique.size,
    distinctAt32UnitGrid: coarse.size,
  };
  for (const [form, side] of [
    ['start', 128],
    ['chest', 144],
    ['exit', 128],
    ['boss', 288],
    ['hub', 272],
  ]) {
    if (form === 'hub' && theme !== 'temple') continue;
    const x = side / 2,
      y = form === 'hub' ? 96 : x;
    const polygon = [
      [-x, -y],
      [x, -y],
      [x, y],
      [-x, y],
    ];
    shells[form] = polygon;
    const specials = {
      temple: {
        start: [
          [-40, -32, 8, 8],
          [40, -32, 8, 8],
        ],
        chest: [
          [-48, -40, 16, 16],
          [48, -40, 16, 16],
          [-48, 40, 8, 8],
          [48, 40, 8, 8],
        ],
        exit: [
          [-40, -32, 8, 8],
          [40, 32, 8, 8],
        ],
        boss: [
          [-72, -72, 24, 24],
          [72, -72, 24, 24],
          [-72, 72, 24, 24],
          [72, 72, 24, 24],
        ],
      },
      wreck: {
        start: [
          [-40, -32, 8, 16],
          [40, 32, 16, 8],
        ],
        chest: [
          [-48, -40, 16, 32],
          [48, 40, 32, 16],
        ],
        exit: [
          [-40, -32, 8, 16],
          [-40, 32, 16, 8],
          [40, 32, 8, 8],
        ],
        boss: [
          [-80, -64, 24, 24],
          [64, -80, 24, 24],
          [-64, 80, 24, 24],
          [80, 64, 24, 24],
        ],
      },
      abyss: {
        start: [
          [-40, -32, 8, 8],
          [-40, 32, 8, 8],
          [40, 32, 8, 8],
        ],
        chest: [
          [-48, -40, 8, 8],
          [48, -40, 16, 16],
          [48, 40, 8, 8],
        ],
        exit: [
          [-40, -32, 8, 8],
          [40, -32, 8, 8],
          [-40, 32, 8, 8],
          [40, 32, 8, 8],
        ],
        boss: [
          [-88, -56, 24, 24],
          [56, -88, 24, 24],
          [-56, 64, 24, 24],
          [88, 80, 24, 24],
        ],
      },
      milk: {
        start: [
          [-40, -32, 16, 16],
          [40, 32, 8, 8],
        ],
        chest: [
          [-48, -40, 16, 16],
          [48, 40, 16, 16],
          [-48, 40, 8, 8],
        ],
        exit: [
          [-40, -32, 16, 16],
          [40, 32, 16, 16],
        ],
        boss: [
          [-64, -64, 24, 24],
          [88, -64, 24, 24],
          [-88, 72, 24, 24],
          [64, 88, 24, 24],
        ],
      },
    };
    const boxes = (specials[theme][form] ?? []).map(([x, y, width, height]) => ({ x, y, width, height }));
    const room = {
      id: `designed_v3/${theme}/${form}`,
      theme,
      form,
      family: form,
      obstacle: form === 'boss' ? 'pillar' : 'wall',
      mask: 15,
      outline: polygon,
      boxes,
      traps: [],
    };
    catalog.push(room);
    rooms[theme].push([form, form, boxes.map((b) => [b.x, b.y, b.width, b.height]), [], `${theme}_${form}`]);
  }
}
const directory = 'docs/testing/style-room-catalog-revision';
mkdirSync(directory, { recursive: true });
writeFileSync(
  'src/data/roomTemplates/designedV3.json',
  await format(JSON.stringify({ shells, rooms }), { parser: 'json' }),
);
writeFileSync(`${directory}/expanded.json`, await format(JSON.stringify(catalog), { parser: 'json' }));
writeFileSync(
  `${directory}/counts.json`,
  JSON.stringify(
    { total: catalog.length, styles: stats, crossStyleDuplicateInteriors: 512 - allInteriors.size },
    null,
    2,
  ) + '\n',
);
log(JSON.stringify({ total: catalog.length, styles: stats }));
