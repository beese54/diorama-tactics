# Card art: who makes what, and what it costs

The design is in `scripts/art/prompts/cards.md`. This file weighs where its art comes from: me through the API, you in Google Flow, or a mix of the two. Prices are BytePlus ModelArk's own list, checked 2026-11-01.

## What I can and can't make myself

I have no image or video model of my own. On this machine I can do everything that is code or processing, but nothing that has to be painted.

**Without any generation ($0):**
- **The card itself:** the frame, the gold and the foil, the embossed name, the POW and MOV medallions, the ACE badge, the text, and the back with its crest (drawn as SVG).
- **All the code motion:**
  - the tilt toward the cursor, the idle float and the 3D flip;
  - parallax between the layers, and inside each layer from a depth map;
  - the light (sunbeams, firelight, lightning), the particles (dust, embers, petals, rain) and the glint along a weapon;
  - the drop shadow.

  This alone already makes the cards show motion, before any clip is made.
- **Processing:**
  - keying the green-screen cutouts (`key.py` already does this for the roster);
  - compositing the layers into `art.jpg`;
  - depth maps, built from the layer masks. A small local depth model could refine them: free, about 100 MB to download, and run one image at a time because of the machine's memory.

**What needs a model:**
- the painted scenes: the background plates, the characters in new card poses, and the foreground pieces;
- the clips of the art in motion: the characters moving.

## The options

### A. Seedream for the images, through the API: I make them

- **How it works:** the same pipeline as the 200+ roster poses (`scripts/art/generate.mjs`). Each character's Flow standing image is attached as the reference, so it stays on model.
- **Price:** Seedream 5.0 Pro, $0.045 an image at 1536×1536 (up to 2.61 MP). The first reference image is free, and each further one costs $0.003.
- **Per card:** a plate, a character layer and a foreground layer, about $0.14. With a retry for about one in two, it comes to **about $0.20 a card, so about $2.50 for all 12.**
- **An alternative:** generate one finished illustration and split it with Seedream's layer decomposition ($0.0225 a layer, about the same cost). The layers would share their light more naturally, but how cleanly it separates is untested.
- **Your effort:** none.

### B. Google Flow for the images: you make them

- **Price:** your Flow credits, not ModelArk dollars.
- **Your effort:**
  - about 36 prompts (3 layers × 12 cards), each with 4 variations to choose from;
  - downloading the picks and naming them into `art/source/cards/`.
- **Quality:** Flow made the best key images in this project; every standing image came from it. But Seedream has kept those characters on model through every pose since, so for card layers built from them, Flow adds little over option A.

### C. Seedance for the clips, through the API: I make them

The square clip maps straight onto the art window. Seedance 2.0 lists 1:1 output, and image-to-video from a first frame, or a first and a last frame. With `art.jpg` as both, the clip ends where it began.

Price per clip, 5 s at 720p, from BytePlus's own examples:

| Model | One clip | 18 clips (12 cards, plus a retry for about one in two) |
|---|---|---|
| Seedance 2.5 | $1.16 | **$20.80**: over what is left |
| Seedance 2.0 | $0.76 | $13.70 |
| Seedance 2.0 Fast | $0.60 | $10.80 |
| **Seedance 2.0 Mini** | **$0.38** | **$6.80** |
| Seedance 1.0 Pro (older) | $0.26 | $4.70 |

- **4 s clips** cost a fifth less than 5 s ones.
- **Square costs the same as 16:9:** a 1:1 clip at 720p has the same pixel count (960×960 = 1280×720).
- **Failed or moderated clips aren't billed.**
- **Your effort:** none.

### D. Flow (Veo) for the clips: you make them

- **Price:** your Flow credits.
- **Limits:**
  - Veo makes 16:9 only. I'd prepare each 1280×720 start frame with the art centred as a 720×720 square, and crop that square back out. The square holds 56% of the frame; the rest is wasted.
  - Our B2 test clip from Flow was smooth, on model and with the camera locked. But it was 720p, with softer lines and compression blotches. At the size of a card's art window, that's acceptable.
- **Your effort:** 12 or more clips, each from a start frame I hand you, downloaded and named.

### The hybrid you asked about: Flow for the images, then Seedance for the motion (B + C)

This works, and the pipeline would take Flow images just as well. It is the right choice if you want Flow's look on every card and don't mind about 36 manual generations. I don't think it's worth your time here: the characters already come from Flow, and Seedream keeps them on model.

## My recommendation: A + C, tested on one card first

1. **I build the card in code first** ($0): the frame, the stats, the back, the tilt, the parallax, the light, the particles and the foil. I'll build it on Long Road's layers, and send you a video.
2. **One test card, Long Road**, end to end, about $2:
   - its three layers from Seedream (about $0.20);
   - the same clip from three Seedance models: 2.0 Mini, 2.0 Fast and 2.0 ($1.74).
   - I send you the three clips side by side, and **you pick the model.**
3. **The other 11 cards** come next, with your chosen model. With Mini: $2.20 of images plus about $6.50 of clips, **about $11 for the whole round including the test.** That leaves about $7 of the budget for B6's skill cut-ins.
4. **Flow as the fallback:** if a card's clip fails twice in Seedance, or you prefer Flow's look for a card, I'll hand you its start frame and prompt.

Seedance 2.5 isn't worth it here. It costs three times as much as Mini, and at the size of a card's art window the difference matters least.

## Keeping the credits safe

- **Balance:** about $18.40 should be left of the $30 (by our ledger, $11.60 is spent). The API key can only generate; it can't read the account's balance. **Please check the balance in the ModelArk console** before we start, and again after the test card.
- **A hard cap in the scripts,** before any spending:
  - `generate.mjs` and a new `scripts/art/video.mjs` estimate each call's cost before sending it.
  - They keep a running ledger in `art/source/spend.json`, which is gitignored with the rest of `art/source`.
  - They **refuse any call that would take the total past the cap**: `ARK_CAP_USD` in `.env.local`, which I'd set to **$12 for the card round** (about $11 planned, plus a margin).
- **Exact costs:** after each video call, the actual cost comes from `usage.completion_tokens` in the response and goes into the ledger.
- **Previews:** `--dry` shows every call and its estimated price without spending anything.
- **The key:** it stays in `.env.local` only, sent in the Authorization header and never printed or committed.

## Your decisions

1. **The images:** Seedream through the API (A, recommended), or Flow by you (B)?
2. **The clips:** Seedance through the API (C, recommended), Flow by you (D), or no clips for now (code motion only)?
3. **The cap** for the card round: $12, or another figure?
4. **The design:** game cards show POW, MOV, ACE and the skill, where the template was image-only. Are the 12 subjects in `cards.md` Part 3 right?
5. **The balance** left in the ModelArk console.
