# Visual history

This folder shows how the game's look has improved over time, one version after another. Each part of the game has its own folder:

| Folder | What it covers | Status |
|---|---|---|
| [land/](#land) | The world map terrain | M0 to M16 done |
| [characters/](#characters) | Units on the map | B1 in review |
| [battles/](#battles) | Battle scenes | B2 style frame in review |

**How the pictures are made.** Every version is rendered from its own git commit, using the same camera views each time, so the pictures can be compared side by side. The script is `scripts/snapshot.mjs`. Animated versions also get a GIF from `scripts/gif.mjs`.

**Every stage is kept, not only the milestones.** Review rounds and fixes are stages too:
- [land/stages.json](land/stages.json) lists every stage in order, with its commit, date, picture and the feedback behind it.
- `scripts/timeline.mjs` turns that list into the timeline GIF below.
- A shipped picture is never overwritten. A review round goes in its milestone's `r<N>-<topic>/` folder, with a before/after picture from `scripts/compare.mjs`.
- Each visual commit's message has a **Progress** section that names the stage, what now looks different, and the pictures added. `git log` reads as a running diary.

Each version records three things: what changed, the feedback that caused the change, and what I learned. The rules I took from each correction are in [tasks/lessons.md](../tasks/lessons.md).

---

## Battles

![Timeline of every battle version](battles/timeline.gif)

### B8 r0: sound, the four transitions, and battle effects (for review)
![A blow lands: sparks tinted by the axe, a ring and a star, and Forced March's light on Aria's squad](battles/b8-polish/r0-review/4-sparks-1.jpg)

| The card flies to the turn box | The wipe into battle | The VS slam | The Morale loss punches in | The foes' banner |
|---|---|---|---|---|
| ![](battles/b8-polish/r0-review/1-card-flight.jpg) | ![](battles/b8-polish/r0-review/2-wipe.jpg) | ![](battles/b8-polish/r0-review/3-intro-vs-slam.jpg) | ![](battles/b8-polish/r0-review/5-outro.jpg) | ![](battles/b8-polish/r0-review/6-foes-banner.jpg) |

Video with sound: [`b8-polish.mp4`](battles/b8-polish/r0-review/b8-polish.mp4), 33 s: a card played, an attack, the battle with a skill, and back to the foes' turn.

**What changed**
- **Sound, made in code:** steel on steel, blows landing, crits, arrows, spells, the charge, the skill cut-in, cards played and focused, the wipe, and the victory and defeat stings. Each sound varies a little in pitch, so repeats don't sound mechanical. No sound plays until the first click, tap or key, as browsers require.
- **Sound controls:** the menu has a Sound button (M mutes from anywhere), plus Music (MUS) and Effects (SFX) sliders, kept between visits.
- **Music is ready for your loops:** four prompts are in `scripts/art/prompts/music.md` (map, battle, victory, defeat). Until the files arrive there is simply no music, and the game asks for no missing files.
- **Four transitions, all kept:**
  - a blade wipes the board into a battle and back out (a Union's battles stay covered in between);
  - "Your turn" (blue) or "Foes' turn" (red) sweeps across as each turn starts;
  - the played card lifts out of the hand and flies to the turn box, which glows as it lands;
  - battles open with the banners sliding in and the VS slamming down, and at the result the Morale loss punches in.
- **Battle effects:**
  - every blow bursts in sparks tinted by its weapon (steel white-gold, an axe orange, a spear's long streaks, a staff violet), with a ring, a flash and a star, bigger on a crit;
  - a charging squad kicks up a dust trail;
  - while a skill is in play, its squad glows in the skill's colour.

**Feedback**
- Audio: "Code SFX + your music"; transitions: "can you do all four and show it to me? i will then decide", then "keep all four transitions"; the art pass: "Battle effects"; controls: "Mute button + volume".

**Decisions**
- **The sound effects are synthesised, not recorded:** each is a small recipe of oscillators, filtered noise and envelopes, so the repo carries no audio assets.
- **The battle's sounds and effects follow the clock,** like everything else in the scene: a capture at a given second always shows the same sparks and asks for the same sounds.
- **The review video carries the game's own sound:** the game logs each effect with its time, the log is rendered offline to a WAV, and the WAV is laid under the recording.

**Learned**
- **An intro started when its HUD was built played unseen** under the wipe while the battle loaded. It starts now once the battle is ready.
- **The first sparks were too faint on the bright meadow.** They needed a star, a larger flash and drawing over every fighter.
- **A new button can catch a check's click.** An earlier check's click landed on the new speaker button and left the game muted, so the sound checks now start from cleared settings.

### B7: the foes play, and battles end
![A foe attack: Varek (red, left) charges, Aria (blue, right) defends with the stance keys](battles/b7-foes/foe-attack.jpg)

| The foes' turn: card, march, attack | Victory | Defeat | The Foes picker |
|---|---|---|---|
| ![](battles/b7-foes/foes-turn.gif) | ![](battles/b7-foes/victory.jpg) | ![](battles/b7-foes/defeat.jpg) | ![](battles/b7-foes/picker.jpg) |

Video: [`foes-turn.mp4`](battles/b7-foes/foes-turn.mp4): the foes play King's Wager, Varek rides up and attacks Corin, who defends aggressively and wins.

**What changed**
- **The foes play real turns** under the same rules as the player: they choose a card, move on its shared MOV pool, and make one attack, as a Union when allies stand on the attacker's shape. Their skills fire on their own when ready, and their All In fills their gauges.
- **Two ways to play them,** picked in the menu (Foes: Easy / Hard), or with `?foes=hard`:
  - **Easy** is bold: the foes march on the nearest ally and take whatever fight in reach hurts most.
  - **Hard** is cautious and sharp: the foes seek strong ground, line up a Union behind their attacker, and only attack when the rules forecast at least a 60% chance of coming out ahead.
- **Defending:** a foe attack plays in full, with the foe on the left and your unit on the right, and you set your stance with A, S or D.
- **Battles end:** when every foe or every ally has fallen, VICTORY (gold) or DEFEAT (crimson) comes up over the board, with the turns, the battles won, the foes felled and the allies lost. **Play again** (Enter) restarts the same map; **New map** (R) moves on.
- **Banners follow sides:** your side's banner is blue with the stance keys and the foes' red, whichever end of the field each stands at.

**Feedback**
- Foe AI: "Choose per battle"; win and lose: "Defeat every unit"; defending: "The full battle"; the end: "Result screen".

**Decisions**
- **The AI lives in the rules core** (`src/game/ai.ts`, pure and tested), and plans a turn the rules then replay. Every move it makes is one the player could make.
- **Fights are forecast by the rules themselves:** the AI plays the Union chain over 8 fixed seeds to judge a fight. It never looks at the real battle's seed.
- **The foes split the shared pool and advance together,** steering by the real walking cost around cliffs and water.

**Learned**
- **A shared pool spent greedily moves one unit.** At first the nearest foe spent the whole pool every turn and trickled in alone.
- **A straight-line distance leads into dead ends.** The first version marched the foes along the board's edge into a corner a cliff cut off; walking cost fixed it.
- **Colours tied to the screen's side broke the moment the foes attacked.** Varek showed in blue and Aria in red; colours now follow allegiance.

### B6 r1: a slower cut-in, the card in focus
![Before and after: the cut-in at 1.9 s, and at 4.2 s with the battle dimmed and the clip larger](battles/b6-skills/r1-slower/compare.jpg)

| The new cut-in, as it plays | Mid-cut-in |
|---|---|
| ![](battles/b6-skills/r1-slower/cut-in.gif) | ![](battles/b6-skills/r1-slower/cut-in.jpg) |

Video: [`firestorm.mp4`](battles/b6-skills/r1-slower/firestorm.mp4).

**What changed**
- **The cut-in lasts 4.2 s, not 1.9.** The band sweeps in for half a second, then holds with a slow drift while the card's clip plays, then leaves in the flash.
- **The card's clip is the focus.** The battle behind dims, the band is taller, and the clip is about 40% larger with a gold glow. The skill's name eases in beside it, a little smaller than before.
- **Skippable:** K, Space or Enter ends the cut-in at once, so it never slows a player who has seen it.

**Feedback**
- "i liked the card details and animation but i find the transition too fast, can we slow it down to have more focus on the card animation?"

**Decisions**
- **The length is set in one place,** `CUT_IN_SECONDS` in `CutIn.ts`, and the styles read it through a CSS variable, so the timing and the animation can't drift apart.

**Learned**
- **Screenshots taken during a screen recording stall the page,** so the recording stretches, and a timing read between shots is wrong. My first look said the cut-in ended after 2.25 s; a log in the page showed it lasted its full 4.2. The clean recordings take no shots while they record.

### B6: Card skills
![Firestorm's cut-in: Ember Rite's own clip sweeping across the battle](battles/b6-skills/firestorm-cut-in.jpg)

| Firestorm: the choice, the cut-in, the blast | Ready: K fires, Space saves | Forced March's cut-in | The blast's aftermath |
|---|---|---|---|
| ![](battles/b6-skills/firestorm.gif) | ![](battles/b6-skills/firestorm-ready.jpg) | ![](battles/b6-skills/march-cut-in.jpg) | ![](battles/b6-skills/firestorm-result.jpg) |

Videos: [`firestorm.mp4`](battles/b6-skills/firestorm.mp4) (Ilse, Ember Rite) and [`forced-march.mp4`](battles/b6-skills/forced-march.mp4) (Aria, Long Road).

**What changed**
- **The skill gauge carries over.** Each unit keeps its gauge from battle to battle, filling it with the blows it lands and the duels it wins (faster when Aggressive, not at all when Passive). The unit panel shows it as SKL.
- **A skill fires only when it can.** The unit's gauge must be full, and it must wield the card's ACE (or the card must be for All).
- **The battle stops to ask.** When it can fire, the battle holds at its opening with a guide: the card, its skill and what it does. K, or the guide's button, fires it now; Space saves the gauge for a later battle. When it can't fire, the guide says why: "Charging 60 / 100", or "Needs ACE LANCE".
- **Firing plays the cut-in.** A band sweeps across with the card's own hover clip playing in it and the skill's name in gold, then leaves in a white flash. Then the battle plays with the effect.
- **The effects:**
  - Forced March: +3 edge.
  - Lance Charge and Volley: the opening volley strikes twice.
  - Blade Dance: each duel won fells a second foe.
  - Pike Wall: the foe's charge and counter miss.
  - Firestorm: a blast at every foe.
  - Hold Fast: half the Morale lost.
  - Rend: +20 Morale on a win.
  - Parry: the first three blows at the leader miss.
  - Trample: the charge fells the front rank.
  - Executioner: duels with the foe's leader are won outright.
- **Hit-stop and shake:** where a skill's blow lands, the battle freezes for a beat and shakes.
- **King's Wager's All In** acts when the card is played: every ally's gauge fills.

**Feedback**
- "Player presses K, include a small user guide during battle so that users can choose to recharge to use".
- On All In: "Keep it, fire on play". On the cut-in: "The card's clip in a band".

**Decisions**
- **The battle holds for the choice rather than asking at any time:** most skills act at the charge, so the choice comes before it. Saving is a real choice, as a gauge kept full can fire with a better card.
- **The gauge lives in the rules** (ClashSim), and the scene only draws it, so every check compares the battle shown with the rules, skill included.
- **Firestorm's blast hits by chance** (very likely, not certain). One sure blow on every foe would have felled whole squads and won every battle outright.
- **Pike Wall's text sharpened** to "The foe's charge and counter miss.": when you attack, the foe's blows come in its counter.

**Learned**
- **A skill's effect needs a time before the battle starts.** The gauge used to begin each battle at zero and was thrown away after, so a charge skill could never be ready in time. Carrying the gauge on the unit fixed both.

### B5: Unions
![Aria selected: her Union of three marked violet, Gorran the target in red](battles/b5-unions/highlight.jpg)

| The second battle of the chain | Battle 1: Aria | Battle 3: Corin | Back on the board |
|---|---|---|---|
| ![](battles/b5-unions/union.gif) | ![](battles/b5-unions/battle-1.jpg) | ![](battles/b5-unions/battle-3.jpg) | ![](battles/b5-unions/after.jpg) |

Video: [`union-attack.mp4`](battles/b5-unions/union-attack.mp4), the whole three-battle attack.

**What changed**
- **A unit attacks with its Union.** A woman leads a + of the four tiles beside her, a man an × of his four corners: the allies standing there join her attack.
- **On the board:**
  - selecting a unit marks the allies on its shape in violet, and edges the shape's empty places, where an ally would join;
  - the unit panel reads "UNION ×3".
- **The attack is a chain of battles:**
  - the leader fights the foe first, then each member fights the same foe in turn, every battle in full;
  - each battle's HUD reads "UNION 2 / 3" under the VS;
  - each loser loses its Morale before the next battle, so the foe carries its losses down the chain;
  - the chain stops as soon as the foe falls.
- **In the video,** Aria wins her battle (Gorran −45), then Bram and Corin each lose theirs to Gorran's axe (−35 and −37 to them). A notice sums up the whole attack.

**Feedback**
- Asked whom each member fights: "Same target, chained". Asked about pacing: "All in full".

**Decisions**
- **The chain is one function in the rules core** (`fightUnion`), with the battle passed in. The game plays each battle on screen, and the tests use the rules alone. So the same loop is checked both ways: 6 Vitest cases, and the browser checks compare every battle with the rules.
- **Violet for the Union.** It was gold at first, but the path preview is yellow and the two read alike. No other mark is violet.
- **A lone unit is a Union of one:** an attack without allies on the shape is the same single battle as before.

**Learned**
- **Every attack is a Union attack now,** so the older single-battle checks had to make their attacker stand alone. Before, an ally that happened to stand on the hero's shape opened a second battle the check didn't expect.

### B4 r5: the hand of animated cards
![The hand over the board: the card under the pointer risen, playing its clip](battles/b4-cards/r5-hand/focus.jpg)

| Choosing, flipping, playing, and the foes' card | On a phone: the chosen card lifts clear | Its back (long press) | The foes' card |
|---|---|---|---|
| ![](battles/b4-cards/r5-hand/hand.gif) | ![](battles/b4-cards/r5-hand/phone-focus.jpg) | ![](battles/b4-cards/r5-hand/phone-flip.jpg) | ![](battles/b4-cards/r5-hand/foe.jpg) |

Videos: [`hand-desktop.mp4`](battles/b4-cards/r5-hand/hand-desktop.mp4) and [`hand-phone.mp4`](battles/b4-cards/r5-hand/hand-phone.mp4).

**What changed**
- **The hand is the animated cards now.** The B4 pixel menu boxes are gone. The cards draw on a canvas of their own over the board, at full device resolution and smooth like the battle scenes; the board stays pixel art beneath them.
- **Choosing:**
  - the cards fan along the bottom;
  - the one under the pointer (or the arrows) rises, grows, tilts toward the pointer and plays its clip, and the card before it stops;
  - a click (or Z) plays it.
- **On a phone:** a tap brings a card up, a second tap plays it, and a long press turns it over. The chosen card lifts clear above the row, several times its size, so it can be read, and every other card stays in reach of a finger. The keys line speaks of taps on a touch screen.
- **F turns the chosen card over** to its crested back, and back again.
- **Spent cards** are greyed, and stamped USED, or IN PLAY for this turn's card.
- **The foes' turn:** their card slides in face down on crimson stock and turns face up. Their turn lasts 2.6 s (from 1.5) so the turn can be watched.
- **When the hand is put away,** its cards sink off the screen and the canvas stops drawing, so the board costs what it did before.

**Feedback**
- "go" (to the hand, after "For cards, I dont want pixel art, I want animated cards that show motion.")

**Decisions**
- **The same card renderer as the showcase,** with sizes chosen for the hand:
  - each card's frame is painted at the size it's drawn (on desktop, a quarter of the showcase's scale);
  - every card on a side shares one painted back;
  - the art layers are scaled down as they load, to 512 px on desktop and 768 on a phone;
  - the clips load only when a card is first chosen.
- **The cards that aren't chosen redraw their art every third frame.** Their light and motes move slowly, and the chosen card redraws every frame.
- **The foes' cards are pre-loaded in the background** once the player's hand is up, so theirs shows the moment they play it.
- **The turn box stays in the pixel style.** It belongs to the board, as the tile and unit panels do.

**Learned**
- **One view becoming eight needs its memory worked out first.** At the showcase's sizes the hand was about a gigabyte of textures, and painting them stalled the page for seconds. Sized to how big they're drawn, the cards open at once. On a GPU the hand runs at 150 frames a second open.
- **A page loaded straight after a source edit can look hung to puppeteer.** Vite reloads it as it loads, and the first load's requests never finish in puppeteer's count, so "network idle" never comes.

### B4 r4: all twelve cards
![The 12 cards at rest, each in its own light](battles/b4-cards/r4-eleven/cards.jpg)

| All 12 hover clips at once | Thunder Hoof: lightning, the clip, the flip |
|---|---|
| ![](battles/b4-cards/r4-eleven/clips-grid.gif) | ![](battles/b4-cards/r4-eleven/thunder-hoof.jpg) |

| The 12 cards' art | King's Wager, by candlelight | Ember Rite, the fire aura |
|---|---|---|
| ![](battles/b4-cards/r4-eleven/art-sheet.jpg) | ![](battles/b4-cards/r4-eleven/kings-wager.jpg) | ![](battles/b4-cards/r4-eleven/ember-rite.jpg) |

Videos: [`clips-grid.mp4`](battles/b4-cards/r4-eleven/clips-grid.mp4) (the 12 clips) and [`thunder-hoof-card.mp4`](battles/b4-cards/r4-eleven/thunder-hoof-card.mp4) (one card in the renderer).

**What changed**
- **The other 11 cards** are made the way Long Road was, from `cards.md` Part 3:
  - Seedream drew a plate, a figure layer from the units' standing images and a foreground for each;
  - `cardart.py` composited them, with a glint line along each weapon;
  - Seedance 2.0 Fast made each card's 5 s hover clip, which starts and ends on its still.
- **The art, card by card:**
  - Swift Banner: Edric gallops across a windy plain.
  - Scout's Path: Dela draws on a cliff ledge above a misty gorge.
  - Open Field: two sword soldiers charge through a flowering meadow.
  - Iron Column: Bram and a spearman cross a bridge under a breaking storm.
  - Ember Rite: Ilse turns a ring of fire runes in a stone circle at dusk.
  - Steady Line: two women soldiers brace in the mud.
  - Cleaver's Oath: Corin swears on his axe over a bonfire.
  - Shield Wall: two soldiers lock shields at a torchlit gate.
  - Thunder Hoof: Varek charges under lightning.
  - Grave Toll: Gorran stands in a moonlit graveyard.
  - King's Wager: Sabine waits in a candlelit war room.
- **Each card has its own light.** It used to be dawn sunbeams on every card. Now it's twelve kinds: daylight, mist shafts, a storm break, a soft bloom, a fire aura, a cold rim, firelight, torches, lightning, moonbeams and candles, each from where its source is in the plate.
- **Rain and drizzle** fall in streaks, not round motes.
- **The clips are re-encoded at CRF 23,** about a third smaller (all 12 come to 23 MB) for the same look.

**Feedback**
- "go with Fast for the other 11 cards"

**Decisions**
- **Painted light on the green screen is keyed out in code, not prompted away.** Seedream kept drawing sun shafts, moon glows and lightning on the green behind the figures even when told not to, and they keyed as solid shapes.
  - `unlight` drops what is green-tinted or cyan (light mixed with the screen; the figures have no green), and then any leftover piece that touches the picture's edge apart from the figures.
  - `warm` keeps a fire's glow but turns its yellow-green haze warm.
- **A foreground that runs along the whole bottom edge goes in whole,** as drawn. Splitting it into the two corners left a hard seam.
- **Night lights stay small.** An added glow washes a dark scene out, so torches and candles are tight, flickering pools at the flames themselves.

**Learned**
- **Re-prompting doesn't remove light the model wants to draw.** Three of the four retries for it came back with the same glow. Fixing it in the keyer worked for all of them at once.
- **Fast held every clip's last frame.** All 11 ended 4.8 to 9.1 levels from their still, so none jumps when the card fades back to the still.

### B4 r3: the hover clip, three models
![The three test clips side by side, with what each cost](battles/b4-cards/r3-clip/clips-compare.jpg)

| The card playing Fast's clip as the pointer circles | Mid-clip, in the card |
|---|---|
| ![](battles/b4-cards/r3-clip/long-road-clip.gif) | ![](battles/b4-cards/r3-clip/card-clip.jpg) |

The full side-by-side video is [`clips-compare.mp4`](battles/b4-cards/r3-clip/clips-compare.mp4).

**What changed**
- **Long Road's hover clip** was made three times, by Seedance 2.0 Mini, 2.0 Fast and 2.0. Each had the same still as its first and last frame, the same prompt and seed 4242, and ran 5 s at 720p.
  - **Mini ($0.38)** points the sword at the sun, but zooms out and reframes as it goes: the milestone leaves the frame, and the last frame isn't the still.
  - **Fast ($0.61)** points the sword at the sun with the camera held still, and comes back to the still.
  - **2.0 ($0.77)** raises the sword overhead into a starburst, with the camera held still, and comes back to the still.
- **Fast's clip is installed** as `public/cards/long-road/motion.mp4` until the model is picked. On hover, it fades in over the layers and plays once.

**Decisions**
- **The default clip is Fast's, not Mini's** as planned. Mini's last frame is 38 levels off the still on average, against about 6 for Fast and 2.0, so the card would visibly jump when it fades back.

**Learned**
- **Mini doesn't hold the last-frame anchor**, at least for this clip: it treats the last frame loosely and drifts the camera. A clip that has to loop back into a card's still needs Fast or 2.0.
- **A key's model permissions are separate from activating a model.** After activation, the 2.0 models answered 403 AccessDenied until the key was allowed to use them. An empty request costs nothing and tells the two apart: 403 means the key is blocked, and 400 means it's allowed in.

### B4 r2: the animated card
![Long Road tilted toward the pointer: the layers part, foil slides over the gold](battles/b4-cards/r2-card/tilt.jpg)

| At rest, then the pointer circling, then the flip | The card at rest | Its back | The foes' card | A card with no art yet |
|---|---|---|---|---|
| ![](battles/b4-cards/r2-card/long-road-card.gif) | ![](battles/b4-cards/r2-card/card.jpg) | ![](battles/b4-cards/r2-card/back.jpg) | ![](battles/b4-cards/r2-card/foes.jpg) | ![](battles/b4-cards/r2-card/no-art.jpg) |

**What changed**
- **A new card renderer, `src/cards/`**, shown on its own at `?mode=card&id=<card>` (`&side=enemy` for the foes' card). It draws at full device resolution, with nothing of the map's pixel pipeline.
- **The face** is painted on a canvas at twice the design size: the name in gold Cinzel, the skill's name in italic, POW on a crimson medallion and MOV on an azure one, the ACE badge, the skill line, rarity, the crest and the number, inside a double gold border with corner scrolls.
- **The back:** the set's crest (a tower over two crossed blades in a laurel) and DIORAMA TACTICS, on a faint lattice.
- **The art window is a live stack of layers**, redrawn every frame:
  - the plate bends by its depth map;
  - the dawn sunbeams breathe and turn;
  - dust drifts behind and in front of the figures;
  - a glint sweeps along Aria's sword every few seconds;
  - the milestone sits nearest.
  - As the card tilts, each layer shifts by its own depth, so the picture opens up like a window.
- **Motion:**
  - the card tilts toward the pointer by up to 14°, and floats and sways at rest;
  - a click or tap flips it, lifting it through the turn;
  - on a phone, a finger drag or the gyroscope tilts it.
  - Its shadow follows the tilt, the float and the flip.
- **Surface:** holographic foil slides over the gold and the bright metal in the art as the card tilts, and the gold's edges catch a moving light, as if embossed.
- **The foes' cards** use the same art on crimson stock with dark silver.
- **The hover clip** is wired in: it fades in over the art, plays once and holds, then fades out rewound. It waits on the Seedance models being enabled on the account.

**Feedback**
- "For cards, I dont want pixel art, I want animated cards that show motion."

**Decisions**
- **One renderer** will serve the showcase, the hand and the foes' card. The B4 pixel hand stays until the 12 cards have art.
- **`public/cards/index.json`** lists the cards that have art, so a card without any never asks the server for missing files.
- **`depth.png` describes the plate alone.** The figures and the foreground are layers of their own. A plate warped around their outlines would show at their edges.

**Learned**
- **The parallax direction.** Tilting a card's right side away is like stepping to its left, so the far layers slide left and the near ones right. Turning the stack about a middle depth keeps the figures steady while the background and foreground part around them.

### B4 r1: Long Road's card art
![Long Road's art: Aria leads a sword soldier down a dawn road toward a far castle, a milestone and straw grass in front](battles/b4-cards/r1-art/art.jpg)

![The layers: the plate with its contact shadow, the keyed character and foreground, and the depth map](battles/b4-cards/r1-art/layers.jpg)

**What changed**
- **The first card's art, in layers**, for the animated card. Seedream made three images through the API, $0.14 in all:
  - the plate: a winding road at dawn, the castle on a far hill;
  - the figures: Aria leading a sword soldier, made from their own standing images, so both stay on model;
  - the foreground: a milestone and straw grass.
- **`scripts/art/cardart.py`** turns them into `public/cards/long-road/`:
  - it keys the green, places the figures and pushes the foreground pieces into the lower corners;
  - it grades the cutouts toward the plate's light, and lays a soft contact shadow under their feet;
  - it builds a depth map: the sky far, the ground rising toward the viewer, the figures nearer and the foreground nearest.
- **The flat `art.jpg`** is the card's still image, and also the first and last frame of its hover clip.

**Feedback**
- "For cards, I dont want pixel art, I want animated cards that show motion."
- The user chose Seedream for the layers and Seedance for the clips, capped at $12.

**Decisions**
- **Every generation goes through the spending guard** (`scripts/art/spend.mjs`). Each call is priced before it is sent, and refused if it would take the round past the cap. What is spent goes into a ledger outside git.
- **The layers are stored full-frame** (1536², WebP with alpha), so the card stacks them without offsets.
- **`layers.json`** carries the sword's line, for the glint that sweeps along it.

**Learned**
- **The rim light** that the prompt asked for glows into the green screen. The keyer kept that glow as a yellow-green halo around Aria. `defringe` drops edge pixels whose green rises as high as their red. The figures' own warm colours (gold hair, leather) have green well below red, so they stay.
- **Seedream put the "corner" foreground pieces mid-frame.** It's easier to place them in code than to prompt for the exact spot.

### B4: one battle a turn, and the foes' turn
![The foes' turn: the turn box red with Swift Banner, POW 45; then turn 2 opens on the hand with Steady Line used](battles/b4-cards/turn/turn.jpg)

| Aria has walked up to Varek with Steady Line in play: POW 65 for the battle | One full turn: card, walk, battle, the foes, the hand again |
|---|---|
| ![Varek marked as the target](battles/b4-cards/turn/target.jpg) | [one-turn.mp4](battles/b4-cards/turn/one-turn.mp4) ([GIF](battles/b4-cards/turn/one-turn.gif)) |

- **What changed:**
  - **The battle fights at the card's POW** (Steady Line: 65), and coming back from it ends your turn: one battle a turn.
  - **The foes' turn is a real turn now.** The turn box turns red with the card they play, and the board takes no orders for about 1.5 s. Then the next turn opens on your hand. Enter ends your turn at any time.
  - **The foes' hand** loses a card each turn, as yours does.
- **Decisions:**
  - **The foes play their first card left and hold their ground** until their AI arrives in B7.
  - **No keys line on the foes' turn,** as there is nothing to press.
- **Learned:**
  - **The board's clock counted the time spent in a battle:** the board stops drawing while a battle has the screen, but its timer kept running. The first frame back carried the whole battle as one step, so the foes' turn ended at once and the board's clock jumped. The timer is now reset when the battle hands the screen back, so the board picks up exactly where it was.
  - **Videos step the page's frames by hand:** screenshots are slower than the game, so the capture script queues the page's animation frames and runs 2.5 of them per video frame. Walks and the foes' 1.5 s then play at their real speed.
  - All 115 browser checks pass, and the map viewer is still pixel-identical (70 of 70).

### B4: the hand of cards
![The turn opens on the hand: eight cards along the bottom, Steady Line raised with its skill, Hold Fast, in the box above](battles/b4-cards/hand/focus.jpg)

| Steady Line played: the turn box shows it, MOV 10 of 10 | Turn 4: three cards used and greyed, Grave Toll in play |
|---|---|
| ![Steady Line played](battles/b4-cards/hand/played.jpg) | ![The hand later in the game](battles/b4-cards/hand/later.jpg) |

- **What changed:**
  - **Each turn opens on your hand:** 8 cards along the bottom in the map's menu style. Each card shows its name, POW, MOV and ACE, and the card under the cursor shows its skill in the box above. While the hand is open, the tile and unit panels step aside.
  - **The card played sets the turn:**
    - its MOV is the pool all your units share;
    - its POW drives the turn's battle.
    - Nobody moves or attacks without one.
  - **Controls:** click a card, or use ←/→ and Z, to play it. X takes it back until a unit moves, and C shows the hand again; once a unit has moved, it is there to look at only.
  - **Used cards** are greyed and stamped USED, and can't be played again. Once all 8 are used, they come back.
  - **The turn box** shows the card in play and the MOV left out of its MOV, or PICK A CARD.
  - **The rules** (`src/game/cards.ts`, `turn.ts`): 12 cards, each with an ACE and a named skill. POW and MOV trade off: POW + 5 × MOV = 115. 8 are dealt to each side by the map's seed.
- **Decisions:**
  - **Menu cards without pictures for now.** Card art comes with a later art round.
  - **The skill text sits in a box above the hand,** because it doesn't fit on a card at the map's pixel scale.
  - **The stamp replaces the ACE line,** so a used card's POW and MOV stay readable.
- **Learned:**
  - The map viewer is pixel-identical to before (70 of 70), and all 111 browser checks pass, including the new card flow: no move without a card, pool = MOV, take back, a used card refused.
  - Vitest's file cache can hide a new source file from a test that globs the source tree. Clearing `node_modules/.vitest-cache` fixes it.

### B3: from the map and back
![Aria is selected and Varek, on the next tile, is marked to attack; the battle; Aria wins and Varek loses 44; back on the board in the same view, Varek's Morale shows 156](battles/b3-battle/from-map/attack.jpg)

![Before and after a battle between two units at Morale 6: Aria loses, drops to 0 and leaves the field](battles/b3-battle/from-map/leaves.jpg)

The whole loop: [map, battle, map](battles/b3-battle/from-map/attack-from-map.mp4) (GIF beside it)

- **What changed:**
  - **Attacking:** select a unit, and any foe on the next tile is marked in bold red. Click it (or Z on it) to attack. A unit may move and then attack, once a turn, but can't attack and then move. A unit that walks up to a foe stays selected, ready to attack.
  - **The battle opens over the board,** at full resolution, while the board stops drawing. It fights on each unit's tile defence (the DEF in the tile panel), and POW 60 until cards arrive (B4).
  - **Going back:** once the battle is over, Space, Enter, Z or a click returns to the board, in the same view. The loser's Morale drops by the battle's damage, the menu box says who won, and a unit at 0 Morale leaves the field.
  - The battle scene is one piece (`BattleScene`) shared by the map and `?mode=battle`; leaving the battle frees its renderer and pictures.
- **Decisions:**
  - Move then attack, not attack then move, as in most tactics games.
  - The Morale drops when the player leaves the result, not while it shows, so the board never changes behind the battle.
- **Learned:**
  - The map viewer is pixel-identical to before (70 of 70 captures), and all 105 browser checks pass, including the camera matrix before and after a battle.
  - The armies deploy packed into corners, so a unit often has no free tile beside it. That's fine for play, but the checks and these pictures move a foe beside a unit, through a hook for checks.

### B3: stance and the skill gauge
![One battle, switched mid-way: neutral at the charge, aggressive from 3 s (edge +4, the gauge fills faster), passive from 7 s (edge 0, the gauge holds at 62), and the result](battles/b3-battle/stance/switch.jpg)

![The player's banner just after A, S and D (top), and after the whole battle in each stance (bottom): the gauge ends at 60, 44 and 0](battles/b3-battle/stance/stances.jpg)

Whole battle: [Sword against axe, switching stance at 3 s and 7 s](battles/b3-battle/stance/stance-switch.mp4) (GIF beside it)

- **What changed:**
  - **Stance keys:** A aggressive, S neutral, D passive. The banner shows the new stance and edge at once; the rules use it from the next beat. The enemy stays neutral until it has an AI (B7).
  - **The edge** now shows on each banner: the weapon triangle, the stance and any card bonus, the same number the rules fight with.
  - **The skill gauge** (`src/game/gauge.ts`, pure and tested) fills by 4 for every blow landed in the charge or the counter and by 6 for every duel won. Aggressive fills it half again as fast; passive fills none. It rises in the banner as each blow lands. Spending it comes with the card skills (B6).
  - `?at=<seconds>` opens a battle still, so captures and checks fight nothing before they ask. `scripts/battlevideo.mjs` can press keys at given seconds.
- **Decisions:**
  - The stance shows at once but counts from the next beat: a beat already fought isn't refought.
  - The gauge is earned at the stance its beat was fought in, so switching to passive mid-battle keeps what was earned.
- **Learned:**
  - Over 200 mirror battles a neutral battle fills about 35 of 100 and an aggressive one about 57, so a skill comes every two or three battles. The numbers will be tuned in play.
  - The real-time clock ran during the page load, so a battle's charge could be fought before a check pressed its key. Opening the battle still fixed it.

### B3 r1: opposite numbers, and Morale in the ranks
![Aria duels Gorran; the fallen lie back at their places; a wounded Aria (Morale 70) brings three soldiers against Varek's knights](battles/b3-battle/director/r1-targets/targets.jpg)

![Before and after: the fallen stayed in the middle of the field; now they lie at their own places](battles/b3-battle/director/r1-targets/fallen-before-after.jpg)

Whole battles: [Sword against axe](battles/b3-battle/director/r1-targets/sword-v-axe.mp4) · [A wounded Aria against knights](battles/b3-battle/director/r1-targets/wounded-v-knights.mp4) · [Bow against mage](battles/b3-battle/director/r1-targets/bow-v-mage.mp4) (GIFs beside them)

- **What changed:**
  - **Opposite numbers:** every fighter takes on its own. The head fights the head and soldier n fights soldier n, in the charge, the counter and the melee.
    - When a soldier's opposite falls (or it has none, like the four extra swordfighters against three riders), it spreads over the enemy soldiers still standing, by its number. It goes for the head only when no soldier is left.
    - A head whose opposite has fallen goes for the soldiers.
    - In the melee every fighter standing duels its target, so one set on by several foes fights each of them in turn.
  - **Morale counts:** a unit brings soldiers in proportion to the Morale it has left (at least one). At 70 of 160, Aria leads three swordfighters instead of seven. `?am=` and `?dm=` set each side's Morale in the battle scene.
  - **The fallen** go down where the blow lands, lie a moment, then fade back in lying at their own place in the formation, which keeps the middle clear.
- **Feedback:**
  - "I want individual attacker to hit their designated opponent. E.g. the leader will fight the leader, soldier will fight soldier."
  - "if only the leader is left, then attack the leader"
  - "they should return to their original position in the fallen pose"
  - "we have to factor their morale as well"
- **Decisions** (the user chose):
  - soldiers scale with Morale, rather than a penalty to the edge;
  - free fighters spread over the soldiers left, rather than ganging up on one;
  - the fallen fade back to their place, rather than sliding.
  
  The weapon triangle stays as it was: sword beats axe, axe beats spear and lance, spear and lance beat sword, and bow and staff stand outside it.
- **Learned:**
  - Balance held under the new targeting, over 400 seeds: a mirror match goes 58% to the attacker and a triangle edge wins about 80%. Against a defender at half Morale the attacker now wins 88%.
  - With duels no longer one per fighter, the script schedules each duel once both its fighters are free, in the rules' order, so a fall never comes before a blow the rules say came first.

### B3: the battle plays out
![Aria's swordfighters against Gorran's axemen: the charge, the charge breaking on the enemy's front with a panic, the melee duels, and the result with Morale −70](battles/b3-battle/director/battle.jpg)

| Knights charge spearfighters | Archers against mages, in the melee |
|---|---|
| ![](battles/b3-battle/director/knights.jpg) | ![](battles/b3-battle/director/ranged.jpg) |

Three whole battles, start to result: [Sword against axe](battles/b3-battle/director/sword-v-axe.mp4) ([GIF](battles/b3-battle/director/sword-v-axe.gif)) · [Knights against spears](battles/b3-battle/director/knight-v-spear.mp4) ([GIF](battles/b3-battle/director/knight-v-spear.gif)) · [Bow against mage](battles/b3-battle/director/bow-v-mage.mp4) ([GIF](battles/b3-battle/director/bow-v-mage.gif))

- **What changed:** the battle scene plays a real battle (`?mode=battle&a=<class>&d=<class>&seed=<n>`), decided by the rules core and played out by the cast.
  - **Charge:** a melee squad runs at the defenders (knights gallop) and each fighter swings in turn, dashing to the enemy's front and back. Archers and mages shoot from their ranks, and the shot flies to land on its beat.
  - **Counter:** the defenders strike back, unless a bow is in the battle or a crit threw them into panic.
  - **Melee:** whoever hasn't met the foe runs in, then the pairs duel. The loser swings first and is turned aside, then the winner's blow lands. A lucky winner's flash fells another.
  - **The end:** a blow staggers, or fells where it lands. The winners cheer, and the Morale lost shows over the loser.
  - **The HUD:** the soldier pips drop with each fall, the Morale bar drops at the result, and a word marks each turn of the battle: "Charge!", "Counter!", "Melee!", "Panic!", "Flash!".
  - **Space** skips to the result.
- **Feedback:** "go", after the squads: on to the animated battle.
- **Decisions:**
  - The scene adds only timing and movement; every blow, fall and result is the rules'. `src/battle/script.ts` turns each beat into timed acts. It is pure and tested against `resolveClash` over 50 seeds and all 36 class pairs, and `Director.ts` draws every fighter from those acts as a pure function of the clock.
  - The sim is stepped a beat at a time as the battle reaches it, ready for stance changes mid-battle.
  - Fallen fighters stay where they fell.
- **Learned:** with each melee strike dashing all the way to its target, the whole charge dived through the enemy's front to a soldier at the back and vanished behind them. A volley strike now stops at the nearest foe standing, while a duel still goes to its own foe. A fighter mid-swing is drawn over the others at its depth.

### B3: the squads take the field
![Four matchups in the battle scene: sword against axe, spear against knights, bow against mage, knights against knights](battles/b3-battle/squads/matchups.jpg)

| Sword against axe | Knights against knights |
|---|---|
| ![](battles/b3-battle/squads/sword-v-axe.jpg) | ![](battles/b3-battle/squads/knight-v-knight.jpg) |

- **What changed:** the battle scene now stands any matchup (`?mode=battle&a=<class>&d=<class>`) with the real cast.
  - Each side has its class's leader (the roster's names: Aria, Gorran, Varek...) and its soldiers in formation, men and women in turn, all breathing at rest.
  - The enemy's soldiers wear red: the sprite shader turns blue cloth crimson by the rule the style frame's red images were baked with, so no second set of images is needed. Leaders are never recoloured.
  - Knights stand as a head and three riders in two looser ranks, a little smaller than a lone rider, so four horses fit a side.
  - The HUD names the leaders and says who has the weapon triangle's edge.
- **Feedback:** "start B3", on the plan to drive the battle scene from the rules.
- **Decisions:** the fighter code moved from the animation test into `src/battle/cast.ts`, so the battle scene and the test share it (the strike frame is pixel-identical). The style frame's still pictures gave way to the animated cast.
- **Learned:** a lone rider's size crowds a squad of four: the leaders' horses met nose to nose at the centre until the mounted squad stood at about nine tenths of the size.

### B2 roster: the twelve soldiers
![The twelve soldiers at the moment of their attacks, a man and a woman for each class: sword, spear, axe, bow, mage and mounted lancer](battles/b2-roster/soldiers/strikes.jpg)

| Their Flow standing images | The mounted lancer's charge |
|---|---|
| ![](battles/b2-roster/soldiers/stands.jpg) | ![](battles/b2-roster/soldiers/knight-charge.jpg) |

| Class | Man | Woman |
|---|---|---|
| Sword | ![](battles/b2-roster/soldiers/sword-m-poses.jpg) | ![](battles/b2-roster/soldiers/sword-f-poses.jpg) |
| Spear | ![](battles/b2-roster/soldiers/spear-m-poses.jpg) | ![](battles/b2-roster/soldiers/spear-f-poses.jpg) |
| Axe | ![](battles/b2-roster/soldiers/axe-m-poses.jpg) | ![](battles/b2-roster/soldiers/axe-f-poses.jpg) |
| Bow | ![](battles/b2-roster/soldiers/bow-m-poses.jpg) | ![](battles/b2-roster/soldiers/bow-f-poses.jpg) |
| Mage | ![](battles/b2-roster/soldiers/mage-m-poses.jpg) | ![](battles/b2-roster/soldiers/mage-f-poses.jpg) |
| Knight | ![](battles/b2-roster/soldiers/knight-m-poses.jpg) | ![](battles/b2-roster/soldiers/knight-f-poses.jpg) |

MP4s, one per class (the man's charge and defeat, then the woman's): [Sword](battles/b2-roster/soldiers/sword.mp4) · [Spear](battles/b2-roster/soldiers/spear.mp4) · [Axe](battles/b2-roster/soldiers/axe.mp4) · [Bow](battles/b2-roster/soldiers/bow.mp4) · [Mage](battles/b2-roster/soldiers/mage.mp4) · [Knight](battles/b2-roster/soldiers/knight.mp4)

- **What changed:** the rank-and-file soldiers, a man and a woman for each of the six classes, made the way the leaders were. They stand at the front rank's height, smaller than the leaders. The game will recolour them red for the rival army.
  - **Sword** and **axe**: their own swings, measured on each soldier's poses.
  - **Spear** and **mounted lance**: thrust streaks. The riders share Edric's gallop.
  - **Bow**: arrows with white fletching.
  - **Mage**: a plainer pale blue bolt (`AZURE`), apart from Ilse's violet.
- **Feedback:** the roster plan: "12 soldier designs", a man and a woman per class, mounted knights whose horses change pose too.
- **Decisions:**
  - The sword pair reuse round 1's images; the other ten came from Flow with the class leader as the style reference.
  - Each soldier's poses use the class leader's tested wording.
- **Learned:**
  - Seedream drew the sword man's shield as a kite shield and the sword woman cut off at the knees in their ready poses, and gave the mounted woman two lances in her follow-through. All three were regenerated (the prompt now says "round, not a kite shield").
  - The mage man's crystal glowed in Flow, and the key left a teal ring round it. The keyer now drops a glow's teal fringe (`unglow` in `scripts/art/key.py`).
  - One request hung for eight minutes, so the generator now gives up after three minutes and retries.
  - Sizes vary a lot from pose to pose, as before; `*factor` in `scripts/art/sets.json` matches each to its stance.
  - The 134 images cost about $6.

### B2 roster: the rival army's six leaders
![The six rival leaders at the moment of their attacks: Sabine's sabre arc, Gorran's chop, Petra's glaive thrust, Ulric's arrow, Morwen's crimson bolt and Varek's lance](battles/b2-roster/rivals/strikes.jpg)

| Their Flow standing images | Varek's charge |
|---|---|
| ![](battles/b2-roster/rivals/stands.jpg) | ![](battles/b2-roster/rivals/varek-charge.jpg) |

| Sabine | Gorran | Petra |
|---|---|---|
| ![](battles/b2-roster/rivals/sabine-poses.jpg) | ![](battles/b2-roster/rivals/gorran-poses.jpg) | ![](battles/b2-roster/rivals/petra-poses.jpg) |

| Ulric | Morwen | Varek |
|---|---|---|
| ![](battles/b2-roster/rivals/ulric-poses.jpg) | ![](battles/b2-roster/rivals/morwen-poses.jpg) | ![](battles/b2-roster/rivals/varek-poses.jpg) |

MP4s, each a charge then a defeat: [Sabine](battles/b2-roster/rivals/sabine.mp4) · [Gorran](battles/b2-roster/rivals/gorran.mp4) · [Petra](battles/b2-roster/rivals/petra.mp4) · [Ulric](battles/b2-roster/rivals/ulric.mp4) · [Morwen](battles/b2-roster/rivals/morwen.mp4) · [Varek](battles/b2-roster/rivals/varek.mp4)

- **What changed:** the rival army's six leaders, so all 12 leaders are done. Each came from a Flow standing image plus Seedream poses (`scripts/art/prompts/<name>.json`). They're made the way the heroes were, with the army's darker crimson-and-black look:
  - **Sabine** (sword): her own sweeping arc, from behind her head over to the sabre's tip.
  - **Gorran** (axe): an overhead chop, like Corin's.
  - **Petra** (glaive): a thrust streak.
  - **Varek** (mounted knight): a lance streak and a four-pose gallop.
  - **Ulric** (bow): an arrow with crimson fletching.
  - **Morwen** (mage): a crimson bolt. The magic glow now takes a colour, violet for Ilse and crimson for Morwen.
- **Feedback:** the roster plan, approved: Flow for the standing image, Seedream for the poses.
- **Decisions:**
  - Morwen's prompt asks for a dark orb that doesn't glow, so her spell is drawn in code, timed to the cast (the rule from Ilse).
  - Varek's poses reuse Edric's pose wording, with his own look.
- **Learned:**
  - Sabine's first slash and follow-through held the sabre pointing backward, behind her. They were regenerated with the blade "pointing forward and away from her body, toward the target".
  - Ulric's first recover came back as a close-up cut off at the waist. It was regenerated with the "drawn smaller so everything fits" wording.
  - The "drawn smaller" wording overshoots, as it did for Dela. Petra's thrust and follow-through, and most of the victories, needed `*1.2`–`*1.35` to match the stance.
  - The 65 images cost about $2.90.

### B2 roster: Dela and Ilse, the ranged heroes
![Ilse's magic bolt flying from her staff across the meadow](battles/b2-roster/ilse/bolt.jpg)

| Dela's arrow leaving the bow | Ilse's bolt, frame by frame |
|---|---|
| ![](battles/b2-roster/dela/shot.jpg) | ![](battles/b2-roster/ilse/cast.jpg) |

| Dela's poses | Ilse's poses |
|---|---|
| ![](battles/b2-roster/dela/poses.jpg) | ![](battles/b2-roster/ilse/poses.jpg) |

MP4s: [Dela's charge and defeat](battles/b2-roster/dela/dela.mp4) · [Ilse's charge and defeat](battles/b2-roster/ilse/ilse.mp4)

- **What changed:** the last two player heroes, so all six are done. Dela (bow) and Ilse (mage) each came from a Flow standing image plus 10 Seedream poses (`scripts/art/prompts/dela.json`, `ilse.json`). Their attacks are ranged, so code draws the projectile:
  - **Dela's arrow:** shaft, steel head and white fletching, with a white trail, flying from her full draw across the field.
  - **Ilse's bolt:** a flash at the crystal, then a violet orb trailing sparks.
  - **What ranged means:** archers and mages take a short step rather than a lunge. Their release has no screen shake and no stamp of dust, because the blow lands far away.
- **Feedback:** the roster plan, approved: Flow for the standing image, Seedream for the poses.
- **Decisions:**
  - Ilse's poses ask for a plain crystal with no glow, so the magic is drawn in code and timed to the cast.
  - The bolt is painted over the scene rather than added as light. Added light washed the violet out to white against the bright meadow.
- **Learned:**
  - Two of Dela's poses came back with her legs cut off by the frame. Asked again to be drawn smaller so everything fits, Seedream then drew her about a quarter smaller. Every regenerated pose needs its size checked against the stance.
  - "Watching the arrow fly" made Seedream draw the arrow in mid-air. It floats free of her, so the processing drops it.
  - The two characters' 22 images cost about $1.

### B2 roster: Corin, the axe
![Corin's overhead chop: the axe brought down in front of him, its arc over his head](battles/b2-roster/corin/chop.jpg)

| All 11 poses | The chop on a 2× screen |
|---|---|
| ![](battles/b2-roster/corin/poses.jpg) | ![](battles/b2-roster/corin/chop-2x.jpg) |

[MP4: his charge, chop and victory, then his defeat](battles/b2-roster/corin/corin.mp4)

- **What changed:** Corin, the player's axe leader, came from a Flow standing image plus 10 Seedream poses (`scripts/art/prompts/corin.json`). His attack is an overhead chop. Its arc comes from his own measured swing, from the axe head behind his head down to it low in front. The smear now takes each character's swing, so Aria and Corin each have their own.
- **Feedback:** the roster plan, approved: Flow for the standing image, Seedream for the poses.
- **Decisions:**
  - Seedream drew Corin about 15% larger than his Flow stance in every pose, so all of his Seedream poses take `*0.87` in `scripts/art/sets.json`.
  - The first victory cut his legs off at the frame's edge, because Seedream framed the raised axe. It was regenerated once, with the prompt asking for him to be drawn smaller so everything fits, from the axe's top down to his boots.
- **Learned:**
  - The fur mantle keyed cleanly, with no green fringe.
  - Each generator frames a character a little differently, so every new set needs its stance overlay checked before it goes in.
  - Eleven images cost about 50¢.

### B2 roster: Edric, the first rider
![Edric's lance charge: the horse at full stretch, the lance driven forward with a streak](battles/b2-roster/edric/thrust.jpg)

| All 13 poses | The charge on a 2× screen |
|---|---|
| ![](battles/b2-roster/edric/poses.jpg) | ![](battles/b2-roster/edric/thrust-2x.jpg) |

[MP4: the gallop in, the charge and victory, then his defeat](battles/b2-roster/edric/edric.mp4)

- **What changed:** Edric, the player's knight, rides a white warhorse, and the horse poses with him. His standing image comes from Google Flow at 4:3, so horse and rider fit. Seedream made 12 more poses (`scripts/art/prompts/edric.json`):
  - the lance charge: ready, couching the lance, the thrust, the follow-through, reining back;
  - a four-pose gallop: stretched, gathered, landing, leading;
  - the hurt (the horse rears), the fall (the horse goes down on its knees) and the victory (rearing, lance raised).
- **In the game:**
  - he stands 1.7 times a soldier's height, and his moves carry 2.2 times further;
  - the gallop plays its four poses at a steady speed, riding high in the gathered pose, with dust as the hooves land;
  - the lance leaves the same kind of streak as Bram's spear.
- **Feedback:** "the knights should ride horses, i want them mounted on horses", and "the horses have to change poses too."
- **Decisions:**
  - Each character's height, reach, dust position and run cycle are its own settings in the animation test, so a rider plays the same clips as someone on foot.
  - Every pose set is now WebP, built from one manifest (`scripts/art/sets.json`, rebuilt with `python scripts/art/anim.py set <name>`). Aria's set went from 3.6 MB to 1.4 MB, Bram's from 4.5 to 1.0 and Edric's from 9.7 to 2.2.
- **Learned:**
  - Seedream kept the horse's barding, tassels and plume across all 12 poses.
  - Rearing poses came out about 12% small, and the fall about 8% large. Per-pose factors in the manifest fix that.
  - Twelve poses cost about 54¢.

### B2 roster: Bram, the first new leader
![Bram's thrust: the spear driven forward, a white streak behind its tip](battles/b2-roster/bram/thrust.jpg)

| All 11 poses | The thrust on a 2× screen |
|---|---|
| ![](battles/b2-roster/bram/poses.jpg) | ![](battles/b2-roster/bram/thrust-2x.jpg) |

[MP4: his charge, attack and victory, then his defeat](battles/b2-roster/bram/bram.mp4)

- **What changed:** Bram, the player's spear leader, is the first character made the roster's way: his standing image from Google Flow, from the prompt in `scripts/art/prompts/standing.md`, and his other 10 poses from Seedream 5.0 Pro through ModelArk (`scripts/art/prompts/bram.json`), all from that one image. A spear attacks with a thrust, so his trail is a straight streak back along the shaft with a speed line either side, not Aria's arc. `?mode=anim&scene=charge&char=bram` plays him.
- **Feedback:** "let's go with bram first." The roster split was the user's call: Flow for the standing image, Seedream for the poses.
- **Decisions:**
  - Every pose takes the standing image as its only reference, so one image fixes the character's look.
  - Bram's colours changed from green to bronze and charcoal, because green on a character is keyed out with the background.
- **Learned:**
  - Seedream draws at 1536 and Flow at 2048, so the processing script now scales each image by its resolution against the standing image. Without that, every Seedream pose came out a quarter smaller.
  - Seedream zoomed out to fit his raised spear in the victory pose. A per-pose size factor (`*1.3` in `scripts/art/anim.py`) brings him back to scale without paying for a regeneration.
  - One request in ten dropped its connection. The generator now retries it twice and carries on with the rest.
  - Ten poses cost about 45¢.

### B2 round 2, r1: motion between the poses
![The strike with motion: Aria leaning into the slash, dust at her front foot](battles/b2-anim-test/r1-motion/strike.jpg)

| Round 2 beside the motion version ([MP4](battles/b2-anim-test/r1-motion/motion.mp4)) | Victory ([MP4 of attack, then win](battles/b2-anim-test/r1-motion/win.mp4)) | Defeat ([MP4 of hit, then defeat](battles/b2-anim-test/r1-motion/lose.mp4)) |
|---|---|---|
| ![](battles/b2-anim-test/r1-motion/motion.gif) | ![](battles/b2-anim-test/r1-motion/victory.jpg) | ![](battles/b2-anim-test/r1-motion/defeat.jpg) |

| The charge: run in, attack, win ([MP4](battles/b2-anim-test/r1-motion/charge.mp4)) | The full attack, every pose in ([MP4](battles/b2-anim-test/r1-motion/attack-full.mp4)) |
|---|---|
| ![](battles/b2-anim-test/r1-motion/charge.jpg) | ![](battles/b2-anim-test/r1-motion/attack-full.jpg) |

- **What changed:** the same pose images, now moved in code. She breathes while she stands and dips to gather strength. She eases back into the wind-up, snaps into the slash stretched and leaning in, and holds for a hit-stop while the screen shakes and dust kicks up at her front foot. Then she settles through the follow-through and steps back. A victory pose plays after the attack, with a small hop. A defeat plays the hurt and fallen poses: the blow lands with a white flash, a shake and a short freeze, she staggers back and collapses with dust, and stays down. The charge runs her in on a two-pose run cycle (`run` and `run-2`) at a steady speed. She bobs up in the airborne pose, kicks up dust at each footfall and skids into her stance before the attack and the win.
- **Feedback:** "i find the frames too less and we perhaps could have more photos to show different actions so that the movement don't look too rigid."
- **Decisions:**
  - The stiffness had two causes: too few poses for the big movements, and nothing moving while a pose is held. More poses fix the first, and code motion fixes the second without spending credits.
  - The jump from wind-up to slash stays instant. That snap, with the smear and the hit-stop, is what makes the blow land.
  - A clip is plain data (`src/battle/poseClip.ts`, tested): beats of a pose, a time and where the body goes. B3's battles will use the same clips.
- **Learned:**
  - Even with only the neighbouring pose attached, Flow's second `recover` copied the follow-through, and its `ready` held the sword upside down. Its `run-2` worked once its floating second sword was erased. So those two came from Seedream 5.0 Pro through the BytePlus ModelArk API (`scripts/art/generate.mjs`, one reference each, the same prompts). Both were right first time: a deep crouch with the sword upright, and a rise out of the lunge with the sword level, with one sword each, no ghosts, and on model. The attack now runs stance, ready, wind-up, slash, follow-through, recover, stance.
  - When a new pose is close to the reference's own pose, Flow copies the reference. Attaching only the neighbouring pose, and describing the new pose more strongly, is the fix for the next try.

### B2 round 2: the animation test
![Aria's strike: pose images with a smear on the left, the Veo clip on the right](battles/b2-anim-test/strike.jpg)

| The two attacks looping ([MP4](battles/b2-anim-test/compare.mp4)) | The strike on a 2× screen |
|---|---|
| ![](battles/b2-anim-test/compare.gif) | ![](battles/b2-anim-test/strike-close.jpg) |

- **What changed:** `?mode=anim` plays Aria's sword attack twice, side by side at her size in battle. On the left, four pose images from Google Flow (stance, wind-up, slash, follow-through), each held for a beat, with a short lunge and a smear drawn in code between the wind-up and the slash. On the right, a Veo 3.1 clip made in Flow from her stance image, played frame by frame at 24 fps.
- **Feedback:** "im okay with round 2." The poses first came back with ghost copies of the sword, and the first video model ignored the prompt.
- **Decisions:**
  - A new processing script keys a whole set at one scale and stands every frame on one anchor (the feet line and the middle of the torso), so the poses don't wobble or change size between frames.
  - Ghost swords that float free of the body are dropped in processing, so those poses didn't need regenerating.
  - The smear is a crescent drawn in a shader around the shoulders, from the blade's place in the wind-up to its place in the slash, thick at the blade and fading at the tail.
  - **Chosen: pose images with smears.** The user picked them over video: "i prefer the pose images + smears too". With four poses the motion is too stiff, so more poses come next (a ready pose before the wind-up, a recovery after the follow-through, a second run pose and a victory pose), plus motion in code between the poses. The jump from wind-up to slash stays a snap, because that's what makes the hit land.
  - **Video is not ruled out.** The Veo clip kept Aria on model, moved smoothly and kept the camera still. It lost this test only because battle sprites need sharp key poses, a hit landing on cue, clean loops, full resolution and timing the rules control. Video suits things that play once: a title or intro, story cutscenes, a special skill's cinematic, or animated portraits.
- **Learned:**
  - Flow copies the reference image's sword into a new pose as a faint ghost. It hides against the green and only shows once the background is keyed out.
  - Veo kept Aria on model, with smooth motion and a locked camera, but it didn't strike: she raised the sword overhead and lifted it again. It also ended on a different pose from the one it started on, so the clip doesn't loop. It came out at 720p, so in battle she is upscaled and softer than the pose images.

### B2 style frame, round 1: men and women
![Aria's blue squad against Roderic's red one, men and women in both](battles/b2-style-frame/r1-mixed-squads/battle-1920x1080@1x.jpg)

| Close-up at 2× pixel density |
|---|
| ![](battles/b2-style-frame/r1-mixed-squads/close-2x.jpg) |

- **What changed:** a woman sword leader and a woman sword soldier from Google Flow. The woman leader has golden hair like Aria's map sprite, so she leads the blue squad; the man from the first frame leads the red one as Roderic. Each squad's soldiers alternate between the two soldier designs.
- **Feedback:** "give me the prompt to generate the soldier and leader but female version as well. I want to ensure that there are male and females."
- **Decisions:**
  - The prompts attached the man's art as a style reference and asked for "a different person", so the woman matches the style without copying his face.
  - A squad takes a list of soldier designs and hands them out in turn, so mixing needs no extra art: the red variants come from the same recolour.
- **Learned:**
  - A reference image carries style and armour across cleanly in Flow; naming a different hair colour and hairstyle is enough to make a new person.
  - The keyer handled a different green again (this leader's background was darker than the soldier's).

### B2 style frame: the battle scene at full resolution
![A sword squad against its red twin on the meadow](battles/b2-style-frame/battle-1920x1080@1x.jpg)

| Close-up at 2× pixel density |
|---|
| ![](battles/b2-style-frame/close-2x.jpg) |

- **What changed:** the first battle scene, as one still frame (`?mode=battle`). A squad is a leader and seven soldiers in three staggered ranks, the leader in front; the attacker stands on the left. The art is the first round from Google Flow: a sword leader, a sword soldier and a meadow backdrop. The enemy is the same art recoloured red in code. The HUD shows each side's name, class, Morale and troops, and the matchup's effectiveness.
- **Feedback:** "for the battle scenes, i do not want it to be pixelated, it should be as clear as possible, like how the battle scenes are in Yggdra's Union." Then the offer to generate the art in Google Flow, which beats drawing characters in code.
- **Decisions:**
  - The battle has its own canvas and renderer: antialiased, at the device pixel ratio, with smooth mipmapped textures. It never goes through the map's 480×270 pipeline. `scripts/battle.mjs` checks the drawing buffer is the page size times the pixel ratio (1920×1080 and 3840×2160 here).
  - `scripts/art/key.py` processes Flow's images: it samples the background green from each image's border (Flow's two images used different greens), keys it out, pulls the green halo back, trims a pixel of JPEG fringe, crops to the feet and scales. It also bakes the red enemy variant by turning blue cloth crimson, leaving steel, skin, hair and leather alone.
  - Prompts never name the game that inspired the look or its artists.
- **Learned:**
  - Recolouring holds up: blue cloth turns a convincing red without touching the steel. Enemy soldiers can share the player's designs, so the roster is 18 designs, not 24.
  - A shadow drawn only under the feet hides behind them. It has to be wider than the stance and sit a little below it to read.

## Characters

![Timeline of every character version](characters/timeline.gif)

### B1: Units on the map
![Aria selected: her move range in blue, the path to a tile in gold](characters/b1-units/meadow/path.png)

| The walk | All ten sprites (idle, walk, resting) |
|---|---|
| ![](characters/b1-units/meadow/walk.gif) | ![](characters/b1-units/sprites.png) |

| Castle Courtyard: selected | After the move |
|---|---|
| ![](characters/b1-units/courtyard/select.png) | ![](characters/b1-units/courtyard/moved.png) |

- **What changed:** maps now open into a skirmish. Five units a side deploy: the allies near the front corner, the foes near the back, on easy dry ground that joins up. A click (or Z) selects a unit and marks where it can go, hovering a tile previews the path, and a click on a marked tile walks it there, hopping up and down steps. Every unit draws on one shared MOV pool (12 a turn until cards arrive). A unit that has moved dims. A foe shows its reach in red. X cancels and Enter ends the turn. Panels show the unit (name, class, Union shape, Morale, stats) and the turn (MOV left). The map viewer stays in the menu (`mode=view`).
- **Feedback:** "M13 to M16 approved, move on to units and battles." The question matrix's defaults were accepted: small pixel units about a tile tall, drawn in code like the props, so the map stays one style.
- **Decisions:**
  - The rules (B0) decide everything: the marked tiles are exactly the rules' move range, and a move is refused unless the rules allow it.
  - Sprites face a direction on the ground and mirror whenever it points left on screen, so they keep facing the right way as the camera turns.
  - Map checks, snapshots, GIFs and pixel-identity captures run in the map viewer, so the land history stays comparable: all 70 captures matched a baseline saved before B1.
- **Learned:**
  - A click has to pick its tile from where it landed. The hover from the last frame lags a quick click.
  - Deployment needs "easy ground" relative to the map: a glacier or a bog has no ground costing 1 MOV, and a desert's sand costs 2.

## Land

![Timeline of every land version](land/timeline.gif)

**From the first map to now**

![M1 vs M2d](land/comparisons/overview-m1-vs-m2d.png)

### M0: Scaffold
![M0](land/m0-scaffold/overview.png)

- **What changed:** an empty three.js scene that draws to a small 480×270 image and scales it up by a whole number. This gives crisp pixel art at any screen size. Three stepped test blocks are drawn with procedural grass and earth.
- **Learned:** settle the pixel pipeline first. Every later picture depends on 1 texture pixel = 1 screen pixel.

### M1: Flat terrain grid
![M1](land/m1-flat-grid/overview.png)

- **What changed:**
  - a 32×32 map with 22 terrain types, every texture painted in code;
  - a free orbit camera;
  - a tile cursor and info panel in the style of Final Fantasy Tactics.
- **Feedback:** *"It looks too flat, include some elevations based on the attributes of the terrain."*
- **Learned:** in a visual project, the first thing shown must already have the defining look. Here that was height. I had split the milestones by engineering layer, so elevation was pushed to the next milestone.

### M2: Stepped elevation
![M2](land/m2-elevation/overview.png)

| River | Forest | Mountain |
|---|---|---|
| ![](land/m2-elevation/close-river.png) | ![](land/m2-elevation/close-forest.png) | ![](land/m2-elevation/close-mountain.png) |

- **What changed:**
  - each terrain type sets the tile height, so mountains rise and river banks slope down to the water;
  - cliff faces show the right rock layers for the ground they belong to.
- **Feedback:** the edges were too sharp and should be rounded.
- **Learned:** blocky steps read as a toy. Real ground has soft shoulders.

### M2b: Rounded edges
![M2b](land/m2b-rounded-edges/overview.png)

| River | Forest | Mountain |
|---|---|---|
| ![](land/m2b-rounded-edges/close-river.png) | ![](land/m2b-rounded-edges/close-forest.png) | ![](land/m2b-rounded-edges/close-mountain.png) |

- **What changed:** cliff tops curve down and cliff bottoms curve up. A one-step drop becomes one smooth slope, and there are no cracks between tiles.
- **Feedback:**
  - *"Make the rounding wider. Tune the edges."*
  - The rounding should vary naturally instead of being the same everywhere.
  - The river was shaded per tile and looked unnatural.
- **Learned:** anything meant to look natural should vary smoothly across the world, not repeat tile by tile. The tile grid is for gameplay, not for how nature is drawn.

### M2c: Natural shapes and painted water
![M2c](land/m2c-natural-shapes-painted-water/overview.png)

| River | Forest | Mountain |
|---|---|---|
| ![](land/m2c-natural-shapes-painted-water/close-river.png) | ![](land/m2c-natural-shapes-painted-water/close-forest.png) | ![](land/m2c-natural-shapes-painted-water/close-mountain.png) |

- **What changed:**
  - the rounding is wider and changes smoothly across the map;
  - banks curve all the way down to the waterline;
  - water is painted pixel by pixel based on distance from the shore, so its shades flow across tile borders.
- **Feedback:** *"Make the grasses and rocks blend seamlessly, similar to how we did it for the river… make some elements movable in a loop."*
- **Learned:** when a correction applies to one feature (here, the water), apply it to every feature like it (the land too) in the same pass.

### M2d: Blended ground and motion
![M2d](land/m2d-blended-ground-and-motion/overview.png)

![Water ripples and flowers sway in a 4-second loop](land/m2d-blended-ground-and-motion/meadow-river.gif)

| River | Forest | Mountain |
|---|---|---|
| ![](land/m2d-blended-ground-and-motion/close-river.png) | ![](land/m2d-blended-ground-and-motion/close-forest.png) | ![](land/m2d-blended-ground-and-motion/close-mountain.png) |

- **What changed:**
  - the whole map's ground is painted as one image, so grass, rock and fields fray into each other across tiles;
  - the water loops every 2 seconds, with drifting shades and twinkling glints;
  - about 1,000 flowers and grass tufts sway in a wind that travels across the map;
  - fixed pinholes, single background pixels showing through where flat tiles met rounded ones.
- **Learned:** look closely at screenshots for background-coloured specks. Mesh pieces built at different detail levels must share their edge points.

### M2e: Theme showcases
Six new maps, one per category, rendered with the same engine as M2d. Each shows a still overview and a 4-second loop. The `m2e-theme-showcases/` folder also has a close-up of each map's landmark and a view from the far side.

| Alpine Pass (Wilds) | Castle Courtyard (Kingdom) |
|---|---|
| ![](land/m2e-theme-showcases/alpine/overview.png) | ![](land/m2e-theme-showcases/courtyard/overview.png) |
| ![](land/m2e-theme-showcases/alpine/loop.gif) | ![](land/m2e-theme-showcases/courtyard/loop.gif) |

| Fountain Plaza (Modern Town) | Night Market Alley (Neon City) |
|---|---|
| ![](land/m2e-theme-showcases/plaza/overview.png) | ![](land/m2e-theme-showcases/market/overview.png) |
| ![](land/m2e-theme-showcases/plaza/loop.gif) | ![](land/m2e-theme-showcases/market/loop.gif) |

| Jungle Temple (Ancient Ruins) | Volcanic Caldera (Elemental) |
|---|---|
| ![](land/m2e-theme-showcases/jungle/overview.png) | ![](land/m2e-theme-showcases/volcano/overview.png) |
| ![](land/m2e-theme-showcases/jungle/loop.gif) | ![](land/m2e-theme-showcases/volcano/loop.gif) |

- **What changed:**
  - **Built ground:** walls, buildings and paving keep sharp edges and flat tops, while natural ground stays rounded.
  - **New ground and wall textures:** flagstones, cobbles, temple blocks, paving slabs, asphalt and planks. Building fronts have windows and shop fronts at street level, with lit windows and neon at night.
  - **Lava:** a second animated liquid, which glows.
  - **Props:** pixel-art trees, crates, stalls, lamps and landmarks, each with a contact shadow. Lamps and fires light the ground around them.
  - **Painted backdrop:** scenery behind the board that turns with the camera.
- **Second pass, after review:**
  - *"For jungle there are too many trees… too many trees hinder the movement. Strategise where to place the trees sparingly."* About 70 random trees became 11 placed by hand: cover pockets on the back edges and beside the stream. The temple's stair lanes and the walkway around it stay open. The dense first version is kept in `jungle-v1-dense/`.
  - *"I want the flames to flicker, water fountain to move and clouds too, clouds can be slower."* Flames, lanterns and the vent now animate, and their light flickers with them. Droplets run down the fountain's arcs and ripples cross its basin. Clouds drift at half the speed. See `courtyard/wide-clouds.gif` and `plaza/fountain.gif`.
- **Feedback:** the first proposal was 30 ideas drawn as simple 2D sketches. *"They do not look as refined as the very first one we did… I was looking for quality ones just like the very first one."*
- **Learned:**
  - Never show a proposal below the quality already reached.
  - Render a few options in the real engine rather than many cheap mock-ups.
  - Keep tall things on the back edges and neon off the tiles, so the board stays readable in every theme.

### M3: World generator
![Twelve generated seeds](land/m3-world-generator/twelve-seeds.png)

| Valley (seed 7) | Island (seed 5) | Coast (seed 10) |
|---|---|---|
| ![](land/m3-world-generator/whole-valley-7.png) | ![](land/m3-world-generator/whole-island-5.png) | ![](land/m3-world-generator/whole-coast-10.png) |

![Seed 7 in motion](land/m3-world-generator/loop-7.gif)

- **What changed:**
  - Any seed grows a new 32×32 map, shaped as an inland valley, an island or a coast. The same seed always gives the same map.
  - Elevation is warped noise, ranked so every map has lowland, hills and ridges. Tall ground leans toward the back of the opening view, so it doesn't hide the board.
  - Land cover comes from height and moisture. Moisture is higher near water and shifts with each seed's climate.
  - Clean-up keeps the board readable and playable. One-tile specks merge into their surroundings, and lone pillars are eased. Cut-off ground is joined by a ford or a pass, so every open tile can be reached.
  - Maps save as JSON with one tile per line, ready to edit by hand, and load back with checks. **New map**, **Save** and **Load** buttons sit in a box in the top-left corner (`R`, `E`, or drop a file).

  ![The menu box](land/m3-world-generator/menu.png)
- **Round 1:** *"Is there any way for me to see other categories like the volcano, the cyberpunk…?"* A map picker in the menu box now switches between every map.

  ![Map picker](land/m3-world-generator/r1-map-picker/picker.png)
- **Decisions:** *"Mix by seed"* for the board's shape. *"Terrain only"* until M5 brings cover props, following the sparse cover rule from the jungle.
- **Learned:**
  - Ranking the noise turns every threshold into a share of the board, so no seed comes out all water or all mountain.
  - Clean-up passes matter as much as the noise does. A generator's rough edges (specks, pillars, cut-off pockets) are what make a map look machine-made or unplayable.

### M4: Rivers, waterfalls and bridges
![Four generated seeds with rivers](land/m4-water/four-seeds.png)

| A cascade (seed 7) | Off the board's edge (seed 14) |
|---|---|
| ![](land/m4-water/cascade-7.png) | ![](land/m4-water/edge-fall-14.png) |
| ![](land/m4-water/falls-7.gif) | ![](land/m4-water/edge-fall-14.gif) |

| Wooden bridge (seed 7) | Stone bridge (seed 39) |
|---|---|
| ![](land/m4-water/bridge-wood-7.png) | ![](land/m4-water/bridge-stone-39.png) |

| Surf on the coast (seed 9) | Meadow's river | Market canal |
|---|---|---|
| ![](land/m4-water/surf-9.gif) | ![](land/m4-water/river-meadow.gif) | ![](land/m4-water/canal-market.png) |

- **What changed:**
  - Every generated map gets one or two rivers. Each starts at a spring in the hills and follows the land down to a lake, the sea or the front edge of the board, where it pours over the side.
  - A river sits one step below its banks and only ever drops along its course. Each drop is a waterfall: a falling sheet on the cliff face with white foam where it lands.
  - River water runs: ripples and sparkles travel downstream, following the bends. Sea shores get a line of surf that washes in and out.
  - Bridges cross each river (two on long ones): wooden plank bridges on posts in the lowlands, stone arches in the hills. A unit on a bridge stands at deck height and moves at full speed.
  - Meadow Vale's river now flows, and the Night Market's plank walkways became real bridges over a running canal.
- **Decisions:** rivers are wadeable everywhere, so they slow units but never block them; one or two per map; they step down with waterfalls; the themed maps get flowing water too.
- **Learned:**
  - Draining the land from its outlets upward (lowest first) gives every spring a downhill route, so rivers never get stuck in a hollow.
  - Banks stand one step above the *highest* water they touch, so falls run between rocky sides instead of spilling over their banks.
  - A seamless flowing loop needs two copies of the pattern, half a loop apart, each fading out before it jumps back.

### M5: Trees, rocks and swamps
![Four generated seeds with cover](land/m5-cover/four-seeds.png)

| Woods (seed 7) | Swamp (seed 13) | Rocks (seed 9) |
|---|---|---|
| ![](land/m5-cover/forest-7.png) | ![](land/m5-cover/swamp-13.png) | ![](land/m5-cover/rocks-9.png) |

![Trees swaying (seed 7)](land/m5-cover/forest-7.gif)

![The tile panel names the cover and counts its defence](land/m5-cover/tile-panel.png)

- **What changed:**
  - Generated maps grow cover: broadleaf trees (oak, poplar and birch shapes) in the woods, pines in pine forest and snowy pines at the snowline, boulders on hills, scree, mountains and badlands, and drowned dead trees in swamps and bogs.
  - Trees grow in clumps with open ground between them. At most an eighth of the land carries cover, the front rows are thinner, and water, bridges, the tiles beside them and river banks stay clear.
  - Cover never blocks a tile. It adds its defence bonus, and the tile panel names it.
  - Low decor that is never cover: reeds in marshes and along the water's edge, pebbles on rocky ground, small bushes in light woods.
  - Lakes and rivers beside marsh, swamp and bog turn murky green; the open sea keeps its clean surf.
- **Decisions:** *"Sparse pockets"* of cover, and trees and rocks as *"Cover, walkable"*. The six themed maps stay as designed.
- **Learned:**
  - Capping cover by share of the land, and letting the strongest spots win, keeps every seed readable however the noise falls.
  - A tint that dithers over a wide band reads as grain. A short, sharp fade looks like a colour change in the water.
  - Snow on trees has to follow snow on the map, not height alone.
- **Round 1 (snowline):** *"Some trees have snow… it is not a snow environment."* Pine forest at height 5 or more got snow even on maps with no snowfield or peak. Now pines carry snow only within two tiles of snow. The after pictures are in `m5-cover/r1-snowline/`.

  ![Seed 9 before and after](land/m5-cover/r1-snowline/seed-9-before-after.png)

### M6: Villages, castles, ruins and roads
![Four generated seeds with settlements](land/m6-settlements/four-seeds.png)

![Seed 7, M5 and M6](land/m6-settlements/seed-7-m5-vs-m6.png)

| Village (seed 19) | Castle (seed 7) | Ruins (seed 9) |
|---|---|---|
| ![](land/m6-settlements/village-19.png) | ![](land/m6-settlements/castle-7.png) | ![](land/m6-settlements/ruins-9.png) |

![Banners on the castle (seed 7)](land/m6-settlements/castle-7.gif)

- **What changed:**
  - Each generated map is built around a settlement, picked by seed:
    - a **village:** half-timbered cottages with thatched or tiled roofs around two crossing streets, a well, gardens with haystacks, and fields outside;
    - a **castle:** a walled square with corner towers, banners, a gate facing the middle of the board, a keep at the back and a flagstone yard;
    - **ruins:** mossy wall stubs and broken pillars on high ground.
  - Half the maps that aren't ruins also have ruins nearby.
  - Sites are chosen on the flattest dry ground, away from water. Castles lean to the back of the view, where their walls hide the least. The footprint is cut level and the ground around it eased to meet it.
  - Roads follow the gentlest route between settlements and out to the two nearest board edges. They cross rivers straight over a bridge, reusing one if it's there.
  - Rooftops, ramparts and ruined walls can be stood on, FFT style. The tile panel names them.
- **Decisions:** *"Mix by seed"* for the settlement, *"Walkable rooftops"*, and roads to *"Settlements and edges"*.
- **Learned:**
  - Levelling ground for a building must leave anything touching water alone, or the banks stop meeting the waterline. A test caught a beach raised beside a castle.
  - A large footprint doesn't fit every map. A rugged island had no room for a castle, so the generator falls back to a smaller settlement.

### M7: Weather
![Seed 7 in each weather: clear, rain, storm; lightning, snow, fog](land/m7-weather/six-weathers.png)

| Rain | Storm |
|---|---|
| ![](land/m7-weather/rain-7.gif) | ![](land/m7-weather/storm-7.gif) |

| Snow | Fog |
|---|---|
| ![](land/m7-weather/snow-7.gif) | ![](land/m7-weather/fog-7.gif) |

| Rain on the Night Market | The weather picker |
|---|---|
| ![](land/m7-weather/market-rain.gif) | ![](land/m7-weather/menu.png) |

- **What changed:**
  - **Rain:** pixel streaks slanting with the wind, splashes on the ground and rings on the water. The ground and cliffs darken when wet, and the light turns grey-blue.
  - **Storm:** heavier, more slanted rain, a strong wind that bends trees, flowers and banners further, and a double lightning flash once every four seconds.
  - **Snow:** flakes drift and swirl. Snow settles on the tile tops pixel by pixel in drifts, never on water, and buries the flowers and grass.
  - **Fog:** soft banks of mist pool in the low ground, drift with the wind, and fade the scenery into haze.
  - Weather eases from one to the next over a couple of seconds; snow takes longer to settle.
  - Each Wild Lands map gets weather to suit it: snow only where there is snow, rain more often where the land is wet, clear skies most often.
  - A weather picker in the menu box sets any weather on any map. Every effect loops in four seconds, like the water and the wind.
- **Decisions:** *"All five"*, *"By seed + picker"*, *"Wet and snowy ground"*.
- **Learned (fixed before shipping):**
  - Ordered dithering at low strength made a regular dot grid that read as noise. Mist now uses a few flat steps of see-through fog, and only fog has mist.
  - Flowers poking through settled snow looked wrong. Snow now buries them as it deepens.
  - Rain bright enough for daylight glared on the night market. Rain and snow dim with the theme's light, and a smaller board gets fewer drops.
  - A lightning flash has to whiten the light as well as brighten it, or it reads as a slightly lighter storm.
  - Snow at snow speed couldn't fall the whole sky in four seconds. Each flake now falls through its own shorter band.
  - I made the same mistake twice: `Weather.ts` and `weather.ts` are one file on Windows. See `tasks/lessons.md`.
- **Round 1 (review):** *"The water droplets for rain and storm is too much, it hinders the view… For snow, instead of every grid being fully white… introduce some bumps and shapes… For rain and storm, introduce water puddles on some grids randomly."*
  - **Rain and storm:** about half as many drops, shorter and see-through, with fainter splashes.
  - **Puddles:** about a quarter of the flat tiles hold one. Each has its own size, place and wobbly edge, and they spread as the ground gets wetter. Blue-grey water with glints and a light far rim, never on roofs.
  - **Snow:** it lies in drifts, with bare grass and paths showing through and a dusting of flakes at the edges. Three tones (lit, plain and blue shadow) give it lumps, and small snow mounds stand on the ground as it deepens.

  ![Rain before and after](land/m7-weather/r1-subtle-rain-snow-puddles/rain-before-after.png)
  ![Snow before and after](land/m7-weather/r1-subtle-rain-snow-puddles/snow-before-after.png)

  | Puddles | Snow up close |
  |---|---|
  | ![](land/m7-weather/r1-subtle-rain-snow-puddles/puddles-close.png) | ![](land/m7-weather/r1-subtle-rain-snow-puddles/snow-close.png) |
  | ![](land/m7-weather/r1-subtle-rain-snow-puddles/rain-7.gif) | ![](land/m7-weather/r1-subtle-rain-snow-puddles/snow-7.gif) |
- **Round 2 (review):** *"The number of puddles are too many, reduce them by about 30%… when the weather is snow, the trees… do not have snow on their roof."*
  - Puddles: one flat tile in six, down from one in four.
  - Snow caps: every standing sprite (trees, pines, rocks, snags, the well, banners) takes snow along its top edges, 2 to 4 pixels deep in a soft wave, with a bright top and a blue underside. Pines catch it on each tier. It deepens with the snow on the ground.

  ![Trees before and after](land/m7-weather/r2-fewer-puddles-snowy-trees/trees-before-after.png)
  ![Puddles before and after](land/m7-weather/r2-fewer-puddles-snowy-trees/puddles-before-after.png)
  ![Snow on the trees](land/m7-weather/r2-fewer-puddles-snowy-trees/snow-trees.gif)

### M8: Day and night
![Seed 7 at dawn, day, dusk and night](land/m8-day-night/four-times.png)

![A whole day on seed 7](land/m8-day-night/cycle-7.gif)

| Dusk shadows across the castle | Cottage shadows and chimney smoke |
|---|---|
| ![](land/m8-day-night/shadows-dusk-castle.png) | ![](land/m8-day-night/village-shadows-smoke.png) |

| A village at night | Smoke by day |
|---|---|
| ![](land/m8-day-night/night-village-19.gif) | ![](land/m8-day-night/smoke-village-19.gif) |

![The time picker](land/m8-day-night/menu.png)

- **What changed:**
  - Four times of day and a running cycle. Dawn is pink-gold under a lavender sky, day is bright, dusk is deep orange under amber, and night is cold moonlight under stars. The light, the sky behind the board and the haze all follow the hour.
  - The sun moves. It rises on the right of the opening view and sets on the left, so morning and evening shadows stretch sideways where you can see them; at noon they are short.
  - **Shadows:** cliffs, columns, cottages, castle walls and bridges cast shadows on the ground, trees and flowers. They are crisp but subtle, fainter by moonlight and under cloud. Besides blocking the sun, a shadow dims the sky light a little, so long dawn and dusk shadows still show on flat ground.
  - **Night:** cottage windows glow warm, and fireflies blink over meadows, marsh and woods (but not in rain or snow).
  - **Ambience:** smoke rises from cottage chimneys and drifts downwind, and on bright days cloud shadows slide slowly over the ground.
  - A third picker in the menu box chooses the time; themed maps keep their own designed light unless you pick one.
- **Decisions:** *"Introduce dawn and dusk as well… subtle shadow effects coming from higher elevation objects… allow the option to choose the day time."*
- **Learned:**
  - A shadow only removes the sun, and a low sun barely lights flat ground, so long shadows were invisible. Letting shadows dim the sky light too made them show at every hour.
  - Which way the sun leans decides whether shadows can be seen at all. With the noon sun behind the camera, every shadow hid behind the thing casting it.
  - Pale smoke on pale ground disappears. It needed to be greyer, more solid, and bigger than first drawn.
  - All the lighting now goes through one place (`LightRig`): theme × time of day × weather. Weather no longer sets the lights itself.

### M9: Big boards and fast loading
![Seed 99 at 32×32 and at 64×64](land/m9-performance/seed99-32-vs-64.png)

![Time to load a board, before and after](land/m9-performance/load-times.png)

| Seed 4242 at 64×64 | A village on the 64×64 board |
|---|---|
| ![](land/m9-performance/whole-64-4242.png) | ![](land/m9-performance/snapshot/close-focus.png) |

![A 64×64 board before and after its rivers and settlements scaled with it](land/m9-performance/big-board-sparse-vs-scaled.png)

![The board size picker](land/m9-performance/menu.png)

- **What changed:**
  - Wild Lands come in 32×32 (standard), 48×48 and 64×64, from a fourth picker in the menu box or `&size=` in the URL.
  - Bigger boards keep the standard board's density. Rivers scale with the board's width and settlements with its area: a 64×64 board has two to four rivers and usually four or five villages, castles and ruins (three on a cramped one), spread apart and joined by roads. 32×32 boards are exactly as before.
  - Loading is faster: 0.79 s → 0.43 s on a 32×32 board, and 2.15 s → 0.92 s on a 64×64 one. Pressing R regrows just as fast.
  - The picture didn't change: 16 fixed captures (the themed maps and Wild Lands at 32×32, in clear, storm, snow, rain, day, night, dawn and dusk) match the old build pixel for pixel.
- **Decisions:** *boards up to 64×64; this laptop's RTX 4060 sets the bar; no visible change;* then, after seeing how bare a 64×64 board was with one village, *scale settlements and rivers with the board.*
- **Learned:**
  - Measure before optimising. The plan said instancing, chunking and culling. The profile showed drawing already ran at 240 fps (about 3,000 uncapped) on 64×64. The real cost was building the board when it loads, so that was the work.
  - The tile surface was sampled 720 times per rounded tile, each sample scanning the neighbours three times. Scanning once per tile removed a quarter of the load. A copy of the old code, kept in a test, proves the shapes are bit-for-bit the same.
  - Two tweaks that looked faster (fewer noise hashes, fewer allocations) were within measurement noise, so they were reverted.
  - Web Workers now paint the ground and the 12 water frames while the main thread builds the mesh. Two Chrome surprises: a worker can't start while the main thread is busy, and the last job sent to a worker waits until the main thread yields. So the board waits for the workers to start, sends the jobs, yields once, and only then builds the mesh.

### M10: Tech pass
![A 64×64 board zoomed all the way out, before and after supersampling](land/m10-tech/zoom-out-64-before-after.png)

![A slow pan across it: before shimmers, after holds steady](land/m10-tech/pan-64-before-after.gif)

- **What changed:**
  - **M10a:** boards load 16–20% faster. Worker threads build the terrain mesh as well as painting the ground. A board now appears as soon as its first water frame is painted, and the other eleven frames follow a moment later. Roads are found with a priority queue. Nothing looks different.
  - **M10b:** the camera can zoom out until the whole board fits, so 64×64 boards zoom to about 0.31; 32×32 boards keep their limit of 0.5. Below zoom 0.5 each screen pixel averages several samples (3×3 at the widest view). Distant ground, cliffs and trees blend into clean colours instead of shimmering as the camera moves. At zoom 0.5 and above nothing changes, pixel for pixel. Points (snow, fireflies, smoke, splashes) and the backdrop keep their size.
  - **M10c:** on this laptop's built-in Intel graphics, a 64×64 board now takes 2.4 ms of GPU time per frame instead of 5.6 (2.4× faster), and 7.2 ms fully zoomed out. The shadow map is redrawn only when the sun moves; each water frame stays on the GPU instead of being re-uploaded six times a second. Nothing looks different.
- **Decisions:** *"Let's do the remaining four first"*: faster loading, zoom-out without shimmer, GPU headroom, then the 24 themes.
- **Learned:**
  - Ordinary mipmaps would have softened today's views. With the camera tilted, the GPU already picks a smaller mip level at zoom 1 along the foreshortened axis. Supersampling only when zoomed out leaves every existing view untouched.
  - More threads isn't always faster. Past about six workers, this laptop throttled and its slower cores joined in, and loading got slower.
  - Background syncing (OneDrive) made timings drift by 50%. Alternating the old and new builds on every load cancels that out.
  - Measure what the GPU does, layer by layer, before optimising. The planned culling wasn't needed: 60% of the GPU time was the shadow map, redrawn every frame for a board that never moves.
  - Hitches that come at a steady rate point to something periodic. Here it was the water animation re-uploading a 4 MB texture.

### M11: Four more Wilds maps
![Autumn Ridge, Desert Mesa Oasis, Frozen Lake and Highland Moor](land/m11-wilds/four-wilds.png)

| Autumn Ridge: the old maple | Desert Mesa Oasis: the sandstone arch |
|---|---|
| ![](land/m11-wilds/autumn/close-focus.png) | ![](land/m11-wilds/desert/close-focus.png) |

| Frozen Lake: the fishing hut | Highland Moor: the shepherd's bothy |
|---|---|
| ![](land/m11-wilds/frozen/close-focus.png) | ![](land/m11-wilds/moor/close-focus.png) |

- **What changed:**
  - **Autumn Ridge** (`?map=autumn`): a ridge climbing to an old red maple. A stream tumbles down in waterfalls to a pond, crossed by a footbridge where two trails meet. Fallen leaves lie in drifts, and autumn woods stand in three pockets.
  - **Desert Mesa Oasis** (`?map=desert`): red-rock mesas with rock stairs, a lone butte, a sandy canyon floor, and a palm-ringed spring at the centre. The landmark is a sandstone arch. The backdrop has a new mesa skyline.
  - **Frozen Lake** (`?map=frozen`): walkable lake ice (no footing: −10 defence) with a few long cracks, snowy shores and pine stands. The landmark is a red fishing hut with its hole by the door. Light snow drifts across the sky.
  - **Highland Moor** (`?map=moor`): moor grass and purple heather at golden dusk, with peat pools, dry-stone walls with gateways, gorse and sheep. The landmark is a shepherd's bothy on a rise.
  - Under the hood: the cliff atlas and the sprite sheet have fixed sizes and append-only layouts, so new art never shifts old maps. Two bugs were fixed. Cliff faces could sample the next atlas row, and snow caps could read the sprite stacked above them.
- **Decisions:** the 24 new theme names were approved as listed; one category per milestone, each reviewed before the next.
- **Learned:**
  - Waterfalls need straight runs. Where a stream drops at a bend, a bank touching both pools ends up two steps above the lower one. Authoring the stream tile by tile, with each drop on a straight run, gives every pool its own banks.
  - Natural ground needs restraint. Leaves, cracks and heather looked busy at first, so they were thinned to drifts that come and go with broad noise.
  - Pixel-perfect checks catch more than regressions. A single changed pixel led to a real UV bug that had been there since M2b.

### M16: Four more Elemental maps
![Crystal Cavern, Glacier Rift, Sky Isles and Toxic Bog](land/m16-elemental/four-elemental.png)

| Crystal Cavern: the crystal spire | Glacier Rift: the rune monolith |
|---|---|
| ![](land/m16-elemental/cavern/close-focus.png) | ![](land/m16-elemental/glacier/close-focus.png) |

| Sky Isles: the sky shrine | Toxic Bog: the giant toadstool |
|---|---|
| ![](land/m16-elemental/skyisles/close-focus.png) | ![](land/m16-elemental/toxicbog/close-focus.png) |

- **What changed:** the last batch. With it, all 30 proposed themes are built.
  - **Crystal Cavern** (`?map=cavern`): underground, with the cavern's walls closing the back, shelves of rock with glittering crystal seams, and a dark pool. Glowing crystal clusters give cover, there are stalagmites and glowcaps, and a towering violet crystal spire lights the cavern.
  - **Glacier Rift** (`?map=glacier`): a glacier under a polar night and an aurora, split by a crevasse crossed by two snow bridges. Seracs give cover, spindrift blows across, and a dark monolith with glowing runes is half swallowed by the ice.
  - **Sky Isles** (`?map=skyisles`): four islands float over a sea of cloud, joined by stone spans on arches. A windmill turns, and a ring of white stone holds a floating golden crystal.
  - **Toxic Bog** (`?map=toxicbog`): pools of glowing green sludge, wadeable but exposing, between hummocks of marsh. There are dead and drowned trees, bubbling gas vents and bones, and a giant toadstool with glowing warts.
- **Decisions:** two new liquid looks, cloud and toxic, painted by the same shoreline-and-ripple painter as water and lava. Cloud lies far below its islands, so the banks rule skips it.
- **Learned:**
  - Glow needs restraint, like weather. Both the cavern's darkness and the bog's sludge first drowned the tiles, and both were toned until every tile read.
  - The checks guard more than pixels: one caught a map with nothing moving on it, and the spindrift fixed it.
  - A liquid look is a palette plus a few numbers (band width, wobble, drift). The same painter gives water, lava, cloud and sludge.

### M15: Four more Ruins maps
![Desert Pyramid, Sunken Temple, Overgrown Colosseum and Stone Circle](land/m15-ruins/four-ruins.png)

| Desert Pyramid: the obelisk | Sunken Temple: the stone face |
|---|---|
| ![](land/m15-ruins/pyramid/close-focus.png) | ![](land/m15-ruins/sunken/close-focus.png) |

| Overgrown Colosseum: the bronze gladiator | Stone Circle: the great trilithon |
|---|---|
| ![](land/m15-ruins/colosseum/close-focus.png) | ![](land/m15-ruins/henge/close-focus.png) |

- **What changed:**
  - **Desert Pyramid** (`?map=pyramid`): a pyramid bigger than the board, nine steps high in the back corner, whose two front faces are walkable steps. A causeway lined with ram sphinxes runs out to the front, with a granite obelisk at its head, dunes all round, and the half-buried head of a fallen colossus.
  - **Sunken Temple** (`?map=sunken`): a temple drowned in a jungle flood. Platforms of mossy stone stand out of wadeable shallows, a broken causeway leads in, columns and lilies dot the water, and a colossal stone face rises on the stepped sanctuary.
  - **Overgrown Colosseum** (`?map=colosseum`): the stands climb a step per tile round the back, every face an arch, with grass and trees taking them over. They have collapsed at the front. The hypogeum's passages lie open in the arena floor, with a bronze gladiator at its centre.
  - **Stone Circle** (`?map=henge`): a henge bank and ditch on chalk downs at dawn. Inside are a ring of sarsens and a horseshoe of trilithons with the great trilithon at its head; an avenue runs out to the heel stone, with barrows and sheep beyond.
- **Decisions:** scale first, as agreed after M13. The pyramid is terrain that overflows the board, and the stone face was scaled up to dwarf the columns. The stones are sized against a person.
- **Learned:**
  - A diagonal on the tile grid comes out as a zigzag. Run built features (causeways, walls) square to the grid, and leave diagonals to natural ground that frays anyway.
  - Radial heights give curved architecture for free. Measuring the distance from a centre gives the colosseum's tiers and the henge's ring and ditch.
  - Front-of-landmark clutter hides the landmark: a column on the sanctuary's front corner covered the face, so it went.
  - Heavy browser checks can be stopped when the machine runs short of memory. Run them one at a time, in the foreground.

### M14: Four more Neon City maps
![Highway Overpass, Rooftop Arcade, Container Port and Shrine Steps](land/m14-neon/four-neon.png)

| Highway Overpass: the billboard | Rooftop Arcade: the neon sign |
|---|---|
| ![](land/m14-neon/overpass/close-focus.png) | ![](land/m14-neon/rooftop/close-focus.png) |

| Container Port: the gantry crane | Shrine Steps: the torii |
|---|---|
| ![](land/m14-neon/port/close-focus.png) | ![](land/m14-neon/shrine/close-focus.png) |

- **What changed:** built overnight, back to back, as the user asked.
  - **Highway Overpass** (`?map=overpass`): a three-lane expressway on a concrete embankment five steps up. On the deck are lane lines, a sign gantry, lamps, and road works whose barriers and cones are cover on the high ground. A ramp at one end and steps on the south side lead up to it. Night streets lie below, with noodle stalls, and a giant glowing billboard is the landmark.
  - **Rooftop Arcade** (`?map=rooftop`): the board is a rooftop with lit facades for sides, among taller towers. It has a neon ARCADE sign on a scaffold, arcade cabinets and claw machines, a plant room with a water tank, air conditioners, a turf lounge under festoon lights, and a sunken pool.
  - **Container Port** (`?map=port`): stacked shipping containers, one to three boxes high, make a maze of walkable high ground. A container ship lies along the back edge at full scale as terrain: only a slice fits, and it runs off both sides. A gangway leads aboard, and a ship-to-shore gantry crane stands on the quay.
  - **Shrine Steps** (`?map=shrine`): stone steps climb a hill above the city through five torii, between stone lanterns and cherry trees in bloom, to a gravel precinct and the shrine hall.
- **Decisions:** after the Canal Quarter review ("ships are supposed to be way bigger"), vehicles and buildings are drawn at true scale or left out. The container ship became terrain, and the shrine hall was redrawn to dwarf the torii.
- **Learned:**
  - Terrain can carry things too big for a sprite. A ship, an embankment and a roof become walkable ground at their real size, which also gives the battle map its high ground.
  - The face-per-step variant that ruled out painted shopfronts in M13 suits containers exactly: every step is one box, so stacks come out mixed for free.
  - Night maps live on their light sources. Each needed its own: sodium lamps, neon, floodlights, lanterns.

### M13: Four more Modern Town maps
![Station Square, Suburban Park, Canal Quarter and High Street](land/m13-modern/four-modern.png)

| Station Square: the steam engine | Suburban Park: the playground |
|---|---|
| ![](land/m13-modern/station/close-focus.png) | ![](land/m13-modern/suburb/close-focus.png) |

| Canal Quarter: the mill chimney | High Street: the clock tower |
|---|---|
| ![](land/m13-modern/canal/close-focus.png) | ![](land/m13-modern/highstreet/close-focus.png) |

- **What changed:**
  - **Station Square** (`?map=station`): a terminus, with two tracks ending at buffer stops between raised platforms and a platform clock. In the forecourt are a taxi lane, a bus shelter, cycle racks and a preserved steam engine on a plinth. Rail is new ground: steel rails on sleepers in ballast, slow to cross.
  - **Suburban Park** (`?map=suburb`): red-brick houses with slate roofs and hedged front gardens, with washing out on the lines. A street bends round a park with a playground on bark chippings, a round duck pond, picnic tables and a small hill. The houses get a new wall: brick, white windows, a bay window and a front door in a different colour on each face.
  - **Canal Quarter** (`?map=canal`): a canal basin by the warehouses and a lock where the canal and the land step down a level. The lock has timber gates with balance beams and a towpath ramping down beside it. A stone bridge and a footbridge are the only crossings, and the mill chimney towers over the wharf. Narrowboats were moored on the water at first; review round 1 removed them, because a boat drawn on one tile looked like a toy beside the warehouses.
  - **High Street** (`?map=highstreet`): rows of shops, brick and cream in turn, each with a fascia, a striped awning and a display window. The town clock tower stands on a raised square. Around it are a red phone box and post boxes, café tables, a zebra crossing between Belisha beacons, a bus stop and market stalls.
- **Fixed:** the backdrop's gabled roofs were drawn upside down. Village Fair's distant village had them too; only that band of its backdrop changed.
- **Decisions:** none new; built as planned and reviewed one map at a time.
- **Learned:**
  - Wall colour can't vary per face. Each step of a wall picks its texture variant on its own, so a colour per variant would stripe a house floor by floor. Rows of different shops come from alternating two terrains instead.
  - A level change can carry a feature. Stepping the land down with the canal makes the lock read at a glance, and the natural towpath turns into a ramp by itself.
  - Scale matters as much as detail. A vehicle squeezed onto one tile reads as a toy next to buildings several storeys tall. Leave such things out and suggest them with scenery: bollards, the lock, the quay.
  - Pixel-checking every older map after each new one paid off again. It confirmed the roof fix touched only Village Fair's backdrop band, and that every other map stayed identical.

### M12: Four more Kingdom maps
![Harbour Town, Royal Gardens, Bridge Gatehouse and Village Fair](land/m12-kingdom/four-kingdom.png)

| Harbour Town: the lighthouse | Royal Gardens: the gazebo |
|---|---|
| ![](land/m12-kingdom/harbour/close-focus.png) | ![](land/m12-kingdom/gardens/close-focus.png) |

| Bridge Gatehouse: the gate over the bridge | Village Fair: the maypole |
|---|---|
| ![](land/m12-kingdom/bridge/close-focus.png) | ![](land/m12-kingdom/fair/close-focus.png) |

- **What changed:**
  - **Harbour Town** (`?map=harbour`): a stone quay above the water, timber piers with moored boats, and a stone mole out to a red-banded lighthouse. Behind is a market square with small cottages and warehouses. Props can now float, so boats sit on the water.
  - **Royal Gardens** (`?map=gardens`): a gazebo on the palace lawn, a fountain circle lined with topiary, a hedge maze with a statue at its heart, and flower parterres. Hedges are cover, not walls: slow to cross, +20 defence.
  - **Bridge Gatehouse** (`?map=bridge`): a river crossed by a stone bridge into a twin-towered gatehouse, with ramparts along the moat and open meadow and woods on the far bank. The gatehouse is walkable cover, so the bridge is a choke point.
  - **Village Fair** (`?map=fair`): a maypole on the village green, striped fair tents, bunting, stalls and a well, ringed by strip fields, thatched cottages and an orchard.
- **Decisions:** none new; built as planned and reviewed one map at a time.
- **Learned:**
  - Ambient effects scale per tile. The chimney rule gives every roof tile a stack, so big houses smoked like factories. Keeping houses one tile deep fixed it without touching generated villages.
  - The atlas fix needed both halves: the clamp keeps a face inside its cell, and a tiny inset keeps samples exactly on the edge from rounding into the next row. Each new map now leaves every older one pixel for pixel.
  - Since M9, boards load asynchronously, so a check that waits on a fixed short timeout will flake. Wait for the state you need, with a generous limit.

### Before and after (M2 → M2d)
![River](land/comparisons/river-m2-vs-m2d.png)
![Forest](land/comparisons/forest-m2-vs-m2d.png)
![Mountain](land/comparisons/mountain-m2-vs-m2d.png)

---

### Adding a new version

1. Start the dev server (`npm run dev`).
2. Run `node scripts/snapshot.mjs evolution/land/<id-name>`. For a theme, add its URL: `node scripts/snapshot.mjs <dir> "http://localhost:5173/?map=<id>"`.
3. If the version animates, add a GIF:

   ```
   node scripts/gif.mjs evolution/land/<id-name>/meadow-river.gif 40 58 2.6 21 10 4 12
   ```

4. Add a section above with what changed, the feedback behind it, and what was learned.
5. Add the stage to [land/stages.json](land/stages.json) and run `node scripts/timeline.mjs`.
6. For a review round or fix, keep the old pictures. Put the new ones in `<milestone>/r<N>-<topic>/`, with a comparison:

   ```
   node scripts/compare.mjs <dir>/before-after.png before.png after.png "Before: …" "After: …"
   ```

7. In the commit message, add a **Progress** section: the stage id, what now looks different, and the pictures added.
