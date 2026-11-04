import * as THREE from 'three';
import type { Card } from '../game/cards';
import { CARD_WORLD_H, CardView, DEFAULT_PARAMS, type CardParams } from './CardView';
import { loadCardFonts } from './frameArt';
import { focusHeight, layoutHand, visiblePoint, type CardSpot } from './handLayout';
import { ART, CARD_H } from './layout';

/** How a card in the hand stands: playable, in play this turn, spent, or only to look at. */
export type HandCardState = '' | 'played' | 'used' | 'locked';

/** What the hand tells its owner: the pointer focused a card, or chose one. */
export interface HandEvents {
  focus: (index: number) => void;
  play: (index: number) => void;
}

const FOV = 26;
/** Hold this long on a card (touch or mouse) to flip it instead of playing it. */
const LONG_PRESS_MS = 450;
/** The foes' card: how long it takes to slide in, and when it turns face up. */
const FOE_IN = 0.35;
const FOE_FLIP_AT = 0.45;
/** A played card's flight to the turn box (B8), in seconds. */
const FLY_SECONDS = 0.6;
/** The pointer off the hand this long ends the focus (crossing a gap between cards doesn't). */
const LEAVE_MS = 250;

/** Where a card flies to: a spot on screen and the height it shrinks to there. */
export interface FlyTarget {
  x: number;
  y: number;
  h: number;
}

/** A card on screen: its view, and the pose it is easing toward its spot with. */
interface Placed {
  view: CardView;
  pose: { x: number; y: number; h: number; rot: number };
}

/**
 * The hand of animated cards (cards.md, Part 1: "In the hand"), drawn by the showcase's card
 * renderer on a canvas of its own at full device resolution, over the board. At rest the cards
 * lie tucked along the bottom, only their tops showing, so the board stays in view. Pointed at
 * (or ←/→, or a tap), the hand comes into focus: the board blurs and dims behind it, the fan
 * rises, and the focused card lifts into the middle of the screen, large enough to read, tilts
 * toward the pointer and plays its clip. Spent cards are greyed, the card in play is stamped. On
 * the foes' turn their card slides in face down and turns face up. The canvas draws only while
 * the hand or the foes' card is up.
 */
export class HandView {
  private readonly root: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 1, 20000);
  private readonly params: CardParams = { ...DEFAULT_PARAMS };
  private readonly keysEl: HTMLElement;
  private boxes: HTMLElement[] = [];
  /** Views for each card, built once and kept (by card id, per side). */
  private readonly views = new Map<string, Promise<CardView>>();
  private cards: readonly Card[] = [];
  private placed: (Placed | null)[] = [];
  private states: HandCardState[] = [];
  private focused = -1;
  /** Where each card is drawn, and the slot in the fan where each takes the pointer (handLayout). */
  private spots: CardSpot[] = [];
  private slots: CardSpot[] = [];
  /** In focus, while the player chooses: the board blurred, the focused card lifted to the middle. */
  private browsing = false;
  private leaveTimer = 0;
  /** The pointer box over the focused card where it is drawn, lifted, in focus. */
  private readonly spotBox: HTMLElement;
  private shown = false;
  private foe: (Placed & { card: Card; t: number; leaving: boolean }) | null = null;
  private frame = 0;
  private last: number | null = null;
  private clock = 0;
  /** Frames drawn, to share the resting cards' art redraws across frames. */
  private ticks = 0;
  private press: { index: number; timer: number; flipped: boolean } | null = null;
  /** A card flying to the turn box (B8): which, from where, how far along, and what to do as it lands. */
  private flight: { p: Placed; from: Placed['pose']; to: FlyTarget; t: number; landed: () => void; foe: boolean } | null = null;
  /** Flights that have landed, for checks. */
  private flights = 0;
  private disposed = false;

  constructor(private readonly events: HandEvents) {
    this.root = document.createElement('div');
    this.root.id = 'card-hand';
    this.root.hidden = true;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.keysEl = document.createElement('div');
    this.keysEl.className = 'keys';
    this.spotBox = document.createElement('div');
    this.spotBox.className = 'card spot';
    this.bind(this.spotBox, () => this.focused, true);
    this.root.append(this.renderer.domElement, this.keysEl, this.spotBox);
    document.body.appendChild(this.root);
    void loadCardFonts();
    addEventListener('resize', this.onResize);
    addEventListener('pointerdown', this.onPressAnywhere, true);
  }

  get open(): boolean {
    return this.shown;
  }

  /**
   * Shows `cards`, each in its state, with card `focused` up; `keys` is the line of keys above.
   * The cards' views are built the first time a card is shown and kept for the skirmish.
   */
  show(cards: readonly Card[], states: HandCardState[], focused: number, keys: string): void {
    const same = cards.length === this.cards.length && cards.every((c, i) => c === this.cards[i]);
    this.cards = cards;
    this.states = states;
    this.keysEl.textContent = keys;
    if (!same) {
      for (const p of this.placed) if (p) this.scene.remove(p.view.group);
      this.placed = cards.map(() => null);
      this.buildBoxes();
      cards.forEach((card, i) => void this.view(card, 'player').then((view) => {
        if (this.cards[i] !== card || this.disposed) return;
        view.phase = i * 1.7;
        const s = this.spots[i];
        // A new card rises from below the screen into its place.
        this.placed[i] = { view, pose: { x: s?.x ?? innerWidth / 2, y: innerHeight + (s?.h ?? 200), h: s?.h ?? 200, rot: 0 } };
        this.scene.add(view.group);
        this.sizeArt();
      }));
    }
    this.shown = true;
    this.focused = focused;
    this.layout();
    this.sizeArt();
    this.wake();
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.press = null;
    this.browse(false);
    this.refresh();
    this.wake();
  }

  /**
   * Brings the hand into focus (the board blurred and dimmed behind it, the fan up, the focused
   * card lifted to the middle of the screen), or tucks it back down with the board clear.
   */
  browse(on: boolean): void {
    clearTimeout(this.leaveTimer);
    on &&= this.shown;
    if (on === this.browsing) return;
    this.browsing = on;
    document.body.classList.toggle('hand-focus', on);
    this.layout();
    this.sizeArt();
    this.wake();
  }

  /** Whether the hand is in focus. */
  get focusing(): boolean {
    return this.browsing;
  }

  /** Puts card `index` up: it rises and plays its clip; the one before goes back down. */
  setFocus(index: number): void {
    if (index === this.focused && this.spots.length === this.cards.length) {
      this.refresh();
      return;
    }
    this.focused = index;
    this.layout();
    this.sizeArt();
  }

  /** Flips the focused card over, or back. */
  flipFocused(): void {
    const p = this.placed[this.focused];
    if (!p) return;
    p.view.flip();
    // A card turned face down stops its clip; turned back up while focused, it plays again.
    p.view.hover(this.shown && this.browsing);
  }

  /** The foes play `card`: it slides in face down at the right and turns face up. */
  showFoe(card: Card): void {
    if (this.foe) this.scene.remove(this.foe.view.group);
    this.foe = null;
    void this.view(card, 'enemy').then((view) => {
      if (this.disposed) return;
      view.setFlipped(true);
      view.hover(false);
      const s = this.foeSpot();
      this.foe = { card, view, t: 0, leaving: false, pose: { x: innerWidth + s.h, y: s.y, h: s.h, rot: 8 } };
      this.scene.add(view.group);
      this.wake();
    });
  }

  /** The foes' card slides away, or, given a target, flies there (B8). */
  hideFoe(to?: FlyTarget, landed?: () => void): void {
    const f = this.foe;
    if (!f) return;
    f.leaving = true;
    if (to) this.startFlight(f, to, landed ?? (() => {}), true);
  }

  /**
   * Card `index` flies from the hand to `to` (the turn box, B8): it lifts, arcs across and
   * shrinks into it, and `landed` is called as it arrives (the box glows); then it is gone.
   */
  fly(index: number, to: FlyTarget, landed: () => void): void {
    const p = this.placed[index];
    if (!p) return void landed();
    this.startFlight(p, to, landed, false);
  }

  private startFlight(p: Placed, to: FlyTarget, landed: () => void, foe: boolean): void {
    // A flight under way lands at once: one card in the air at a time.
    if (this.flight) this.land();
    this.flight = { p, from: { ...p.pose }, to, t: 0, landed, foe };
    this.wake();
  }

  /** Moves the flying card along its arc; true while it is in the air. */
  private flyStep(dt: number): boolean {
    const f = this.flight;
    if (!f) return false;
    f.t += dt;
    const u = Math.min(1, f.t / FLY_SECONDS);
    // Eased in and out, along a curve that lifts it first: a card picked up and tossed.
    const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    const [a, b] = [f.from, f.to];
    const cx = (a.x + b.x) / 2;
    const cy = Math.min(a.y, b.y) - innerHeight * 0.18;
    const q = f.p.pose;
    q.x = (1 - e) ** 2 * a.x + 2 * (1 - e) * e * cx + e * e * b.x;
    q.y = (1 - e) ** 2 * a.y + 2 * (1 - e) * e * cy + e * e * b.y;
    q.h = a.h + (b.h - a.h) * e;
    q.rot = a.rot * (1 - e) - 14 * Math.sin(e * Math.PI);
    if (u >= 1) this.land();
    return true;
  }

  /** The flying card arrives: the target is told, and the card goes (below the screen, or off the board for the foes'). */
  private land(): void {
    const f = this.flight;
    if (!f) return;
    this.flight = null;
    this.flights++;
    if (f.foe) {
      this.scene.remove(f.p.view.group);
      if (this.foe === f.p) this.foe = null;
    } else f.p.pose = { ...f.p.pose, y: innerHeight + f.p.pose.h * 2 };
    f.landed();
  }

  /** The state of the hand on screen, for checks. */
  info(): {
    open: boolean; drawing: boolean; canvas: { width: number; height: number; css: number };
    focused: number; flipped: boolean[]; playing: boolean[]; clip: { has: boolean; playing: boolean; mix: number } | null;
    aims: ({ x: number; y: number } | null)[]; foe: { id: string; side: string; faceUp: boolean } | null;
    flying: boolean; flights: number;
    /** In focus or tucked; the focused card's height as drawn; the top of the hand as drawn (CSS px). */
    browsing: boolean; focusedHeight: number; top: number;
  } {
    const f = this.placed[this.focused];
    return {
      open: this.shown,
      drawing: this.frame !== 0,
      canvas: { width: this.renderer.domElement.width, height: this.renderer.domElement.height, css: innerWidth },
      focused: this.focused,
      flipped: this.placed.map((p) => !!p?.view.flipped),
      playing: this.placed.map((p) => !!p?.view.stage.clipState().playing),
      clip: f ? f.view.stage.clipState() : null,
      aims: this.slots.map((_, i) => visiblePoint(this.slots, i, innerHeight)),
      flying: this.flight !== null,
      flights: this.flights,
      browsing: this.browsing,
      focusedHeight: this.spots[this.focused]?.h ?? 0,
      top: Math.min(innerHeight, ...this.spots.map((s) => s.y - s.h / 2)),
      foe: this.foe && !this.foe.leaving ? { id: this.foe.card.id, side: this.foe.view.side, faceUp: !this.foe.view.flipped } : null,
    };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    removeEventListener('resize', this.onResize);
    removeEventListener('pointerdown', this.onPressAnywhere, true);
    clearTimeout(this.leaveTimer);
    document.body.classList.remove('hand-focus', 'hand-shown');
    for (const v of this.views.values()) void v.then((view) => view.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.root.remove();
  }

  // ---- inside ------------------------------------------------------------------------------

  private view(card: Card, side: 'player' | 'enemy'): Promise<CardView> {
    const key = `${side}:${card.id}`;
    let v = this.views.get(key);
    if (!v) {
      v = CardView.create(card, side, this.params, 384, { lazyClip: true, paintScale: this.paintScale(), texSize: this.texSize() });
      this.views.set(key, v);
    }
    return v;
  }

  /**
   * The frame's canvas pixels per design unit: enough for the largest the hand draws a card (the
   * focused card, or the foes'), in quarter steps from 0.5 to the showcase's 2. The frames are
   * painted once, on the CPU, and uploaded: at the showcase's scale eight of them stall the page.
   */
  private paintScale(): number {
    const largest = Math.max(focusHeight(8, innerWidth, innerHeight), this.foeSpot().h);
    return THREE.MathUtils.clamp(Math.ceil(((largest * devicePixelRatio * 1.15) / CARD_H) * 4) / 4, 0.5, 2);
  }

  /** The art layers' size as loaded: the largest art window the hand draws, in steps of 256. */
  private texSize(): number {
    const largest = Math.max(focusHeight(8, innerWidth, innerHeight), this.foeSpot().h);
    return THREE.MathUtils.clamp(Math.ceil(this.artFor(largest) / 256) * 256, 256, 1536);
  }

  /**
   * Builds the views for `cards` on `side` ahead of need, one after another, so a card shows the
   * moment it is played (the foes' card, for one) instead of after it loads.
   */
  prefetch(cards: readonly Card[], side: 'player' | 'enemy'): void {
    // After the cards already on their way (the player's hand), so it never slows those.
    const first = Promise.all([...this.views.values()]);
    void cards.reduce<Promise<unknown>>((chain, card) => chain.then(() => (this.disposed ? null : this.view(card, side))), first);
  }

  /** The art window's size in device pixels for a card `h` CSS pixels high: sharp, no larger. */
  private artFor(h: number): number {
    return THREE.MathUtils.clamp(Math.ceil(((h * ART.size) / CARD_H) * devicePixelRatio * 1.1), 192, 1024);
  }

  /** Gives each card's art a render target its size on screen: the focused card's larger. */
  private sizeArt(): void {
    this.placed.forEach((p, i) => p?.view.stage.resize(this.artFor(this.spots[i]?.h ?? 200)));
  }

  /** One invisible box per card, on its slot in the fan, to take the pointer; with its stamp, if any. */
  private buildBoxes(): void {
    for (const b of this.boxes) b.remove();
    this.boxes = this.cards.map((card, i) => {
      const b = document.createElement('div');
      b.className = 'card';
      b.dataset.id = card.id;
      this.bind(b, () => i, false);
      this.root.insertBefore(b, this.spotBox);
      return b;
    });
  }

  /**
   * The pointer on a card's box: `index` gives the card (a slot's own, or the focused one for the
   * box over the lifted card, `lifted`). Pointing at the hand brings it into focus and the card
   * up; off the hand for LEAVE_MS, it tucks away. A click plays the card; a tap focuses it first,
   * and a second tap plays it; a long press flips it instead.
   */
  private bind(b: HTMLElement, index: () => number, lifted: boolean): void {
    b.addEventListener('pointerenter', (e) => {
      clearTimeout(this.leaveTimer);
      if (e.pointerType !== 'mouse') return;
      this.browse(true);
      if (index() !== this.focused) this.events.focus(index());
    });
    // Only the lifted card tilts toward the pointer: over a slot, the card is drawn elsewhere.
    if (lifted) b.addEventListener('pointermove', (e) => this.aim(index(), e));
    b.addEventListener('pointerleave', (e) => {
      if (lifted) this.placed[index()]?.view.tiltGoal.set(0, 0);
      if (e.pointerType === 'mouse' && this.browsing) this.leaveTimer = window.setTimeout(() => this.browse(false), LEAVE_MS);
    });
    b.addEventListener('pointerdown', (e) => {
      b.setPointerCapture?.(e.pointerId);
      const i = index();
      const press = { index: i, flipped: false, timer: 0 };
      press.timer = window.setTimeout(() => {
        // A long press flips the card (focusing it first) instead of playing it.
        press.flipped = true;
        this.browse(true);
        if (i !== this.focused) this.events.focus(i);
        this.flipFocused();
      }, LONG_PRESS_MS);
      this.press = press;
    });
    const release = (e: PointerEvent, cancelled: boolean) => {
      const press = this.press;
      this.press = null;
      if (!press || press.index !== index()) return;
      clearTimeout(press.timer);
      if (press.flipped || cancelled) return;
      const i = press.index;
      if (e.pointerType === 'mouse' || (this.browsing && i === this.focused)) this.events.play(i);
      else {
        this.browse(true);
        if (i !== this.focused) this.events.focus(i);
      }
    };
    b.addEventListener('pointerup', (e) => release(e, false));
    b.addEventListener('pointercancel', (e) => release(e, true));
  }

  /** A press anywhere off the hand (a tap on the board, say) ends its focus. */
  private readonly onPressAnywhere = (e: PointerEvent): void => {
    if (this.browsing && !(e.target instanceof Node && this.root.contains(e.target))) this.browse(false);
  };

  /** Tilts the focused card toward the pointer over it. */
  private aim(i: number, e: PointerEvent): void {
    const s = this.spots[i];
    const p = this.placed[i];
    if (!s || !p || i !== this.focused) return;
    p.view.tiltGoal.set(THREE.MathUtils.clamp((e.clientX - s.x) / (s.w / 2), -1, 1), THREE.MathUtils.clamp(-(e.clientY - s.y) / (s.h / 2), -1, 1));
  }

  /** Places the boxes, stamps and keys line for the current focus, mode and screen. */
  private layout(): void {
    ({ cards: this.spots, slots: this.slots } = layoutHand(this.cards.length, this.focused, innerWidth, innerHeight, this.browsing ? 'focus' : 'tucked'));
    const put = (b: HTMLElement, s: CardSpot, card: CardSpot) => Object.assign(b.style, {
      width: `${s.w}px`, height: `${s.h}px`, zIndex: String(s.z), fontSize: `${card.h * 0.065}px`,
      transform: `translate(${s.x - s.w / 2}px, ${s.y - s.h / 2}px) rotate(${s.rot}deg)`,
    });
    this.boxes.forEach((b, i) => put(b, this.slots[i], this.spots[i]));
    const lifted = this.spots[this.focused];
    if (lifted) put(this.spotBox, lifted, lifted);
    this.refresh();
    // The line of keys beside the lifted card where there is room (it stands near the top), else above the hand.
    const keysW = this.keysEl.offsetWidth;
    const right = lifted ? lifted.x + lifted.w / 2 : innerWidth;
    if (this.browsing && lifted && innerWidth - right >= keysW + 32) {
      Object.assign(this.keysEl.style, { left: `${right + 16}px`, top: `${lifted.y - lifted.h / 2}px`, transform: 'none' });
    } else {
      const top = Math.min(...this.spots.map((s) => s.y - s.h / 2), innerHeight);
      Object.assign(this.keysEl.style, { left: '', top: `${Math.max(4, top - 34)}px`, transform: '' });
    }
  }

  /** The cards' states: dim, stamps, the clip on the focused card only. */
  private refresh(): void {
    // Put away, the cards take no pointer while they sink (the foes' card never takes one).
    this.keysEl.hidden = !this.shown || !this.browsing;
    this.root.classList.toggle('tucked', !this.browsing);
    // The panels at the screen's bottom stand clear of the tucked cards while the hand is up.
    document.body.classList.toggle('hand-shown', this.shown);
    const stampOf = (i: number) => {
      const state = this.states[i] ?? '';
      const stamp = state === 'played' ? 'IN PLAY' : state === 'used' ? 'USED' : '';
      return { state, html: stamp ? `<div class="stamp">${stamp}</div>` : '' };
    };
    // In focus, the focused card's stamp goes with it to the middle; its slot keeps a faint outline.
    const lifted = this.shown && this.browsing && !!this.spots[this.focused];
    this.boxes.forEach((b, i) => {
      b.style.display = this.shown ? '' : 'none';
      const { state, html } = stampOf(i);
      const up = lifted && i === this.focused;
      b.className = `card${state ? ` ${state}` : ''}${i === this.focused ? ' focus' : ''}${up ? ' lifted' : ''}`;
      b.innerHTML = up ? '' : html;
    });
    this.spotBox.style.display = lifted ? '' : 'none';
    if (lifted) {
      const { state, html } = stampOf(this.focused);
      this.spotBox.className = `card spot${state ? ` ${state}` : ''}`;
      this.spotBox.innerHTML = html;
    }
    // The focused card plays its clip while the hand is in focus.
    this.placed.forEach((p, i) => p?.view.hover(this.shown && this.browsing && i === this.focused && !p.view.flipped));
  }

  private foeSpot(): { x: number; y: number; h: number } {
    const h = Math.min(innerHeight * 0.42, innerWidth * 0.42 * CARD_WORLD_H);
    return { x: innerWidth - h / CARD_WORLD_H / 2 - Math.max(16, innerWidth * 0.04), y: innerHeight * 0.48, h };
  }

  private readonly onResize = (): void => {
    if (this.shown) {
      this.layout();
      this.sizeArt();
    }
  };

  /** Starts the loop (if anything is up) and shows the canvas. */
  private wake(): void {
    this.root.hidden = false;
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    const dt = this.last === null ? 1 / 60 : Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.clock += dt;
    const W = innerWidth;
    const H = innerHeight;
    // Sized only when the screen changes: setting a canvas's size clears and reallocates it.
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== W || size.y !== H || this.renderer.getPixelRatio() !== devicePixelRatio) {
      this.renderer.setPixelRatio(devicePixelRatio);
      this.renderer.setSize(W, H, false);
    }
    this.camera.aspect = W / H;
    // At z = 0 one world unit is one CSS pixel.
    this.camera.position.set(0, 0, H / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    this.camera.updateProjectionMatrix();

    const k = 1 - Math.exp(-dt * 10);
    const flyer = this.flight?.p;
    let moving = this.flyStep(dt);
    this.placed.forEach((p, i) => {
      if (!p) return;
      const s = this.spots[i];
      // Put away: the cards sink below the screen. The one in flight follows its arc.
      const goal = this.shown ? s : { ...s, y: H + s.h };
      if (p === flyer) {
        this.place(p, 250);
        p.view.update(this.clock, dt, this.renderer, true);
        return;
      }
      moving = this.ease(p, goal, k) || moving;
      const dimGoal = this.states[i] === 'used' || this.states[i] === 'played' ? 1 : this.states[i] === 'locked' ? 0.6 : 0;
      p.view.dim += (dimGoal - p.view.dim) * k;
      this.place(p, i === this.focused ? 120 : s.z * 2);
      // The focused card redraws its art every frame; the resting ones (slow light, drifting
      // motes) every third, staggered so each frame redraws a few.
      p.view.update(this.clock, dt, this.renderer, i === this.focused || (this.ticks + i) % 3 === 0);
    });
    if (this.foe) {
      const f = this.foe;
      f.t += dt;
      const s = this.foeSpot();
      const goal = f.leaving ? { x: W + s.h, y: s.y, h: s.h, rot: 8 } : { ...s, rot: f.t < FOE_IN ? 8 : 0 };
      if (f !== flyer) this.ease(f, goal, 1 - Math.exp(-dt * 8));
      if (!f.leaving && f.t >= FOE_FLIP_AT && f.view.flipped) f.view.flip();
      this.place(f, 200);
      f.view.update(this.clock, dt, this.renderer);
      if (f.leaving && f !== flyer && f.pose.x > W + s.h * 0.4) {
        this.scene.remove(f.view.group);
        this.foe = null;
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.ticks++;
    // Nothing up and nothing still sliding away: stop drawing and get out of the way.
    if (!this.shown && !this.foe && !this.flight && !moving) {
      this.frame = 0;
      this.last = null;
      this.renderer.clear();
      this.root.hidden = true;
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  /** Eases `p`'s pose toward `goal`; returns whether it is still on its way. */
  private ease(p: Placed, goal: { x: number; y: number; h: number; rot: number }, k: number): boolean {
    const q = p.pose;
    q.x += (goal.x - q.x) * k;
    q.y += (goal.y - q.y) * k;
    q.h += (goal.h - q.h) * k;
    q.rot += (goal.rot - q.rot) * k;
    return Math.abs(goal.y - q.y) + Math.abs(goal.x - q.x) > 0.5;
  }

  /**
   * Puts `p`'s card at its pose, `z` pixels toward the viewer (to stack over the others), drawn
   * back by its nearness so the perspective neither grows it nor pushes it off its spot.
   */
  private place(p: Placed, z: number): void {
    const { x, y, h, rot } = p.pose;
    const g = p.view.group;
    const back = (this.camera.position.z - z) / this.camera.position.z;
    g.position.set((x - innerWidth / 2) * back, (innerHeight / 2 - y) * back, z);
    g.scale.setScalar((h / CARD_WORLD_H) * back);
    g.rotation.z = THREE.MathUtils.degToRad(-rot);
  }
}
