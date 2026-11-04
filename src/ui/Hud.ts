import { audio } from '../audio/Audio';
export interface HudActions {
  /** The maps the picker offers, and the one on screen. */
  maps: readonly { id: string; name: string }[];
  current: string;
  /** Switches to another map. */
  pick: (id: string) => void;
  /** The weathers the second picker offers, the one chosen, and what to do on a change. */
  weathers: readonly { id: string; name: string }[];
  weather: string;
  pickWeather: (id: string) => void;
  /** The times of day the third picker offers, the one chosen, and what to do on a change. */
  times: readonly { id: string; name: string }[];
  time: string;
  pickTime: (id: string) => void;
  /** Board sizes the fourth picker offers (generated maps only), the one chosen, and what to do on a change. */
  sizes?: readonly { id: string; name: string }[];
  size?: string;
  pickSize?: (id: string) => void;
  /** Skirmish or map viewer, the one on, and what to do on a change. */
  modes: readonly { id: string; name: string }[];
  mode: string;
  pickMode: (id: string) => void;
  /** How the foes play (B7): Easy or Hard, the one on, and what to do on a change; skirmish only. */
  foes?: readonly { id: string; name: string }[];
  foesLevel?: string;
  pickFoes?: (id: string) => void;
  /** Grows a new random map; generated themes only. */
  newMap?: () => void;
  save: () => void;
  load: (file: File) => void;
}

/** How long a notice stays up, in ms. */
const NOTICE_MS = 5000;

/**
 * FFT-style bar in the top-left corner, kept small so the board shows: the map's name and seed, a
 * MENU button (Tab) and the sound switch (M). The menu folds out beneath it: pickers for the map,
 * the mode (skirmish or map viewer), the foes, the weather, the time of day and (on generated
 * maps) the board size, the volumes, and buttons to grow a new map, save it as JSON or load a
 * saved one. It folds away again on a click outside, Tab or Esc, or once a choice is made. Short
 * notices show on their own at the top of the screen.
 */
export class Hud {
  private readonly el: HTMLElement;
  private readonly title: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly notice: HTMLElement;
  private noticeTimer = 0;

  constructor(parent: HTMLElement, actions: HudActions) {
    const el = (this.el = document.createElement('div'));
    el.id = 'hud';
    el.innerHTML = '<div class="bar"><span class="title"></span></div><div class="menu" hidden><div class="buttons"></div></div>';
    this.title = el.querySelector('.title')!;
    this.menu = el.querySelector('.menu')!;
    const bar = el.querySelector('.bar')!;
    const buttons = el.querySelector('.buttons')!;
    this.notice = Object.assign(document.createElement('div'), { id: 'notice', hidden: true });

    this.toggle = Object.assign(document.createElement('button'), { type: 'button', className: 'menu-toggle', textContent: 'Menu', title: 'Menu (Tab)' });
    this.toggle.addEventListener('click', () => this.toggleMenu());
    bar.appendChild(this.toggle);
    // A click anywhere else folds the menu away.
    addEventListener('pointerdown', (e) => this.menuOpen && !el.contains(e.target as Node) && this.closeMenu(), true);

    const button = (label: string, key: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = `${label} (${key})`;
      b.addEventListener('click', () => {
        this.closeMenu();
        onClick();
      });
      buttons.appendChild(b);
    };
    const select = (title: string, options: readonly { id: string; name: string }[], current: string, onChange: (id: string) => void) => {
      const s = document.createElement('select');
      s.title = title;
      for (const { id, name } of options) s.add(new Option(name, id, false, id === current));
      s.addEventListener('change', () => {
        this.closeMenu();
        onChange(s.value);
      });
      buttons.appendChild(s);
    };
    select('Switch map', actions.maps, actions.current, actions.pick);
    select('Skirmish or map viewer', actions.modes, actions.mode, actions.pickMode);
    if (actions.foes && actions.pickFoes) select('How the foes play', actions.foes, actions.foesLevel ?? 'easy', actions.pickFoes);
    select('Weather', actions.weathers, actions.weather, actions.pickWeather);
    select('Time of day', actions.times, actions.time, actions.pickTime);
    if (actions.sizes && actions.pickSize) select('Board size', actions.sizes, actions.size ?? '', actions.pickSize);

    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.json,application/json';
    picker.hidden = true;
    picker.addEventListener('change', () => {
      const file = picker.files?.[0];
      picker.value = '';
      if (file) actions.load(file);
    });
    // Sound (B8): the speaker on the bar mutes it all (M); the menu's sliders set the music's and the effects' volumes.
    const speaker = document.createElement('button');
    speaker.type = 'button';
    speaker.className = 'speaker';
    speaker.addEventListener('click', () => audio.toggleMute());
    bar.appendChild(speaker);
    const slider = (label: string, channel: 'music' | 'effects') => {
      const l = document.createElement('label');
      l.className = 'volume';
      l.title = `${channel === 'music' ? 'Music' : 'Effects'} volume`;
      const input = Object.assign(document.createElement('input'), { type: 'range', min: '0', max: '1', step: '0.05' });
      input.addEventListener('input', () => audio.set({ [channel]: Number(input.value), muted: false }));
      l.append(label, input);
      buttons.appendChild(l);
      return input;
    };
    const [musicInput, effectsInput] = [slider('MUS', 'music'), slider('SFX', 'effects')];
    const showSound = () => {
      const st = audio.settings;
      speaker.textContent = st.muted ? 'Sound: off' : 'Sound: on';
      speaker.title = st.muted ? 'Sound off: turn it on (M)' : 'Sound on: mute it (M)';
      musicInput.value = String(st.music);
      effectsInput.value = String(st.effects);
    };
    audio.onChange(showSound);
    showSound();
    if (actions.newMap) button('New map', 'R', actions.newMap);
    button('Save', 'E', actions.save);
    button('Load', 'or drop a file', () => picker.click());
    el.appendChild(picker);
    parent.appendChild(el);
    parent.appendChild(this.notice);
  }

  /** Whether the menu is folded out. */
  get menuOpen(): boolean {
    return !this.menu.hidden;
  }

  toggleMenu(): void {
    if (this.menuOpen) this.closeMenu();
    else {
      this.menu.hidden = false;
      this.el.classList.add('open');
      this.toggle.classList.add('on');
    }
  }

  closeMenu(): void {
    if (!this.menuOpen) return;
    this.menu.hidden = true;
    this.el.classList.remove('open');
    this.toggle.classList.remove('on');
  }

  setTitle(name: string, seed?: number): void {
    this.title.textContent = seed === undefined ? name : `${name}  #${seed}`;
  }

  /** Shows a short message (a load error, say) that fades after a few seconds. */
  say(text: string): void {
    this.notice.textContent = text;
    this.notice.hidden = false;
    // Its fade starts again with each notice.
    this.notice.style.animation = 'none';
    void this.notice.offsetWidth;
    this.notice.style.animation = '';
    clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => (this.notice.hidden = true), NOTICE_MS);
  }
}
