import {
  clamp, lerp, ease, prog, win, rng, el, place, style, css, text, words, showWords, esc,
} from './lib.js';
import { Terminal } from './splash.js';

const W = 1920;
const H = 1080;
const CODE_LH = 29;
const PANE_HEAD = 46;
const PRE_PAD = 16;

// ---------------------------------------------------------------- shared bits

function scene(stage, cls = '') {
  return el('div', 'scene ' + cls, stage);
}

function show(node, on) {
  if (node._on !== on) {
    node.classList.toggle('on', on);
    node._on = on;
  }
}

function pane(parent, x, y, w, h, label, right = '', cls = 'pane') {
  const node = place(el('div', cls, parent), x, y, w, h);
  if (label != null) el('div', 'pane-label', node, `<b>${label}</b><span>${right}</span>`);
  const pre = el('pre', '', node);
  return { node, pre };
}

function lines(pre, htmlLines, numbered = false, start = 1) {
  return htmlLines.map((html, i) => {
    const line = el('span', 'l', pre);
    if (numbered) el('span', 'ln', line, String(start + i));
    el('span', 'lc', line, html || ' ');
    return line;
  });
}

// types each line left to right: p runs 0..1 over the whole block
function typeLines(lineEls, p, caret) {
  const lens = lineEls.map(l => l._len ?? (l._len = l.lastChild.textContent.length || 1));
  const total = lens.reduce((a, b) => a + b, 0);
  let budget = p * total;
  let caretAt = null;
  lineEls.forEach((l, i) => {
    const vis = clamp(budget / lens[i]);
    budget -= lens[i];
    css(l.lastChild, 'clip-path', vis >= 1 ? 'none' : `inset(0 ${((1 - vis) * 100).toFixed(2)}% 0 0)`);
    style(l, vis > 0 ? 1 : 0);
    if (vis > 0 && vis < 1) caretAt = [i, vis * lens[i]];
    if (vis >= 1 && !caretAt && i === lineEls.length - 1) caretAt = [i, lens[i]];
  });
  if (caret) {
    if (caretAt && p < 1) {
      style(caret, 1, 0, 0);
      const [i, chars] = caretAt;
      const l = lineEls[i];
      caret.style.top = l.offsetTop + 'px';
      caret.style.left = l.lastChild.offsetLeft + chars * caret._cw + 'px';
    } else style(caret, 0);
  }
}

function caretFor(pre, fontPx) {
  const c = el('span', 'abs', pre);
  c._cw = fontPx * 0.6;
  Object.assign(c.style, { width: c._cw + 'px', height: fontPx * 1.25 + 'px', background: 'currentColor', marginTop: '3px', opacity: 0 });
  pre.style.position = 'relative';
  return c;
}

function fadeLines(lineEls, t, start, stagger = 0.03, dur = 0.35, dy = 8) {
  lineEls.forEach((l, i) => {
    const p = prog(t, start + i * stagger, dur);
    style(l, p, 0, (1 - p) * dy);
  });
}

const lineY = (paneTop, i, lh = CODE_LH) => paneTop + PANE_HEAD + PRE_PAD + i * lh + lh / 2;

function kTokens(k) {
  if (k >= 1000) return (k / 1000).toFixed(2) + 'M';
  return Math.round(k) + 'k';
}

// ---------------------------------------------------------------- background

function background(stage) {
  const root = el('div', 'layer', stage);
  root.innerHTML = `
    <div class="layer" data-k="glow" style="background: radial-gradient(120% 90% at 20% 0%, var(--sky-1), transparent 60%)"></div>
    <div class="layer" data-k="sky" style="background: linear-gradient(180deg, var(--sky-1) 0%, var(--sky-2) 52%, var(--sky-3) 100%)"></div>
    <div class="layer" data-k="stars"></div>
    <div class="abs" data-k="moon" style="left:1560px;top:120px;width:108px;height:108px;border-radius:50%;background:var(--moon-face);box-shadow:0 0 60px 18px var(--moon-glow), 0 0 160px 60px var(--moon-glow)"></div>
    <div class="layer" data-k="clouds"></div>`;
  const $ = k => root.querySelector(`[data-k="${k}"]`);
  const r = rng(7);
  const stars = [...Array(46)].map(() => {
    const size = 2 + r() * 3.2;
    const s = place(el('span', 'abs', $('stars')), r() * W, r() * H * 0.62, size, size);
    Object.assign(s.style, { borderRadius: '50%', background: 'var(--star)', boxShadow: '0 0 8px var(--star)' });
    s._phase = r() * Math.PI * 2;
    s._speed = 0.5 + r() * 0.9;
    return s;
  });
  const cloudPaths = [
    [380, 120, 'M10 120 Q10 95 35 90 Q20 60 55 50 Q60 20 100 18 Q130 0 165 15 Q195 5 220 20 Q250 8 275 25 Q310 10 340 30 Q365 20 370 50 Q390 65 370 85 Q380 110 360 120Z'],
    [300, 110, 'M5 110 Q0 85 25 75 Q15 50 50 40 Q55 15 90 12 Q120 -5 155 10 Q180 0 210 15 Q240 5 260 25 Q285 15 290 45 Q310 60 290 80 Q300 105 280 110Z'],
    [160, 65, 'M5 65 Q0 48 16 42 Q8 26 30 20 Q38 4 58 6 Q75 -4 95 8 Q112 0 128 15 Q148 8 152 30 Q166 40 150 52 Q158 63 142 65Z'],
  ];
  const cloudSpec = [
    [0, 1.7, 1080 - 176, 14, 'var(--cloud-deep)'],
    [1, 1.5, 1080 - 150, -10, 'var(--cloud-deep)'],
    [2, 2.0, 1080 - 110, 20, 'var(--cloud)'],
    [0, 2.1, 1080 - 132, -16, 'var(--cloud)'],
    [1, 1.7, 1080 - 96, 12, 'var(--cloud)'],
  ];
  const clouds = cloudSpec.map(([shape, scale, y, speed, fill], i) => {
    const [vw, vh, d] = cloudPaths[shape];
    const svg = el('div', 'abs', $('clouds'), `<svg viewBox="0 0 ${vw} ${vh}" width="${vw * scale}" height="${vh * scale}" style="display:block"><path d="${d}" fill="${fill}"/></svg>`);
    svg.style.top = y + 'px';
    svg._base = [-200 + i * 460, speed, vw * scale];
    return svg;
  });
  return { root, $, stars, clouds };
}

// piecewise linear keyframes
function keyed(frames) {
  return t => {
    if (t <= frames[0][0]) return frames[0][1];
    for (let i = 1; i < frames.length; i++) {
      const [t1, v1] = frames[i];
      const [t0, v0] = frames[i - 1];
      if (t <= t1) return lerp(v0, v1, ease.inOutSine((t - t0) / (t1 - t0)));
    }
    return frames[frames.length - 1][1];
  };
}

// ---------------------------------------------------------------- film

export function buildFilm(stage, { exporting }) {
  const bg = background(stage);
  const scenes = [];
  const chapters = [];
  let clock = 0;
  const add = (title, dur, build, { overlap = 0.25, chapter = true } = {}) => {
    const start = Math.max(0, clock - overlap);
    const s = build(start);
    s.start = start;
    s.end = start + dur;
    scenes.push(s);
    if (chapter) chapters.push({ at: start + (start ? overlap : 0), title });
    clock = start + dur;
    return s;
  };

  const crumb = place(el('div', 'abs crumb', stage, '<b>maki</b><span></span>'), 96, 52);
  const crumbText = crumb.lastChild;
  crumb.style.zIndex = 5;

  const threeCanvas = el('canvas', 'layer', stage);
  threeCanvas.style.pointerEvents = 'none';
  let world = null;
  let worldReady = null;
  const needWorld = () => {
    if (!worldReady) {
      worldReady = import('./world.js').then(m => {
        world = new m.Staircase(threeCanvas, m.sessionItems(rng(11)));
        world.mod = m;
        world.resize(zoomNow * devicePixelRatio);
        return world;
      });
    }
    return worldReady;
  };
  let zoomNow = 1;

  const ctx = { stage, bg, needWorld, getWorld: () => world, threeCanvas, exporting, assets: stage.dataset.assets ?? '../' };

  const splash = add('maki', 9.2, start => splashScene(ctx, start));
  add('why', 13.2, start => heroScene(ctx, start, splash), { overlap: 2.2 });
  add('the bill', 27.5, start => billScene(ctx, start), { overlap: 0.8 });
  add('index', 24, start => indexScene(ctx, start));
  add('code_execution', 23, start => execScene(ctx, start));
  add('subagents', 17, start => taskScene(ctx, start));
  add('tool_search, batch, compaction', 16.5, start => restScene(ctx, start));
  add('the benchmark', 15.5, start => benchScene(ctx, start));
  add('lua plugins', 33, start => luaScene(ctx, start));
  add('permissions', 13.5, start => permScene(ctx, start));
  add('nothing hidden', 11, start => detailScene(ctx, start));
  add('providers', 10.5, start => providerScene(ctx, start));
  add('install', 12, start => outroScene(ctx, start), { overlap: 1.2 });
  const duration = clock;

  const OUT = scenes[scenes.length - 1].start;
  const HERO = scenes[1].start;
  const skyOp = keyed([[0, 0], [HERO + 1.4, 0], [HERO + 2.6, 1], [scenes[2].start + 0.4, 1], [scenes[2].start + 1.8, 0], [OUT, 0], [OUT + 1.6, 1]]);
  const glowOp = keyed([[0, 0], [HERO + 2, 0], [scenes[2].start + 1, 0.5], [OUT, 0.5], [OUT + 1.6, 0]]);
  const starOp = keyed([[0, 0], [HERO + 1.6, 0], [HERO + 3, 1], [scenes[2].start, 1], [scenes[2].start + 1.8, 0.28], [OUT, 0.28], [OUT + 1.6, 1]]);
  const moonOp = keyed([[0, 0], [HERO + 2.2, 0], [HERO + 3.4, 1], [scenes[2].start, 1], [scenes[2].start + 1.2, 0], [OUT + 0.6, 0], [OUT + 2, 1]]);
  const cloudOp = keyed([[0, 0], [HERO + 1.8, 0], [HERO + 3.2, 1], [scenes[2].start + 0.2, 1], [scenes[2].start + 1.2, 0], [OUT + 0.4, 0], [OUT + 2.2, 1]]);
  const crumbOp = keyed([[0, 0], [scenes[2].start + 0.6, 0], [scenes[2].start + 1.4, 1], [OUT - 0.2, 1], [OUT + 0.6, 0]]);

  let crumbTitle = '';
  function render(t) {
    style(bg.$('sky'), skyOp(t));
    style(bg.$('glow'), glowOp(t));
    const so = starOp(t) * Number(getStarOp());
    const starsOn = so > 0.01;
    style(bg.$('stars'), starsOn ? 1 : 0);
    if (starsOn) for (const s of bg.stars) style(s, so * (0.55 + 0.45 * Math.sin(t * s._speed * 1.05 + s._phase)));
    const mo = moonOp(t);
    style(bg.$('moon'), mo, 0, (1 - mo) * 30);
    const co = cloudOp(t);
    style(bg.$('clouds'), co, 0, (1 - co) * 60);
    if (co > 0.01) {
      for (const c of bg.clouds) {
        const [x0, speed, width] = c._base;
        const span = W + width + 200;
        const x = ((((x0 + t * speed) % span) + span) % span) - width - 100;
        style(c, 1, x, 0);
      }
    }

    const co2 = crumbOp(t);
    style(crumb, co2);
    const ch = chapters.findLast(c => c.at <= t);
    const title = ch ? ch.title : '';
    if (title !== crumbTitle) {
      crumbTitle = title;
      text(crumbText, '/ ' + title);
    }

    let o3d = 0;
    for (const s of scenes) {
      const on = t >= s.start && t < s.end;
      show(s.node, on);
      if (on) {
        s.render(t - s.start, t);
        if (s.uses3d) o3d = Math.max(o3d, s.o3d ?? 1);
      }
    }
    style(threeCanvas, o3d);
  }

  let starCache = null;
  const getStarOp = () => starCache ?? (starCache = getComputedStyle(document.documentElement).getPropertyValue('--star-op').trim() || '1');

  const videos = scenes.flatMap(s => s.videos || []);
  return {
    duration,
    chapters,
    render,
    resize(zoom) {
      zoomNow = zoom;
      for (const s of scenes) s.resize?.(zoom);
      world?.resize(zoom * devicePixelRatio);
    },
    themeChanged() {
      starCache = null;
      world?.theme();
    },
    setPlaying(on) {
      for (const v of videos) v.setPlaying(on);
    },
    setSpeed(s) {
      for (const v of videos) v.setSpeed(s);
    },
    async prepare(t) {
      if (scenes.some(s => s.uses3d && t >= s.start - 2 && t < s.end)) await needWorld();
      for (const v of videos) await v.prepare(t);
    },
  };
}

// ---------------------------------------------------------------- 1. splash

function splashScene(ctx, start) {
  const node = scene(ctx.stage);
  node.style.zIndex = 3;
  const box = el('div', 'abs', node);
  Object.assign(box.style, { left: 0, top: 0, width: W + 'px', height: H + 'px', overflow: 'hidden', transformOrigin: '0 0' });
  const canvas = el('canvas', '', box);
  Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' });
  const term = new Terminal(canvas);
  let zoom = 1;

  const cap = words(node, 'note', 'the real splash screen, ported from <span style="color:#ffb86c">splash.rs</span>. in the terminal, LLVM vectorizes it to AVX', 40, 832, 1400);
  Object.assign(cap.node.style, { color: '#c9cde0', fontSize: '22px', width: 'auto', padding: '8px 16px', borderRadius: '6px', background: 'rgba(24, 25, 34, 0.92)', border: '1px solid #44475a' });

  // hero window: the terminal settles on the right, where the landing page keeps its demo
  const TARGET = [964, 262, 860, 484];
  const TYPE_AT = 0.7;
  const ENTER_AT = 1.75;
  const SHRINK_AT = 7.2;
  const SHRINK = 1.8;

  const s = {
    node,
    landsAt: start + SHRINK_AT + SHRINK,
    enterAt: start + ENTER_AT,
    resize(z) { zoom = z; },
    render(lt, t) {
      const typed = lt < ENTER_AT ? Math.min(4, Math.floor(clamp((lt - TYPE_AT) / 0.55) * 4 + (lt > TYPE_AT ? 1 : 0))) : -1;
      const p = prog(lt, SHRINK_AT, SHRINK, ease.inOutExpo);
      const [tx, ty, tw, th] = TARGET;
      const x = lerp(0, tx, p);
      const y = lerp(0, ty, p);
      const w = lerp(W, tw, p);
      const h = lerp(H, th, p);
      box.style.left = x + 'px';
      box.style.top = y + 'px';
      box.style.width = w + 'px';
      box.style.height = h + 'px';
      css(box, 'border-radius', (p * 10).toFixed(1) + 'px');
      css(box, 'box-shadow', p > 0.01 ? 'var(--pane-shadow)' : 'none');
      term.resize(w, h, zoom * devicePixelRatio);
      term.draw(lt - ENTER_AT, typed === -1 ? -1 : Math.max(0, typed));
      showWords(cap, lt, 3.4, 6.9, { stagger: 0.03 });
      style(box, 1);
    },
  };
  return s;
}

// ---------------------------------------------------------------- 2. hero

function heroScene(ctx, start, splash) {
  const node = scene(ctx.stage);
  node.style.zIndex = 2;
  const win2 = el('div', 'abs', node);
  const [wx, wy, ww, wh] = [964, 262, 860, 484];
  place(win2, wx, wy, ww, wh);
  Object.assign(win2.style, { borderRadius: '10px', overflow: 'hidden', boxShadow: 'var(--pane-shadow)' });
  const canvas = el('canvas', '', win2);
  Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' });
  const term = new Terminal(canvas);
  let zoom = 1;

  const mark = words(node, '', '<span style="font-weight:800;font-size:150px;letter-spacing:-0.03em;line-height:1">maki</span>', 132, 150, 700);
  const tag = words(node, 'lead', 'the efficient coder', 138, 314, 700);
  tag.node.style.fontSize = '44px';
  const column = place(el('div', 'abs', node), 138, 432, 800);
  Object.assign(column.style, { display: 'flex', flexDirection: 'column', gap: '30px' });
  const [l1, l2, l3] = [
    'I got frustrated with existing coding agents and hitting hourly/weekly token limits.',
    'So I built maki, a lightweight Rust TUI with some novel context token reduction techniques.',
    'In benchmarks, it reduces cost by <span class="acc">2x</span> and finishes them <span class="acc">2x</span> faster too.',
  ].map(html => {
    const b = words(column, 'say', html, 0, 0, 800);
    Object.assign(b.node.style, { position: 'relative', left: 'auto', top: 'auto', fontSize: '36px' });
    return b;
  });

  const END = 13.2;
  return {
    node,
    resize(z) { zoom = z; },
    render(lt) {
      // the splash scene hands its terminal over at the moment it lands
      const global = start + lt;
      const handover = global >= splash.landsAt - 1e-3;
      style(win2, handover ? 1 - prog(lt, END - 0.9, 0.7, ease.in) : 0, prog(lt, END - 0.9, 0.7, ease.in) * 80);
      if (handover) {
        term.resize(ww, wh, zoom * devicePixelRatio);
        term.draw(global - splash.enterAt, -1);
      }
      showWords(mark, lt, 2.0, END - 0.4, { stagger: 0.05, dur: 0.9 });
      showWords(tag, lt, 2.4, END - 0.4, { stagger: 0.05 });
      showWords(l1, lt, 3.6, END - 0.3, { stagger: 0.028 });
      showWords(l2, lt, 6.6, END - 0.25, { stagger: 0.028 });
      showWords(l3, lt, 9.6, END - 0.2, { stagger: 0.03 });
    },
  };
}

// ---------------------------------------------------------------- 3. the bill

function billScene(ctx, start) {
  const node = scene(ctx.stage);
  node.style.zIndex = 2;
  const s = { node, uses3d: true };
  ctx.needWorld();

  const TURN0 = 1.2;
  const TURN_GAP = 0.62;
  const INFLATE = 8.2;
  const FF = 10.4;
  const FF_GAP = 0.105;
  const SMALLER = 20.8;
  const FEWER = 23.2;
  const FILE_K = 25;
  const INDEXED_K = 1.4;
  const FEW = 20;
  const END = 27.5;

  const h1 = words(node, 'h1', 'Every turn re-sends the whole conversation.', 96, 124, 900);
  const lead1 = words(node, 'lead', 'The API is stateless, so each turn pays again for everything before it.', 100, 280, 760);
  const h1b = words(node, 'h1', 'Read a 2000-line file on turn 2 of a 40-turn session...', 96, 124, 980);
  const lead2 = words(node, 'lead', '...and you pay for it on every turn after.', 100, 280, 800);
  const h1d = words(node, 'h1', 'Prompt caching lowers the price.', 96, 124, 980);
  const lead3 = words(node, 'lead', 'Cache reads still cost, and a bloated context makes the model dumber.', 100, 210, 800);
  const h1c = words(node, 'h1', 'So maki attacks both multipliers.', 96, 124, 1000);

  const diagram = place(el('pre', 'abs mono', node), 100, 620, 820);
  Object.assign(diagram.style, { fontSize: '23px', lineHeight: '40px', color: 'var(--ink-2)' });
  const diagLines = [
    'turn 1  [system + prompt]                ─► tool call',
    'turn 2  [system + prompt + result 1]     ─► tool call',
    'turn 3  [system + prompt + result 1 + 2] ─► ...',
  ].map(line => el('span', 'l', diagram, esc(line).replace(/\[(.*)\]/, '[<span class="acc">$1</span>]')));

  const meter = place(el('div', 'abs', node), 1340, 124, 480);
  meter.innerHTML = `
    <div class="mono" style="font-size:22px;color:var(--ink-3)">tokens sent so far</div>
    <div data-k="total" style="font-weight:800;font-size:92px;letter-spacing:-0.03em;line-height:1.05;font-variant-numeric:tabular-nums">0</div>
    <div class="mono" style="font-size:22px;color:var(--ink-3)"><span data-k="turn">turn 0</span><span data-k="was"></span></div>`;
  const total = meter.querySelector('[data-k="total"]');
  const turnLabel = meter.querySelector('[data-k="turn"]');
  const was = meter.querySelector('[data-k="was"]');

  const fileNote = place(el('div', 'abs mono', node, 'main.rs · 2000 lines ≈ 25k tokens'), 0, 0);
  Object.assign(fileNote.style, { fontSize: '22px', color: 'var(--accent)', whiteSpace: 'nowrap' });
  const math = place(el('div', 'abs', node), 100, 650, 800);
  math.innerHTML = `<div class="mono" style="font-size:30px;line-height:1.5;color:var(--ink)">25k tokens <span class="dim">×</span> 38 turns</div>
    <div style="font-weight:800;font-size:84px;line-height:1.1;color:var(--accent);letter-spacing:-0.03em">≈ 950k tokens</div>
    <div class="mono dim" style="font-size:22px">for one file the model read once</div>`;

  const svg = el('div', 'layer', node);
  svg.innerHTML = `<svg width="${W}" height="${H}" style="position:absolute;inset:0;overflow:visible">
    <defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="var(--accent)"/></marker></defs>
    <line data-k="v" stroke="var(--accent)" stroke-width="3" marker-end="url(#ah)" marker-start="url(#ah)"/>
    <line data-k="hz" stroke="var(--accent)" stroke-width="3" marker-end="url(#ah)" marker-start="url(#ah)"/>
    <line data-k="lead" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 5"/>
  </svg>`;
  const vLine = svg.querySelector('[data-k="v"]');
  const hLine = svg.querySelector('[data-k="hz"]');
  const leader = svg.querySelector('[data-k="lead"]');
  const dial = (y, glyph, name, how) => {
    const d = place(el('div', 'abs', node), 100, y, 820);
    d.innerHTML = `<div style="display:flex;gap:22px;align-items:baseline"><span class="acc" style="font-size:52px;font-weight:800;width:44px;text-align:center">${glyph}</span><div><div class="say" style="font-size:44px">${name}</div><div class="mono dim" style="font-size:22px;margin-top:4px">${how}</div></div></div>`;
    return d;
  };
  const dialV = dial(300, '↕', 'smaller results', 'index · code_execution · subagents · tool_search');
  const dialH = dial(470, '↔', 'fewer round-trips', 'batch · code_execution · compaction');
  const foot = place(el('div', 'abs note', node, 'illustrative session: 3.2k system prompt, ~0.7k per tool result, 12 tokens per line'), 100, 1010, 1400);
  foot.style.fontSize = '18px';

  const turnLabels = [...Array(8)].map((_, i) => el('div', 'abs mono', node, `turn ${i + 1}`));
  for (const l of turnLabels) Object.assign(l.style, { fontSize: '19px', color: 'var(--ink-3)', whiteSpace: 'nowrap', transform: 'translateX(-50%)' });
  const bandLabels = ['system prompt + tools', 'your prompt'].map(n => el('div', 'abs mono', node, n));
  for (const l of bandLabels) Object.assign(l.style, { fontSize: '19px', color: 'var(--ink-2)', whiteSpace: 'nowrap' });
  const newest = el('div', 'abs mono', node, '');
  Object.assign(newest.style, { fontSize: '19px', color: 'var(--accent)', whiteSpace: 'nowrap', transform: 'translateX(-50%)' });

  let items = null;
  let peak = 0;
  const riseAt = k => (k <= 8 ? TURN0 + (k - 1) * TURN_GAP : FF + (k - 9) * FF_GAP);

  s.render = lt => {
    const world = ctx.getWorld();
    s.o3d = win(lt, 0.2, END, 0.9, 0.6);
    showWords(h1, lt, 0.5, 7.9);
    showWords(lead1, lt, 1.3, 7.9, { stagger: 0.02 });
    diagLines.forEach((l, i) => {
      const p = prog(lt, TURN0 + i * TURN_GAP + 0.1, 0.5);
      style(l, p * (1 - prog(lt, 7.5, 0.4)), (1 - p) * -12, 0);
    });
    showWords(h1b, lt, 8.0, 15.0);
    showWords(lead2, lt, 11.4, 15.0, { stagger: 0.03 });
    showWords(h1d, lt, 15.2, 20.0);
    showWords(lead3, lt, 15.8, 20.0, { stagger: 0.022 });
    showWords(h1c, lt, 20.2, END);
    const dv = prog(lt, SMALLER - 0.3, 0.7, ease.outExpo);
    style(dialV, dv * (1 - prog(lt, END - 0.5, 0.45, ease.in)), 0, (1 - dv) * 24);
    const dh = prog(lt, FEWER - 0.3, 0.7, ease.outExpo);
    style(dialH, dh * (1 - prog(lt, END - 0.5, 0.45, ease.in)), 0, (1 - dh) * 24);

    const mathP = win(lt, 12.4, 20.0, 0.6, 0.45);
    style(math, mathP, 0, (1 - prog(lt, 12.4, 0.6)) * 20);
    style(foot, win(lt, 12.4, END - 0.1, 0.6, 0.5) * 0.9);
    if (!world) return;
    items ??= world.items;

    const shrink = prog(lt, SMALLER, 1.6, ease.inOutExpo);
    const fewer = prog(lt, FEWER, 1.6, ease.inOutExpo);
    const lastTurn = lerp(40, FEW, fewer);
    const turn = k => {
      if (k > lastTurn + 0.999) return 0;
      const p = prog(lt, riseAt(k), k <= 8 ? 0.55 : 0.3, ease.outExpo);
      return p * (k > lastTurn ? clamp(1 - (k - lastTurn)) : 1);
    };
    const drop = k => prog(lt, riseAt(k) + (k <= 8 ? 0.22 : 0.08), k <= 8 ? 0.45 : 0.25, ease.out);
    const inflate = k => prog(lt, INFLATE + (k - 3) * 0.07, 1.1, ease.inOutExpo);
    const fileK = k => lerp(lerp(items[3][0], FILE_K, inflate(k)), INDEXED_K, shrink);
    const tokens = (j, k) => (j === 3 ? fileK(k) : items[j][0]);

    const zoomOut = prog(lt, FF - 0.6, 3.6, ease.inOutSine);
    const inflateView = prog(lt, INFLATE - 0.2, 1.4, ease.inOutSine);
    const shrinkView = prog(lt, SMALLER, 1.8, ease.inOutSine);
    const fewerView = prog(lt, FEWER, 1.8, ease.inOutSine);
    const k = world.mod.K;
    const colH = (n, fileTok) => (3.6 + 0.72 * (n - 1) + fileTok) * k;
    const box = (n, fileTok) => [-0.6, 0, -0.6, (n - 1) + 0.6, colH(n, fileTok), 0.6];
    let b = box(8, 0.6);
    b = b.map((v, i) => lerp(v, box(8, FILE_K)[i], inflateView));
    b = b.map((v, i) => lerp(v, box(40, FILE_K)[i], zoomOut));
    b = b.map((v, i) => lerp(v, box(40, INDEXED_K)[i], shrinkView));
    b = b.map((v, i) => lerp(v, box(FEW, INDEXED_K)[i], fewerView));
    const region = [lerp(900, 980, zoomOut), lerp(430, 400, zoomOut), lerp(900, 840, zoomOut), lerp(500, 540, zoomOut)];
    const yaw = lerp(0.62, 0.5, prog(lt, 0, END, ease.linear));
    const pitch = lerp(0.52, 0.46, zoomOut);

    world.render({ turn, drop, tokens, fileHot: lt > INFLATE - 0.3, box: b, region, yaw, pitch, gridTurns: Math.max(8, Math.min(lastTurn, 8 + (40 - 8) * zoomOut)) });

    let sent = 0;
    let latest = 0;
    for (let n = 1; n <= 40; n++) {
      const r = turn(n);
      if (r <= 0) continue;
      latest = n;
      let col = 0;
      for (let j = 0; j <= n; j++) col += tokens(j, n) * (j === n ? drop(n) : 1);
      sent += col * r;
    }
    if (lt < SMALLER) peak = sent;
    text(total, kTokens(sent));
    text(turnLabel, `turn ${latest}`);
    text(was, lt > SMALLER ? `  ·  was ${kTokens(peak)}` : '');
    style(meter, win(lt, 0.9, END - 0.1, 0.6, 0.5));

    const SP = world.mod.SPACING;
    turnLabels.forEach((l, i) => {
      const [x, y] = world.project(i * SP, 0, 0.9);
      l.style.left = x + 'px';
      l.style.top = y + 6 + 'px';
      style(l, prog(lt, riseAt(i + 1), 0.4) * (1 - prog(lt, FF - 0.8, 0.6)));
    });
    const bandY = [items[0][0] / 2, items[0][0] + items[1][0] / 2];
    bandLabels.forEach((l, i) => {
      const [x, y] = world.project(-0.36, bandY[i] * k, 0.36);
      l.style.left = x - l.offsetWidth - 22 + 'px';
      l.style.top = y - 13 - (i ? 22 : -6) + 'px';
      style(l, prog(lt, TURN0 + 0.3 + i * 0.3, 0.5) * (1 - prog(lt, INFLATE - 0.6, 0.5)));
    });
    const newestK = Math.min(8, latest);
    if (newestK >= 2) {
      const [x, y] = world.project((newestK - 1) * SP, colH(newestK, 0) + 1.7, 0);
      newest.style.left = x + 'px';
      newest.style.top = y - 30 + 'px';
      text(newest, `+ result ${newestK - 1}`);
    }
    style(newest, newestK >= 2 ? prog(lt, riseAt(newestK), 0.25) * (1 - prog(lt, riseAt(newestK) + 0.55, 0.25)) * (1 - prog(lt, INFLATE - 0.8, 0.3)) : 0);

    const fileY = (items[0][0] + items[1][0] + items[2][0] + fileK(3) / 2) * k;
    const [fx, fy] = world.project(2 * SP - 0.36, fileY, 0.36);
    const noteOp = win(lt, INFLATE + 0.5, SMALLER + 0.2, 0.5, 0.4);
    style(fileNote, noteOp);
    fileNote.style.left = fx - fileNote.offsetWidth - 40 + 'px';
    fileNote.style.top = fy - 60 + 'px';
    leader.setAttribute('x1', fx - 34);
    leader.setAttribute('y1', fy - 36);
    leader.setAttribute('x2', fx - 4);
    leader.setAttribute('y2', fy - 4);
    style(leader, noteOp);

    const lastCol = Math.max(1, Math.round(lastTurn));
    const topY = colH(lastCol, fileK(lastCol));
    const [ax, ay0] = world.project((lastCol - 1) * SP + 0.9, 0, 0.36);
    const [, ay1] = world.project((lastCol - 1) * SP + 0.9, topY, 0.36);
    const [bx0, by0] = world.project(-0.36, 0, 1.2);
    const [bx1, by1] = world.project((lastCol - 1) * SP + 0.36, 0, 1.2);
    const gv = prog(lt, SMALLER - 0.2, 0.8, ease.outExpo);
    const gh = prog(lt, FEWER - 0.2, 0.8, ease.outExpo);
    vLine.setAttribute('x1', ax); vLine.setAttribute('y1', ay0);
    vLine.setAttribute('x2', ax); vLine.setAttribute('y2', lerp(ay0, ay1, gv));
    hLine.setAttribute('x1', bx0); hLine.setAttribute('y1', by0);
    hLine.setAttribute('x2', lerp(bx0, bx1, gh)); hLine.setAttribute('y2', lerp(by0, by1, gh));
    const out = 1 - prog(lt, END - 0.5, 0.45, ease.in);
    style(vLine, gv > 0 ? out : 0);
    style(hLine, gh > 0 ? out : 0);
  };
  return s;
}

// ---------------------------------------------------------------- 4. index

const SRC = [
  '<span class="kw">use</span> std::fs;',
  '<span class="kw">use</span> clap::<span class="ty">Parser</span>;',
  '<span class="kw">use</span> color_eyre::<span class="ty">Result</span>;',
  '',
  '<span class="at">#[derive(Parser)]</span>',
  '<span class="kw">struct</span> <span class="ty">Args</span> {',
  '    paths: <span class="ty">Vec</span>&lt;<span class="ty">PathBuf</span>&gt;,',
  '    <span class="at">#[arg(short, long)]</span>',
  '    lines: <span class="kw">bool</span>,',
  '}',
  '',
  '<span class="kw">fn</span> <span class="fn">count_words</span>(text: &amp;<span class="ty">str</span>) -&gt; <span class="ty">usize</span> {',
  '    text.<span class="fn">split_whitespace</span>().<span class="fn">count</span>()',
  '}',
  '',
  '<span class="kw">fn</span> <span class="fn">count_lines</span>(text: &amp;<span class="ty">str</span>) -&gt; <span class="ty">usize</span> {',
  '    text.<span class="fn">lines</span>().<span class="fn">count</span>()',
  '}',
  '',
  '<span class="kw">fn</span> <span class="fn">main</span>() -&gt; <span class="ty">Result</span>&lt;()&gt; {',
  '    <span class="kw">let</span> args = <span class="ty">Args</span>::<span class="fn">parse</span>();',
  '    <span class="kw">for</span> path <span class="kw">in</span> &amp;args.paths {',
  '        <span class="kw">let</span> text = fs::<span class="fn">read_to_string</span>(path)?;',
  '        <span class="kw">let</span> n = <span class="kw">if</span> args.lines {',
  '            <span class="fn">count_lines</span>(&amp;text)',
  '        } <span class="kw">else</span> {',
  '            <span class="fn">count_words</span>(&amp;text)',
  '        };',
  '        <span class="fn">println!</span>(<span class="st">"{}: {n}"</span>, path.<span class="fn">display</span>());',
  '    }',
  '    <span class="ty">Ok</span>(())',
  '}',
];

// `maki index main.rs`, verbatim. second field: the source lines each row came from
const SKELETON = [
  ['<span class="sec">imports:</span> <span class="rng">[1-3]</span>', [0, 1, 2]],
  ['  clap::<span class="ty">Parser</span>', [1]],
  ['  color_eyre::<span class="ty">Result</span>', [2]],
  ['  std::fs', [0]],
  ['', []],
  ['<span class="sec">types:</span>', []],
  ['  <span class="at">#[derive(Parser)]</span>', [4]],
  ['  <span class="kw">struct</span> <span class="ty">Args</span> <span class="rng">[6-10]</span>', [5]],
  ['    paths: <span class="ty">Vec</span>&lt;<span class="ty">PathBuf</span>&gt;', [6]],
  ['    lines: <span class="kw">bool</span>', [8]],
  ['', []],
  ['<span class="sec">fns:</span>', []],
  ['  <span class="fn">count_words</span>(text: &amp;<span class="ty">str</span>) -&gt; <span class="ty">usize</span> <span class="rng">[12-14]</span>', [11]],
  ['  <span class="fn">count_lines</span>(text: &amp;<span class="ty">str</span>) -&gt; <span class="ty">usize</span> <span class="rng">[16-18]</span>', [15]],
  ['  <span class="fn">main</span>() -&gt; <span class="ty">Result</span>&lt;()&gt; <span class="rng">[20-32]</span>', [19]],
];

function indexScene(ctx, start) {
  const node = scene(ctx.stage);
  const SRC_X = 96;
  const SRC_Y = 116;
  const SRC_W = 800;
  const SRC_LH = 26;
  const SK_X = 1000;
  const SK_Y = 300;
  const SK_W = 824;
  const OUT_AT = 12.2;

  const src = pane(node, SRC_X, SRC_Y, SRC_W, PANE_HEAD + PRE_PAD * 2 + SRC.length * SRC_LH, 'src/main.rs', '32 lines');
  Object.assign(src.pre.style, { lineHeight: SRC_LH + 'px', fontSize: '19px' });
  const srcLines = lines(src.pre, SRC, true);
  const kept = new Set(SKELETON.flatMap(r => r[1]));
  const band = el('div', 'abs', src.node);
  Object.assign(band.style, { left: 0, right: 0, height: SRC_LH * 3 + 'px', background: 'linear-gradient(180deg, transparent, oklch(75% 0.12 45 / 0.18), transparent)' });
  const marks = SRC.map((_, i) => {
    const m = el('div', 'abs', src.node);
    Object.assign(m.style, { left: 0, width: '3px', height: SRC_LH + 'px', top: PANE_HEAD + PRE_PAD + i * SRC_LH + 'px', background: 'oklch(75% 0.12 45)' });
    return m;
  });
  const readBox = el('div', 'abs', src.node);
  Object.assign(readBox.style, { left: '6px', right: '6px', top: PANE_HEAD + PRE_PAD + 19 * SRC_LH - 2 + 'px', height: 13 * SRC_LH + 4 + 'px', border: '2px solid oklch(75% 0.12 45)', borderRadius: '4px' });

  const sk = pane(node, SK_X, SK_Y, SK_W, PANE_HEAD + PRE_PAD * 2 + SKELETON.length * CODE_LH, 'maki index src/main.rs', 'skeleton, 15 lines');
  sk.pre.style.lineHeight = CODE_LH + 'px';
  const skLines = lines(sk.pre, SKELETON.map(r => r[0]));

  const h1 = words(node, 'h1', '<code>index</code>: read less, know more', SK_X, 112, 860);
  const lead = words(node, 'lead', 'tree-sitter turns a file into a skeleton, with line ranges.', SK_X + 4, 196, 820);
  lead.node.style.fontSize = '32px';
  const lead2 = words(node, 'lead', 'Then the model reads only the lines it needs.', SK_X + 4, 196, 820);
  lead2.node.style.fontSize = '32px';
  const lead3 = words(node, 'lead', 'On a real file the gap gets wide.', 100, 196, 1400);
  lead3.node.style.fontSize = '32px';

  const svgWrap = el('div', 'layer', node);
  const paths = [];
  let svgInner = `<svg width="${W}" height="${H}" style="position:absolute;inset:0;overflow:visible">`;
  SKELETON.forEach(([, from], i) => {
    for (const f of from) {
      const x0 = SRC_X + SRC_W - 10;
      const y0 = lineY(SRC_Y, f, SRC_LH);
      const x1 = SK_X + 8;
      const y1 = lineY(SK_Y, i);
      svgInner += `<path data-i="${i}" d="M${x0} ${y0} C ${x0 + 70} ${y0}, ${x1 - 70} ${y1}, ${x1} ${y1}" fill="none" stroke="oklch(75% 0.12 45)" stroke-width="1.6" stroke-opacity="0.75" pathLength="1" stroke-dasharray="1 1"/>`;
    }
  });
  svgWrap.innerHTML = svgInner + '</svg>';
  svgWrap.querySelectorAll('path').forEach(p => paths.push([Number(p.dataset.i), p]));

  const tui = pane(node, SK_X, SK_Y + PANE_HEAD + PRE_PAD * 2 + SKELETON.length * CODE_LH + 32, SK_W, 104, null, '', 'tui');
  const t1 = el('span', 'l', tui.pre, '<span class="dot">●</span> <span class="tool">index&gt;</span> <span class="path">src/main.rs</span> <span class="ann">(15 lines)</span>');
  const t2 = el('span', 'l', tui.pre, '<span class="dot">●</span> <span class="tool">read&gt;</span> <span class="path">src/main.rs:20-32</span> <span class="ann">(13 of 32 lines)</span>');

  // 1400 lines against 60 + 40, drawn to scale
  const BAR_W = 1480;
  const bars = place(el('div', 'abs', node), 100, 320, 1720);
  bars.innerHTML = `
    <div class="mono dim" style="font-size:24px"><span style="color:var(--ink)">read</span> big.rs</div>
    <div style="display:flex;align-items:center;gap:22px;margin:10px 0 50px"><div data-k="a" style="height:64px;border-radius:6px;background:var(--ink-3)"></div><span data-k="an" style="white-space:nowrap"><span class="stat-big" style="font-size:64px">1400</span> <span class="mono dim" style="font-size:24px">lines</span></span></div>
    <div class="mono dim" style="font-size:24px"><span class="acc">index</span> big.rs, then <span class="acc">read</span> offset=812 limit=40</div>
    <div style="display:flex;align-items:center;gap:22px;margin-top:10px"><div style="display:flex;gap:4px"><div data-k="b1" style="height:64px;border-radius:6px 0 0 6px;background:var(--accent)"></div><div data-k="b2" style="height:64px;border-radius:0 6px 6px 0;background:oklch(75% 0.12 45 / 0.55)"></div></div><span data-k="bn" class="stat-big acc" style="font-size:64px">60 + 40</span><span class="mono dim" style="font-size:24px">lines: signatures + the range it needs</span></div>`;
  const $ = k => bars.querySelector(`[data-k="${k}"]`);
  const barA = $('a');
  const barB1 = $('b1');
  const barB2 = $('b2');
  const nums = place(el('div', 'abs', node), 100, 720, 1720);
  nums.innerHTML = `
    <div class="say" style="font-size:44px">In my sessions: costs <span class="acc">59</span> tok/turn, saves <span class="acc">224</span> on reads.</div>
    <div class="lead" style="font-size:34px;margin-top:14px">Reads were ~65% of my tokens, so this one is big.</div>
    <div class="note" style="margin-top:30px;font-size:22px">30+ languages, each through its own tree-sitter grammar. The tool itself is a Lua plugin.</div>`;
  const numsParts = [...nums.children];

  return {
    node,
    render(lt) {
      style(node, 1 - prog(lt, 23.2, 0.7, ease.in));
      const srcIn = prog(lt, 0, 0.8, ease.outExpo);
      const gone = prog(lt, OUT_AT, 0.6);
      style(src.node, srcIn * (1 - gone), (1 - srcIn) * -60, 0);
      fadeLines(srcLines, lt, 0.1, 0.018);
      const slide = prog(lt, OUT_AT + 0.2, 0.9, ease.inOutExpo);
      showWords(h1, lt, 0.3, 23.3);
      h1.node.style.left = lerp(SK_X, 96, slide) + 'px';
      showWords(lead, lt, 0.9, 8.8, { stagger: 0.025 });
      showWords(lead2, lt, 9.0, OUT_AT + 0.2, { stagger: 0.025 });
      showWords(lead3, lt, OUT_AT + 0.9, 23.3, { stagger: 0.03 });

      const scan = prog(lt, 2.0, 2.2, ease.inOutSine);
      band.style.top = PANE_HEAD + PRE_PAD + lerp(-3, SRC.length, scan) * SRC_LH + 'px';
      style(band, win(lt, 2.0, 4.3, 0.2, 0.3));
      const scanLine = lerp(-3, SRC.length, scan) + 1.5;
      const reading = prog(lt, 9.2, 0.5);
      srcLines.forEach((l, i) => {
        const keep = kept.has(i);
        let o = scanLine > i && !keep ? lerp(1, 0.32, prog(lt, 2.0 + (i / SRC.length) * 2.2, 0.4)) : 1;
        if (reading > 0) o = lerp(o, i >= 19 ? 1 : 0.22, reading);
        css(l.lastChild, 'opacity', o.toFixed(3));
        css(l.firstChild, 'opacity', o.toFixed(3));
      });
      marks.forEach((m, i) => style(m, kept.has(i) && scanLine > i ? 1 - reading : 0));
      style(readBox, reading);

      style(sk.node, prog(lt, 4.2, 0.6) * (1 - gone), 0, (1 - prog(lt, 4.2, 0.6)) * 20);
      const skAt = i => 4.5 + i * 0.13;
      skLines.forEach((l, i) => {
        const p = prog(lt, skAt(i), 0.4);
        style(l, p, (1 - p) * -16, 0);
      });
      const linkOut = 1 - prog(lt, 8.2, 0.6);
      for (const [i, p] of paths) {
        const d = prog(lt, skAt(i) - 0.05, 0.55, ease.inOut);
        css(p, 'stroke-dashoffset', (1 - d).toFixed(3));
        style(p, d > 0 ? linkOut : 0);
      }

      style(tui.node, prog(lt, 9.0, 0.5) * (1 - gone), 0, (1 - prog(lt, 9.0, 0.5)) * 20);
      style(t1, prog(lt, 9.2, 0.3));
      style(t2, prog(lt, 9.8, 0.3));

      style(bars, prog(lt, OUT_AT + 1.0, 0.5));
      const growA = prog(lt, OUT_AT + 1.2, 1.4, ease.inOutExpo);
      barA.style.width = (BAR_W * growA).toFixed(1) + 'px';
      const growB = prog(lt, OUT_AT + 2.8, 0.9, ease.outExpo);
      barB1.style.width = ((BAR_W * 60) / 1400 * growB).toFixed(1) + 'px';
      barB2.style.width = ((BAR_W * 40) / 1400 * prog(lt, OUT_AT + 3.3, 0.7, ease.outExpo)).toFixed(1) + 'px';
      style($('an'), prog(lt, OUT_AT + 2.2, 0.5));
      style($('bn').parentNode.lastElementChild, prog(lt, OUT_AT + 3.8, 0.5));
      style($('bn'), prog(lt, OUT_AT + 3.3, 0.5));
      numsParts.forEach((p, i) => {
        const a = prog(lt, 16.8 + i * 1.5, 0.7, ease.outExpo);
        style(p, a, 0, (1 - a) * 24);
      });
    },
  };
}

// ---------------------------------------------------------------- 5. code_execution

const SCRIPT = [
  '<span class="cm"># find dead exports in a TS repo</span>',
  'files = <span class="kw">await</span> <span class="fn">glob</span>(pattern=<span class="st">\'src/**/*.ts\'</span>)',
  'srcs = <span class="kw">await</span> asyncio.<span class="fn">gather</span>(',
  '    *[<span class="fn">read</span>(path=f) <span class="kw">for</span> f <span class="kw">in</span> files]',
  ')',
  '',
  'exports, imports = {}, <span class="fn">set</span>()',
  '<span class="kw">for</span> f, src <span class="kw">in</span> <span class="fn">zip</span>(files, srcs):',
  '    <span class="kw">for</span> m <span class="kw">in</span> re.<span class="fn">finditer</span>(<span class="st">r\'^export \\w+ (\\w+)\'</span>, src, re.M):',
  '        exports[m.<span class="fn">group</span>(1)] = f',
  '    <span class="kw">for</span> m <span class="kw">in</span> re.<span class="fn">finditer</span>(<span class="st">r\'import\\s*\\{([^}]+)\\}\'</span>, src):',
  '        imports.<span class="fn">update</span>(n.<span class="fn">strip</span>() <span class="kw">for</span> n <span class="kw">in</span> m.<span class="fn">group</span>(1).<span class="fn">split</span>(<span class="st">\',\'</span>))',
  '',
  '<span class="kw">for</span> name, f <span class="kw">in</span> exports.<span class="fn">items</span>():',
  '    <span class="kw">if</span> name <span class="kw">not in</span> imports:',
  '        <span class="fn">print</span>(<span class="st">f\'{f}  {name}\'</span>)',
];
const OUTPUT = [
  'src/lib/csv.ts       parseCsvLegacy',
  'src/auth/jwt.ts      signV1',
  'src/utils/phone.ts   formatE164',
];

function execScene(ctx, start) {
  const node = scene(ctx.stage);
  const h1 = words(node, 'h1', '<code>code_execution</code>: think inside the sandbox', 96, 124, 1500);
  const lead = words(node, 'lead', 'Tools are async Python functions. Only what the script prints enters your context.', 100, 208, 1500);
  lead.node.style.fontSize = '32px';

  const SCRIPT_Y = 300;
  const script = pane(node, 96, SCRIPT_Y, 1010, PANE_HEAD + PRE_PAD * 2 + SCRIPT.length * CODE_LH, 'script', 'python, runs in monty');
  script.pre.style.lineHeight = CODE_LH + 'px';
  script.pre.style.fontSize = '19.5px';
  const scriptLines = lines(script.pre, SCRIPT);
  const caret = caretFor(script.pre, 19.5);
  caret.style.color = 'var(--t-ink)';

  const BOX = [1190, 300, 634, 400];
  const box = place(el('div', 'abs', node), ...BOX);
  Object.assign(box.style, { borderRadius: '14px', border: '2px dashed var(--ink-3)', background: 'var(--well)' });
  const boxLabel = el('div', 'abs mono', box, 'monty sandbox · capped time + memory');
  Object.assign(boxLabel.style, { left: '20px', top: '14px', fontSize: '19px', color: 'var(--ink-2)' });
  const never = el('div', 'abs', box, '<div class="stat-big" style="font-size:72px">297 files</div><div class="lead" style="font-size:30px">never reached the model</div>');
  Object.assign(never.style, { left: 0, right: 0, top: '130px', textAlign: 'center' });
  const boxCount = el('div', 'abs mono', box, '');
  Object.assign(boxCount.style, { left: '20px', bottom: '14px', fontSize: '19px' });

  const OUT_Y = 760;
  const outPane = pane(node, 1190, OUT_Y, 634, PANE_HEAD + PRE_PAD * 2 + 3 * CODE_LH, 'output', '3 lines · all the model sees');
  outPane.pre.style.lineHeight = CODE_LH + 'px';
  outPane.pre.style.fontSize = '19.5px';
  const outLines = lines(outPane.pre, OUTPUT.map(esc));

  const stat = place(el('div', 'abs', node), 96, 890, 1040);
  stat.innerHTML = `<div style="display:flex;align-items:baseline;gap:26px"><span class="stat-big" style="font-size:80px">~40k</span><span class="mono dim" style="font-size:26px">tokens read</span><span class="acc" style="font-size:60px;font-weight:800">→</span><span class="stat-big acc" style="font-size:80px">~30</span><span class="mono dim" style="font-size:26px">tokens in context</span></div>`;
  const compare = place(el('div', 'abs', node), 96, 330, 1010);
  compare.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px">
      <div><div class="mono dim" style="font-size:24px;margin-bottom:14px">without</div>
        <div class="say" style="font-size:40px;line-height:1.5;color:var(--ink-2)">glob → 300 paths<br>read × 300<br>300 results in context,<br>re-sent every turn</div></div>
      <div><div class="mono acc" style="font-size:24px;margin-bottom:14px">with code_execution</div>
        <div class="say" style="font-size:40px;line-height:1.5">1 script, 1 turn<br>filtered in Python<br>3 lines in context</div></div>
    </div>
    <div class="note" style="margin-top:40px;font-size:22px">it shrinks the result and removes the round-trips, both multipliers at once</div>`;

  // every read is a card: out of the script, into the sandbox; three survive and become the output
  const swarm = el('canvas', 'layer', node);
  const sctx = swarm.getContext('2d');
  let zoom = 1;
  const r = rng(5);
  const N = 300;
  const KEEP = new Map([[41, 0], [150, 1], [233, 2]]);
  const FROM = [96 + 22 + 30 * 11.7, lineY(SCRIPT_Y, 3)];
  const cards = [...Array(N)].map((_, i) => ({
    hx: BOX[0] + 30 + r() * (BOX[2] - 90),
    hy: BOX[1] + 60 + r() * (BOX[3] - 130),
    at: 5.6 + (i / N) * 2.3 + r() * 0.25,
    arc: 20 + r() * 70,
    drift: r() * 6.28,
    fall: 0.4 + r() * 0.8,
    slot: KEEP.get(i) ?? -1,
  }));
  const FILTER = 9.6;
  const TO_OUT = 10.7;

  return {
    node,
    resize(z) { zoom = z; },
    render(lt) {
      style(node, 1 - prog(lt, 22.3, 0.7, ease.in));
      showWords(h1, lt, 0.2, 23);
      showWords(lead, lt, 0.8, 23, { stagger: 0.022 });
      const paneIn = prog(lt, 1.2, 0.6);
      style(script.node, paneIn * (1 - prog(lt, 13.8, 0.6)), 0, (1 - paneIn) * 30);
      typeLines(scriptLines, prog(lt, 1.6, 3.6, ease.linear), caret);

      const boxIn = prog(lt, 4.6, 0.7, ease.outExpo);
      style(box, boxIn, 0, (1 - boxIn) * 30);

      const pw = Math.round(W * zoom * devicePixelRatio);
      const ph = Math.round(H * zoom * devicePixelRatio);
      if (swarm.width !== pw || swarm.height !== ph) {
        swarm.width = pw;
        swarm.height = ph;
      }
      sctx.setTransform(pw / W, 0, 0, ph / H, 0, 0);
      sctx.clearRect(0, 0, W, H);
      const root = getComputedStyle(document.documentElement);
      const inkC = root.getPropertyValue('--ink-3');
      const accC = root.getPropertyValue('--accent');
      const lineC = root.getPropertyValue('--paper');
      let inside = 0;
      if (lt > 5.4 && lt < TO_OUT + 1.6) {
        for (const c of cards) {
          const p = prog(lt, c.at, 1.0, ease.inOutSine);
          if (p <= 0) continue;
          if (p >= 1) inside++;
          let x = lerp(FROM[0], c.hx, p) + Math.sin(lt * 1.3 + c.drift) * 6 * p;
          let y = lerp(FROM[1], c.hy, p) - Math.sin(p * Math.PI) * c.arc + Math.cos(lt * 1.1 + c.drift) * 4 * p;
          let o = Math.min(1, p * 4);
          let color = inkC;
          let w = 30;
          if (c.slot < 0) {
            const f = prog(lt, FILTER + c.fall * 0.8, 0.5, ease.in);
            o *= 1 - f;
            y += f * 40;
          } else if (lt > FILTER) {
            color = accC;
            const lift = prog(lt, FILTER + 0.2, 0.7, ease.inOutExpo);
            const tx = BOX[0] + 60 + c.slot * 190;
            const ty = BOX[1] + BOX[3] - 110;
            x = lerp(x, tx, lift);
            y = lerp(y, ty, lift);
            const go = prog(lt, TO_OUT, 0.8, ease.inOutExpo);
            x = lerp(x, 1190 + 22, go);
            y = lerp(y, lineY(OUT_Y, c.slot) - 11, go);
            w = lerp(30, 420, go);
            o *= 1 - prog(lt, TO_OUT + 0.7, 0.35);
          }
          if (o <= 0.01) continue;
          sctx.globalAlpha = o * 0.9;
          sctx.fillStyle = color;
          sctx.beginPath();
          sctx.roundRect(x, y, w, 22, 3);
          sctx.fill();
          sctx.globalAlpha = o * 0.5;
          sctx.fillStyle = lineC;
          sctx.fillRect(x + 5, y + 6, w * 0.55, 2.5);
          sctx.fillRect(x + 5, y + 13, w * 0.35, 2.5);
        }
        sctx.globalAlpha = 1;
      }
      const tokensIn = (inside / N) * 40;
      text(boxCount, lt < FILTER + 0.3 ? `read × ${inside} · ${tokensIn.toFixed(1)}k tokens, all in here` : 'regex filter · 297 dropped · 3 printed');
      css(boxCount, 'color', lt < FILTER + 0.3 ? 'var(--ink-2)' : 'var(--accent)');

      const nv = prog(lt, TO_OUT + 0.9, 0.7, ease.outExpo);
      style(never, nv, 0, (1 - nv) * 16);
      const outIn = prog(lt, 10.4, 0.5);
      style(outPane.node, outIn, 0, (1 - outIn) * 20);
      fadeLines(outLines, lt, TO_OUT + 0.6, 0.12, 0.4, 0);
      const statIn = prog(lt, 12.2, 0.7, ease.outExpo);
      style(stat, statIn, 0, (1 - statIn) * 24);
      const cmp = prog(lt, 14.4, 0.8, ease.outExpo);
      style(compare, cmp * (1 - prog(lt, 22.2, 0.5)), 0, (1 - cmp) * 24);
    },
  };
}

// ---------------------------------------------------------------- 6. subagents

function taskScene(ctx, start) {
  const node = scene(ctx.stage);
  const h1 = words(node, 'h1', '<code>task</code>: subagents as garbage collectors', 96, 124, 1500);
  const lead = words(node, 'lead', 'A subagent gets its own throwaway context. Only its summary comes back.', 100, 208, 1500);
  lead.node.style.fontSize = '32px';

  const main = pane(node, 96, 320, 800, 520, null, '', 'tui');
  const mainLines = [
    '<span class="user">❯ why do some requests skip auth?</span>',
    '',
    '<span class="dot">●</span> <span class="tool">task&gt;</span> find where auth tokens are checked <span class="ann">weak</span>',
    '',
    '<span class="ann">  ⠋ subagent running…</span>',
  ].map(h => el('span', 'l', main.pre, h || ' '));
  const result = el('span', 'l', main.pre, '<span class="blk">  JWT middleware, <span class="path">src/auth.rs:120</span>\n  skipped for routes under /health</span>');
  const mainAfter = el('span', 'l', main.pre, '\n<span class="pfx">maki&gt;</span> Found it. /health bypasses the middleware…');
  const mainStatus = el('div', 'abs mono', main.node);
  Object.assign(mainStatus.style, { left: '0', right: '0', bottom: '0', padding: '10px 24px 12px', borderTop: '1px solid var(--d-com)', fontSize: '19px', color: 'var(--d-com)', display: 'flex', justifyContent: 'space-between' });
  mainStatus.innerHTML = '<span class="cy" style="font-weight:700">[BUILD]</span><span data-k="ctx">14.2k/200.0k (7%)</span>';

  const sub = pane(node, 1000, 320, 824, 520, null, '', 'tui');
  const subHead = el('div', 'abs mono', sub.node, '<span class="pu" style="font-weight:700">subagent</span> <span class="co">· own context · model tier</span> <span class="or">weak</span>');
  Object.assign(subHead.style, { left: '24px', top: '14px', fontSize: '19px' });
  sub.pre.style.paddingTop = '56px';
  const subSrc = [
    '<span class="dot">●</span> <span class="tool">glob&gt;</span> <span class="path">src/**/*.rs</span> <span class="ann">(212 files)</span>',
    '<span class="dot">●</span> <span class="tool">grep&gt;</span> jwt|bearer|authorize <span class="ann">(×6)</span>',
    '<span class="dot">●</span> <span class="tool">read&gt;</span> <span class="path">src/auth.rs:88-160</span>',
    '<span class="dot">●</span> <span class="tool">read&gt;</span> <span class="path">src/router.rs:1-74</span>',
    '<span class="dot">●</span> <span class="tool">read&gt;</span> <span class="path">src/middleware/mod.rs</span>',
    '<span class="dot">●</span> <span class="tool">index&gt;</span> <span class="path">src/session.rs</span>',
    '<span class="ann">  … 6 more reads, 2 dead ends</span>',
    '',
    '<span class="pfx">maki&gt;</span> JWT middleware, src/auth.rs:120,',
    '      skipped for routes under /health',
  ];
  const subLines = subSrc.map(h => el('span', 'l', sub.pre, h || ' '));
  const subCtx = el('div', 'abs mono', sub.node, '');
  Object.assign(subCtx.style, { right: '24px', bottom: '14px', fontSize: '19px', color: 'var(--d-com)' });

  // garbage collection: every glyph of the subagent drifts off and fades
  const gc = el('canvas', 'abs', node);
  place(gc, 1000, 320, 824, 520);
  const gctx = gc.getContext('2d');
  const gr = rng(3);
  const glyphs = [...Array(420)].map(() => ({ x: gr() * 780 + 20, y: 60 + gr() * 330, vx: (gr() - 0.3) * 140, vy: -40 - gr() * 160, ch: '.:+*#%'[Math.floor(gr() * 6)], d: gr() * 0.5 }));
  let zoom = 1;

  const tiers = place(el('div', 'abs', node), 96, 890, 1728);
  tiers.innerHTML = `<div style="display:flex;gap:14px;align-items:center;white-space:nowrap">
    <span class="lead" style="font-size:30px;margin-right:8px">The model picks a tier for each subagent:</span>
    <span class="chip mono" data-t="0">weak</span><span class="chip mono" data-t="1">medium</span><span class="chip mono" data-t="2">strong</span>
    <span class="lead" style="font-size:30px;margin-left:8px">haiku-tier for grep, opus-tier for architecture.</span></div>`;
  const weak = tiers.querySelector('[data-t="0"]');
  const gcNote = place(el('div', 'abs', node), 1000, 500, 824);
  gcNote.innerHTML = '<div style="text-align:center"><div class="stat-big acc" style="font-size:88px">~20k tokens</div><div class="lead" style="font-size:30px">that your main context never saw</div></div>';

  return {
    node,
    resize(z) { zoom = z; },
    render(lt) {
      style(node, 1 - prog(lt, 16.3, 0.7, ease.in));
      showWords(h1, lt, 0.2, 17);
      showWords(lead, lt, 0.8, 17, { stagger: 0.022 });
      const mIn = prog(lt, 1.0, 0.6);
      style(main.node, mIn, 0, (1 - mIn) * 30);
      mainLines.forEach((l, i) => style(l, prog(lt, 1.3 + i * 0.25, 0.3) * (i === 4 ? 1 - prog(lt, 8.4, 0.3) : 1)));
      const back = prog(lt, 8.6, 0.6, ease.outExpo);
      style(result, back, (1 - back) * 120, 0);
      style(mainAfter, prog(lt, 9.8, 0.4));

      const subIn = prog(lt, 2.4, 0.6, ease.outExpo);
      const collected = prog(lt, 10.2, 0.8, ease.in);
      style(sub.node, subIn * (1 - collected), (1 - subIn) * 60, 0);
      subLines.forEach((l, i) => style(l, prog(lt, 3.0 + i * 0.42, 0.25)));
      const subTok = clamp((lt - 3.0) / 4.6) * 20.4;
      subCtx.innerHTML = `<span class="or">${subTok.toFixed(1)}k</span> tokens in here`;
      const wk = prog(lt, 2.6, 0.4);
      css(weak, 'background', wk > 0.5 ? 'var(--accent)' : 'var(--chip-bg)');
      css(weak, 'color', wk > 0.5 ? 'var(--paper)' : 'var(--chip-fg)');
      style(tiers, prog(lt, 2.4, 0.6));
      const ctxTok = lerp(14.2, 14.6, back);
      mainStatus.lastChild.textContent = `${ctxTok.toFixed(1)}k/200.0k (7%)`;

      const gw = Math.round(824 * zoom * devicePixelRatio);
      const gh = Math.round(520 * zoom * devicePixelRatio);
      if (gc.width !== gw || gc.height !== gh) { gc.width = gw; gc.height = gh; }
      gctx.setTransform(gw / 824, 0, 0, gh / 520, 0, 0);
      gctx.clearRect(0, 0, 824, 520);
      const gp = lt - 10.2;
      if (gp > 0 && gp < 3) {
        gctx.font = '20px "JetBrains Mono"';
        for (const g of glyphs) {
          const tt = Math.max(0, gp - g.d);
          const o = clamp(1 - tt / 1.6) * clamp(gp / 0.3);
          if (o <= 0) continue;
          gctx.globalAlpha = o;
          gctx.fillStyle = tt < 0.2 ? '#f8f8f2' : '#6272a4';
          gctx.fillText(g.ch, g.x + g.vx * tt, g.y + g.vy * tt + 40 * tt * tt);
        }
        gctx.globalAlpha = 1;
      }
      const note = prog(lt, 11.4, 0.8, ease.outExpo);
      style(gcNote, note, 0, (1 - note) * 30);
    },
  };
}

// ---------------------------------------------------------------- 7. the rest

function restScene(ctx, start) {
  const node = scene(ctx.stage);
  const h1 = words(node, 'h1', 'And the smaller tricks add up.', 96, 124, 1500);
  const COL_W = 540;
  const cols = [
    ['tool_search', 'An MCP server with 100 tools puts 100 definitions in every request.', 'maki loads one search tool, then only the matches.'],
    ['batch', 'Independent tool calls go out in one turn.', 'One request, N results. Every round-trip re-sends the context.'],
    ['compaction', 'Long session? Images and thinking go first.', 'Then old turns get summarized, and the multiplier resets.'],
  ].map(([name, a, b], i) => {
    const x = 96 + i * (COL_W + 62);
    const col = place(el('div', 'abs', node), x, 620, COL_W);
    col.innerHTML = `<div class="mono acc" style="font-size:28px;font-weight:600;margin-bottom:14px">${name}</div><div class="say" style="font-size:31px;line-height:1.36">${a}</div><div class="lead" style="font-size:28px;margin-top:10px">${b}</div>`;
    const vis = place(el('div', 'abs', node), x, 280, COL_W, 300);
    return { col, vis };
  });

  // tool_search: a grid of 100 tool definitions folds into one
  const g = el('div', 'abs', cols[0].vis);
  place(g, 0, 0, COL_W, 300);
  const dots = [...Array(100)].map((_, i) => {
    const d = el('div', 'abs', g);
    const cx = (i % 20) * 26 + 14;
    const cy = Math.floor(i / 20) * 26 + 70;
    Object.assign(d.style, { left: cx + 'px', top: cy + 'px', width: '18px', height: '18px', borderRadius: '3px', background: 'var(--ink-3)' });
    d._c = [cx, cy];
    return d;
  });
  const gridCap = el('div', 'abs mono', g, '');
  Object.assign(gridCap.style, { left: '0', top: '0', fontSize: '20px', color: 'var(--ink-3)' });
  const search = el('div', 'abs chip mono', g, 'tool_search');
  Object.assign(search.style, { left: '176px', top: '112px' });
  const hits = ['datadog.query_metrics', 'datadog.get_monitor'].map((n, i) => {
    const c = el('div', 'abs chip mono', g, n);
    Object.assign(c.style, { left: '60px', top: 196 + i * 50 + 'px', fontSize: '19px' });
    return c;
  });

  // batch: four arrows, one request
  const b = el('div', 'abs', cols[1].vis);
  place(b, 0, 0, COL_W, 300);
  b.innerHTML = `<svg width="${COL_W}" height="300" style="overflow:visible">
    ${[0, 1, 2, 3].map(i => `<g data-i="${i}"><rect x="20" y="${30 + i * 64}" width="150" height="44" rx="6" fill="var(--chip-bg)" stroke="var(--chip-border)"/><text x="95" y="${58 + i * 64}" text-anchor="middle" font-family="JetBrains Mono" font-size="19" fill="var(--chip-fg)">${['read a.rs', 'read b.rs', 'grep TODO', 'glob *.md'][i]}</text>
    <path d="M178 ${52 + i * 64} C 260 ${52 + i * 64}, 280 150, 350 150" fill="none" stroke="var(--accent)" stroke-width="2.5" pathLength="1" stroke-dasharray="1 1"/></g>`).join('')}
    <rect data-k="req" x="354" y="118" width="170" height="64" rx="8" fill="var(--accent)"/>
    <text data-k="reqt" x="439" y="158" text-anchor="middle" font-family="Nunito" font-weight="800" font-size="24" fill="var(--paper)">1 request</text>
  </svg>`;
  const bGroups = [...b.querySelectorAll('g')];
  const bReq = [b.querySelector('[data-k="req"]'), b.querySelector('[data-k="reqt"]')];

  // compaction: a tall context bar gets squeezed
  const c = el('div', 'abs', cols[2].vis);
  place(c, 0, 0, COL_W, 300);
  const segs = [
    ['summary of turns 1-30', 'var(--ink-3)'], ['images', 'var(--t-con)'], ['thinking', 'var(--t-kw)'], ['old turns', 'var(--t-ty)'], ['recent turns', 'var(--t-str)'],
  ].map(([label, color], i) => {
    const s = el('div', 'abs', c);
    Object.assign(s.style, { left: '40px', width: '300px', background: color, borderRadius: '4px', overflow: 'hidden', color: '#1e1e2e', fontFamily: 'var(--font-mono)', fontSize: '18px', padding: '0 10px', display: 'flex', alignItems: 'center' });
    s.textContent = label;
    return s;
  });
  const barLabel = el('div', 'abs mono', c, '');
  Object.assign(barLabel.style, { left: '360px', top: '0', fontSize: '20px', color: 'var(--ink-2)' });

  return {
    node,
    render(lt) {
      style(node, 1 - prog(lt, 15.8, 0.7, ease.in));
      showWords(h1, lt, 0.2, 17);
      const BEAT = [0.9, 5.4, 9.9];
      cols.forEach(({ col, vis }, i) => {
        const a = prog(lt, BEAT[i], 0.8, ease.outExpo);
        style(col, a, 0, (1 - a) * 30);
        style(vis, a);
      });
      text(gridCap, lt < 3.6 ? 'an MCP server: 100 tool definitions' : '1 definition, 2 loaded on demand');
      const fold = prog(lt, 3.2, 1.4, ease.inOutExpo);
      dots.forEach((d, i) => {
        const [cx, cy] = d._c;
        style(d, 1 - fold * 0.95, (230 - cx) * fold, (112 - cy) * fold, 1 - fold * 0.6);
      });
      style(search, prog(lt, 4.3, 0.5), 0, 0, 0.8 + 0.2 * prog(lt, 4.3, 0.5, ease.outBack));
      hits.forEach((h, i) => {
        const p = prog(lt, 5.4 + i * 0.35, 0.5, ease.outExpo);
        style(h, p, 0, (1 - p) * -30);
      });

      bGroups.forEach((grp, i) => {
        const p = prog(lt, 6.4 + i * 0.25, 0.6, ease.inOut);
        style(grp, prog(lt, 5.8 + i * 0.12, 0.4));
        css(grp.querySelector('path'), 'stroke-dashoffset', (1 - p).toFixed(3));
      });
      const rq = prog(lt, 7.6, 0.5, ease.outBack);
      for (const e of bReq) style(e, clamp(rq));

      const squeeze = prog(lt, 11.6, 1.6, ease.inOutExpo);
      const heights = [
        lerp(0, 46, squeeze), lerp(52, 0, squeeze), lerp(58, 0, squeeze), lerp(92, 0, squeeze), 56,
      ];
      let y = 20 + lerp(0, 190, squeeze) * 0.5;
      segs.forEach((s, i) => {
        s.style.top = y + 'px';
        s.style.height = heights[i] + 'px';
        s.style.opacity = heights[i] < 6 ? 0 : 1;
        y += heights[i] + (heights[i] > 1 ? 4 : 0);
      });
      style(c, prog(lt, 10.2, 0.5));
      const total = Math.round(lerp(174, 58, squeeze));
      text(barLabel, `${total}k tokens`);
      barLabel.style.top = 20 + lerp(0, 95, squeeze) + 'px';
    },
  };
}

// ---------------------------------------------------------------- 8. benchmark

const BENCH = [
  ['Codex', 66.7, 3.47, '#9d91ff'],
  ['DSH Creator', 63.3, 3.28, '#7cc0f5'],
  ['Claude Code', 63.3, 18.34, '#f5b08c'],
  ['Pi', 60.0, 2.43, '#e6e6e6'],
  ['DSH PTC', 60.0, 4.58, '#7cc0f5'],
  ['DSH Standard', 60.0, 3.46, '#7cc0f5'],
  ['Oh My Pi', 56.7, 4.75, '#f5b083'],
  ['Kimi Code', 56.7, 3.65, '#8fe0cf'],
  ['DSH Minimal', 56.7, 4.72, '#7cc0f5'],
  ['Exo Harness', 53.3, 1.05, '#dddddd'],
  ['OpenCode', 50.0, 3.24, '#b88af0'],
  ['Hermes', 50.0, 2.9, '#b0b0b0'],
];

function benchScene(ctx, start) {
  const node = scene(ctx.stage);
  const h1 = words(node, 'h1', 'Highest pass rate of 13 harnesses.', 96, 124, 1100);
  const lead = words(node, 'lead', 'Second-lowest cost per pass. FrontierHarness Eval v1.0, 30 tasks.', 100, 208, 1100);
  lead.node.style.fontSize = '32px';

  const CH = [210, 300, 1500, 600];
  const [cx, cy, cw, chh] = CH;
  const xOf = cost => cx + ((Math.log10(cost) - Math.log10(0.9)) / (Math.log10(22) - Math.log10(0.9))) * cw;
  const yOf = pct => cy + chh - ((pct - 48) / (72 - 48)) * chh;
  let svg = `<svg width="${W}" height="${H}" style="position:absolute;inset:0;overflow:visible">`;
  svg += '<g data-k="grid">';
  for (const c of [1, 2, 5, 10, 20]) svg += `<line x1="${xOf(c)}" y1="${cy}" x2="${xOf(c)}" y2="${cy + chh}" stroke="var(--rule)" stroke-dasharray="5 6"/><text x="${xOf(c)}" y="${cy + chh + 40}" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="var(--ink-3)">$${c}</text>`;
  for (const p of [50, 55, 60, 65, 70]) svg += `<line x1="${cx}" y1="${yOf(p)}" x2="${cx + cw}" y2="${yOf(p)}" stroke="var(--rule)" stroke-dasharray="5 6"/><text x="${cx - 20}" y="${yOf(p) + 8}" text-anchor="end" font-family="JetBrains Mono" font-size="22" fill="var(--ink-3)">${p}%</text>`;
  svg += `<text x="${cx + cw / 2}" y="${cy + chh + 86}" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="var(--ink-2)">cost per pass (log scale)</text>`;
  svg += `<text x="${cx - 110}" y="${cy + chh / 2}" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="var(--ink-2)" transform="rotate(-90 ${cx - 110} ${cy + chh / 2})">pass rate</text>`;
  svg += '</g>';
  BENCH.forEach(([name, pct, cost, color], i) => {
    const x = xOf(cost);
    const y = yOf(pct);
    const left = ['DSH Creator', 'Claude Code', 'Pi', 'Kimi Code', 'Hermes'].includes(name);
    const dy = { 'DSH Standard': 34, 'DSH Minimal': 38, 'Oh My Pi': -14 }[name] ?? 7;
    const tone = `color-mix(in oklch, ${color}, var(--ink) var(--pt-mix))`;
    svg += `<g data-p="${i}"><circle cx="${x}" cy="${y}" r="9" style="fill:${tone}"/><text x="${x + (left ? -18 : 18)}" y="${y + dy}" text-anchor="${left ? 'end' : 'start'}" font-family="Nunito" font-weight="700" font-size="21" style="fill:${tone}">${name} <tspan font-family="JetBrains Mono" font-weight="400" font-size="17" fill="var(--ink-3)">${pct}% · $${cost.toFixed(2)}</tspan></text></g>`;
  });
  const mx = xOf(2.06);
  const my = yOf(70);
  svg += `<g data-k="maki"><circle data-k="ring" cx="${mx}" cy="${my}" r="30" fill="oklch(75% 0.12 45 / 0.14)" stroke="var(--accent)" stroke-width="2"/>
    <path d="M${mx} ${my - 16} L${mx + 4.7} ${my - 5.2} L${mx + 16} ${my - 4.9} L${mx + 7.2} ${my + 2.4} L${mx + 10.2} ${my + 13.6} L${mx} ${my + 7.2} L${mx - 10.2} ${my + 13.6} L${mx - 7.2} ${my + 2.4} L${mx - 16} ${my - 4.9} L${mx - 4.7} ${my - 5.2}Z" fill="var(--accent)"/>
    <text x="${mx + 48}" y="${my - 4}" font-family="Nunito" font-weight="800" font-size="34" fill="var(--accent)">maki 0.5.5</text>
    <text x="${mx + 48}" y="${my + 30}" font-family="JetBrains Mono" font-size="22" fill="var(--ink)">70.0% · $2.06 per pass</text></g>`;
  svg += '</svg>';
  const chart = el('div', 'layer', node, svg);
  const grid = chart.querySelector('[data-k="grid"]');
  const points = [...chart.querySelectorAll('[data-p]')];
  const maki = chart.querySelector('[data-k="maki"]');
  const ring = chart.querySelector('[data-k="ring"]');
  const foot = place(el('div', 'abs note', node, 'cost per pass = model cost across all 30 tasks, failures included / tasks passed · source: frontierharness.org, report.zip in the v0.5.5 release'), 96, 1024, 1700);
  foot.style.fontSize = '17px';

  return {
    node,
    render(lt) {
      style(node, 1 - prog(lt, 14.8, 0.7, ease.in));
      showWords(h1, lt, 5.0, 16);
      showWords(lead, lt, 5.8, 16, { stagger: 0.022 });
      style(grid, prog(lt, 0.2, 0.8));
      points.forEach((p, i) => {
        const a = prog(lt, 0.9 + i * 0.16, 0.5, ease.outExpo);
        style(p, a, 0, (1 - a) * -30);
      });
      const m = prog(lt, 3.4, 0.9, ease.outBack);
      style(maki, clamp(m * 1.4), 0, (1 - clamp(m)) * -80);
      const pulse = (lt - 4.2) % 2.2;
      ring.setAttribute('r', 22 + (lt > 4.2 ? pulse * 12 : 8));
      ring.style.opacity = lt > 4.2 ? String(clamp(1 - pulse / 2.2)) : '1';
      style(foot, prog(lt, 1.2, 0.8));
    },
  };
}

// ---------------------------------------------------------------- 9. lua

const PLUGINS = ['bash', 'batch', 'code_execution', 'completion', 'edit', 'glob', 'grep', 'index', 'list', 'memory', 'question', 'read', 'sessions', 'skill', 'task', 'thinking', 'todo_write', 'view_image', 'webfetch', 'websearch', 'write'];
const NVIM_MAP = [
  ['vim.fs', 'maki.fs'],
  ['vim.uv', 'maki.uv'],
  ['vim.keymap', 'maki.keymap'],
  ['vim.treesitter', 'maki.treesitter'],
  ['vim.fn.jobstart', 'maki.fn.jobstart'],
  ['nvim_create_autocmd', 'maki.api.create_autocmd'],
];
const CI_TOOL = [
  '<span class="fn">maki.api.register_tool</span>({',
  '  name = <span class="st">"ci_status"</span>,',
  '  description = <span class="st">"Latest CI run for this branch"</span>,',
  '  schema = { type = <span class="st">"object"</span>, properties = {} },',
  '  handler = <span class="kw">function</span>()',
  '    <span class="kw">local</span> res, err = <span class="fn">maki.net.request</span>(',
  '      <span class="st">"https://ci.internal/runs/json?branch=main"</span>)',
  '    <span class="kw">if</span> err <span class="kw">then</span>',
  '      <span class="kw">return</span> { llm_output = err, is_error = <span class="kw">true</span> }',
  '    <span class="kw">end</span>',
  '    <span class="kw">local</span> buf = <span class="fn">maki.ui.buf</span>()',
  '    <span class="fn">buf:lines</span>(<span class="fn">maki.ui.highlight</span>(res.body, <span class="st">"json"</span>))',
  '    <span class="kw">return</span> { llm_output = res.body, body = buf }',
  '  <span class="kw">end</span>,',
  '})',
];
const SCRAMBLE = '!<>-_\\/[]{}=+*^?#abcdefghijklmnopqrstuvwxyz';
const DOOM_CLIPS = [['doom-av1.mp4', 'video/mp4; codecs=av01.0.04M.08'], ['doom.mp4', 'video/mp4']];

function luaScene(ctx, start) {
  const node = scene(ctx.stage);
  const h1 = words(node, 'h1', 'Hackable all the way down.', 96, 124, 1500);
  const lead = words(node, 'lead', 'Every built-in tool is a Lua plugin. <code>read</code>, <code>bash</code>, <code>edit</code>, even <code>batch</code>.', 100, 208, 1500);
  lead.node.style.fontSize = '32px';

  const tree = place(el('div', 'abs', node), 100, 310, 1700);
  tree.innerHTML = `<div class="mono dim" style="font-size:24px;margin-bottom:18px">./plugins/</div>`;
  const chips = el('div', '', tree);
  Object.assign(chips.style, { display: 'flex', flexWrap: 'wrap', gap: '14px', maxWidth: '1500px' });
  const pChips = PLUGINS.map(p => {
    const c = el('span', 'chip mono', chips, p + '/');
    Object.assign(c.style, { fontSize: '28px', padding: '10px 22px' });
    return c;
  });
  chips.style.maxWidth = '1720px';
  const treeNote = el('div', 'lead', tree, 'Read them, then copy one to start your own. Your plugins get the same API.');
  Object.assign(treeNote.style, { fontSize: '30px', marginTop: '26px' });

  const h1b = words(node, 'h1', 'The API mirrors Neovim.', 96, 124, 1500);
  const leadb = words(node, 'lead', 'If you have written a Neovim plugin, you already know most of it.', 100, 208, 1500);
  leadb.node.style.fontSize = '32px';
  const map = place(el('div', 'abs', node), 100, 320, 1720);
  const rows = NVIM_MAP.map(([from, to]) => {
    const row = el('div', '', map);
    Object.assign(row.style, { display: 'grid', gridTemplateColumns: '560px 120px 1fr', alignItems: 'baseline', fontFamily: 'var(--font-mono)', fontSize: '40px', lineHeight: '1.75' });
    const a = el('span', 'dim', row, from);
    a.style.textAlign = 'right';
    const arrow = el('span', 'acc', row, '→');
    arrow.style.textAlign = 'center';
    const b = el('span', '', row, '');
    return { row, a, arrow, b, to };
  });

  const h1c = words(node, 'h1', 'Give the model a new tool in 15 lines.', 96, 124, 1500);
  const leadc = words(node, 'lead', 'Save it in <code>~/.config/maki/lua/</code>, <code>require</code> it from <code>init.lua</code>, <code>/reload</code>. The model can call it.', 100, 208, 1720);
  leadc.node.style.fontSize = '32px';
  const code = pane(node, 96, 300, 1010, PANE_HEAD + PRE_PAD * 2 + CI_TOOL.length * CODE_LH, 'lua/ci_status.lua', 'Luau');
  code.pre.style.lineHeight = CODE_LH + 'px';
  code.pre.style.fontSize = '19.5px';
  const codeLines = lines(code.pre, CI_TOOL);
  const caret = caretFor(code.pre, 19.5);
  caret.style.color = 'var(--t-ink)';
  const run = pane(node, 1150, 300, 674, 520, null, '', 'tui');
  const runLines = [
    '<span class="user">❯ is main green?</span>',
    '',
    '<span class="dot">●</span> <span class="tool">ci_status&gt;</span>',
    '<span class="blk">{</span>',
    '<span class="blk">  <span class="cy">"branch"</span>: <span class="ye">"main"</span>,</span>',
    '<span class="blk">  <span class="cy">"status"</span>: <span class="ye">"failed"</span>,</span>',
    '<span class="blk">  <span class="cy">"job"</span>: <span class="ye">"test (ubuntu)"</span>,</span>',
    '<span class="blk">  <span class="cy">"duration_s"</span>: <span class="pu">412</span></span>',
    '<span class="blk">}</span>',
    '',
    '<span class="pfx">maki&gt;</span> No. <span class="code">test (ubuntu)</span> failed on main.',
  ].map(h => el('span', 'l', run.pre, h || ' '));

  const doomLine = words(node, 'h1', 'And yes... it can even run DOOM.', 96, 116, 1500);
  const doomSub = words(node, 'lead', 'A Lua plugin, drawing into a maki window with half-block cells.', 100, 196, 1500);
  doomSub.node.style.fontSize = '30px';
  const DOOM = [180, 262, 1560, 788];
  const doomBox = place(el('div', 'abs', node), ...DOOM);
  Object.assign(doomBox.style, { borderRadius: '10px', overflow: 'hidden', boxShadow: 'var(--pane-shadow)', background: '#16171F' });
  const video = el('video', '', doomBox);
  video.muted = true;
  video.playsInline = true;
  Object.assign(video.style, { width: '100%', height: '100%', display: 'block', objectFit: 'cover' });

  const DOOM_AT = 24.6;
  const CLIP_FROM = 7.8;
  let playing = false;
  let loading = null;
  const clipTime = lt => CLIP_FROM + Math.max(0, lt - DOOM_AT);
  // fetched whole once the chapter starts: a blob seeks frame-exactly from any host
  const load = () => (loading ??= (async () => {
    const [file] = DOOM_CLIPS.find(([, type]) => video.canPlayType(type)) ?? DOOM_CLIPS[DOOM_CLIPS.length - 1];
    const res = await fetch(ctx.assets + file);
    video.src = URL.createObjectURL(await res.blob());
    await new Promise(r => video.addEventListener('loadeddata', r, { once: true }));
  })().catch(() => {}));
  const vctl = {
    setPlaying(on) { playing = on; if (!on) video.pause(); },
    setSpeed(rate) { video.defaultPlaybackRate = video.playbackRate = rate; },
    async prepare(t) {
      const lt = t - s.start;
      if (lt < DOOM_AT - 1 || lt > s.end - s.start) return;
      await load();
      video.pause();
      const target = clipTime(lt);
      if (Math.abs(video.currentTime - target) < 0.001) return;
      await new Promise(r => {
        video.addEventListener('seeked', r, { once: true });
        video.currentTime = target;
      });
    },
  };

  const s = {
    node,
    videos: [vctl],
    render(lt) {
      if (!ctx.exporting) load();
      style(node, 1 - prog(lt, 32.3, 0.7, ease.in));
      showWords(h1, lt, 0.2, 7.2);
      showWords(lead, lt, 0.8, 7.2, { stagger: 0.025 });
      style(tree, 1 - prog(lt, 6.8, 0.4));
      pChips.forEach((c, i) => {
        const p = prog(lt, 1.6 + i * 0.07, 0.5, ease.outBack);
        style(c, clamp(p), 0, (1 - clamp(p)) * 24);
      });
      style(treeNote, prog(lt, 4.0, 0.6));

      showWords(h1b, lt, 7.4, 14.4);
      showWords(leadb, lt, 8.0, 14.4, { stagger: 0.025 });
      style(map, 1 - prog(lt, 14.0, 0.4));
      rows.forEach(({ row, a, arrow, b, to }, i) => {
        const at = 8.6 + i * 0.55;
        const p = prog(lt, at, 0.5, ease.outExpo);
        style(row, p, 0, (1 - p) * 18);
        style(arrow, prog(lt, at + 0.3, 0.3));
        const decode = clamp((lt - at - 0.45) / 0.7);
        const shown = Math.floor(decode * to.length);
        let str = to.slice(0, shown);
        if (decode > 0 && decode < 1) {
          for (let k = shown; k < Math.min(to.length, shown + 4); k++) str += SCRAMBLE[Math.floor((lt * 40 + k * 7 + i * 3) % SCRAMBLE.length)];
        }
        text(b, str);
        css(b, 'color', decode >= 1 ? 'var(--accent)' : 'var(--ink-2)');
      });

      showWords(h1c, lt, 14.6, 24.2);
      showWords(leadc, lt, 15.2, 24.2, { stagger: 0.025 });
      const cIn = prog(lt, 15.4, 0.6);
      style(code.node, cIn * (1 - prog(lt, 23.8, 0.4)), 0, (1 - cIn) * 30);
      typeLines(codeLines, prog(lt, 15.8, 3.6, ease.linear), caret);
      const rIn = prog(lt, 19.6, 0.6);
      style(run.node, rIn * (1 - prog(lt, 23.8, 0.4)), (1 - rIn) * 40, 0);
      runLines.forEach((l, i) => style(l, prog(lt, 19.9 + (i < 3 ? i * 0.3 : 1.2 + i * 0.12), 0.3)));

      showWords(doomLine, lt, DOOM_AT - 0.2, 33.4, { stagger: 0.05 });
      showWords(doomSub, lt, DOOM_AT + 0.8, 33.4, { stagger: 0.025 });
      const dIn = prog(lt, DOOM_AT, 0.9, ease.outExpo);
      style(doomBox, dIn, 0, (1 - dIn) * 60, 0.94 + 0.06 * dIn);
      if (!ctx.exporting) {
        const want = clipTime(lt);
        if (lt >= DOOM_AT - 0.5) {
          if (Math.abs(video.currentTime - want) > 0.25) video.currentTime = want;
          if (playing && video.paused) video.play().catch(() => {});
          if (!playing && !video.paused) video.pause();
        } else if (!video.paused) video.pause();
      }
    },
  };
  return s;
}

// ---------------------------------------------------------------- 10. permissions

function permScene(ctx, start) {
  const node = scene(ctx.stage);
  const h1 = words(node, 'h1', 'Permissions that read the whole command.', 96, 124, 1500);
  const lead = words(node, 'lead', 'Bash is parsed with tree-sitter, so maki knows what is actually being run.', 100, 208, 1500);
  lead.node.style.fontSize = '32px';

  const cmdBox = place(el('div', 'abs', node), 96, 310, 1728);
  cmdBox.innerHTML = '<div class="mono" style="font-size:52px;color:var(--ink)"><span class="acc">$</span> <span data-k="c1">git diff</span> <span class="dim">&amp;&amp;</span> <span data-k="c2">rm -rf /</span></div>';
  const c1 = cmdBox.querySelector('[data-k="c1"]');
  const c2 = cmdBox.querySelector('[data-k="c2"]');

  // the tree-sitter-bash tree for the line above
  const T = [
    ['program', 860, 470],
    ['list', 860, 560],
    ['command', 520, 660],
    ['&&', 860, 660],
    ['command', 1200, 660],
    ['command_name: git', 400, 760],
    ['argument: diff', 660, 760],
    ['command_name: rm', 1080, 760],
    ['arguments: -rf /', 1360, 760],
  ];
  const E = [[0, 1], [1, 2], [1, 3], [1, 4], [2, 5], [2, 6], [4, 7], [4, 8]];
  let svg = `<svg width="${W}" height="${H}" style="position:absolute;inset:0;overflow:visible">`;
  E.forEach(([a, b], i) => {
    svg += `<path data-e="${i}" d="M${T[a][1]} ${T[a][2] + 22} C ${T[a][1]} ${T[a][2] + 60}, ${T[b][1]} ${T[b][2] - 60}, ${T[b][1]} ${T[b][2] - 22}" fill="none" stroke="var(--ink-3)" stroke-width="2" pathLength="1" stroke-dasharray="1 1"/>`;
  });
  svg += '</svg>';
  const treeSvg = el('div', 'layer', node, svg);
  const edges = [...treeSvg.querySelectorAll('path')];
  const nodes = T.map(([label, x, y], i) => {
    const n = el('div', 'abs mono', node, esc(label));
    const leaf = i >= 5;
    Object.assign(n.style, {
      left: x + 'px', top: y + 'px', transform: 'translate(-50%, -50%)', fontSize: '24px', padding: '6px 16px', borderRadius: '6px',
      background: leaf ? 'var(--pane-bg)' : 'var(--chip-bg)', color: leaf ? 'var(--t-ink)' : 'var(--ink-2)', border: '1px solid ' + (leaf ? 'var(--pane-line)' : 'var(--chip-border)'), whiteSpace: 'nowrap',
    });
    n._leaf = leaf;
    return n;
  });

  const verdict = place(el('div', 'abs', node), 96, 850, 1728);
  verdict.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:60px">
    <div><div class="mono dim" style="font-size:22px">most agents</div><div class="say" style="font-size:40px">only see <span class="mono" style="font-size:36px">git&nbsp;*</span></div></div>
    <div><div class="mono acc" style="font-size:22px">maki</div><div class="say" style="font-size:40px">checks <span class="mono" style="font-size:36px">git&nbsp;*</span> and <span class="mono acc" style="font-size:36px">rm&nbsp;*</span> on their own</div></div>
  </div>`;
  const vParts = [...verdict.firstChild.children];

  const prompt = place(el('div', 'tui', node), 1060, 320, 764, 0);
  prompt.innerHTML = `<pre style="font-size:22px;line-height:1.5;padding:22px 26px"><span class="or" style="font-weight:700">bash&gt;</span> rm -rf /  <span class="co">needs permission</span>
<span class="gr" style="font-weight:700">y</span> <span class="co">once</span>  <span class="gr" style="font-weight:700">s</span> <span class="co">session</span>  <span class="gr" style="font-weight:700">a</span> <span class="co">always here</span>  <span class="re" style="font-weight:700">n</span> <span class="co">deny, say why</span></pre>`;
  prompt.style.height = 'auto';
  const handles = place(el('div', 'abs note', node, 'also handles pipes, subshells and command substitution · per-tool allow/deny rules · --yolo skips it all'), 96, 1010, 1700);
  handles.style.fontSize = '19px';

  return {
    node,
    render(lt) {
      style(node, 1 - prog(lt, 12.8, 0.7, ease.in));
      showWords(h1, lt, 0.2, 14);
      showWords(lead, lt, 0.8, 14, { stagger: 0.022 });
      const cin = prog(lt, 1.2, 0.6, ease.outExpo);
      style(cmdBox, cin, 0, (1 - cin) * 20);
      const lit = prog(lt, 4.6, 0.5);
      css(c1, 'color', lit > 0.5 ? 'var(--good)' : 'var(--ink)');
      css(c2, 'color', lit > 0.5 ? 'var(--accent)' : 'var(--ink)');
      const treeOut = 1;
      edges.forEach((e, i) => {
        const p = prog(lt, 2.2 + i * 0.12, 0.5, ease.inOut);
        css(e, 'stroke-dashoffset', (1 - p).toFixed(3));
        style(e, (p > 0 ? 1 : 0) * treeOut);
      });
      nodes.forEach((n, i) => {
        const p = prog(lt, 2.0 + i * 0.13, 0.4, ease.outExpo);
        n.style.opacity = p * treeOut;
        n.style.transform = `translate(-50%, calc(-50% + ${(1 - p) * 14}px))`;
        if (n._leaf && i === 7) css(n, 'border-color', lit > 0.5 ? 'var(--accent)' : 'var(--pane-line)');
        if (n._leaf && i === 5) css(n, 'border-color', lit > 0.5 ? 'var(--good)' : 'var(--pane-line)');
      });
      vParts.forEach((v, i) => {
        const p = prog(lt, 5.0 + i * 1.3, 0.7, ease.outExpo);
        style(v, p, 0, (1 - p) * 24);
      });
      const pr = prog(lt, 8.0, 0.6, ease.outExpo);
      style(prompt, pr, 0, (1 - pr) * 30);
      style(handles, prog(lt, 8.8, 0.6));
    },
  };
}

// ---------------------------------------------------------------- 11. nothing hidden

function detailScene(ctx, start) {
  const node = scene(ctx.stage);
  const h1 = words(node, 'h1', 'Nothing hidden.', 96, 124, 1500);
  const lead = words(node, 'lead', 'Token count, cost and model always sit in the status bar. Native Rust, 60 FPS, no JavaScript runtime.', 100, 208, 1720);
  lead.node.style.fontSize = '32px';

  const bar = place(el('div', 'tui', node), 96, 360, 1728, 0);
  bar.style.height = 'auto';
  bar.innerHTML = `<pre style="font-size:30px;line-height:1.6;padding:22px 32px;overflow:hidden"><span class="co">${'─'.repeat(120)}</span>
<span class="co">❯</span> <span class="co">Queue another prompt...</span>
<span class="co">${'─'.repeat(120)}</span>
<span class="ye">⠋</span> <span class="cy" style="font-weight:700">[BUILD]</span>   <span class="co">~/code/api:main</span>  <span data-k="model" class="co">deepseek/deepseek-flash</span>  <span data-k="tok">22.1k/200.0k (11%)</span> <span data-k="cost">$0.019</span></pre>`;
  const tok = bar.querySelector('[data-k="tok"]');
  const cost = bar.querySelector('[data-k="cost"]');
  const model = bar.querySelector('[data-k="model"]');
  const callouts = [['context used', tok], ['what it cost', cost], ['which model', model]].map(([label]) => {
    const c = el('div', 'abs mono acc', node, '↑ ' + label);
    c.style.fontSize = '24px';
    return c;
  });

  const also = place(el('div', 'abs', node), 96, 780, 1728);
  also.innerHTML = '<div class="mono dim" style="font-size:22px;margin-bottom:16px">also in there</div>';
  const alsoLabel = also.firstChild;
  const list = el('div', '', also);
  Object.assign(list.style, { display: 'flex', flexWrap: 'wrap', gap: '14px' });
  const items = ['/tasks: a window per subagent', 'Ctrl-F fuzzy search', '/btw side questions', 'Esc Esc rewind', 'plan mode', 'long-term memory', 'MCP over stdio or HTTP', 'skills', 'ACP for Zed', '--print headless', 'OpenTelemetry', '26 themes', 'image paste', '! and !! shell'].map(x => el('span', 'chip', list, esc(x)));

  return {
    node,
    render(lt) {
      style(node, 1 - prog(lt, 10.3, 0.7, ease.in));
      showWords(h1, lt, 0.2, 12);
      showWords(lead, lt, 0.7, 12, { stagger: 0.02 });
      const bIn = prog(lt, 1.2, 0.7, ease.outExpo);
      style(bar, bIn, 0, (1 - bIn) * 30);
      const grow = clamp((lt - 1.6) / 4);
      text(tok, `${(22.1 + grow * 9.3).toFixed(1)}k/200.0k (${Math.round(11 + grow * 5)}%)`);
      text(cost, `$${(0.019 + grow * 0.008).toFixed(3)}`);
      callouts.forEach((c, i) => {
        const target = [tok, cost, model][i];
        const p = prog(lt, 2.0 + i * 0.4, 0.5, ease.outExpo);
        c.style.left = 96 + target.offsetLeft + 'px';
        c.style.top = 360 + bar.offsetHeight + 12 + 'px';
        style(c, p, 0, (1 - p) * 16);
      });
      style(alsoLabel, prog(lt, 4.2, 0.4));
      items.forEach((it, i) => {
        const p = prog(lt, 4.4 + i * 0.12, 0.5, ease.outBack);
        style(it, clamp(p), 0, (1 - clamp(p)) * 20);
      });
    },
  };
}

// ---------------------------------------------------------------- 12. providers

const PROVIDERS = ['Anthropic', 'OpenAI', 'xAI', 'Google', 'Copilot', 'Ollama', 'llama.cpp', 'Mistral', 'Z.AI', 'DeepSeek', 'OpenRouter', 'Requesty', 'Synthetic', 'Regolo', 'TensorX', 'OpenCode Zen', 'OpenCode Go', 'Aperture'];

function providerScene(ctx, start) {
  const node = scene(ctx.stage);
  const h1 = words(node, 'h1', 'Bring your own model. Local ones too.', 96, 124, 1500);
  const lead = words(node, 'lead', 'Set an API key env var, or <code>maki auth login openai</code> for OAuth.', 100, 208, 1500);
  lead.node.style.fontSize = '32px';
  const wrap = place(el('div', 'abs', node), 96, 330, 1728);
  Object.assign(wrap.style, { display: 'flex', flexWrap: 'wrap', gap: '18px' });
  const chips = PROVIDERS.map(p => {
    const c = el('span', 'chip', wrap, p);
    c.style.fontSize = '32px';
    c.style.padding = '10px 26px';
    if (p === 'Ollama' || p === 'llama.cpp') c.style.borderColor = 'var(--accent)';
    return c;
  });
  const plus = place(el('div', 'abs', node), 96, 700, 1500);
  plus.innerHTML = `<div class="say" style="font-size:38px">Anything that speaks the OpenAI or Anthropic API works too.</div>
    <div class="lead" style="font-size:30px;margin-top:12px">Or drop an executable in <code>~/.config/maki/providers/</code> for a custom provider or proxy.</div>`;
  return {
    node,
    render(lt) {
      style(node, 1 - prog(lt, 9.8, 0.7, ease.in));
      showWords(h1, lt, 0.2, 11);
      showWords(lead, lt, 0.8, 11, { stagger: 0.025 });
      chips.forEach((c, i) => {
        const p = prog(lt, 1.2 + i * 0.09, 0.55, ease.outBack);
        style(c, clamp(p), 0, (1 - clamp(p)) * 30);
      });
      const pl = prog(lt, 3.8, 0.8, ease.outExpo);
      style(plus, pl, 0, (1 - pl) * 24);
    },
  };
}

// ---------------------------------------------------------------- 13. outro

function outroScene(ctx, start) {
  const node = scene(ctx.stage);
  const mark = words(node, '', '<span style="font-weight:800;font-size:170px;letter-spacing:-0.03em;line-height:1">maki</span>', 0, 250, W);
  mark.node.style.textAlign = 'center';
  const tag = words(node, 'lead', 'the efficient coder', 0, 440, W);
  Object.assign(tag.node.style, { textAlign: 'center', fontSize: '46px' });
  const install = place(el('div', 'abs', node), 0, 560, W);
  install.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:22px">
    <div class="mono" data-k="a" style="font-size:40px;padding:18px 34px;border-radius:10px;background:var(--pane-bg);color:#DDE0EA;box-shadow:var(--pane-shadow)"><span style="color:#F7A87D">$</span> curl -fsSL https://maki.sh/install.sh | sh</div>
    <div class="mono" data-k="b" style="font-size:28px;color:var(--ink-2)"><span class="acc">$</span> nix run github:tontinton/maki</div>
    <div data-k="c" style="font-size:30px;font-weight:700;margin-top:18px"><span class="acc">maki.sh</span> <span class="dim">·</span> github.com/tontinton/maki</div>
  </div>`;
  const parts = ['a', 'b', 'c'].map(k => install.querySelector(`[data-k="${k}"]`));
  const hint = place(el('div', 'abs mono', node, '<kbd>g</kbd> to watch again · <kbd>j</kbd> <kbd>k</kbd> to jump between chapters'), 0, 880, W);
  Object.assign(hint.style, { textAlign: 'center', fontSize: '22px', color: 'var(--ink-3)' });
  hint.querySelectorAll('kbd').forEach(k => (k.style.fontSize = '18px'));
  if (ctx.exporting) hint.remove();
  return {
    node,
    render(lt) {
      style(hint, prog(lt, 5, 1));
      showWords(mark, lt, 1.0, 99, { stagger: 0.06, dur: 1 });
      showWords(tag, lt, 1.5, 99, { stagger: 0.05 });
      parts.forEach((p, i) => {
        const a = prog(lt, 2.4 + i * 0.6, 0.8, ease.outExpo);
        style(p, a, 0, (1 - a) * 24);
      });
    },
  };
}
