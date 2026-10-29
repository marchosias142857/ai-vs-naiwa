import { readFileSync, writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
const rooms = JSON.parse(readFileSync('docs/testing/style-room-catalog-revision/expanded.json', 'utf8'));
const colors = { temple: '#8e8877', wreck: '#9b7965', abyss: '#707b86', milk: '#c2b59b' };
const cards = rooms
  .map((t) => {
    const rect = (p, color, rim = 0) =>
      `<rect x="${p.x - (p.width ?? 24) / 2 - rim}" y="${p.y - (p.height ?? 28) / 2 - rim}" width="${(p.width ?? 24) + 2 * rim}" height="${(p.height ?? 28) + 2 * rim}" fill="${color}" rx="1"/>`;
    const zones = t.traps
      .map((p) =>
        rect(
          p,
          p.kind === 'spikes'
            ? '#d2ad5c'
            : p.kind === 'current'
              ? '#5ab7ca'
              : p.kind === 'weed'
                ? '#70a88d'
                : p.kind === 'mine'
                  ? '#e07b78'
                  : '#a97e54',
          3,
        ),
      )
      .join('');
    return `<article data-style="${t.theme}" data-family="${t.family}" data-id="${t.id}"><svg viewBox="-200 -160 400 320" role="img" aria-label="${t.id}"><polygon points="${t.outline.map((p) => p.join(',')).join(' ')}" fill="${colors[t.theme]}" stroke="#dedbc9" stroke-width="4"/>${t.boxes.map((p) => rect(p, '#3a4249')).join('')}${zones}<path d="M-15 0H15M0-15V15" stroke="#fff" stroke-width="2"/></svg><h2>${t.id.split('/').at(-1)}</h2><p>${t.theme} · ${t.form} · ${t.design ?? t.family} · ${t.boxes.length} 组障碍 / ${t.traps.length} 处机关</p></article>`;
  })
  .join('');
const options = (key) => [...new Set(rooms.map((t) => t[key]))].map((v) => `<option>${v}</option>`).join('');
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>#115 房型目录</title><style>body{margin:0;background:#141b24;color:#e8edf1;font:16px system-ui}header{padding:32px 4vw 20px;background:#1e2937;position:sticky;top:0;z-index:1}h1{margin:0 0 12px;font-size:28px}header p{line-height:1.6;color:#aebdce;max-width:1000px}select,input{font:inherit;padding:8px;margin:4px;border:1px solid #53637a;border-radius:6px;background:#26374a;color:white}main{padding:24px 4vw;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}article{background:#202d3e;border:1px solid #405169;border-radius:12px;overflow:hidden}article[hidden]{display:none}svg{width:100%;display:block;background:#101720}h2{font-size:17px;margin:16px 16px 4px}article p{font-size:12px;color:#aebdce;margin:0 16px 16px}output{margin-left:12px}a{color:#adcaff}</style><header><h1>#115 · 风格房型目录</h1><p>每风格128个战斗候选；起点、武器、终点固定正方形。此页为完整布局示意，亮线标注轮廓，深块是障碍，彩块包含机关边框；实际台阶墙体与素材见同目录 PNG 实景。每风格 32 种去除尺寸缩放后的外壳、128 种独立内部摆法；共 529 项，含石殿主城。特殊房也按风格分别布置。</p><label>风格<select id="style"><option value="">全部</option>${options('theme')}</select></label><label>家族<select id="family"><option value="">全部</option>${options('family')}</select></label><input id="search" placeholder="按 ID 搜索" aria-label="按 ID 搜索"><output id="count">529 项</output></header><main>${cards}</main><script>const cards=[...document.querySelectorAll('article')];function filter(){let n=0;for(const c of cards){c.hidden=(style.value&&c.dataset.style!==style.value)||(family.value&&c.dataset.family!==family.value)||!c.dataset.id.includes(search.value);if(!c.hidden)n++;}document.querySelector('#count').textContent=n+' 项';}const style=document.querySelector('#style'),family=document.querySelector('#family'),search=document.querySelector('#search');for(const c of [style,family,search])c.addEventListener('input',filter);</script></html>`;
writeFileSync(
  'docs/testing/style-room-catalog-revision/catalog.html',
  await format(html, {
    ...(await resolveConfig('docs/testing/style-room-catalog-revision/catalog.html')),
    parser: 'html',
  }),
);

const shells = rooms.filter((t) => t.theme === 'temple' && t.form === 'combat' && t.id.endsWith('_0'));
const shellSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="2720" viewBox="0 0 1600 2720"><rect width="1600" height="2720" fill="#111923"/><text x="40" y="45" fill="#f1eee0" font-size="28" font-family="sans-serif">32 distinct room shells · 368 × 272 world units</text>${shells.map((t, i) => `<g transform="translate(${(i % 4) * 400 + 200},${Math.floor(i / 4) * 330 + 240})"><rect x="-192" y="-155" width="384" height="305" rx="12" fill="#202c3c"/><polygon points="${t.outline.map((p) => p.join(',')).join(' ')}" fill="#697a87" stroke="#ded8c6" stroke-width="4"/><text x="0" y="-165" text-anchor="middle" fill="#f1eee0" font-size="18" font-family="sans-serif">${t.id.split('/').at(-1).replace(/_0$/, '')}</text></g>`).join('')}</svg>`;
writeFileSync(
  'docs/testing/style-room-catalog-revision/shells.svg',
  await format(shellSvg, { parser: 'html' }),
);
