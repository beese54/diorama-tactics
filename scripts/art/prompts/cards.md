# Layered 3D cards: the design and the prompts

How to make the 12 cards of `src/game/cards.ts` as layered, animated 3D cards from the art we already have. This file adapts the "Layered 3D Character Card" template to Diorama Tactics. Part 1 is the build brief for the card itself; Part 2 holds the art prompts for each layer; Part 3 gives a brief for each card.

The cards are **not pixel art**. Like the battle scenes, they draw at full device resolution with smooth art and motion. Only the map board is pixel art.

Where the art comes from (Google Flow, Seedream or Seedance) is decided in `tasks/card-art-options.md`.

---

## Part 1: the build brief

> Build an animated collectible card in three.js for each card in `src/game/cards.ts`, from the layer files in `public/cards/<card id>/`. Unlike a full-art trading card, these are game cards: each one shows its POW, MOV, ACE and skill, readable even when the card is small in the hand.

### Card format
- Portrait 5:7 card (1000×1400 design units) with rounded corners (radius ~44). Nothing may render outside the rounded shape, including the foil and glow layers.
- **Art window:** a 920×920 square from y = 170 to 1090. It shows the card's art at full width, without cropping.
- **Top band:**
  - the card's name in **Cinzel** (OFL, self-hosted in `public/fonts/`), in antique gold (#d8b25a, embossed);
  - below it, the skill's name as an italic subtitle in **Cormorant Garamond**, for example *Forced March*.
- **Stats** (game cards, so these are required):
  - **POW** on a crimson-and-gold medallion overlapping the art window's lower-left corner;
  - **MOV** on an azure-and-silver medallion at the lower-right corner;
  - both numerals large enough to read when a hand card is about 150 px wide on screen.
  - **ACE:** a small weapon badge (sword, spear, axe, lance, bow, staff, or a star for All) at the art window's top-right corner, labelled ACE.
- **Bottom panel:**
  - the skill's one line in italic serif, for example "+3 edge for the whole battle.";
  - a footer with the set symbol (the crest from the back), the card number "01 / 12", and rarity by POW: ◆ up to 55, ◆◆ 60–70, ◆◆◆ 75–90.
- **Frame:**
  - dark navy card stock with a fine linen texture, a thin double gold border and gold filigree at the corners;
  - the **foes' card** is the same card in crimson-and-black stock with dark-silver borders, by a uniform switch, not a second set of art.

### Layers (back to front)
1. `plate.jpg`: the background scene, with no characters in it.
2. `far.png` *(optional)*: a far layer, such as sky, a castle on the horizon or mist.
3. **Animated light** (code): drifting, pulsing light of the card's own kind (Part 3), such as sunbeams, firelight, a magic aura or lightning.
4. **Particles** (code): of the card's own kind, such as dust, embers, petals, rain, leaves or ash.
5. `character.png`: the character cutout (one or two figures), keyed from #00FF00.
6. `prop.png` *(optional)*: a weapon or prop cutout, with a glint sweeping along it. If the weapon is part of `character.png`, the glint runs along a path traced over it instead (`glint.json`).
7. `front.png`: foreground elements near the viewer, keyed from #00FF00.
8. **Card frame** (code: SVG plus shaders), with the name, stats and text.
9. **Holographic foil overlay** (code).

**Loading:**
- Each layer loads from `public/cards/<id>/` by file name.
- If a file is missing, the card falls back gracefully: the flat `art.jpg` becomes the background.
- In dev, a small checklist on screen shows which layer files exist.

### Depth and 3D
- **Depth map:** a grayscale `depth.png` (white = near) shifts each pixel on tilt, for real parallax inside the 2D art.
- **Without a depth map**, one is built from the layers:
  - the plate is dark at the top, getting brighter toward its lower edge, where the ground comes forward;
  - the character's mask is brighter, and the foreground layer is brightest.
  - An optional local depth model can refine it (see the options file).
- **Layer depths:** the layers stack at different Z depths.
- **Controls:** layer spread and depth strength can be tweaked.

### Interaction
- **Tilt:** on hover, the card tilts toward the cursor, up to 14°, with smooth easing.
- **Rest:** when not hovered, the card floats slowly and sways gently.
- **Phones:** touch-drag tilts the card, and so does the gyroscope (iOS asks for permission on the first tap).
- **Flip:** the card flips in 3D to show its back.
  - In the `?mode=card` showcase, a click or tap flips it.
  - In the hand, a click plays the card, so F (or a long press) flips it instead.
  - On the foes' turn, their card enters face-down and flips face-up to show what they played.
- **The back:**
  - navy stock with a gold crest: a tower over two crossed blades in a laurel, with "DIORAMA TACTICS" beneath;
  - the foes' back is the same in crimson and dark silver.
- **Shadow:** a soft drop shadow follows the tilt, the float and the flip.

### Surface effects
- **Holographic rainbow foil** stays on the gold frame, the lettering, the medallions and the bright metallic parts of the art: armour, blades and the crown. It never covers the whole card, and it shifts with the tilt.
- **Embossing:** the gold name, borders and medallion rims catch a moving light as the card tilts.
- **Colour-keyed glow, per card** (Part 3), picked out of the art by colour: for example Ilse's runes, the embers or the lightning.

### Hover animation (video)
- **The clip:** each card has a clip of its art in motion, `motion.mp4`.
  - With Seedance, it is made square (1:1, 720p) straight from `art.jpg`, so it maps 1:1 onto the art window.
  - With Flow (16:9 only), it is made at 1280×720 from a start frame with the art centred as a 720×720 square, and the centre square is cropped to the art window with no zoom.
- **Playback:** hovering crossfades from the still to the clip and plays it once, holding on its last frame. Leaving the card fades back to the still and rewinds the clip.
- **The resting image:**
  - Where the model takes a first and a last frame, both are `art.jpg`, so the clip ends where it began and the still stays the resting image.
  - Otherwise, the clip's final frame is saved as `still.jpg` and used as the resting image, so the animation finishes in the rest pose.
- **Start offset:** if the clip opens with a camera move or a close-up, a start-time offset skips it.
- **Effects during the clip:** foil and glint must not fight the moving video. The art-based foil is suppressed while the clip shows; the foil on the frame stays.
- **In the hand:** only the focused card plays its clip, one at a time.

### Deliverable (in this repo, not a standalone page)
- **The showcase:** `?mode=card&id=<card id>` in the Vite app, on three.js 0.186 from the project, with no CDN.
  - A dark radial backdrop, the card centred and sized to fit the viewport, at full device resolution and antialiased.
- **Controls** (dev builds only): max tilt, layer spread, depth strength, foil intensity, light-effect intensity, clip start offset, crossfade length.
- **One renderer** (`src/cards/`) serves the showcase, then the hand and the foes' card, replacing the B4 pixel menu cards.
- **Before building, settle:** the layer separation, the crop, the frame style, the card text, and which effects animate.

---

## Part 2: art prompts for each layer

The rules for all the art:
- The art matches the roster: 2D anime fantasy tactics RPG, clean crisp lineart, cel shading and rich saturated colours.
- Each character comes from its own standing image in `art/source/`, attached as the reference, so it stays on model.
- Prompts never name another game or its artists.
- Nothing that is keyed from green may contain green or teal. That covers characters and foreground layers: use straw, amber, rust or stone colours for grass and leaves there. Plates aren't keyed, so green is fine in them.
- **Size:** 1536×1536 (1:1). That stays in Seedream's cheaper price tier, at or under 2.61 MP.

### Plate (`plate.jpg`, no reference)
> Square fantasy tactics RPG card illustration background: [SCENE]. No people, no animals, no text. Painterly 2D anime background art with cel-shaded forms, rich saturated colours and soft atmospheric depth: clear foreground, middle ground and far distance. [LIGHT] lighting. The centre and lower middle are left open, as a stage for figures standing there. Even detail to every edge.

### Character (`character.png`, the reference: the standing images named in Part 3)
> [WHO, as in the reference image(s)], [ACTION AND POSE], drawn in exactly the same art style as the reference, the same person with the same armour, colours and weapon. Full figure[s] in frame with margin around them, [WEAPON] included. Lit by [LIGHT] from [DIRECTION], to match a [SCENE] background. 2D anime fantasy tactics RPG character art, clean crisp lineart, cel shading, rich saturated colours, highly detailed, sharp focus, no motion blur, no cast shadow, no ground. Plain flat pure green background (#00FF00), no green on the character, no text.

### Foreground (`front.png`, no reference)
> [FOREGROUND ELEMENTS], close to the viewer along the bottom edge and the lower corners, slightly soft as if just in front of the lens. The middle and top are empty. Painterly 2D anime style, cel shading, [LIGHT] lighting. No green colours at all; grass and leaves in straw, amber or rust. Plain flat pure green background (#00FF00), no text.

### Composite (`art.jpg`, code, no generation)
`scripts/art/cardart.py`:
- keys the cutouts;
- stacks them on the plate at their places in Part 3;
- adds a contact shadow under the figures and one colour grade, so the layers sit in the same light;
- writes `art.jpg` (the flat still), `depth.png` and the layer files.

### Motion clip (`motion.mp4`, image-to-video from `art.jpg`)
> [CHARACTER MOTION], then settling back into the opening pose. [AMBIENT MOTION]. The camera stays completely still: no zoom, no pan, no cut. The background holds still except for [AMBIENT MOTION]. The characters keep the same faces, armour, colours and weapons throughout. No text.

Settings: 1:1, 720p, 4–5 s, first and last frame both `art.jpg` where the model takes them; no audio.

---

## Part 3: the 12 cards

The references are files in `art/source/`. "Light" and "Particles" are drawn by code. "Glint" is the prop the light sweeps along.

| # | Card (ACE) | Who (reference) | Pose | Plate scene | Light | Particles | Foreground | Glint | Clip motion |
|---|---|---|---|---|---|---|---|---|---|
| 01 | **Long Road** (All) | Aria (`leader-f.jpg`) leading a sword soldier (`soldier-sword-m-stand.jpg`) | striding forward, sword low, looking down the road | a winding road over rolling hills at dawn, a far castle | dawn sunbeams from the right | dust motes | a road milestone and straw-coloured grass tufts | Aria's sword | her cloak and hair stream; she raises her sword toward the horizon, then lowers it |
| 02 | **Swift Banner** (Lance) | Edric (`edric-stand.jpg`) | galloping, a blue banner on the lance | open plain under a wide sky, wind in the clouds | bright streaming daylight | dust and a few petals | tall straw grass whipping past | the lance tip | the horse's gallop; the banner flutters hard |
| 03 | **Scout's Path** (Bow) | Dela (`dela-stand.jpg`) | crouched on a ledge, bow half-drawn, scanning | a misty gorge with pines below | light shafts through mist | falling amber leaves | a rock ledge's edge and rust ferns | the arrowhead | she draws fully, holds, eases the string |
| 04 | **Open Field** (Sword) | sword soldiers, man and woman (`soldier-sword-m-stand.jpg`, `soldier-sword-f-stand.jpg`) | charging side by side, swords raised | a wide flowering meadow at noon | high sun, a soft bloom | white and yellow petals | wildflowers in white and yellow | both blades | a short charge in place; the petals swirl past |
| 05 | **Iron Column** (Spear) | Bram (`bram-stand.jpg`) with a spear soldier (`soldier-spear-m-stand.jpg`) | the spears levelled forward in a column | a stone bridge under a breaking storm | a break in the clouds lighting the spearheads | a fine drizzle glitter | the bridge parapet's stones | the row of spearheads | they step forward in unison; the spears dip and level |
| 06 | **Ember Rite** (Staff) | Ilse (`ilse-stand.jpg`) | casting, staff raised, a ring of fire runes | an ancient stone circle at dusk | a warm magic aura pulsing | embers | the edge of a standing stone | the staff crystal | the runes kindle and turn; her robes lift in the heat |
| 07 | **Steady Line** (All) | a sword soldier and a spear soldier (`soldier-sword-f-stand.jpg`, `soldier-spear-f-stand.jpg`) | shoulder to shoulder, braced | a muddy field under a cold overcast sky | a cold rim light | sparse rain | broken stakes in the mud | the shield rims | they brace against a blow, then hold |
| 08 | **Cleaver's Oath** (Axe) | Corin (`corin-stand.jpg`) | raising his axe to the sky, swearing | a hilltop camp at night with a bonfire | firelight flicker | sparks and embers | the bonfire's logs | the axe edge | he lifts the axe high; the firelight surges |
| 09 | **Shield Wall** (Sword) | sword soldiers (`soldier-sword-m-stand.jpg`, `soldier-sword-f-stand.jpg`) | round shields locked, blades ready | a castle gate under torchlight | torchlight flicker | dust | arrows stuck in the ground | the shield bosses | they lock the shields tighter; arrows glance off |
| 10 | **Thunder Hoof** (Lance) | Varek (`varek-stand.jpg`) | the black warhorse charging, lance couched | a stormy battlefield | lightning flashes | rain, and sparks from the hooves | a mud splash | the lance | the charge; lightning lights him from behind |
| 11 | **Grave Toll** (Axe) | Gorran (`gorran-stand.jpg`) | the cleaver on his shoulder, glowering | a ruined bell tower in a moonlit graveyard | cold moonbeams | drifting ash | leaning tombstones | the cleaver's edge | the bell swings; he lowers the cleaver toward the viewer |
| 12 | **King's Wager** (All) | Sabine (`sabine-stand.jpg`) | leaning on her sabre beside a war table | a royal war room by candlelight, a crown on the map table | candlelight | golden dust | a tipped goblet and game pieces | the crown | she slides a game piece forward; the candles flare |

Each card uses its own palette, so the hand reads as 12 different cards: dawn gold, sky blue, mist, noon white, storm grey, dusk orange, cold slate, night red, torch amber, storm violet, moon blue and candle gold.
