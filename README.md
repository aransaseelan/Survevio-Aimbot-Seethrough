# Survev.io Aimbot, ESP & X-Ray

## Overview
Tampermonkey/Greasemonkey userscript that adds a lightweight aimbot, ESP overlay, and X-ray visibility tweaks to `survev.io` and the older `surviv.io`. The script hooks the canvas draw pipeline to detect player loadout sprites and renders an on-screen status bar for each feature.

## Features
- Aimbot: finds the nearest detected player sprite and dispatches a synthetic `mousemove` to steer aim toward it.
- ESP: draws red lines from screen center to each detected player every frame.
- X-Ray: invalidates ceiling/tree/bush textures so players remain visible.
- HUD overlay: shows `[B] Aimbot`, `[N] ESP`, and `[H] X-Ray` states at the top of the canvas.
- WebGL guard: forces the game to use Canvas2D by nulling WebGL contexts.

## Controls (in-game)
- `B` — toggle aimbot
- `N` — toggle ESP
- `H` — toggle X-Ray

## Installation
1. Install the Tampermonkey extension (or another userscript manager).
2. Create a new script and copy the contents of `mod.js` into it.
3. Save; the `@match` rules already cover `survev.io` and `surviv.io`.
4. Reload the game; open the console to confirm you see `Survev.io mod loaded`.

## X-Ray 
With X-ray:
<img width="3420" height="1892" alt="image" src="https://github.com/user-attachments/assets/07d87096-0710-4c26-b6d2-2de4b0abdc3f" />

Without X-ray:
<img width="3420" height="1898" alt="image" src="https://github.com/user-attachments/assets/e25feba7-8dad-4c27-9b09-7087ef8f0a74" />


## Notes
- Player detection is based on `drawImage` calls for loadout sprites and ignores very small/large or heavily distorted draws to skip HUD elements.
- The aimbot emits `mousemove` events on the canvas, so pointer-lock should remain active for best results.
- Defaults for `espEnabled`, `aimbotEnabled`, and `xrayEnabled` are set to `true`; tweak the constants near the top of `mod.js` to adjust sensitivity and filtering.
- Use responsibly and at your own risk; game updates may break the hooks.
