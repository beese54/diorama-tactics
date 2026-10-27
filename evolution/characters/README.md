# Characters: visual history

Units on the map, drawn as pixel art like the props. Stages are listed in [stages.json](stages.json) and play in order in [timeline.gif](timeline.gif). The notes for each stage are in [../README.md](../README.md#characters).

Shots come from `node scripts/units.mjs evolution/characters/<id-name> <map ids...>`: the opening view, a unit selected with its range, the path preview, the unit after its move, a close-up, and a GIF of the walk. `node scripts/unitsheet.mjs <out.png>` draws every unit's sprite magnified.
