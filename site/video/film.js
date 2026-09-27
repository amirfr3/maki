import { buildFilm } from './scenes.js';
import { clamp, fmt } from './lib.js';

const STAGE_W = 1920;
const STAGE_H = 1080;
const SEEK_STEP = 5;
const FRAME = 1 / 60;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const MSG_MS = 2600;

const root = document.documentElement;
const exporting = root.classList.contains('export');
const frame = document.getElementById('frame');
const stage = document.getElementById('stage');
const player = document.getElementById('player');
const fill = document.getElementById('progress-fill');
const progress = document.getElementById('progress');
const tip = document.getElementById('progress-tip');
const timeEl = document.getElementById('time');
const chapterNow = document.getElementById('chapter-now');
const speedBtn = document.getElementById('speed');
const chapterList = document.getElementById('chapters');
const keys = document.getElementById('keys');
const cmdline = document.getElementById('cmdline');
const cmd = document.getElementById('cmd');
const cmdMsg = document.getElementById('cmd-msg');

const film = buildFilm(stage, { exporting });
const { duration, chapters } = film;

let t = 0;
let playing = false;
let speed = 1;
let lastNow = 0;
let chapterAt = -1;

function fit() {
  if (exporting) {
    stage.style.zoom = '1';
    film.resize(1);
    return;
  }
  const full = document.fullscreenElement === frame;
  const w = full ? innerWidth : frame.clientWidth;
  const h = full ? innerHeight : frame.clientHeight;
  const zoom = Math.min(w / STAGE_W, h / STAGE_H);
  stage.style.zoom = String(zoom);
  if (!full) frame.style.height = '';
  film.resize(zoom);
}

function chapterIndex(time) {
  let i = 0;
  while (i + 1 < chapters.length && chapters[i + 1].at <= time + 1e-6) i++;
  return i;
}

function paint() {
  film.render(t);
  fill.style.width = (t / duration) * 100 + '%';
  timeEl.textContent = `${fmt(t)} / ${fmt(duration)}`;
  const ci = chapterIndex(t);
  if (ci !== chapterAt) {
    chapterAt = ci;
    chapterNow.textContent = chapters[ci].title;
    chapterList.querySelectorAll('li').forEach((li, i) => li.classList.toggle('on', i === ci));
  }
}

function seek(time) {
  t = clamp(time, 0, duration);
  if (t >= duration) setPlaying(false);
  paint();
}

function setPlaying(on) {
  if (on && t >= duration - 0.05) t = 0;
  playing = on;
  player.classList.toggle('playing', on);
  if (on) player.classList.add('started');
  film.setPlaying(on);
  lastNow = performance.now();
}

function loop(now) {
  if (playing) {
    t += Math.min(0.1, (now - lastNow) / 1000) * speed;
    if (t >= duration) {
      t = duration;
      setPlaying(false);
    }
    paint();
  }
  lastNow = now;
  requestAnimationFrame(loop);
}

function setSpeed(s) {
  speed = s;
  speedBtn.textContent = s + 'x';
  film.setSpeed(s);
}

function stepSpeed(dir) {
  const i = SPEEDS.indexOf(speed);
  setSpeed(SPEEDS[clamp(i + dir, 0, SPEEDS.length - 1)]);
}

function jumpChapter(dir) {
  const ci = chapterIndex(t);
  const intoChapter = t - chapters[ci].at;
  const target = dir < 0 && intoChapter > 2 ? ci : ci + dir;
  seek(chapters[clamp(target, 0, chapters.length - 1)].at);
}

function toggleTheme() {
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch (e) {}
  film.themeChanged();
  paint();
}

function toggleFullscreen() {
  if (document.fullscreenElement) return document.exitFullscreen();
  // phones hold the frame sideways; a refused lock just leaves it upright
  frame.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
}

// ---------- ex commands ----------

function parseTime(s) {
  const parts = s.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

let msgTimer = 0;
function say(msg) {
  cmdMsg.textContent = msg;
  cmdline.hidden = false;
  cmd.value = '';
  cmd.blur();
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { cmdline.hidden = true; cmdMsg.textContent = ''; }, MSG_MS);
}

function run(line) {
  const c = line.trim();
  if (!c) return (cmdline.hidden = true);
  const time = parseTime(c);
  if (time != null) {
    seek(time);
    return (cmdline.hidden = true);
  }
  const set = c.match(/^set?\s+speed=([\d.]+)$/);
  if (set) {
    setSpeed(clamp(Number(set[1]), 0.25, 4));
    return (cmdline.hidden = true);
  }
  if (c === 'q' || c === 'wq' || c === 'x') return say('E37: No write since last change (add ! to override)');
  if (c === 'q!' || c === 'qa!') return (location.href = '../');
  if (c === 'help' || c === 'h') {
    cmdline.hidden = true;
    return (keys.hidden = false);
  }
  const ch = chapters.findIndex(x => x.title.toLowerCase().startsWith(c.toLowerCase()));
  if (ch >= 0) {
    seek(chapters[ch].at);
    return (cmdline.hidden = true);
  }
  say(`E492: Not an editor command: ${c}`);
}

function openCmd() {
  clearTimeout(msgTimer);
  cmdMsg.textContent = '';
  cmdline.hidden = false;
  cmd.value = '';
  cmd.focus();
}

cmd.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') run(cmd.value);
  else if (e.key === 'Escape') cmdline.hidden = true;
});

// ---------- input ----------

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!keys.hidden) {
    if (e.key === 'Escape' || e.key === '?') keys.hidden = true;
    e.preventDefault();
    return;
  }
  const k = e.key;
  const map = {
    ' ': () => setPlaying(!playing),
    'k': () => jumpChapter(-1),
    'j': () => jumpChapter(1),
    'h': () => seek(t - SEEK_STEP),
    'l': () => seek(t + SEEK_STEP),
    'ArrowLeft': () => seek(t - SEEK_STEP),
    'ArrowRight': () => seek(t + SEEK_STEP),
    'g': () => seek(0),
    'G': () => seek(duration),
    ',': () => { setPlaying(false); seek(t - FRAME); },
    '.': () => { setPlaying(false); seek(t + FRAME); },
    '[': () => stepSpeed(-1),
    ']': () => stepSpeed(1),
    'f': toggleFullscreen,
    't': toggleTheme,
    '?': () => (keys.hidden = false),
    ':': openCmd,
    'Escape': () => (cmdline.hidden = true),
  };
  if (/^[0-9]$/.test(k)) {
    seek((Number(k) / 10) * duration);
    e.preventDefault();
    return;
  }
  if (map[k]) {
    map[k]();
    e.preventDefault();
  }
});

frame.addEventListener('click', () => setPlaying(!playing));
frame.addEventListener('dblclick', toggleFullscreen);
document.getElementById('play').addEventListener('click', () => setPlaying(!playing));
document.getElementById('fullscreen').addEventListener('click', toggleFullscreen);
document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
document.getElementById('keys-open').addEventListener('click', () => (keys.hidden = false));
keys.addEventListener('click', e => { if (e.target === keys) keys.hidden = true; });
speedBtn.addEventListener('click', () => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]));

function timeAt(e) {
  const r = progress.getBoundingClientRect();
  return clamp((e.clientX - r.left) / r.width) * duration;
}
let scrubbing = false;
let resumeAfterScrub = false;
progress.addEventListener('pointerdown', e => {
  scrubbing = true;
  resumeAfterScrub = playing;
  setPlaying(false);
  progress.setPointerCapture(e.pointerId);
  seek(timeAt(e));
});
progress.addEventListener('pointermove', e => {
  const at = timeAt(e);
  const r = progress.getBoundingClientRect();
  tip.style.left = clamp((e.clientX - r.left) / r.width) * 100 + '%';
  tip.textContent = `${fmt(at)}  ${chapters[chapterIndex(at)].title}`;
  if (scrubbing) seek(at);
});
progress.addEventListener('pointerup', () => {
  scrubbing = false;
  if (resumeAfterScrub) setPlaying(true);
});

for (const [i, ch] of chapters.entries()) {
  const tick = document.createElement('div');
  tick.className = 'tick';
  tick.style.left = (ch.at / duration) * 100 + '%';
  if (i > 0) progress.appendChild(tick);

  const li = document.createElement('li');
  li.innerHTML = `<button><span class="at">${fmt(ch.at)}</span><span>${ch.title}</span></button>`;
  li.firstChild.addEventListener('click', () => { seek(ch.at); setPlaying(true); });
  chapterList.appendChild(li);
}

matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
  let stored = null;
  try { stored = localStorage.getItem('theme'); } catch (err) {}
  if (stored === 'light' || stored === 'dark') return;
  root.setAttribute('data-theme', e.matches ? 'light' : 'dark');
  film.themeChanged();
  paint();
});

function readHash() {
  const m = location.hash.match(/t=([\d:.]+)/);
  if (m) seek(parseTime(m[1]) ?? 0);
}
addEventListener('hashchange', readHash);
addEventListener('resize', fit);
document.addEventListener('fullscreenchange', fit);

await document.fonts.ready;
fit();
paint();
readHash();

window.film = {
  duration,
  chapters,
  async seek(time) {
    t = clamp(time, 0, duration);
    await film.prepare(t);
    paint();
  },
};

if (!exporting) requestAnimationFrame(loop);
