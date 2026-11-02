# Music for Diorama Tactics: the prompts

Four tracks for the game (B8). Generate them in a Google music tool (MusicFX / Lyria, the same way
the art comes from Flow), export each as MP3 or WAV, and drop them in `art/source/music/` with
these names: `map`, `battle`, `victory`, `defeat` (any of .mp3, .wav, .m4a, .ogg). Then run

```
node scripts/art/music.mjs
```

which trims the silence, evens the loudness, encodes them for the game in
`public/audio/music/`, and lists them in its `index.json` so the game plays them. Until then the
game is silent where music would be, and plays only its sound effects.

The prompts name no game, franchise or composer. Generate a few takes of each and keep the best;
the map and battle tracks loop, so a take whose end flows back into its start is the one to keep.

---

## 1. `map`: the strategy board (loops)
> A medieval fantasy strategy theme, folk-orchestral: a steady marching snare and frame drum, warm
> strings carrying a hopeful, determined melody, a solo recorder or fiddle answering it, light
> harp, pizzicato basses. Mid tempo, about 95 BPM, in a major key with a modal touch. It feels like
> planning a campaign over a map at dawn: confident, a little adventurous, never tense. No vocals.
> Seamlessly loopable, 60 to 90 seconds, the ending leading straight back into the opening.

## 2. `battle`: a clash on the field (loops)
> An energetic fantasy battle theme: driving orchestral percussion (taiko, timpani, snare), bold
> brass fanfares, fast staccato strings, a heroic melody over a minor key that lifts to major at
> the peak. About 140 BPM, urgent and exciting rather than dark, like two armies charging across a
> green field. No vocals. Seamlessly loopable, about 60 seconds.

## 3. `victory`: the battle is won (plays once)
> A short triumphant fantasy victory fanfare: bright brass and timpani, a rising heroic phrase
> ending on a held major chord with a cymbal swell. 6 to 10 seconds, a clean ending. No vocals.

## 4. `defeat`: the battle is lost (plays once)
> A short somber fantasy defeat theme: a solo cello or low strings with a slow falling minor
> phrase, a soft harp, a low drum, ending quietly on an unresolved chord. 6 to 10 seconds, a clean
> ending. No vocals.
