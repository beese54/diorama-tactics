# Standing images for Google Flow

One standing image per character, made in Google Flow. Seedream makes every other pose from it through ModelArk (`scripts/art/generate.mjs`), so this image fixes the character's look.

## Settings (every prompt)

- **Image**, 4 variations, download at **2K**.
- **Aspect:** **1:1** for characters on foot; **4:3** for mounted knights, because horse and rider are wide.
- **Reference:** attach the image named under each prompt. It carries the art style; each prompt asks for a different person.
- **Check before saving:**
  - nothing green on the character, because green is keyed out with the background;
  - one weapon only;
  - the whole figure in frame, with the horse's hooves and the weapon tip included.
- **Save** in `art/source/` under the file name given, for example `bram-stand.jpg`.

Colours are chosen to survive the green keying: no green or teal anywhere on a character. Player heroes each have their own colours, plus a blue team sash or plume. Rival leaders share a darker look in crimson and black. Soldiers are dressed in blue so the game can recolour them red for the enemy.

---

## Player heroes

### Bram: spear, man → `bram-stand.jpg`
Reference: `leader-f.jpg` (Aria)
> Full-body character art of a broad-shouldered young man, a fantasy spearman captain, a different person from the reference but drawn in exactly the same art style. Three-quarter side view facing right, standing ready in a guard stance with a long spear held forward in both hands, its leaf-shaped steel blade pointing ahead. Bronze and charcoal grey armour with riveted plates, a short white scarf, a blue sash across his chest, short dark brown hair and a short dark beard, steady determined expression. He holds exactly one spear. 2D anime fantasy tactics RPG battle character, clean crisp lineart, cel shading, rich saturated colours, highly detailed, sharp focus, no motion blur. Whole figure in frame with margin around it, spear included, even studio lighting, no cast shadow. Plain flat pure green background (#00FF00), no green on the character, no text, no ground.

### Corin: axe, man → `corin-stand.jpg`
Reference: `leader-f.jpg`
> Full-body character art of a tall rugged young man, a fantasy axe warrior, a different person from the reference but drawn in exactly the same art style. Three-quarter side view facing right, standing ready in a wide stance with a large double-bitted great axe held across his body in both hands. Amber-gold and dark brown leather armour with iron plates, a brown fur mantle over his shoulders, a blue armband, wild auburn hair tied back, fierce grin. He holds exactly one axe. 2D anime fantasy tactics RPG battle character, clean crisp lineart, cel shading, rich saturated colours, highly detailed, sharp focus, no motion blur. Whole figure in frame with margin around it, axe included, even studio lighting, no cast shadow. Plain flat pure green background (#00FF00), no green on the character, no text, no ground.

### Dela: bow, woman → `dela-stand.jpg`
Reference: `leader-f.jpg`
> Full-body character art of a nimble young woman, a fantasy archer, a different person from the reference but drawn in exactly the same art style. Three-quarter side view facing right, standing ready with a longbow held in her left hand, an arrow nocked and pointing forward, the string not yet drawn. Rose pink and white light leather armour, a short white hooded cloak, a quiver of arrows on her back, a blue sash at her waist, a black bob haircut with one white feather, alert focused expression. She holds exactly one bow. 2D anime fantasy tactics RPG battle character, clean crisp lineart, cel shading, rich saturated colours, highly detailed, sharp focus, no motion blur. Whole figure in frame with margin around it, bow included, even studio lighting, no cast shadow. Plain flat pure green background (#00FF00), no green on the character, no text, no ground.

### Ilse: mage, woman → `ilse-stand.jpg`
Reference: `leader-f.jpg`
> Full-body character art of a graceful young woman, a fantasy mage, a different person from the reference but drawn in exactly the same art style. Three-quarter side view facing right, standing ready with a tall staff held forward in her right hand, topped with a clear pale crystal, her left hand raised. Flowing white and violet robes with wide sleeves and gold trim, a short blue capelet, long straight silver-white hair, calm confident expression. She holds exactly one staff. 2D anime fantasy tactics RPG battle character, clean crisp lineart, cel shading, rich saturated colours, highly detailed, sharp focus, no motion blur. Whole figure in frame with margin around it, staff included, even studio lighting, no cast shadow. Plain flat pure green background (#00FF00), no green on the character, no text, no ground.

### Edric: knight, man, mounted → `edric-stand.jpg` (4:3)
Reference: `leader-f.jpg`
> Full-body character art of a young knight on horseback, a different person from the reference but drawn in exactly the same art style. Strict side view facing right: a strong white warhorse standing still with all four hooves on the same ground line, and the knight seated upright in the saddle with a long lance held upright in his right hand and a kite shield on his left arm. White and gold heavy plate armour, a helm with the visor up and a tall blue plume, a calm noble face with short light brown hair visible. The horse wears white and gold barding with blue trim. He holds exactly one lance. 2D anime fantasy tactics RPG battle character, clean crisp lineart, cel shading, rich saturated colours, highly detailed, sharp focus, no motion blur. Horse, rider and lance entirely in frame with margin around them, even studio lighting, no cast shadow. Plain flat pure green background (#00FF00), no green on the character or horse, no text, no ground.

---

## Rival army leaders

### Varek: knight, man, mounted → `varek-stand.jpg` (4:3)
Reference: `edric-stand.jpg` once you have it (same pose, different design); otherwise `leader-f.jpg`
> Full-body character art of a menacing knight commander on horseback, a different person and a different design from the reference, drawn in exactly the same art style. Strict side view facing right: a huge black warhorse standing still with all four hooves on the same ground line, and the knight seated upright with a long black lance held upright and a tall tower shield. Black heavy plate armour with sharp angular edges and crimson trim, a closed horned great helm, a long crimson cape. The horse wears black and crimson barding with a spiked steel face plate. He holds exactly one lance. 2D anime fantasy tactics RPG battle character, clean crisp lineart, cel shading, rich saturated colours, highly detailed, sharp focus, no motion blur. Horse, rider and lance entirely in frame with margin around them, even studio lighting, no cast shadow. Plain flat pure green background (#00FF00), no green on the character or horse, no text, no ground.

### Sabine: sword, woman → `sabine-stand.jpg`
Reference: `leader-f.jpg`
> Full-body character art of a cold elegant woman, an enemy swordswoman commander, a different person and a different design from the reference, drawn in exactly the same art style. Three-quarter side view facing right, standing ready with a curved sabre held forward in her right hand. Dark crimson and black half-plate armour with sharp angular pauldrons, a black high collar, a thin silver circlet, long black hair in a severe single braid, cold narrow eyes. She holds exactly one sword. 2D anime fantasy tactics RPG battle character, clean crisp lineart, cel shading, rich saturated colours, highly detailed, sharp focus, no motion blur. Whole figure in frame with margin around it, sword included, even studio lighting, no cast shadow. Plain flat pure green background (#00FF00), no green on the character, no text, no ground.

### Gorran: axe, man → `gorran-stand.jpg`
Reference: `leader-f.jpg`
> Full-body character art of a huge brutish man, an enemy axe warlord, a different person and a different design from the reference, drawn in exactly the same art style. Three-quarter side view facing right, standing in a wide heavy stance with an enormous cleaver-like axe held in both hands. Spiked black iron armour with crimson cloth, a bald scarred head, a thick black beard, a snarling expression. He holds exactly one axe. 2D anime fantasy tactics RPG battle character, clean crisp lineart, cel shading, rich saturated colours, highly detailed, sharp focus, no motion blur. Whole figure in frame with margin around it, axe included, even studio lighting, no cast shadow. Plain flat pure green background (#00FF00), no green on the character, no text, no ground.

### Petra: spear, woman → `petra-stand.jpg`
Reference: `leader-f.jpg`
> Full-body character art of a tall disciplined woman, an enemy spear captain, a different person and a different design from the reference, drawn in exactly the same art style. Three-quarter side view facing right, standing ready with a long glaive held forward in both hands, its curved blade pointing ahead. Black and crimson lamellar armour, a crested helm with the visor raised, short ash-blonde hair, a stern expression. She holds exactly one glaive. 2D anime fantasy tactics RPG battle character, clean crisp lineart, cel shading, rich saturated colours, highly detailed, sharp focus, no motion blur. Whole figure in frame with margin around it, glaive included, even studio lighting, no cast shadow. Plain flat pure green background (#00FF00), no green on the character, no text, no ground.

### Ulric: bow, man → `ulric-stand.jpg`
Reference: `leader-f.jpg`
> Full-body character art of a lean silent man, an enemy archer, a different person and a different design from the reference, drawn in exactly the same art style. Three-quarter side view facing right, standing ready with a black recurve bow in his left hand, an arrow with crimson fletching nocked and pointing forward, the string not yet drawn. Dark leather and black chainmail, a deep black hood and a black cloth mask over his lower face, a quiver on his back, cold eyes. He holds exactly one bow. 2D anime fantasy tactics RPG battle character, clean crisp lineart, cel shading, rich saturated colours, highly detailed, sharp focus, no motion blur. Whole figure in frame with margin around it, bow included, even studio lighting, no cast shadow. Plain flat pure green background (#00FF00), no green on the character, no text, no ground.

### Morwen: mage, woman → `morwen-stand.jpg`
Reference: `leader-f.jpg`
> Full-body character art of a pale imperious woman, an enemy sorceress, a different person and a different design from the reference, drawn in exactly the same art style. Three-quarter side view facing right, standing ready with a dark twisted staff in her right hand, topped with a glowing red orb, her left hand raised with long fingers. Black and crimson robes with sharp high shoulders, a black crown-like headpiece, long dark purple hair, a cruel smile. She holds exactly one staff. 2D anime fantasy tactics RPG battle character, clean crisp lineart, cel shading, rich saturated colours, highly detailed, sharp focus, no motion blur. Whole figure in frame with margin around it, staff included, even studio lighting, no cast shadow. Plain flat pure green background (#00FF00), no green on the character, no text, no ground.

---

## Soldiers (blue; the game recolours them red for the enemy)

Each class has a man and a woman. The sword pair is already done (`soldier-f.jpg` and the round 1 man). For every soldier, attach the class's player leader as the style reference, for example Bram for the spearmen. Then make the woman with the man as a second reference, so the pair match.

Shared tail for every soldier prompt (it's already written into each one below): "plainer than a captain. 2D anime fantasy tactics RPG battle character, clean crisp lineart, cel shading, sharp focus, no motion blur. Whole figure in frame with margin, even lighting, no cast shadow. Plain flat pure green background (#00FF00), no green on the character, no text, no ground."

### Spear soldiers → `soldier-spear-m-stand.jpg`, `soldier-spear-f-stand.jpg`
Reference: `bram-stand.jpg`; for the woman, also attach the man
> Full-body character art of a [man / woman] foot soldier, a spearman of the same army as the reference, a different person, drawn in exactly the same art style. Three-quarter side view facing right, in a guard stance with a long spear held forward in both hands. A steel kettle helmet, a blue padded gambeson with a blue tabard, steel greaves, brown leather belt and boots[; for the woman: a short brown braid under the helmet]. Holds exactly one spear. Plainer than a captain. 2D anime fantasy tactics RPG battle character, clean crisp lineart, cel shading, sharp focus, no motion blur. Whole figure in frame with margin, even lighting, no cast shadow. Plain flat pure green background (#00FF00), no green on the character, no text, no ground.

### Axe soldiers → `soldier-axe-m-stand.jpg`, `soldier-axe-f-stand.jpg`
Reference: `corin-stand.jpg`; for the woman, also attach the man
> Full-body character art of a [man / woman] foot soldier, an axe fighter of the same army as the reference, a different person, drawn in exactly the same art style. Three-quarter side view facing right, in a ready stance with a two-handed battle axe held across the body. A blue leather jerkin over chainmail, an open steel cap, brown leather bracers and boots[; for the woman: tied-back red-brown hair]. Holds exactly one axe. Plainer than a captain. 2D anime fantasy tactics RPG battle character, clean crisp lineart, cel shading, sharp focus, no motion blur. Whole figure in frame with margin, even lighting, no cast shadow. Plain flat pure green background (#00FF00), no green on the character, no text, no ground.

### Bow soldiers → `soldier-bow-m-stand.jpg`, `soldier-bow-f-stand.jpg`
Reference: `dela-stand.jpg`; for the woman, also attach the man
> Full-body character art of a [man / woman] foot soldier, an archer of the same army as the reference, a different person, drawn in exactly the same art style. Three-quarter side view facing right, standing ready with a longbow in the left hand and an arrow nocked, pointing forward, string not drawn. A blue hood and a blue padded gambeson, a quiver on the back, brown leather bracers and boots[; for the woman: a dark ponytail out of the hood]. Holds exactly one bow. Plainer than a captain. 2D anime fantasy tactics RPG battle character, clean crisp lineart, cel shading, sharp focus, no motion blur. Whole figure in frame with margin, even lighting, no cast shadow. Plain flat pure green background (#00FF00), no green on the character, no text, no ground.

### Mage soldiers → `soldier-mage-m-stand.jpg`, `soldier-mage-f-stand.jpg`
Reference: `ilse-stand.jpg`; for the woman, also attach the man
> Full-body character art of a [man / woman] apprentice mage soldier of the same army as the reference, a different person, drawn in exactly the same art style. Three-quarter side view facing right, standing ready with a short wooden staff held forward, topped with a small clear crystal. Blue hooded robes with white trim and a brown leather belt with pouches[; for the woman: long light brown hair over one shoulder]. Holds exactly one staff. Plainer than a captain. 2D anime fantasy tactics RPG battle character, clean crisp lineart, cel shading, sharp focus, no motion blur. Whole figure in frame with margin, even lighting, no cast shadow. Plain flat pure green background (#00FF00), no green on the character, no text, no ground.

### Knight soldiers, mounted → `soldier-knight-m-stand.jpg`, `soldier-knight-f-stand.jpg` (4:3)
Reference: `edric-stand.jpg`; for the woman, also attach the man
> Full-body character art of a [man / woman] mounted lancer of the same army as the reference, a different person, drawn in exactly the same art style. Strict side view facing right: a brown bay horse standing still with all four hooves on the same ground line, wearing a blue cloth caparison, and the rider seated upright with a lance held upright and a small round shield. Steel half-plate armour with a blue surcoat, an open steel helm[; for the woman: a short blonde braid under the helm]. Holds exactly one lance. Plainer than a captain. 2D anime fantasy tactics RPG battle character, clean crisp lineart, cel shading, sharp focus, no motion blur. Horse, rider and lance entirely in frame with margin, even lighting, no cast shadow. Plain flat pure green background (#00FF00), no green on the character or horse, no text, no ground.

---

## Story characters

- **The round 1 sword captain** (`Full-body_character_art_of_a_2K_...jpg`, a young man in blue and silver plate): kept for the story, not a battle leader.
