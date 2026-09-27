export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;

export const ease = {
  linear: x => x,
  in: x => x * x * x,
  out: x => 1 - (1 - x) ** 3,
  inOut: x => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
  outExpo: x => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
  inOutExpo: x => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2),
  outBack: x => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2,
  inOutSine: x => -(Math.cos(Math.PI * x) - 1) / 2,
};

// 0..1 progress of t through [a, a + d], eased
export const prog = (t, a, d, e = ease.out) => e(clamp((t - a) / d));

// visible from a to b: fades in over fi, out over fo
export const win = (t, a, b, fi = 0.5, fo = 0.45) =>
  Math.min(prog(t, a, fi), 1 - prog(t, b - fo, fo, ease.in));

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function el(tag, cls, parent, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  if (parent) parent.appendChild(node);
  return node;
}

export function place(node, x, y, w, h) {
  node.style.left = x + 'px';
  node.style.top = y + 'px';
  if (w != null) node.style.width = w + 'px';
  if (h != null) node.style.height = h + 'px';
  return node;
}

// cached writes: most frames change nothing on most nodes
export function style(node, o = 1, x = 0, y = 0, s = 1) {
  const op = o <= 0.001 ? '0' : o >= 0.999 ? '1' : o.toFixed(3);
  if (node._o !== op) {
    node.style.opacity = op;
    node.style.visibility = op === '0' ? 'hidden' : '';
    node._o = op;
  }
  const tf = x || y || s !== 1 ? `translate(${x.toFixed(2)}px,${y.toFixed(2)}px)${s !== 1 ? ` scale(${s.toFixed(4)})` : ''}` : '';
  if (node._t !== tf) {
    node.style.transform = tf;
    node._t = tf;
  }
}

export function css(node, prop, value) {
  const key = '_' + prop;
  if (node[key] !== value) {
    node.style.setProperty(prop, value);
    node[key] = value;
  }
}

export function text(node, value) {
  if (node._txt !== value) {
    node.textContent = value;
    node._txt = value;
  }
}

// wraps every word in a mask so it can rise into view; nested markup keeps its styling
export function splitWords(root) {
  const words = [];
  const walk = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.appendChild(document.createTextNode(' '));
            continue;
          }
          const mask = el('span', 'w', frag);
          words.push(el('span', 'wi', mask, part.replace(/&/g, '&amp;').replace(/</g, '&lt;')));
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.dataset.whole != null) {
          const mask = el('span', 'w');
          child.replaceWith(mask);
          const inner = el('span', 'wi', mask);
          inner.appendChild(child);
          words.push(inner);
        } else {
          walk(child);
        }
      }
    }
  };
  walk(root);
  return words;
}

export function revealWords(words, t, start, stagger = 0.035, dur = 0.7) {
  for (let i = 0; i < words.length; i++) {
    const p = prog(t, start + i * stagger, dur, ease.outExpo);
    style(words[i], clamp(p * 1.6), 0, (1 - p) * 42);
  }
}

// a block of rising words that later fades out as one piece
export function words(parent, cls, html, x, y, w) {
  const node = place(el('div', 'abs ' + cls, parent, html), x, y, w);
  return { node, words: splitWords(node) };
}

export function showWords(block, t, a, b, { stagger = 0.035, dur = 0.7, out = 0.45, lift = 16 } = {}) {
  const o = t < a || t > b ? 0 : 1 - prog(t, b - out, out, ease.in);
  style(block.node, o, 0, -lift * prog(t, b - out, out, ease.in));
  if (o > 0) revealWords(block.words, t, a, stagger, dur);
}

export const fmt = s => {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// resolves any CSS color (oklch included) to [r, g, b] in 0..1
const probe = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d', { willReadFrequently: true }) : null;
export function rgbOf(color) {
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}
