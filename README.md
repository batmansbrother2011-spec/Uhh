# Eaglercraft 1.20.4 - Mobile Touch Controls (v2)

Faithfully styled mobile UI matching **Eaglercraft 1.8.8** touchscreen look, with Minecraft stone-textured buttons, beveled edges, and pixelated icons.

## Layout (matches 1.8.8 mobile UI)

```
              [Pause][Chat][F5][F3]              [☰ toggle]
                
   +---+                                          |
   | ▲ |                                      [Drag to look zone]
+---+---+---+                                  (right half of screen)
| ◄ | ◆ | ► |
+---+---+---+
    | ▼ |                                  [Jump ◆] [Inventory ▦]
    +---+                                  [Drop] [Break] [Place]
                
                  [1][2][3][4][5][6][7][8][9]
                       (active slot highlighted)
```

## What's included

- **Top bar**: Pause (Esc), Chat (T), F5 (perspective), F3 (debug) — 4 stone-textured buttons
- **D-pad** (bottom-left): Up/Down/Left/Right arrows + center diamond (sneak)
- **Action buttons** (bottom-right): 
  - Jump (Space) with diamond icon
  - Inventory (E) with 3x3 grid icon
  - Drop (Q), Break (left mouse hold), Place (right mouse tap)
- **Hotbar** (bottom-center): 9 slots with dark green interior, silver borders, white active border
- **Look zone** (right half): drag-to-look with hint text
- **Toggle button** (top-right): hamburger button to show/hide mobile UI

## Visual style

- Minecraft stone-textured buttons (gray gradient, beveled edges)
- Pixelated CSS icons (no images required)
- Inset/outset shadows for 3D bevel effect
- Active button darkens on press (button-push effect)
- `image-rendering: pixelated` for crisp pixel art look

## Files

- `web/mobile.css` — All styling (Minecraft stone buttons, icons, layout)
- `web/mobile.js` — Touch detection, UI construction, event synthesis, pointer-lock stub
- `web/index.html` — Updated with mobile viewport and includes
- `web/mobile_assets/touch_gui.png` — Original 1.8.8 texture (extracted, for reference)

## Usage

### On mobile (auto-detected)
1. Open `index.html` via HTTP server
2. Mobile controls auto-activate
3. Use D-pad to move, drag right side to look, tap hotbar to switch items, tap Jump/Inventory/etc.

### Force mobile mode
- URL: `index.html?mobile=1`

### Force desktop mode  
- URL: `index.html?mobile=0`

### On desktop (testing)
- Click the hamburger button (top-right) to toggle mobile UI

## Event mappings

| UI element    | Synthesized event                       |
|---------------|-----------------------------------------|
| D-pad Up      | keydown/keyup W (87)                    |
| D-pad Down    | keydown/keyup S (83)                    |
| D-pad Left    | keydown/keyup A (65)                    |
| D-pad Right   | keydown/keyup D (68)                    |
| D-pad Center  | keydown/keyup Shift (16) - sneak        |
| Jump          | keydown/keyup Space (32)               |
| Inventory     | keydown/keyup E (69)                    |
| Chat          | keydown/keyup T (84)                    |
| Pause         | keydown/keyup Esc (27)                  |
| F5            | keydown/keyup F5 (116)                  |
| F3            | keydown/keyup F3 (114)                  |
| Drop          | keydown/keyup Q (81)                   |
| Break         | mousedown/mouseup button=0 (left)      |
| Place         | mousedown/mouseup button=2 (right)     |
| Hotbar 1-9    | keydown/keyup digits 1-9 (49-57)       |
| Look zone     | mousemove with movementX/Y deltas      |

## How it works

1. `mobile.js` monkey-patches `EventTarget.prototype.addEventListener` to capture which `<canvas>` the game registers mouse/keyboard handlers on.
2. Builds DOM overlay buttons styled to match Eaglercraft 1.8.8 mobile UI.
3. On touch interactions, synthesizes `MouseEvent`/`KeyboardEvent` with proper `offsetX/Y`, `movementX/Y`, `button`, `keyCode`, `which` and dispatches to the captured canvas.
4. Stubs `requestPointerLock` (mobile browsers don't support it) but fires fake `pointerlockchange` events so the game's logic still works.

## Credits

- Original Eaglercraft 1.20.4 by lax1dude
- Mobile UI design adapted from Eaglercraft 1.8.8 touchscreen implementation
- `touch_gui.png` extracted from Eaglercraft 1.8.8 assets (for reference)
