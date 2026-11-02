#!/usr/bin/env node
// Turns a GitHub contribution calendar into a garden: every day is a plot,
// and the more you contribute that day, the bigger the plant that grows there.
//
//   node scripts/garden.mjs           real data (GraphQL if GITHUB_TOKEN is set, else the public profile page)
//   node scripts/garden.mjs --demo    random data, for previewing the design offline
//
// Writes dist/garden-light.svg and dist/garden-dark.svg.

import { mkdir, writeFile } from 'node:fs/promises';

const USER = process.env.GARDEN_USER || 'tjh3281';
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = process.env.GARDEN_OUT || 'dist';
const DEMO = process.argv.includes('--demo');

// Contributions in a day needed to grow a sprout, flower, bloom, tree.
// GitHub's own levels are relative to your busiest day, so one huge day turns
// everything else into sprouts; absolute counts make a livelier garden.
const STAGES = [1, 2, 4, 10];
const stage = (d) => (d.count == null ? d.level : STAGES.filter((n) => d.count >= n).length);

// ---------------------------------------------------------------- data

const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

async function fromGraphQL() {
  const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{
    totalContributions weeks{contributionDays{date contributionCount contributionLevel}}}}}}`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'garden' },
    body: JSON.stringify({ query, variables: { login: USER } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors ?? json)}`);
  const cal = json.data.user.contributionsCollection.contributionCalendar;
  return {
    total: cal.totalContributions,
    days: cal.weeks
      .flatMap((w) => w.contributionDays)
      .map((d) => ({ date: d.date, count: d.contributionCount, level: LEVEL[d.contributionLevel] })),
  };
}

async function fromProfilePage() {
  const res = await fetch(`https://github.com/users/${USER}/contributions`, { headers: { 'User-Agent': 'garden' } });
  if (!res.ok) throw new Error(`contributions page: HTTP ${res.status}`);
  const html = await res.text();

  const counts = new Map();
  for (const m of html.matchAll(/for="(contribution-day-component-\d+-\d+)"[^>]*>([^<]*)</g)) {
    const n = /^(\d+) contribution/.exec(m[2].trim());
    counts.set(m[1], n ? +n[1] : 0);
  }
  const days = [];
  for (const m of html.matchAll(/<td[^>]*\bdata-date="([\d-]+)"[^>]*>/g)) {
    const id = /\bid="([^"]+)"/.exec(m[0])?.[1];
    const level = +(/\bdata-level="(\d)"/.exec(m[0])?.[1] ?? 0);
    days.push({ date: m[1], level, count: counts.get(id) });
  }
  if (!days.length) throw new Error('no days found on the contributions page');
  days.sort((a, b) => a.date.localeCompare(b.date));

  const total = /([\d,]+)\s+contributions?\s+in the last year/.exec(html)?.[1].replace(/,/g, '');
  return { total: total ? +total : days.reduce((s, d) => s + (d.count ?? 0), 0), days };
}

function demoData() {
  const days = [];
  const today = Date.now();
  for (let i = 370; i >= 0; i--) {
    const count = Math.random() < 0.45 ? 0 : Math.floor(Math.random() ** 2 * 16);
    days.push({ date: new Date(today - i * 864e5).toISOString().slice(0, 10), level: 0, count });
  }
  return { total: days.reduce((s, d) => s + d.count, 0), days };
}

// ---------------------------------------------------------------- helpers

// Stable per-day randomness, so a plant doesn't change species between runs.
function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

const f = (n) => +n.toFixed(2);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function streaks(days) {
  let longest = 0;
  let run = 0;
  for (const d of days) {
    run = d.level > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // Today not watered yet doesn't break the streak.
  let i = days.length - 1;
  if (days[i]?.level === 0) i--;
  let current = 0;
  while (i >= 0 && days[i].level > 0) current++, i--;
  return { current, longest };
}

// ---------------------------------------------------------------- themes

const THEMES = {
  light: {
    skyTop: '#bfe3ff', skyBottom: '#fff3d9', hillBack: '#bfe0a0', hillFront: '#a3d27f',
    meadowTop: '#a3d27f', meadowBottom: '#8cc46a', soil: '#8a5a3b', mound: '#744a2f', rim: '#5b9f43',
    fence: '#d9b384', fenceDark: '#b38b5d', leaf: '#3f8f34', leafLight: '#6dbf52', stem: '#4a8f39',
    trunk: '#7a4b2a', canopy: ['#3e8e3b', '#4fa445', '#36803a'], canopyHi: '#7cc760', pine: '#2f7a4a',
    blossom: '#ffb3c7', blossomHi: '#ffd6e2', fruit: '#f25c54', bush: '#4c9b3e',
    petals: ['#ff6b8b', '#ffb703', '#c77dff', '#ff8fab', '#f25c54', '#ffffff', '#4cc9f0'], eye: '#ffd23f', eyeDark: '#8a5a2b',
    text: '#1f3317', muted: '#3e5a32', border: '#d0d7de',
  },
  dark: {
    skyTop: '#070d1f', skyBottom: '#1a2748', hillBack: '#17302a', hillFront: '#1d3d2c',
    meadowTop: '#1d3d2c', meadowBottom: '#152e21', soil: '#4a3122', mound: '#3a2519', rim: '#2e6a3a',
    fence: '#6d5439', fenceDark: '#54402c', leaf: '#3c8a44', leafLight: '#5cb65a', stem: '#3c7e3f',
    trunk: '#5e3b22', canopy: ['#2e7d4a', '#3a9150', '#25693f'], canopyHi: '#58b06a', pine: '#22603f',
    blossom: '#e58fb0', blossomHi: '#f7bcd2', fruit: '#ff6f61', bush: '#2f7a40',
    petals: ['#ff7aa2', '#ffc94a', '#c99bff', '#ff9fbf', '#ff6f61', '#f2f2f2', '#6fd6ff'], eye: '#ffd23f', eyeDark: '#7a4f25',
    text: '#e6edf3', muted: '#a8c3ad', border: '#30363d',
  },
};

// ---------------------------------------------------------------- plants
// Each returns SVG drawn around a base point at (0, 0), growing upward.

function sprout(t, h) {
  const s = h & 1 ? -1 : 1;
  return `<path d="M0 0V-5" stroke="${t.stem}" stroke-width="1.2" stroke-linecap="round"/>
<ellipse cx="${-2.4 * s}" cy="-4.6" rx="2.6" ry="1.2" fill="${t.leafLight}" transform="rotate(${30 * s} ${-2.4 * s} -4.6)"/>
<ellipse cx="${2.2 * s}" cy="-5.6" rx="2.3" ry="1.1" fill="${t.leaf}" transform="rotate(${-35 * s} ${2.2 * s} -5.6)"/>`;
}

function petalRing(cx, cy, n, dist, r, color, rx) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = f(cx + Math.cos(a) * dist);
    const y = f(cy + Math.sin(a) * dist);
    out += rx
      ? `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${r}" fill="${color}" transform="rotate(${f((a * 180) / Math.PI)} ${x} ${y})"/>`
      : `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`;
  }
  return out;
}

function flower(t, h) {
  const petal = t.petals[h % t.petals.length];
  const eye = petal === t.petals[1] ? t.eyeDark : t.eye;
  const s = h & 2 ? -1 : 1;
  return `<path d="M0 0V-9" stroke="${t.stem}" stroke-width="1.2" stroke-linecap="round"/>
<ellipse cx="${2.3 * s}" cy="-3.6" rx="2.4" ry="1.1" fill="${t.leaf}" transform="rotate(${-30 * s} ${2.3 * s} -3.6)"/>
${petalRing(0, -10, 5, 2.1, 1.9, petal)}<circle cy="-10" r="1.3" fill="${eye}"/>`;
}

function bloom(t, h) {
  const petal = t.petals[(h >>> 3) % t.petals.length];
  const stem = `<path d="M0 0V-12" stroke="${t.stem}" stroke-width="1.4" stroke-linecap="round"/>
<ellipse cx="-2.8" cy="-4" rx="3" ry="1.2" fill="${t.leafLight}" transform="rotate(30 -2.8 -4)"/>
<ellipse cx="2.8" cy="-6.5" rx="3" ry="1.2" fill="${t.leaf}" transform="rotate(-30 2.8 -6.5)"/>`;
  switch (h % 3) {
    case 0: // daisy
      return `${stem}${petalRing(0, -13.5, 8, 2.7, 1.15, petal, 2.4)}<circle cy="-13.5" r="1.8" fill="${t.eye}"/>`;
    case 1: // tulip
      return `${stem}<path d="M-3.4 -12.5Q-3.9 -18.4-1.7 -18.8L0 -16.6 1.7 -18.8Q3.9 -18.4 3.4 -12.5 0 -10.4-3.4 -12.5z" fill="${petal}"/>`;
    default: {
      // flowering bush
      const dots = [[-3.5, -6], [2.5, -8.5], [0, -4], [3.8, -4.2], [-1.2, -9.6]]
        .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="1.25" fill="${t.petals[(h + i) % t.petals.length]}"/>`)
        .join('');
      return `<circle cx="-3" cy="-4.2" r="4" fill="${t.bush}"/><circle cx="3" cy="-4.2" r="4" fill="${t.bush}"/>
<circle cy="-7" r="4.6" fill="${t.leaf}"/>${dots}`;
    }
  }
}

function tree(t, h) {
  const trunk = `<path d="M-1.6 0L-1 -11H1L1.6 0z" fill="${t.trunk}"/>`;
  const c = t.canopy[h % t.canopy.length];
  const round = (fill, hi) => `<circle cx="-4.8" cy="-14" r="5.6" fill="${fill}"/><circle cx="4.8" cy="-14" r="5.6" fill="${fill}"/>
<circle cy="-19" r="7.4" fill="${fill}"/><circle cx="-2.4" cy="-21" r="3" fill="${hi}" opacity=".55"/>`;
  switch ((h >>> 4) % 4) {
    case 0: // pine
      return `<rect x="-1.2" y="-6" width="2.4" height="6" fill="${t.trunk}"/>
<path d="M0 -27L-5 -18H5zM0 -22L-6.5 -12H6.5zM0 -16.5L-8 -5.5H8z" fill="${t.pine}"/>`;
    case 1: // cherry blossom
      return `${trunk}${round(t.blossom, t.blossomHi)}<circle cx="3" cy="-17" r="1" fill="${t.blossomHi}"/><circle cx="-5" cy="-12.5" r="1" fill="${t.blossomHi}"/>`;
    case 2: // fruit tree
      return `${trunk}${round(c, t.canopyHi)}<circle cx="3.5" cy="-13" r="1.3" fill="${t.fruit}"/><circle cx="-4.5" cy="-16" r="1.3" fill="${t.fruit}"/><circle cx="2" cy="-21" r="1.3" fill="${t.fruit}"/>`;
    default:
      return `${trunk}${round(c, t.canopyHi)}`;
  }
}

const PLANTS = [null, sprout, flower, bloom, tree];

function plant(t, level, seed, x, y, scale = 1) {
  if (!level) return '';
  const cls = level === 4 ? 'tr' : level > 1 ? 'sw' : '';
  const delay = cls ? ` style="animation-delay:-${(seed % 60) / 10}s"` : '';
  const sc = scale === 1 ? '' : ` scale(${scale})`;
  return `<g transform="translate(${f(x)} ${f(y)})${sc}"><g class="${cls}"${delay}>${PLANTS[level](t, seed)}</g></g>`;
}

// ---------------------------------------------------------------- scene

function render({ total, days }, mode) {
  const t = THEMES[mode];
  const C = 16; // one day's plot
  const offset = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  days = days.map((d) => ({ ...d, level: stage(d) }));
  const cells = days.map((d, i) => ({ ...d, col: Math.floor((i + offset) / 7), row: (i + offset) % 7 }));
  const cols = cells.at(-1).col + 1;

  const W = 920;
  const H = 320;
  const GX = (W - cols * C) / 2;
  const bedTop = 128;
  const bedBottom = bedTop + 7 * C + 8;

  const trees = days.filter((d) => d.level === 4).length;
  const flowers = days.filter((d) => d.level === 2 || d.level === 3).length;
  const sprouts = days.filter((d) => d.level === 1).length;
  const { current, longest } = streaks(days);

  // sky decoration: sun + clouds by day, moon + stars by night
  let sky = '';
  if (mode === 'light') {
    sky += `<circle class="glow" cx="${W - 84}" cy="50" r="34" fill="#ffd166" opacity=".3"/><circle cx="${W - 84}" cy="50" r="22" fill="#ffd166"/>`;
    const cloud = `<circle r="9"/><circle cx="11" cy="-4" r="12"/><circle cx="24" r="9"/><rect x="0" y="0" width="24" height="9"/>`;
    sky += [[160, 34, 0.9, -10], [470, 58, 0.7, -55], [700, 26, 0.6, -85]]
      .map(([x, y, s, d]) => `<g class="cloud" style="animation-delay:${d}s"><g transform="translate(${x} ${y}) scale(${s})" fill="#fff" opacity=".9">${cloud}</g></g>`)
      .join('');
  } else {
    for (let i = 0; i < 46; i++) {
      const h = hash(`star${i}`);
      const x = f((h % 1000) / 1000 * W);
      const y = f(((h >>> 10) % 1000) / 1000 * 100 + 6);
      const r = (h >>> 20) % 3 === 0 ? 1.3 : 0.8;
      sky += `<circle class="${i % 3 ? '' : 'tw'}" style="animation-delay:-${i % 5}s" cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity=".8"/>`;
    }
    sky += `<circle cx="${W - 84}" cy="50" r="30" fill="#f4f1de" opacity=".08"/>
<path d="M${W - 84} 32a18 18 0 1 0 17 23A15 15 0 0 1 ${W - 84} 32z" fill="#f4f1de"/>`;
  }

  const hills = `<path d="M0 118Q140 70 300 104T620 92T${W} 100V${H}H0z" fill="${t.hillBack}"/>
<path d="M0 130Q200 96 420 122T${W} 116V${H}H0z" fill="${t.hillFront}"/>`;

  // fence behind the bed
  const fx0 = GX - 18;
  const fx1 = GX + cols * C + 18;
  let fence = `<rect x="${fx0}" y="${bedTop - 30}" width="${fx1 - fx0}" height="3" fill="${t.fenceDark}"/><rect x="${fx0}" y="${bedTop - 20}" width="${fx1 - fx0}" height="3" fill="${t.fenceDark}"/>`;
  for (let x = fx0; x <= fx1 - 6; x += 26) {
    fence += `<path d="M${x} ${bedTop - 4}V${bedTop - 34}l3 -4 3 4V${bedTop - 4}z" fill="${t.fence}"/>`;
  }

  const bed = `<rect x="${GX - 12}" y="${bedTop - 8}" width="${cols * C + 24}" height="${7 * C + 16}" rx="10" fill="${t.soil}" stroke="${t.rim}" stroke-width="4"/>`;

  let mounds = '';
  let plants = '';
  for (const row of [0, 1, 2, 3, 4, 5, 6]) {
    for (const d of cells.filter((c) => c.row === row)) {
      const h = hash(d.date);
      const x = GX + d.col * C + C / 2 + ((h % 5) - 2) * 0.4;
      const y = bedTop + row * C + C - 3;
      mounds += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="5.6" ry="2" fill="${t.mound}"/>`;
      plants += plant(t, d.level, h, x, y);
      // a little texture on empty plots so the bed doesn't look like a spreadsheet
      if (!d.level && h % 7 === 0) mounds += `<circle cx="${f(x + 3)}" cy="${f(y - 1)}" r="1.1" fill="${t.mound}" opacity=".9"/>`;
      if (!d.level && h % 11 === 1) mounds += `<path d="M${f(x - 2)} ${f(y)}l-1 -3.5M${f(x - 1)} ${f(y)}l.6 -4M${f(x)} ${f(y)}l1.4 -3" stroke="${t.leaf}" stroke-width=".8" stroke-linecap="round" opacity=".7"/>`;
    }
  }

  // month labels under the bed
  let months = '';
  let lastCol = -9;
  let lastMonth = -1;
  for (let col = 0; col < cols; col++) {
    const first = cells.find((c) => c.col === col);
    const m = new Date(`${first.date}T00:00:00Z`).getUTCMonth();
    if (m !== lastMonth && col - lastCol >= 3 && col < cols - 2) {
      months += `<text x="${GX + col * C}" y="${bedBottom + 18}" class="t m">${MONTHS[m]}</text>`;
      lastCol = col;
    }
    lastMonth = m;
  }

  // creatures: butterflies by day, fireflies by night
  let critters = '';
  if (mode === 'light') {
    const wings = (c) => `<g class="flap"><ellipse cx="-2.6" cy="-1" rx="2.8" ry="2" fill="${c}"/><ellipse cx="-2" cy="1.6" rx="1.8" ry="1.3" fill="${c}"/>
<ellipse cx="2.6" cy="-1" rx="2.8" ry="2" fill="${c}"/><ellipse cx="2" cy="1.6" rx="1.8" ry="1.3" fill="${c}"/></g><rect x="-.5" y="-2.5" width="1" height="5" rx=".5" fill="#3a2a1a"/>`;
    const paths = [
      `M${GX + 60} ${bedTop + 40}C${GX + 200} ${bedTop - 40} ${GX + 340} ${bedTop + 90} ${GX + 480} ${bedTop + 20}S${GX + 700} ${bedTop + 70} ${GX + 780} ${bedTop - 10}S${GX + 300} ${bedTop - 30} ${GX + 60} ${bedTop + 40}`,
      `M${GX + 700} ${bedTop + 80}C${GX + 560} ${bedTop + 10} ${GX + 420} ${bedTop + 100} ${GX + 260} ${bedTop + 30}S${GX + 80} ${bedTop + 60} ${GX + 140} ${bedTop - 20}S${GX + 600} ${bedTop - 10} ${GX + 700} ${bedTop + 80}`,
    ];
    critters = paths
      .map((p, i) => `<g>${wings(i ? '#c77dff' : '#ffb703')}<animateMotion dur="${46 + i * 14}s" repeatCount="indefinite" path="${p}"/></g>`)
      .join('');
  } else {
    critters += `<defs><radialGradient id="ff"><stop offset="0" stop-color="#fff7a8"/><stop offset=".35" stop-color="#f6e05e" stop-opacity=".7"/><stop offset="1" stop-color="#f6e05e" stop-opacity="0"/></radialGradient></defs>`;
    for (let i = 0; i < 16; i++) {
      const h = hash(`firefly${i}`);
      const x = f(GX + ((h % 1000) / 1000) * cols * C);
      const y = f(bedTop - 30 + ((h >>> 10) % 140));
      critters += `<circle class="ff" style="animation-delay:-${(h >>> 4) % 7}s;animation-duration:${4 + ((h >>> 8) % 4)}s" cx="${x}" cy="${y}" r="4" fill="url(#ff)"/>`;
    }
  }

  // footer: stats on the left, legend on the right
  const statsY = H - 22;
  const stats = [
    `<tspan class="b">${total.toLocaleString('en-US')}</tspan> contributions in the last year`,
    `<tspan class="b">${trees}</tspan> trees`,
    `<tspan class="b">${flowers}</tspan> flowers`,
    `<tspan class="b">${sprouts}</tspan> sprouts`,
    `streak <tspan class="b">${current}</tspan> (best ${longest})`,
  ].join('<tspan class="dot">  Â·  </tspan>');

  const legendX = W - 228;
  let legend = `<text x="${legendX}" y="${statsY}" class="t s">less</text>`;
  [0, 1, 2, 3, 4].forEach((lvl, i) => {
    const x = legendX + 40 + i * 26;
    legend += `<ellipse cx="${x}" cy="${statsY + 1}" rx="5" ry="1.8" fill="${t.mound}"/>`;
    legend += plant(t, lvl, [0, 1, 6, 9, 32][i], x, statsY, lvl === 4 ? 0.7 : 1);
  });
  legend += `<text x="${legendX + 40 + 5 * 26 - 4}" y="${statsY}" class="t s">more</text>`;

  const font = `-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${USER}'s contribution garden: ${total} contributions in the last year, ${trees} trees, ${flowers} flowers">
<title>${USER}'s contribution garden</title>
<style>
.t{font-family:${font};fill:${t.text}}
.h{font-size:20px;font-weight:700}
.sub{font-size:12px;fill:${mode === 'light' ? '#3d5168' : '#9fb3c8'}}
.m{font-size:10px;fill:${t.muted}}
.s{font-size:11.5px;fill:${t.muted}}
.b{font-weight:700;fill:${t.text}}
.dot{fill:${t.muted};opacity:.6}
.sw,.tr{transform-box:fill-box;transform-origin:50% 100%;animation:sway 3.4s ease-in-out infinite alternate}
.tr{animation:sway-t 5.5s ease-in-out infinite alternate}
@keyframes sway{from{transform:rotate(-6deg)}to{transform:rotate(6deg)}}
@keyframes sway-t{from{transform:rotate(-1.6deg)}to{transform:rotate(1.6deg)}}
.cloud{animation:drift 110s linear infinite}
@keyframes drift{from{transform:translateX(-${W}px)}to{transform:translateX(${W}px)}}
.glow{transform-box:fill-box;transform-origin:center;animation:pulse 4s ease-in-out infinite alternate}
@keyframes pulse{from{transform:scale(.9)}to{transform:scale(1.12)}}
.tw{animation:tw 2.6s ease-in-out infinite alternate}
@keyframes tw{from{opacity:.15}to{opacity:.95}}
.flap{transform-box:fill-box;transform-origin:center;animation:flap .22s ease-in-out infinite alternate}
@keyframes flap{from{transform:scaleX(1)}to{transform:scaleX(.25)}}
.ff{animation:blink 5s ease-in-out infinite}
@keyframes blink{0%,100%{opacity:0}45%,60%{opacity:1}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.skyTop}"/><stop offset="1" stop-color="${t.skyBottom}"/></linearGradient>
<linearGradient id="meadow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.meadowTop}"/><stop offset="1" stop-color="${t.meadowBottom}"/></linearGradient>
<clipPath id="frame"><rect width="${W}" height="${H}" rx="14"/></clipPath>
</defs>
<g clip-path="url(#frame)">
<rect width="${W}" height="${H}" fill="url(#sky)"/>
${sky}
${hills}
<rect y="${bedTop + 20}" width="${W}" height="${H - bedTop - 20}" fill="url(#meadow)"/>
<text x="28" y="40" class="t h">My Garden</text>
<text x="28" y="60" class="t sub">every contribution plants something Â· last 12 months</text>
${fence}
${bed}
${mounds}
${plants}
${critters}
${months}
<text x="28" y="${statsY + 4}" class="t s">${stats}</text>
<g transform="translate(0 4)">${legend}</g>
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="14" fill="none" stroke="${t.border}"/>
</svg>
`;
}

// ---------------------------------------------------------------- main

let data;
if (DEMO) data = demoData();
else if (TOKEN) data = await fromGraphQL().catch((e) => (console.warn(`${e.message}; falling back to profile page`), fromProfilePage()));
else data = await fromProfilePage();

await mkdir(OUT, { recursive: true });
for (const mode of ['light', 'dark']) {
  await writeFile(`${OUT}/garden-${mode}.svg`, render(data, mode));
}
console.log(`ðŸŒ± ${USER}: ${data.total} contributions over ${data.days.length} days â†’ ${OUT}/garden-{light,dark}.svg`);
