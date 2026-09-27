// Renders the film to an MP4 by stepping its clock one frame at a time in headless Chromium.
//
//   node site/video/export.mjs [--fps 60] [--theme dark|light] [--portrait] [--workers 3] [--out maki.mp4] [--start s] [--end s]
//
// Needs playwright (with its Chromium) and ffmpeg with libx264. Set FFMPEG to use a specific binary.

import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFile, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webp': 'image/webp', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.cast': 'text/plain',
};

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean).map(a => a.trim().split(/\s+/)),
);
const fps = Number(args.fps ?? 60);
const theme = args.theme ?? 'dark';
const portrait = 'portrait' in args;
const viewport = portrait ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
const workers = Number(args.workers ?? 3);
const out = resolve(args.out ?? `maki-${theme}${portrait ? '-vertical' : ''}.mp4`);
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
const { chromium } = createRequire(import.meta.url)('playwright');

const server = createServer(async (req, res) => {
  const path = join(SITE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try {
    const file = path.endsWith('/') ? join(path, 'index.html') : path;
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/video/?export${portrait ? '&portrait' : ''}`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

async function openFilm() {
  const page = await browser.newPage({ viewport, colorScheme: theme });
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.film);
  return page;
}

const probe = await openFilm();
const duration = await probe.evaluate(() => window.film.duration);
await probe.close();
const first = Math.floor(Number(args.start ?? 0) * fps);
const frames = Math.ceil(Math.min(duration, Number(args.end ?? duration)) * fps) - first;
const work = await mkdtemp(join(tmpdir(), 'maki-film-'));
console.log(`${frames} frames at ${fps} fps, ${workers} workers, theme ${theme}, ${viewport.width}x${viewport.height}`);

let done = 0;
const started = Date.now();
async function renderChunk(index, from, to) {
  const page = await openFilm();
  const file = join(work, `chunk${index}.mp4`);
  const enc = spawn(ffmpeg, [
    '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-tune', 'animation', file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = from; f < to; f++) {
    await page.evaluate(t => window.film.seek(t), (first + f) / fps);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const png = await page.screenshot({ type: 'png' });
    if (!enc.stdin.write(png)) await new Promise(r => enc.stdin.once('drain', r));
    if (++done % fps === 0) {
      const rate = done / ((Date.now() - started) / 1000);
      process.stdout.write(`\r${done}/${frames} frames, ${rate.toFixed(1)} fps, ~${Math.round((frames - done) / rate)}s left   `);
    }
  }
  enc.stdin.end();
  await new Promise((r, j) => enc.on('close', code => (code ? j(new Error(`ffmpeg exited ${code}`)) : r())));
  await page.close();
  return file;
}

const per = Math.ceil(frames / workers);
const chunks = await Promise.all(
  [...Array(workers)].map((_, i) => renderChunk(i, i * per, Math.min(frames, (i + 1) * per))),
);
const list = join(work, 'list.txt');
await writeFile(list, chunks.map(c => `file '${c}'`).join('\n'));
await new Promise((r, j) => {
  const cat = spawn(ffmpeg, ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out], { stdio: 'inherit' });
  cat.on('close', code => (code ? j(new Error(`ffmpeg concat exited ${code}`)) : r()));
});

await browser.close();
server.close();
await rm(work, { recursive: true, force: true });
console.log(`\nwrote ${out}`);
