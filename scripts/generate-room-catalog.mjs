import { writeFileSync, mkdirSync } from 'node:fs';
import { format } from 'prettier';
import { log } from 'node:console';

// Authoring tool only: bounded enumeration, no random scatter or runtime search.
// Each family has a circulation skeleton and a coherent set of cover groups.
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
const motifs = [
  [
    [-80, -56, 32, 16],
    [80, -56, 32, 16],
    [-80, 56, 16, 32],
    [80, 56, 16, 32],
  ],
  [
    [-88, -48, 16, 48],
    [88, -48, 16, 48],
    [-88, 48, 16, 48],
    [88, 48, 16, 48],
  ],
  [
    [-64, -56, 48, 16],
    [88, 56, 48, 16],
    [-88, 56, 16, 32],
  ],
  [
    [-96, -56, 16, 32],
    [-48, 48, 16, 32],
    [56, -56, 16, 32],
    [104, 48, 16, 32],
  ],
  [
    [-80, -48, 48, 16],
    [80, -48, 48, 16],
    [-56, 56, 16, 32],
    [104, 56, 16, 32],
  ],
  [
    [-96, -56, 32, 32],
    [64, -56, 32, 16],
    [-64, 56, 32, 16],
    [96, 56, 32, 32],
  ],
  [
    [-72, -56, 48, 16],
    [88, -56, 16, 32],
    [-96, 48, 16, 32],
    [56, 48, 32, 16],
  ],
  [
    [-112, -48, 16, 32],
    [-56, 56, 32, 16],
    [56, -56, 32, 16],
    [112, 48, 16, 32],
  ],
];
function outline(f, w, h) {
  const x = w / 2,
    y = h / 2;
  switch (f) {
    case 0:
      return [
        [-x, -y],
        [x, -y],
        [x, y],
        [-x, y],
      ];
    case 1:
      return [
        [-x + 32, -y],
        [x - 32, -y],
        [x, -y + 32],
        [x, y - 32],
        [x - 32, y],
        [-x + 32, y],
        [-x, y - 32],
        [-x, -y + 32],
      ];
    case 2:
      return [
        [-x + 64, -y],
        [x, -y],
        [x, y],
        [-x, y],
        [-x, -y + 64],
      ];
    case 3:
      return [
        [-x + 24, -y],
        [x - 24, -y],
        [x - 24, -40],
        [x, -40],
        [x, 40],
        [x - 24, 40],
        [x - 24, y],
        [-x + 24, y],
        [-x + 24, 40],
        [-x, 40],
        [-x, -40],
        [-x + 24, -40],
      ];
    case 4:
      return [
        [-x, -y],
        [-48, -y],
        [-48, -y + 32],
        [48, -y + 32],
        [48, -y],
        [x, -y],
        [x, y],
        [-x, y],
      ];
    case 5:
      return [
        [-x, -y],
        [x - 48, -y],
        [x - 48, -y + 24],
        [x, -y + 24],
        [x, y],
        [-x + 32, y],
        [-x + 32, y - 32],
        [-x, y - 32],
      ];
    case 6:
      return [
        [-x, -y],
        [x, -y],
        [x, y - 64],
        [x - 64, y],
        [-x, y],
      ];
    default:
      return [
        [-x + 16, -y],
        [x - 48, -y],
        [x, -y + 48],
        [x, y - 32],
        [x - 32, y],
        [-x + 32, y],
        [-x, y - 32],
        [-x, -y + 16],
      ];
  }
}
function inside(p, polygon) {
  let yes = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0])
      yes = !yes;
  }
  return yes;
}
function footprint(p) {
  const rim = p.kind ? 3 : 0;
  return { x: p.x, y: p.y, w: (p.width ?? 24) + 2 * rim, h: (p.height ?? 28) + 2 * rim };
}
function canPlace(p, placed, polygon) {
  const a = footprint(p),
    margin = 12;
  // The cross connects all doors and the center; never use it as a placement candidate.
  if (Math.abs(a.x) - a.w / 2 < 28 || Math.abs(a.y) - a.h / 2 < 24) return false;
  for (let y = a.y - a.h / 2 - margin; y <= a.y + a.h / 2 + margin; y += 4)
    for (let x = a.x - a.w / 2 - margin; x <= a.x + a.w / 2 + margin; x += 4)
      if (!inside([x, y + 10], polygon) || !inside([x, y], polygon)) return false;
  return placed.every(
    (b) => Math.abs(a.x - b.x) >= (a.w + b.w) / 2 + 8 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2 + 8,
  );
}
function make(theme, field, f, size, variation) {
  const w = 320 + (size % 4) * 16,
    h = 256 + Math.floor(size / 4) * 16,
    polygon = outline(f, w, h);
  const boxes = [],
    traps = [],
    placed = [];
  const put = (p, target) => {
    if (!canPlace(p, placed, polygon)) return false;
    // A circle beside a cover corner can leave a sub-grid neck despite separated
    // visual rectangles. Keep a full 18-unit large-enemy lane plus grid slack.
    if (
      p.kind === 'barrel' &&
      boxes.some(
        (b) =>
          Math.hypot(
            Math.max(0, Math.abs(p.x - b.x) - b.width / 2),
            Math.max(0, Math.abs(p.y - b.y) - b.height / 2),
          ) <
          7 + 18 + 4,
      )
    )
      return false;
    target.push(p);
    placed.push(footprint(p));
    return true;
  };
  for (const [i, b] of motifs[f].entries()) {
    const [x, y, width, height] = b;
    const horizontal = width >= height;
    const stretch = i === variation ? Math.min(width, height) : 0;
    const p = {
      x: x + (i === variation ? 8 : 0),
      y,
      width: width + (horizontal ? stretch : 0),
      height: height + (horizontal ? 0 : stretch),
    };
    if (!put(p, boxes)) {
      // One authored alternate, not repeated arbitrary retries.
      if (!put({ x, y, width, height }, boxes))
        throw Error(`cover rejected ${theme}/${f}/${size}/${variation}/${i}`);
    }
  }
  // Ordered perimeter niches scored by clearance from cover and distance from the center.
  const candidates = [];
  for (const y of [-80, -64, -48, 48, 64, 80])
    for (const x of [-128, -112, -96, -80, -64, -48, 48, 64, 80, 96, 112, 128]) {
      const horizontal = (f + variation) % 2 === 0;
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
          clearance +
          Math.abs(x) * 0.15 +
          Math.abs(y) * 0.15 +
          (Math.sign(x) === (variation & 1 ? 1 : -1) ? 12 : 0),
      });
    }
  candidates.sort((a, b) => b.score - a.score || a.p.y - b.p.y || a.p.x - b.p.x);
  for (const { p } of candidates) {
    if (traps.length === 2 + (variation === 3 ? 1 : 0)) break;
    put(p, traps);
  }
  if (traps.length < 2) throw Error(`insufficient legal field niches ${theme}/${f}/${size}/${variation}`);
  if (variation === 1 || variation === 3) {
    const kind = variation === 1 ? 'mine' : 'barrel';
    const niches = [
      [-128, 80],
      [128, -80],
      [128, 80],
      [-128, -80],
      [-48, 80],
      [48, -80],
      [-48, -80],
      [48, 80],
    ];
    if (!niches.some(([x, y]) => put({ kind, x, y }, traps)))
      throw Error(`no ${kind} niche ${theme}/${f}/${size}`);
  }
  return {
    id: `designed_v3/${theme}/${families[f]}_${size}_${variation}`,
    theme,
    form: 'combat',
    family: families[f],
    obstacle: 'wall',
    mask: 15,
    outline: polygon,
    boxes,
    traps,
  };
}
// Translation/rotation/reflection-normalized geometry. Theme, IDs and hazard semantics do not hide duplicates.
function signature(room) {
  const keys = [];
  for (const flip of [-1, 1])
    for (let turn = 0; turn < 4; turn++) {
      const point = ([x, y]) => {
        x *= flip;
        for (let i = 0; i < turn; i++) [x, y] = [-y, x];
        return [x, y];
      };
      const points = room.outline.map(point),
        minX = Math.min(...points.map((p) => p[0])),
        minY = Math.min(...points.map((p) => p[1]));
      const normalize = (p) => [p[0] - minX, p[1] - minY];
      const rings = [];
      for (const ring of [points, [...points].reverse()])
        for (let i = 0; i < ring.length; i++)
          rings.push(JSON.stringify([...ring.slice(i), ...ring.slice(0, i)].map(normalize)));
      const items = (xs) =>
        xs
          .map((p) => [
            ...normalize(point([p.x, p.y])),
            ...(turn % 2 ? [p.height, p.width] : [p.width, p.height]),
          ])
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      keys.push(JSON.stringify([rings.sort()[0], items(room.boxes), items(room.traps)]));
    }
  return keys.sort()[0];
}
const catalog = [];
for (const [theme, field] of Object.entries(styles)) {
  const unique = new Set();
  for (let size = 0; size < 12; size++)
    for (let f = 0; f < 8; f++)
      for (let variation = 0; variation < 4; variation++) {
        if (unique.size === 128) continue;
        const room = make(theme, field, f, size, variation),
          key = signature(room);
        if (unique.has(key)) continue;
        unique.add(key);
        catalog.push(room);
      }
  if (unique.size !== 128) throw Error(`catalog quota not met ${theme}: ${unique.size}`);
  for (const [form, side] of [
    ['start', 128],
    ['chest', 144],
    ['exit', 128],
    ['boss', 288],
    ['hub', 272],
  ]) {
    catalog.push({
      id: `designed_v3/${theme}/${form}`,
      theme,
      form,
      family: form,
      obstacle: 'wall',
      mask: 15,
      outline: outline(0, side, form === 'hub' ? 192 : side),
      boxes: [],
      traps: [],
    });
  }
}
mkdirSync('src/data/roomTemplates', { recursive: true });
writeFileSync(
  'src/data/roomTemplates/designedV3.json',
  await format(JSON.stringify(catalog), { parser: 'json' }),
);
log(
  JSON.stringify({
    total: catalog.length,
    combatPerStyle: 128,
    styles: Object.keys(styles),
    structuralDuplicates: 0,
  }),
);
