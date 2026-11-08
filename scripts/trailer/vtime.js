// Virtual time for frame-perfect recording (scripts/trailer.mjs). Injected before the page's own
// scripts: performance.now, Date.now, requestAnimationFrame and the timers all read a clock the
// recorder controls. It runs "live" (following real time) while the page loads and between shots;
// frozen, each __vt.frame(ms) moves it on by exactly that much, runs the page's timers and frame,
// brings CSS animations and playing videos to the same moment, and waits for it to be on screen.
// A cut in the video is time moved on with nothing captured. Dev recording only: not part of the game.
(() => {
  const realNow = performance.now.bind(performance);
  const realRaf = window.requestAnimationFrame.bind(window);
  const realDate = Date.now;
  const dateZero = realDate();
  let now = 0;
  let live = true;
  let liveFrom = realNow();
  let liveBase = 0;

  performance.now = () => (live ? liveBase + realNow() - liveFrom : now);
  Date.now = () => dateZero + Math.round(performance.now());

  // requestAnimationFrame: callbacks queue for the next frame, real or virtual.
  let rafQ = [];
  let rafId = 0;
  window.requestAnimationFrame = (cb) => {
    rafQ.push({ id: ++rafId, cb });
    return rafId;
  };
  window.cancelAnimationFrame = (id) => {
    rafQ = rafQ.filter((r) => r.id !== id);
  };

  // Timers, due at a virtual time; run in order, each interval rescheduled.
  const timers = new Map();
  let timerId = 0;
  const add = (cb, ms, args, every) => {
    const id = ++timerId;
    const wait = Math.max(0, Number(ms) || 0);
    timers.set(id, { at: performance.now() + wait, cb, args, every: every ? Math.max(1, wait) : 0 });
    return id;
  };
  window.setTimeout = (cb, ms, ...args) => add(cb, ms, args, false);
  window.setInterval = (cb, ms, ...args) => add(cb, ms, args, true);
  window.clearTimeout = window.clearInterval = (id) => timers.delete(id);
  const runTimers = (t) => {
    for (;;) {
      let next = null;
      for (const [id, tm] of timers) if (tm.at <= t && (!next || tm.at < next[1].at || (tm.at === next[1].at && id < next[0]))) next = [id, tm];
      if (!next) return;
      const [id, tm] = next;
      if (tm.every) tm.at += tm.every;
      else timers.delete(id);
      try {
        typeof tm.cb === 'function' ? tm.cb(...tm.args) : (0, eval)(String(tm.cb));
      } catch (e) {
        console.error(e);
      }
    }
  };
  const runFrame = (t) => {
    const q = rafQ;
    rafQ = [];
    for (const r of q) {
      try {
        r.cb(t);
      } catch (e) {
        console.error(e);
      }
    }
  };

  // three.js VideoTexture uploads on every render when the video has no frame callback, which is
  // what a video stepped by seeking needs (a seek while still may not raise a frame callback).
  delete HTMLVideoElement.prototype.requestVideoFrameCallback;
  // Videos that play: their start on the virtual clock; frozen, each is still and set by seeking.
  const videos = new Map();
  const realPlay = HTMLMediaElement.prototype.play;
  const realPause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.play = function () {
    videos.set(this, performance.now() - (this.currentTime || 0) * 1000);
    const p = realPlay.call(this);
    if (!live) this.playbackRate = 0;
    return p;
  };
  HTMLMediaElement.prototype.pause = function () {
    videos.delete(this);
    return realPause.call(this);
  };
  const seekVideos = () =>
    Promise.all(
      [...videos].map(([v, start]) => {
        if (!v.isConnected && !v.src) return null;
        v.playbackRate = 0;
        const d = v.duration || 0;
        let t = Math.max(0, (now - start) / 1000);
        if (d) t = v.loop ? t % d : Math.min(t, d - 0.001);
        if (Math.abs(v.currentTime - t) < 0.0005) return null;
        return new Promise((res) => {
          const done = () => res(null);
          v.addEventListener('seeked', done, { once: true });
          setTimeoutReal(done, 400);
          v.currentTime = t;
        });
      }),
    );
  const setTimeoutReal = (cb, ms) => {
    const end = realNow() + ms;
    const tick = () => (realNow() >= end ? cb() : realRaf(tick));
    realRaf(tick);
  };

  // CSS animations and transitions: each held at its time on the virtual clock.
  const animStart = new WeakMap();
  const syncAnimations = () => {
    const tl = document.timeline.currentTime;
    for (const a of document.getAnimations()) {
      if (!animStart.has(a)) animStart.set(a, now - (a.currentTime ?? 0) / (a.playbackRate || 1));
      if (a.playState !== 'running' || tl === null) continue;
      a.startTime = tl - (now - animStart.get(a)) * (a.playbackRate || 1);
    }
  };

  // Live: real frames drive the page on real time.
  const liveTick = () => {
    if (!live) return;
    const t = performance.now();
    runTimers(t);
    runFrame(t);
    realRaf(liveTick);
  };
  realRaf(liveTick);

  const flush = async () => {
    for (let i = 0; i < 4; i++) await null;
  };
  const painted = () => new Promise((res) => realRaf(() => realRaf(res)));

  window.__vt = {
    now: () => performance.now(),
    live: () => live,
    /** Stops following real time: from now on time moves only by frame(). */
    async freeze() {
      if (!live) return now;
      now = performance.now();
      live = false;
      for (const v of videos.keys()) v.playbackRate = 0;
      await painted();
      return now;
    },
    /** Follows real time again (from where the virtual clock stands). */
    thaw() {
      if (live) return;
      liveBase = now;
      liveFrom = realNow();
      live = true;
      for (const v of videos.keys()) v.playbackRate = 1;
      realRaf(liveTick);
    },
    /** Moves the frozen clock on by `ms`, in steps of at most `step` (each running the page's timers and frame), and waits until the result is on screen. */
    async frame(ms, step = ms) {
      let left = ms;
      while (left > 1e-6) {
        const d = Math.min(step, left);
        now += d;
        left -= d;
        runTimers(now);
        await flush();
        runFrame(now);
        await flush();
      }
      await seekVideos();
      syncAnimations();
      await painted();
      return now;
    },
  };
})();
