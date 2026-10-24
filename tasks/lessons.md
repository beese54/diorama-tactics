# Lessons

## 2026-10-24: "It looks too flat"
- **What happened:** M1 shipped a flat grid because the roadmap put elevation in M2. The user judged it on looks and found it underwhelming.
- **Rule:** For visual milestones, ask "what is the defining visual quality the user pictured?" (here: elevation and terrain variety) and put it in the *first* thing they see. Split milestones by visual impact, not just by engineering layer.
- **Rule:** When placeholder data drives the visuals (test map), make it express the feature's attributes (terrain → height) instead of leaving it uniform.

## 2026-10-24: "rounding doesn't have to be uniform" / "river shades per tile look unnatural"
- **What happened:** I shipped rounding and water colours that were uniform per tile. The user wants the look of the real outdoors: varied shapes, and colours that ignore tile borders.
- **Rule:** For anything meant to look natural (terrain shape, water, foliage, weather), vary it with smooth world-space noise by default, and paint per pixel across tile borders when a feature spans tiles. The tile grid is for gameplay, not for how nature is drawn.
- **Rule:** Keep variation a pure function of world position, so neighbouring tiles agree and no cracks appear.

