// A port of maki-ui/src/splash.rs, drawn onto a character grid: 96x27 for the
// wide film, 60 columns for the tall one. Same wave layers, vignette, symbol
// ramp and fade timings.

import { clamp, ease } from './lib.js';

const CHROME_ROWS = 4;

const BG = [0x28, 0x2a, 0x36];
const FG = [0xf8, 0xf8, 0xf2];
const ACCENT = [0x8b, 0xe9, 0xfd];
const TIP = [0xf1, 0xfa, 0x8c];
const DIM = [0x62, 0x72, 0xa4];
const PINK = [0xff, 0x79, 0xc6];
const GREEN = [0x50, 0xfa, 0x7b];
const RED = [0xff, 0x55, 0x55];

const FIELD_SYMS = [' ', '.', ':', '+', '*'];
const FIELD_CHAR_MAX = FIELD_SYMS.length - 1;
const WAVE_LAYERS = 3;
const INTENSITY_SCALE = 0.3;
const VIGNETTE_SCALE = 0.25;
const FIELD_BASE_OPACITY = 0.5;
const FADE_DURATION = 1.6;
const LOGO_DELAY = 0.2;
const LOGO_RAMP = 0.8;
const LOGO_ALPHA = 0.85;
const LOGO_BLUE_LIFT = 15;
const ACCENT_ALPHA = 0.75;
const MUTED_ALPHA = 0.5;
const VERSION_ALPHA = 0.4;
const FIELD_OFFSET = 4127.3;

const VERSION = 'v0.5.6';
const TAGLINE = 'the efficient coder';
const TIP_LABEL = '/btw';
const TIP_DESC = 'to ask something without interrupting the session';
const PLACEHOLDER_HEAD = 'Ask maki to ';
const PLACEHOLDER_HINT = 'fix a bug';
const STATUS_MODE = ' [BUILD]';
const STATUS_CWD = '~/code/wc:main';
const STATUS_MODEL = 'anthropic/claude-opus-5';
const STATUS_CONTEXT = '0/200.0k (0%)';
const CWD_MODEL_SEPARATOR = '  ';
const TRUNCATE_PREFIX = '..';

// status_bar.rs: on a narrow terminal the model gets up to half the free
// columns and the cwd the rest, each losing its head behind `..`
function truncateTail(s, max) {
  if (s.length <= max) return s;
  return TRUNCATE_PREFIX + s.slice(s.length - Math.max(0, max - TRUNCATE_PREFIX.length));
}

export function statusRight(cols, left, cwd, model, rest) {
  const available = Math.max(0, cols - left.length - rest.length - CWD_MODEL_SEPARATOR.length);
  const shortModel = truncateTail(model, Math.floor(available / 2));
  return truncateTail(cwd, available - shortModel.length) + CWD_MODEL_SEPARATOR + shortModel + rest;
}

const mix = (a, b, t) => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t));
const hex = c => `rgb(${c[0]},${c[1]},${c[2]})`;

export class Terminal {
  constructor(canvas, cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.w = 0;
    this.h = 0;
    this.lut = [1, 2, 3, 4].map(idx => {
      const t = FIELD_BASE_OPACITY + (idx / FIELD_CHAR_MAX) * (1 - FIELD_BASE_OPACITY);
      return hex([
        Math.round(BG[0] + (ACCENT[0] - BG[0]) * t * 0.25),
        Math.round(BG[1] + (ACCENT[1] - BG[1]) * t * 0.175),
        Math.round(BG[2] + (ACCENT[2] - BG[2]) * t * 0.325),
      ]);
    });
    this.buckets = this.lut.map(() => []);
  }

  resize(cssW, cssH, pixelRatio) {
    const w = Math.max(1, Math.round(cssW * pixelRatio));
    const h = Math.max(1, Math.round(cssH * pixelRatio));
    if (w === this.w && h === this.h) return;
    this.canvas.width = this.w = w;
    this.canvas.height = this.h = h;
  }

  // prompt: characters of `maki` typed at the shell, -1 once the app is up
  draw(splashT, typed) {
    const { ctx, w, h, cols, rows } = this;
    const cw = w / cols;
    const ch = h / rows;
    this.cw = cw;
    this.ch = ch;
    ctx.fillStyle = hex(BG);
    ctx.fillRect(0, 0, w, h);
    ctx.textBaseline = 'middle';
    this.font = `${(cw / 0.6).toFixed(2)}px "JetBrains Mono"`;
    this.bold = `700 ${(cw / 0.6).toFixed(2)}px "JetBrains Mono"`;

    if (typed >= 0) {
      this.shell(typed);
      return;
    }
    const fade = splashT >= FADE_DURATION ? 1 : ease.out(clamp(splashT / FADE_DURATION));
    this.field(splashT + FIELD_OFFSET, fade);
    const top = Math.floor((rows - CHROME_ROWS - 8) / 2);
    this.logo(splashT, fade, top);
    this.centered(TAGLINE, top + 1, mix(BG, FG, 0.75 * fade));
    const help = [
      ['Ctrl+H', mix(BG, ACCENT, ACCENT_ALPHA * fade)],
      [' help', mix(BG, FG, MUTED_ALPHA * fade)],
      [' · ', mix(BG, FG, MUTED_ALPHA * fade)],
      ['/help', mix(BG, ACCENT, ACCENT_ALPHA * fade)],
      [' in chat', mix(BG, FG, MUTED_ALPHA * fade)],
    ];
    this.segments(help, top + 3);
    const tip = [
      ['tip: ', mix(BG, TIP, ACCENT_ALPHA * fade), true],
      [TIP_LABEL, mix(BG, ACCENT, ACCENT_ALPHA * fade)],
      [' ', FG],
      [TIP_DESC, mix(BG, FG, MUTED_ALPHA * fade)],
    ];
    this.segments(tip, top + 5);
    this.put(VERSION, cols - VERSION.length - 1, 0, mix(BG, FG, VERSION_ALPHA * fade));
    this.chrome(fade);
  }

  shell(typed) {
    const word = 'maki'.slice(0, typed);
    let x = 0;
    x = this.put('maki', x, 0, [0x8b, 0xe9, 0xfd], true) + 1;
    x = this.put('main', x, 0, PINK, true) + 1;
    x = this.put('❯', x, 0, GREEN, true) + 1;
    x = this.put(word, x, 0, typed === 4 ? GREEN : RED);
    this.cursor(x, 0);
  }

  chrome(fade) {
    const { cols, rows } = this;
    const line = mix(BG, DIM, fade);
    const rule = '─'.repeat(cols);
    this.put(rule, 0, rows - 4, line);
    this.put(rule, 0, rows - 2, line);
    let x = this.put('❯ ', 0, rows - 3, mix(BG, DIM, fade));
    x = this.put(PLACEHOLDER_HEAD, x, rows - 3, mix(BG, DIM, fade));
    this.ctx.font = `italic ${this.font}`;
    x = this.put(PLACEHOLDER_HINT, x, rows - 3, mix(BG, DIM, fade), false, true);
    this.put('...', x, rows - 3, mix(BG, DIM, fade));
    this.put(STATUS_MODE, 0, rows - 1, mix(BG, ACCENT, fade), true);
    const right = statusRight(cols, STATUS_MODE, STATUS_CWD, STATUS_MODEL, `  ${STATUS_CONTEXT} `);
    this.put(right, cols - right.length, rows - 1, mix(BG, FG, 0.55 * fade));
  }

  cursor(x, y) {
    const { ctx, cw, ch } = this;
    ctx.fillStyle = hex(FG);
    ctx.fillRect(x * cw, y * ch + ch * 0.12, cw, ch * 0.76);
  }

  put(str, x, y, color, bold = false, keepFont = false) {
    const { ctx, cw, ch } = this;
    if (!keepFont) ctx.font = bold ? this.bold : this.font;
    ctx.fillStyle = hex(color);
    let col = x;
    for (const c of str) {
      if (c !== ' ') ctx.fillText(c, col * cw, y * ch + ch / 2);
      col++;
    }
    return col;
  }

  centered(str, y, color) {
    this.put(str, Math.floor((this.cols - str.length) / 2), y, color);
  }

  segments(segs, y) {
    const total = segs.reduce((n, s) => n + s[0].length, 0);
    let x = Math.floor((this.cols - total) / 2);
    for (const [str, color, bold] of segs) x = this.put(str, x, y, color, bold);
  }

  logo(t, fade, y) {
    const alpha = LOGO_ALPHA * ease.out(clamp((t - LOGO_DELAY) / LOGO_RAMP)) * fade;
    const lifted = [ACCENT[0], ACCENT[1], Math.min(255, ACCENT[2] + LOGO_BLUE_LIFT)];
    this.put('maki', Math.floor((this.cols - 4) / 2), y, mix(BG, lifted, alpha), true);
  }

  field(t, fade) {
    const { ctx, cw, ch, buckets } = this;
    const w = this.cols;
    const h = this.rows - CHROME_ROWS;
    const layers = [];
    for (let i = 0; i < WAVE_LAYERS; i++) {
      layers.push([2 + i * 1.8, 1.5 + i * 1.2, t * (0.3 + i * 0.15) + i * 2.094, 1 / (1.5 + i * 0.5)]);
    }
    const weightSum = layers.reduce((n, l) => n + l[3], 0);
    const half = weightSum * 0.5;
    const valScale = (fade * INTENSITY_SCALE) / half;
    for (const b of buckets) b.length = 0;

    for (let row = 0; row < h; row++) {
      const ny = row / h;
      const dy = (ny - 0.5) * 2;
      const vy = dy * dy;
      for (let col = 0; col < w; col++) {
        const nx = col / w;
        const dx = (nx - 0.5) * 2;
        const vx = dx * dx;
        const vignette = 1 - (vx + vy) * VIGNETTE_SCALE;
        if (vignette <= 0) continue;
        let sum = 0;
        for (const [fx, fy, phase, weight] of layers) {
          sum += Math.sin(nx * fx + ny * fy + phase) * weight;
        }
        const val = (sum + half) * vignette * valScale;
        const idx = Math.floor(val * FIELD_CHAR_MAX + 0.5);
        if (idx <= 0) continue;
        buckets[Math.min(idx, FIELD_CHAR_MAX) - 1].push(col, row);
      }
    }
    ctx.font = this.font;
    for (let i = 0; i < buckets.length; i++) {
      const cells = buckets[i];
      if (!cells.length) continue;
      ctx.fillStyle = this.lut[i];
      const sym = FIELD_SYMS[i + 1];
      for (let j = 0; j < cells.length; j += 2) ctx.fillText(sym, cells[j] * cw, cells[j + 1] * ch + ch / 2);
    }
  }
}
