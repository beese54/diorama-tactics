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
