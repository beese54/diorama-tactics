# Battles: visual history

The side-view battle scene, drawn at full screen resolution (never pixelated), with art generated in Google Flow from prompts written for the project. Stages are listed in [stages.json](stages.json) and play in order in [timeline.gif](timeline.gif). The notes for each stage are in [../README.md](../README.md#battles).

Shots come from `node scripts/battle.mjs evolution/battles/<id-name> [width height dpr]...`, which also checks that the scene is drawn at the screen's full resolution.
