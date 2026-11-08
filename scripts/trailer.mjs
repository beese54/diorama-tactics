// Records the demo video of Diorama Tactics from the real game, frame by frame on a virtual clock
// (scripts/trailer/vtime.js), with captions, a cursor and the AI's thinking drawn over it
// (scripts/trailer/overlay.js), and the game's own sound effects as its soundtrack.
// Needs the dev server and ffmpeg.
//   node scripts/trailer.mjs [outDir=media/trailer] [scenes=all|card,maps,skirmish,outro|assemble] [port=5175]
// Each scene is captured to <outDir>/<scene>/ (JPEG frames, and scene.json: its frame count and
// the effects heard, in seconds of the scene); "assemble" joins them with crossfades into
// <outDir>/diorama-tactics-demo.mp4 (H.264 + AAC, 1920x1080, 30 fps).
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outDir = 'media/trailer', which = 'all', port = '5175'] = process.argv.slice(2);
const BASE = `http://localhost:${port}/`;
const FPS = 30;
const DT = 1000 / FPS;
const W = 1920;
const H = 1080;
const XFADE = 0.6;
const VTIME = readFileSync(new URL('./trailer/vtime.js', import.meta.url), 'utf8');
const OVERLAY = readFileSync(new URL('./trailer/overlay.js', import.meta.url), 'utf8');
const MAPS = [
  ['autumn', 'Autumn Ridge'],
  ['glacier', 'Glacier Rift'],
  ['volcano', 'Volcanic Caldera'],
  ['canal', 'Canal Quarter'],
  ['pyramid', 'Desert Pyramid'],
  ['skyisles', 'Sky Isles'],
];
/** The scenes in the order they play. */
const ORDER = ['card', ...MAPS.map(([id]) => `map-${id}`), 'skirmish', 'outro'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** One scene's recording: a page on virtual time, its captured frames, and the game time of each. */
class Rec {
  constructor(browser, name) {
    this.browser = browser;
    this.name = name;
    this.dir = join(outDir, name);
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
    this.count = 0;
    /** The game's clock (ms) at each captured frame. */
    this.times = [];
    this.mouse = { x: W * 0.7, y: H * 0.6 };
    this.errors = [];
  }

  async open(url) {
    this.page = await this.browser.newPage();
    const page = this.page;
    page.on('pageerror', (e) => this.errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && this.errors.push(m.text()));
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(VTIME);
    await page.evaluateOnNewDocument(OVERLAY);
    this.cdp = await page.createCDPSession();
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 });
    return page;
  }

  ev(fn, ...args) {
    return this.page.evaluate(fn, ...args);
  }

  /** One frame: the game moved on `ms` (0 holds it still), the overlay to this frame's time; captured unless told not to. */
  async frame(ms = DT, capture = true) {
    const now = await this.ev(async (t, ms, step) => {
      window.__rec.tick(t);
      return window.__vt.frame(ms, step);
    }, this.count / FPS, ms, Math.min(DT, Math.max(ms, 1)));
    if (!capture) return;
    const { data } = await this.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94, optimizeForSpeed: true });
    writeFileSync(join(this.dir, `f${String(this.count).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'));
    this.times.push(now);
    this.count++;
  }

  /** `seconds` of video at `rate` times the game's speed (0 holds it still); `each` runs before every frame with how far in (0 to 1). */
  async play(seconds, { rate = 1, each } = {}) {
    const n = Math.round(seconds * FPS);
    for (let i = 0; i < n; i++) {
      if (each) await each(i / Math.max(1, n - 1));
      await this.frame(DT * rate);
    }
  }

  /** Plays (captured) until `test` is true in the page, returning its value; fails after `max` seconds. */
  async until(test, { max = 30, rate = 1, arg } = {}) {
    for (let i = 0; i < max * FPS; i++) {
      const v = await this.ev(test, arg);
      if (v) return v;
      await this.frame(DT * rate);
    }
    throw new Error(`${this.name}: timed out waiting for ${test}`);
  }

  /** Moves the game on (not captured) until `test` is true, half a second at a time; `nudge` runs between. */
  async skipUntil(test, { max = 120, nudge, arg } = {}) {
    for (let i = 0; i < max * 2; i++) {
      const v = await this.ev(test, arg);
      if (v) return v;
      if (nudge) await nudge();
      await this.frame(500, false);
    }
    throw new Error(`${this.name}: timed out skipping to ${test}`);
  }

  /** A dip to black: the screen fades out, `skip` moves the game on unseen, and it fades back in. */
  async cut(skip) {
    await this.ev(() => window.__rec.curtain(1, 0.3));
    await this.play(0.33);
    await skip();
    await this.ev(() => window.__rec.curtain(0, 0.35));
    await this.play(0.2);
  }

  caption(id, o) {
    return this.ev((id, o) => window.__rec.show(id, o), id, o);
  }

  hide(id, fade = 0.35) {
    return this.ev((id, f) => window.__rec.hide(id, f), id, fade);
  }

  /** Glides the drawn cursor (and the real pointer) to (x, y) over `seconds`, the game running. */
  async moveTo(x, y, seconds = 0.6) {
    const [x0, y0] = [this.mouse.x, this.mouse.y];
    await this.play(seconds, {
      each: async (k) => {
        const e = ease(k);
        this.mouse = { x: lerp(x0, x, e), y: lerp(y0, y, e) };
        await this.page.mouse.move(this.mouse.x, this.mouse.y);
        await this.ev((x, y) => window.__rec.cursor(x, y, true), this.mouse.x, this.mouse.y);
      },
    });
  }

  async click() {
    await this.ev(() => window.__rec.click());
    await this.page.mouse.click(this.mouse.x, this.mouse.y);
  }

  async key(code) {
    await this.page.keyboard.press(code);
  }

  /** Writes scene.json: the frame count and the effects heard, at seconds of this scene (those in a cut are dropped). */
  async finish() {
    const log = (await this.ev(() => window.__audio?.log?.() ?? [])) ?? [];
    const sfx = [];
    const t = this.times;
    for (const e of log) {
      let i = -1;
      for (let j = t.length - 1; j >= 0; j--) if (t[j] <= e.t) { i = j; break; }
      if (i < 0) continue;
      const gap = i + 1 < t.length ? t[i + 1] - t[i] : DT;
      if (gap > DT * 1.5) continue;
      sfx.push({ name: e.name, at: (i + (gap > 0 ? Math.min(1, (e.t - t[i]) / gap) : 0)) / FPS });
    }
    writeFileSync(join(this.dir, 'scene.json'), JSON.stringify({ frames: this.count, sfx, errors: this.errors }, null, 1));
    console.log(`${this.name}: ${this.count} frames (${(this.count / FPS).toFixed(1)} s), ${sfx.length} effects, ${this.errors.length ? 'errors: ' + this.errors.join(' | ') : 'no errors'}`);
    await this.page.close();
  }
}

// ---- the scenes ------------------------------------------------------------------------------

/** Thunder Hoof in the card showcase: the title over it, its clip, its layers in depth, a flip. */
async function cardScene(rec, outro = false) {
  await rec.open(`${BASE}?mode=card&id=thunder-hoof`);
  await rec.page.waitForFunction(() => window.__card?.ready && window.__card.loaded['motion.mp4'], { timeout: 60000 });
  await rec.ev(() => {
    // The showcase's dev sliders aren't part of the card.
    for (const d of document.querySelectorAll('body > div')) if (d.querySelector('input[type=range]')) d.remove();
    // The card stands right of centre, leaving room for the title.
    document.getElementById('card-showcase').style.transform = 'translateX(19%)';
  });
  await wait(1500);
  await rec.ev(() => window.__vt.freeze());
  await rec.ev(() => window.__rec.curtain(1, 0.001));
  await rec.frame(0, false);
  await rec.ev(() => window.__rec.curtain(0, 0.9));
  const tilt = async (k, amp = 1) => rec.ev((x, y) => window.__card.aim(x, y), Math.sin(k) * 0.55 * amp, Math.cos(k * 0.8) * 0.35 * amp);
  let phase = 0;
  const drift = (amp) => async () => {
    phase += 0.045;
    await tilt(phase, amp);
  };
  await rec.ev(() => window.__card.hover(true));
  if (outro) {
    await rec.caption('end', { hero: true, kicker: 'Built with three.js · TypeScript · Claude Code', title: 'Diorama Tactics', sub: 'github.com/beese54/diorama-tactics', at: { left: 100, top: 300, width: 880 } });
    await rec.play(6.5, { each: drift(0.8) });
    await rec.ev(() => window.__rec.curtain(1, 0.9));
    await rec.play(1.0, { each: drift(0.8) });
    return;
  }
  await rec.caption('title', { hero: true, kicker: 'A card-driven tactics game', title: 'Diorama Tactics', sub: 'Every battle is played out, beat by beat', at: { left: 100, top: 300, width: 880 } });
  await rec.play(4.2, { each: drift(0.7) });
  await rec.hide('title');
  await rec.play(0.4, { each: drift(0.7) });
  await rec.caption('card', { kicker: 'The cards', title: 'Thunder Hoof', sub: 'Layered art: depth, foil and a motion clip of its own', at: { left: 100, top: 380, width: 860 } });
  // Wider sweeps, to part the layers.
  await rec.play(3.0, { each: drift(1.25) });
  await rec.ev(() => window.__card.flip());
  await rec.play(1.4, { each: drift(0.5) });
  await rec.ev(() => window.__card.flip());
  await rec.ev(() => window.__card.hover(false));
  await rec.play(0.2, { each: drift(0.6) });
  await rec.ev(() => window.__card.hover(true));
  await rec.play(2.6, { each: drift(0.9) });
}

/** One map of the montage: a slow orbit of the landmark, the map's name in the corner. */
async function mapScene(rec, id, name, index) {
  await rec.open(`${BASE}?mode=view&map=${id}`);
  await rec.page.waitForFunction(() => window.__map?.theme, { timeout: 60000 });
  await rec.ev(() => document.getElementById('hud')?.setAttribute('hidden', ''));
  await wait(3500);
  const theme = await rec.ev(() => window.__map.theme());
  const [fx, fy] = theme.focus ?? [theme.width / 2, theme.width / 2];
  await rec.ev(() => window.__vt.freeze());
  const seconds = 2.9;
  const z0 = theme.zoom * 1.25;
  const pose = (k) => rec.ev((az, z, x, y) => window.__map.setPose(az, 57, z, x, y), lerp(28, 52, k), lerp(z0, z0 * 1.18, k), fx, fy);
  await pose(0);
  await rec.frame(0, false);
  // One caption over the whole montage: carried in place over each cut after the first.
  await rec.caption('maps', { kicker: '30 terrains', title: 'Procedurally generated', sub: 'Every tile built in code: ground, water, props, light and weather', at: { left: 50, bottom: 50, width: 940 }, instant: index > 0 });
  await rec.caption('name', { html: `<div class="rec-cap" style="padding:12px 22px"><div class="rec-kicker" style="margin:0">${name}</div></div>`, at: { right: 60, top: 50 }, from: 'right' });
  await rec.play(seconds, { each: (k) => pose(k) });
}

/**
 * The skirmish on Meadow Vale against the Hard AI: a card from the hand (Thunder Hoof hovered,
 * Long Road played), a move into a Union, the Union's battles (the gauge handed down), then the
 * foes' turn with what the AI weighed, and Varek firing Thunder Hoof's Trample.
 */
async function skirmishScene(rec) {
  const page = await rec.open(`${BASE}?map=meadow&foes=hard`);
  await page.waitForFunction(() => window.__map?.hand()?.view?.aims?.length, { timeout: 90000 });
  const cards = await rec.ev(async () => (await import('/src/game/cards.ts')).CARDS.map((c) => ({ id: c.id, name: c.name, pow: c.pow, skill: c.skill.name })));
  const cardName = Object.fromEntries(cards.map((c) => [c.id, c]));
  await rec.ev(() => {
    window.__map.setHand('player', ['long-road', 'swift-banner', 'open-field', 'ember-rite', 'steady-line', 'shield-wall', 'thunder-hoof', 'kings-wager']);
    window.__map.setHand('enemy', ['thunder-hoof', 'kings-wager', 'grave-toll', 'long-road', 'shield-wall', 'steady-line', 'open-field', 'iron-column']);
  });
  await wait(2500);
  const units = await rec.ev(() => window.__map.units());
  const aria = units.find((u) => u.name === 'Aria');
  const allies = units.filter((u) => u.side === 'player' && u.id !== aria.id);
  const target = units.find((u) => u.name === 'Sabine');
  const varek = units.find((u) => u.name === 'Varek');
  const others = units.filter((u) => u.side === 'enemy' && u.id !== target.id);
  // A centre near Aria with both rings of the + and the foe's tile on open ground, clear of the other foes.
  const plus = [[0, -1], [1, 0], [0, 1], [-1, 0], [0, -2], [2, 0], [0, 2], [-2, 0], [3, 0]];
  const openAt = (x, y) => rec.ev((x, y) => { const t = window.__map.tile(x, y); return !!t && !t.prop && !t.water; }, x, y);
  let spot = null;
  for (let r = 0; r < 10 && !spot; r++) {
    for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
      const [x, y] = [aria.x + dx, aria.y + dy];
      const tiles = [[x, y], ...plus.map(([a, b]) => [x + a, y + b])];
      if (tiles.some(([a, b]) => others.some((u) => Math.abs(u.x - a) + Math.abs(u.y - b) < 2))) continue;
      let ok = true;
      for (const [a, b] of tiles) if (!(await openAt(a, b))) { ok = false; break; }
      if (ok) spot = [x, y];
    }
  }
  if (!spot) throw new Error('no spot for the Union');
  const [x, y] = spot;
  const mover = allies[3];
  const place = [[aria, x, y, 40], [allies[0], x, y - 1, 20], [allies[1], x + 1, y, 0], [allies[2], x, y - 2, 0], [mover, x + 3, y, 0], [target, x, y + 1, 0]];
  for (const [u, ux, uy, gauge] of place) await rec.ev((id, c) => window.__map.setUnit(id, c), u.id, { x: ux, y: uy, gauge });
  // The foes: Varek's gauge full (his lance can fire Thunder Hoof's Trample), the rest empty.
  for (const u of units.filter((u) => u.side === 'enemy' && u.id !== target.id)) await rec.ev((id, g) => window.__map.setUnit(id, { gauge: g }), u.id, u.id === varek.id ? 100 : 0);
  await rec.ev((x, y) => window.__map.setPose(45, 55, 1.25, x, y), x + 1, y - 1);
  await wait(1500);
  await rec.ev(() => window.__vt.freeze());
  await rec.ev(() => window.__rec.cursor(1400, 700, true));
  rec.mouse = { x: 1400, y: 700 };
  await rec.play(0.4);

  // A card from the hand: Thunder Hoof hovered (its clip plays), Long Road played.
  await rec.caption('cap', { kicker: 'Your turn', title: 'Play a card', sub: 'Its POW powers every battle; its MOV is shared by the whole army', at: { left: 50, top: 140, width: 820 } });
  const aimOf = async (id) => {
    const hand = await rec.ev(() => window.__map.hand());
    const i = hand.cards.findIndex((c) => c.id === id);
    return hand.view.aims[i];
  };
  let p = await aimOf('thunder-hoof');
  await rec.moveTo(p.x, p.y, 0.8);
  await rec.play(3.4);
  p = await aimOf('long-road');
  await rec.moveTo(p.x, p.y, 0.6);
  await rec.play(0.5);
  await rec.click();
  await rec.play(1.2);
  await rec.hide('cap');

  // A move: the last ally steps into Aria's Union shape.
  const aim = (x, y) => rec.ev((x, y) => window.__map.aimAt(x, y), x, y);
  const settle = () => rec.until(() => !window.__map.busy(), { max: 10 });
  await rec.caption('cap', { kicker: 'Move', title: 'Bring allies together', sub: 'Every tile costs 1 MOV from the shared pool', at: { left: 50, top: 140, width: 820 } });
  p = await aim(x + 3, y);
  await rec.moveTo(p.x, p.y, 0.7);
  await rec.click();
  await rec.play(0.9);
  p = await aim(x + 2, y);
  await rec.moveTo(p.x, p.y, 0.6);
  await rec.play(0.5);
  await rec.click();
  await settle();
  await rec.until(() => !!window.__map.pendingMove()?.aims, { max: 10 });
  await rec.play(0.4);
  const confirm = (await rec.ev(() => window.__map.pendingMove())).aims.confirm;
  await rec.moveTo(confirm.x, confirm.y, 0.5);
  await rec.click();
  await rec.play(0.6);
  await rec.hide('cap');

  // The Union: Aria selected, her allies one and two tiles out marked.
  p = await aim(x, y);
  await rec.moveTo(p.x, p.y, 0.6);
  await rec.click();
  await rec.play(0.3);
  await rec.caption('cap', { kicker: 'Union', title: 'Allies on her + join the attack', sub: 'One and two tiles out: up to 9 battles in a row', at: { left: 50, top: 140, width: 820 } });
  await rec.play(2.6);
  p = await aim(x, y + 1);
  await rec.moveTo(p.x, p.y, 0.6);
  await rec.play(0.3);
  await rec.click();
  await rec.hide('cap');
  // No pointer over the battles.
  await rec.play(0.3);
  await rec.ev(() => window.__rec.cursor(0, 0, false));

  // The Union's battles.
  const battleOpen = (i) => window.__map.battling() && window.__battle?.ready && window.__battle?.chain?.index === i && !document.getElementById('wipe') && !document.querySelector('#battle-hud.intro');
  await rec.until(battleOpen, { max: 20, arg: 0 });
  await rec.caption('bcap', { kicker: 'Union battle 1', title: 'Stances charge the skill gauge', sub: 'Passive charges it fastest: READY lights mid-battle', at: { center: true, top: 350 }, from: 'bottom' });
  await rec.play(0.8);
  await rec.key('KeyD');
  await rec.until(() => { const s = window.__battle.skill(); return s.state === 'ready' || s.phase === 'done'; }, { max: 25 });
  await rec.play(1.6);
  await rec.cut(async () => {
    await rec.hide('bcap', 0);
    await rec.skipUntil(battleOpen, { arg: 1, nudge: async () => { if (await rec.ev(() => !!window.__battle?.result?.())) await rec.key('Space'); } });
  });
  await rec.caption('bcap', { kicker: 'Union battle 2', title: 'The gauge is handed down', sub: "Bram opens on Aria's gauge plus his own: full, ready to fire", at: { center: true, top: 350 }, from: 'bottom' });
  await rec.play(2.2);
  await rec.hide('bcap');
  if (await rec.ev(() => window.__battle.skill().choosing)) await rec.key('KeyK');
  await rec.play(3.0);
  await rec.until(() => !window.__battle.skill().held, { max: 10 });
  await rec.play(2.0);
  // The rest of the Union's battles, unseen; then the foes' turn.
  const leave = async () => {
    const s = await rec.ev(() => window.__map.battling() && (window.__battle?.result?.() || window.__battle?.skill?.()?.choosing || window.__battle?.skill?.()?.held));
    if (s) await rec.key('Space');
  };
  await rec.cut(async () => {
    await rec.skipUntil(() => !window.__map.battling(), { nudge: leave });
    await rec.skipUntil(() => window.__map.turn().side === 'enemy' && !!window.__map.foeThinking());
  });

  // The foes' turn: their card, and what the AI weighed.
  const th = await rec.ev(() => window.__map.foeThinking());
  const now = await rec.ev(() => window.__map.units());
  const nameOf = (id) => now.find((u) => u.id === id)?.name ?? id;
  const row = (cls, mark, n, v) => `<div class="rec-row ${cls}"><span class="m">${mark}</span><span class="n">${n}</span><span class="v">${v}</span></div>`;
  const sorted = [...th.cards].sort((a, b) => b.score - a.score).slice(0, 3);
  const cardRows = sorted.map((c, i) => row(i === 0 ? 'ok pick' : 'no', i === 0 ? '✓' : '', cardName[c.id].name, `${c.pow}${c.firer ? ' + 30' : ''} = ${c.score}`)).join('');
  const pick = sorted[0];
  const why = pick.firer ? `<div class="rec-note">POW, +30 because ${nameOf(pick.firer)}'s full gauge can fire ${cardName[pick.id].skill}</div>` : '<div class="rec-note">The most POW that reaches a fight</div>';
  const fights = [...th.setups].sort((a, b) => (b.passed - a.passed) || (b.forecast.dealt - b.forecast.taken) - (a.forecast.dealt - a.forecast.taken));
  const shown = [...fights.filter((f) => f.passed).slice(0, 2), ...fights.filter((f) => !f.passed).sort((a, b) => b.forecast.win - a.forecast.win).slice(0, 2)];
  const meter = (w) => `<span class="rec-meter ${w < 0.6 ? 'bad' : ''}"><i style="width:${Math.round(w * 100)}%"></i><b></b></span>`;
  const best = shown.find((f) => f.passed);
  const fightRows = shown.map((f) => row(f === best ? 'ok pick' : f.passed ? 'ok' : 'no', f.passed ? '✓' : '✗', `${nameOf(f.unit)} → ${nameOf(f.target)}`,
    `${meter(f.forecast.win)} ${Math.round(f.forecast.win * 8)}/8 wins`)).join('');
  const verdict = best ? `${nameOf(best.unit)}'s Union attacks ${nameOf(best.target)}` : 'No fight worth taking: it holds strong ground';
  const html = `<div class="rec-panel"><h3>Enemy AI · Hard</h3><h2>Thinking it through</h2>
    <h4>1 · Pick the card</h4>${cardRows}${why}
    <h4>2 · Forecast each fight: 8 simulated battles</h4>${fightRows}
    <div class="rec-verdict">${verdict}</div></div>`;
  console.log('AI', JSON.stringify({ card: sorted[0], best, verdict }));
  await rec.ev(() => window.__rec.cursor(0, 0, false));
  // The foes' banner and their card turning face up, at speed; then the panel.
  await rec.until(() => !document.getElementById('turn-banner')?.isConnected, { max: 5 });
  await rec.caption('ai', { html, at: { left: 50, top: 120 }, step: 0.45 });
  await rec.caption('cap', { kicker: 'The opponent', title: 'Same rules as you', sub: 'It simulates every fight, and attacks only at 60%+ odds', at: { right: 50, bottom: 50, width: 860 }, from: 'right' });
  // Slowed while the panel builds, then at speed as the foes march.
  await rec.play(5.6, { rate: 0.06 });
  // At speed as the foes march; the panel and caption go as the battle's wipe starts.
  await rec.until(() => window.__map.battling() || !!document.getElementById('wipe'), { max: 25 });
  await rec.hide('cap', 0.25);
  await rec.hide('ai', 0.25);
  await rec.until(() => window.__battle?.ready && !document.getElementById('wipe') && !document.querySelector('#battle-hud.intro'), { max: 15 });
  await rec.play(0.6);
  // The defender may hold a full gauge (the last of our Union kept it): saved, and the battle goes on.
  if (await rec.ev(() => window.__battle.skill().choosing)) await rec.key('Space');
  await rec.until(() => { const s = window.__battle.skill(); return !!s.foeFired && s.cutIn?.on; }, { max: 12 });
  // Clear of the cut-in's own title and art: the lower right of its band.
  await rec.caption('bcap', { kicker: 'Thunder Hoof, played by the AI', title: 'Varek fires Trample', sub: 'The charge fells the front rank', at: { right: 50, bottom: 60, width: 780 }, from: 'right' });
  await rec.play(2.4);
  await rec.hide('bcap');
  if (await rec.ev(() => window.__battle.skill().held)) await rec.key('Space');
  await rec.play(5.0);
  await rec.ev(() => window.__rec.curtain(1, 0.6));
  await rec.play(0.7);
}

// ---- assembling ------------------------------------------------------------------------------

async function assemble(browser) {
  const scenes = ORDER.filter((s) => existsSync(join(outDir, s, 'scene.json')));
  const parts = [];
  let start = 0;
  for (const [k, s] of scenes.entries()) {
    const meta = JSON.parse(readFileSync(join(outDir, s, 'scene.json'), 'utf8'));
    const mp4 = join(outDir, `${s}.mp4`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', join(outDir, s, 'f%05d.jpg'), '-c:v', 'libx264', '-crf', '14', '-preset', 'fast', '-pix_fmt', 'yuv420p', mp4]);
    const seconds = meta.frames / FPS;
    parts.push({ s, mp4, seconds, start, sfx: meta.sfx });
    start += seconds - (k < scenes.length - 1 ? XFADE : 0);
  }
  const total = start;
  // Video: each scene crossfaded into the next.
  const inputs = parts.flatMap((p) => ['-i', p.mp4]);
  let chain = '';
  let last = '[0:v]';
  for (let k = 1; k < parts.length; k++) {
    const out = k === parts.length - 1 ? '[v]' : `[x${k}]`;
    chain += `${last}[${k}:v]xfade=transition=fade:duration=${XFADE}:offset=${parts[k].start.toFixed(3)}${out};`;
    last = out;
  }
  if (parts.length === 1) chain = '[0:v]null[v];';
  // Sound: the game's effects at their places in the cut.
  const events = parts.flatMap((p) => p.sfx.map((e) => ({ name: e.name, at: p.start + e.at })));
  const page = await browser.newPage();
  await page.goto(`${BASE}?mode=view`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForFunction(() => window.__audio, { timeout: 60000 });
  const wav = await page.evaluate((e, s) => window.__audio.render(e, s), events, total + 0.5);
  await page.close();
  const wavPath = join(outDir, 'sfx.wav');
  writeFileSync(wavPath, Buffer.from(wav, 'base64'));
  const final = join(outDir, 'diorama-tactics-demo.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-i', wavPath, '-filter_complex', `${chain}[${parts.length}:a]afade=t=out:st=${(total - 1).toFixed(2)}:d=1[a]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-t', total.toFixed(3), final]);
  console.log(`assembled ${final}: ${total.toFixed(1)} s from ${parts.map((p) => `${p.s} ${p.seconds.toFixed(1)}s`).join(', ')}; ${events.length} effects`);
}

// ---- main -----------------------------------------------------------------------------------

mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
try {
  const want = which === 'all' ? [...ORDER, 'assemble'] : which.split(',').flatMap((s) => (s === 'maps' ? MAPS.map(([id]) => `map-${id}`) : [s]));
  for (const s of want) {
    if (s === 'assemble') {
      await assemble(browser);
      continue;
    }
    const rec = new Rec(browser, s);
    try {
      if (s === 'card') await cardScene(rec);
      else if (s === 'outro') await cardScene(rec, true);
      else if (s === 'skirmish') await skirmishScene(rec);
      else if (s.startsWith('map-')) {
        const i = MAPS.findIndex(([id]) => `map-${id}` === s);
        await mapScene(rec, MAPS[i][0], MAPS[i][1], i);
      } else throw new Error(`unknown scene ${s}`);
    } finally {
      if (rec.page && !rec.page.isClosed()) await rec.finish();
    }
  }
} finally {
  await browser.close();
}
