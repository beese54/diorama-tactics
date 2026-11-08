// The demo video's layer over the game (scripts/trailer.mjs): captions, a drawn cursor, the AI's
// thinking panel, title cards and dips to black. It runs on the video's own clock (seconds of
// video, passed to __rec.tick each frame), so it can move while the game holds still. It never
// takes the pointer. Dev recording only: not part of the game.
(() => {
  const css = `
  #rec-layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; font-family: "Source Sans 3", sans-serif; }
  #rec-layer * { box-sizing: border-box; }
  .rec-box { position: absolute; opacity: 0; will-change: transform, opacity; }
  .rec-cap { background: linear-gradient(180deg, rgba(10,14,30,0.86), rgba(6,8,18,0.92)); border: 1.5px solid rgba(216,178,90,0.75);
    border-radius: 18px; padding: 26px 38px 30px; box-shadow: 0 12px 40px rgba(0,0,0,0.55); color: #f3ead2; }
  .rec-kicker { font: 700 28px/1.2 "Source Sans 3", sans-serif; letter-spacing: 0.2em; text-transform: uppercase; color: #d8b25a; margin-bottom: 8px; }
  .rec-title { font: 700 62px/1.1 Cinzel, serif; color: #fff4d6; text-shadow: 0 2px 12px rgba(0,0,0,0.6); }
  .rec-sub { font: italic 600 42px/1.25 "Cormorant Garamond", serif; color: #e9dcc0; margin-top: 8px; }
  .rec-hero .rec-title { font-size: 128px; line-height: 1.02; color: #f1cf7a; text-shadow: 0 4px 30px rgba(0,0,0,0.7), 0 0 50px rgba(216,178,90,0.25); }
  .rec-hero .rec-sub { font-size: 52px; margin-top: 20px; }
  .rec-hero .rec-kicker { font-size: 32px; }
  .rec-panel { width: 860px; background: linear-gradient(180deg, rgba(12,16,34,0.92), rgba(5,7,16,0.95)); border: 1.5px solid rgba(220,80,70,0.8);
    border-radius: 14px; padding: 22px 26px; color: #f3ead2; box-shadow: 0 12px 40px rgba(0,0,0,0.6); }
  .rec-panel h3 { margin: 0 0 6px; font: 700 26px/1.2 "Source Sans 3", sans-serif; letter-spacing: 0.24em; color: #ff8d7a; text-transform: uppercase; }
  .rec-panel h2 { margin: 0 0 14px; font: 700 44px/1.15 Cinzel, serif; color: #fff4d6; }
  .rec-panel h4 { margin: 18px 0 8px; font: 700 25px/1.2 "Source Sans 3", sans-serif; letter-spacing: 0.16em; color: #d8b25a; text-transform: uppercase; }
  .rec-row { display: flex; align-items: baseline; gap: 14px; font: 600 31px/1.3 "Source Sans 3", sans-serif; padding: 5px 10px; border-radius: 8px; opacity: 0; }
  .rec-row .n { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rec-row .v { color: #cfc4ae; font-weight: 500; white-space: nowrap; }
  .rec-row .m { width: 36px; text-align: center; font-weight: 700; }
  .rec-row.ok { background: rgba(216,178,90,0.16); }
  .rec-row.ok .m { color: #8be08b; }
  .rec-row.no { color: #a7a29a; }
  .rec-row.no .m { color: #ff7a6a; }
  .rec-row.pick { background: rgba(216,178,90,0.28); outline: 1.5px solid rgba(241,207,122,0.8); }
  .rec-note { margin: 6px 10px 0; font: italic 600 29px/1.25 "Cormorant Garamond", serif; color: #f1cf7a; opacity: 0; }
  .rec-verdict { margin-top: 18px; font: 700 38px/1.2 Cinzel, serif; color: #f1cf7a; opacity: 0; }
  .rec-meter { display: inline-block; width: 130px; height: 14px; border-radius: 7px; background: rgba(255,255,255,0.12); position: relative; top: -2px; overflow: hidden; }
  .rec-meter i { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, #d8b25a, #f1cf7a); }
  .rec-meter.bad i { background: linear-gradient(90deg, #a5463c, #d06a5c); }
  .rec-meter b { position: absolute; top: 0; bottom: 0; left: 60%; width: 2px; background: #fff; opacity: 0.8; }
  #rec-cursor { position: absolute; left: 0; top: 0; width: 46px; height: 60px; opacity: 0; filter: drop-shadow(0 3px 4px rgba(0,0,0,0.6)); }
  #rec-ring { position: absolute; width: 80px; height: 80px; margin: -40px 0 0 -40px; border-radius: 50%; border: 3px solid #f1cf7a; opacity: 0; }
  #rec-curtain { position: absolute; inset: 0; background: #000; opacity: 0; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  const layer = document.createElement('div');
  layer.id = 'rec-layer';
  layer.innerHTML = `<div id="rec-ring"></div><svg id="rec-cursor" viewBox="0 0 34 44"><path d="M3 2 L3 34 L11 27 L17 41 L23 38 L17 25 L28 25 Z" fill="#fff" stroke="#14182a" stroke-width="2.5" stroke-linejoin="round"/></svg><div id="rec-curtain"></div>`;
  const mount = () => {
    if (!document.head || !document.body) return requestAnimationFrame(mount);
    document.head.appendChild(style);
    document.body.appendChild(layer);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const $ = (id) => layer.querySelector(`#${id}`);
  /** Boxes on screen: element, when shown, when hidden (or null), and how they slide in. */
  const boxes = new Map();
  let t = 0;
  const cursor = { x: 960, y: 540, shown: false, clickAt: -10 };
  let curtain = { from: 0, to: 0, t0: 0, t1: 0 };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  window.__rec = {
    /**
     * Shows a box `id`: a caption ({ kicker, title, sub }) or raw `html`, placed by `at`
     * ({ left|right|top|bottom|width } in px, or center: true for the middle), sliding from `from`
     * (`instant`: already in place, for a caption carried over a cut).
     */
    show(id, o) {
      this.hide(id, 0);
      const el = document.createElement('div');
      el.className = `rec-box ${o.html ? '' : 'rec-cap'} ${o.hero ? 'rec-hero' : ''} ${o.cls ?? ''}`;
      if (o.hero) el.classList.remove('rec-cap');
      el.innerHTML = o.html ?? `${o.kicker ? `<div class="rec-kicker">${esc(o.kicker)}</div>` : ''}<div class="rec-title">${esc(o.title ?? '')}</div>${o.sub ? `<div class="rec-sub">${esc(o.sub)}</div>` : ''}`;
      const at = o.at ?? { left: 60, bottom: 60 };
      for (const k of ['left', 'right', 'top', 'bottom', 'width', 'maxWidth']) if (at[k] !== undefined) el.style[k] = typeof at[k] === 'number' ? `${at[k]}px` : at[k];
      if (at.center) Object.assign(el.style, { left: '50%', top: at.top !== undefined ? `${at.top}px` : '50%', textAlign: 'center' });
      layer.insertBefore(el, $('rec-ring'));
      boxes.set(id, { el, shown: o.instant ? t - 10 : t, hidden: null, from: o.from ?? 'left', center: !!at.center, centerY: at.center && at.top === undefined, rows: [...el.querySelectorAll('.rec-row, .rec-note, .rec-verdict')], step: o.step ?? 0.35 });
      return id;
    },
    /** Hides box `id` over `fade` seconds. */
    hide(id, fade = 0.35) {
      const b = boxes.get(id);
      if (!b) return;
      if (fade === 0) {
        b.el.remove();
        boxes.delete(id);
      } else if (b.hidden === null) b.hidden = t + fade;
    },
    hideAll(fade = 0.35) {
      for (const id of [...boxes.keys()]) this.hide(id, fade);
    },
    cursor(x, y, shown = true) {
      Object.assign(cursor, { x, y, shown });
    },
    click() {
      cursor.clickAt = t;
    },
    /** Fades the curtain from its opacity now to `to` over `seconds`. */
    curtain(to, seconds) {
      const now = this.curtainNow();
      curtain = { from: now, to, t0: t, t1: t + Math.max(seconds, 1e-3) };
    },
    curtainNow() {
      return curtain.from + (curtain.to - curtain.from) * ease((t - curtain.t0) / (curtain.t1 - curtain.t0));
    },
    /** Moves everything to video time `seconds`. */
    tick(seconds) {
      t = seconds;
      for (const [id, b] of boxes) {
        const into = ease((t - b.shown) / 0.45);
        const out = b.hidden === null ? 1 : 1 - ease(1 - (b.hidden - t) / 0.35);
        if (b.hidden !== null && t >= b.hidden) {
          b.el.remove();
          boxes.delete(id);
          continue;
        }
        const k = into * out;
        const slide = (1 - into) * 40;
        const dx = b.from === 'left' ? -slide : b.from === 'right' ? slide : 0;
        const dy = b.from === 'bottom' ? slide : b.from === 'top' ? -slide : 0;
        b.el.style.opacity = String(k);
        b.el.style.transform = `${b.center ? `translate(-50%, ${b.centerY ? '-50%' : '0'}) ` : ''}translate(${dx}px, ${dy}px)`;
        // Rows of a panel appear one after another.
        b.rows.forEach((r, i) => (r.style.opacity = String(ease((t - b.shown - 0.35 - i * b.step) / 0.3))));
      }
      const c = $('rec-cursor');
      c.style.opacity = cursor.shown ? '1' : '0';
      const press = Math.max(0, 1 - (t - cursor.clickAt) / 0.12);
      c.style.transform = `translate(${cursor.x - 3}px, ${cursor.y - 2}px) scale(${1 - press * 0.15})`;
      const ring = $('rec-ring');
      const r = (t - cursor.clickAt) / 0.45;
      ring.style.opacity = r >= 0 && r < 1 ? String(0.9 * (1 - r)) : '0';
      ring.style.transform = `translate(${cursor.x}px, ${cursor.y}px) scale(${0.4 + r * 0.9})`;
      ring.style.left = ring.style.top = '0';
      $('rec-curtain').style.opacity = String(this.curtainNow());
    },
    esc,
  };
})();
