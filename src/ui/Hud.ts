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
  /** Grows a new random map; generated themes only. */
  newMap?: () => void;
  save: () => void;
  load: (file: File) => void;
}

/** How long a notice stays up, in ms. */
const NOTICE_MS = 5000;

/**
 * FFT-style box in the top-left corner: the map's name and seed, pickers for the map and the
 * weather, buttons to grow a new map, save it as JSON or load a saved one, and a line for
 * short notices.
 */
export class Hud {
  private readonly title: HTMLElement;
  private readonly notice: HTMLElement;
  private noticeTimer = 0;

  constructor(parent: HTMLElement, actions: HudActions) {
    const el = document.createElement('div');
    el.id = 'hud';
    el.innerHTML = '<div class="title"></div><div class="buttons"></div><div class="notice" hidden></div>';
    this.title = el.querySelector('.title')!;
    this.notice = el.querySelector('.notice')!;
    const buttons = el.querySelector('.buttons')!;

    const button = (label: string, key: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = `${label} (${key})`;
      b.addEventListener('click', onClick);
      buttons.appendChild(b);
    };
    const select = (title: string, options: readonly { id: string; name: string }[], current: string, onChange: (id: string) => void) => {
      const s = document.createElement('select');
      s.title = title;
      for (const { id, name } of options) s.add(new Option(name, id, false, id === current));
      s.addEventListener('change', () => onChange(s.value));
      buttons.appendChild(s);
    };
    select('Switch map', actions.maps, actions.current, actions.pick);
    select('Weather', actions.weathers, actions.weather, actions.pickWeather);

    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.json,application/json';
    picker.hidden = true;
    picker.addEventListener('change', () => {
      const file = picker.files?.[0];
      picker.value = '';
      if (file) actions.load(file);
    });
    if (actions.newMap) button('New map', 'R', actions.newMap);
    button('Save', 'E', actions.save);
    button('Load', 'or drop a file', () => picker.click());
    el.appendChild(picker);
    parent.appendChild(el);
  }

  setTitle(name: string, seed?: number): void {
    this.title.textContent = seed === undefined ? name : `${name}  #${seed}`;
  }

  /** Shows a short message (a load error, say) that fades after a few seconds. */
  say(text: string): void {
    this.notice.textContent = text;
    this.notice.hidden = false;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => (this.notice.hidden = true), NOTICE_MS);
  }
}
