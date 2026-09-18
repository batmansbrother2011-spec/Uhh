/* =====================================================================
 * Eaglercraft 1.20.4 - Mobile Touch Controls
 * Ported & adapted from Eaglercraft 1.8.8 touch UI patterns
 *
 * Strategy:
 *   - Monkey-patch addEventListener to capture game's mouse/keyboard
 *     handlers (the game registers them on its canvas/root element).
 *   - Build a DOM overlay (D-pad, look zone, hotbar, action buttons).
 *   - On touch interactions, synthesize MouseEvent / KeyboardEvent
 *     objects and dispatch them to the same targets the game uses.
 *   - Disable pointer lock (which doesn't work on mobile) by stubbing
 *     requestPointerLock when mobile mode is active.
 * ===================================================================== */
(function () {
    "use strict";

    if (window.__eaglerMobileLoaded) return;
    window.__eaglerMobileLoaded = true;

    /* ---------- State ---------- */
    var EM = {
        active: false,             // mobile UI currently shown
        autoDetected: false,       // touch device detected at boot
        capturedCanvas: null,      // game canvas element
        capturedRoot: null,        // game root element (parent of canvas)
        mouseMoveTarget: null,     // element that gets mousemove events
        mouseButtonTarget: null,    // element that gets mousedown/up
        keyTarget: null,            // element that gets keydown/up
        lookActive: false,          // currently dragging to look
        lookLastX: 0,
        lookLastY: 0,
        lookTouchId: null,
        moveTouchId: null,
        moveDir: { up: false, down: false, left: false, right: false },
        activeSlot: 0,
        // Key codes (Eaglercraft / LWJGL key codes used by 1.20.4)
        // 1.20.4 uses LWJGL3 key codes. We use the same codes that the
        // Eaglercraft Keyboard handler expects. See classes.js Dr9() handler:
        //   b.which is the source, then A7c() remaps to LWJGL codes.
        // Common mappings (browser which -> Eaglercraft internal):
        //   W=87, A=65, S=83, D=68, Space=32, Shift=16, E=69, Q=81, T=84,
        //   1..9 = 49..57, Esc=27
        keys: {
            forward: 87, back: 83, left: 65, right: 68,
            jump: 32, sneak: 16, inventory: 69, chat: 84, drop: 81,
            esc: 27
        }
    };

    window.__eaglerMobile = EM;

    /* ---------- Touch detection ---------- */
    function isTouchDevice() {
        return !!(
            ("ontouchstart" in window) ||
            (navigator.maxTouchPoints > 0) ||
            (window.MessageChannel && false) // placeholder
        ) && /Mobi|Android|iPhone|iPad|iPod|Tablet|Touch/i.test(navigator.userAgent);
    }
    EM.autoDetected = isTouchDevice();

    /* ---------- Monkey-patch addEventListener to capture game handlers -----
     * The 1.20.4 game calls addEventListener on its canvas/root element with
     * specific event types. We intercept those calls and remember the targets
     * + handlers, so we can dispatch synthetic events to them later.
     */
    var _origAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
        try {
            // We're interested in mouse/key events attached to <canvas> or document
            var tag = (this && this.tagName) ? this.tagName.toLowerCase() : "";
            if (type === "mousemove" && (tag === "canvas" || this === window || this === document)) {
                EM.mouseMoveTarget = EM.mouseMoveTarget || this;
                if (tag === "canvas") EM.capturedCanvas = EM.capturedCanvas || this;
            }
            if ((type === "mousedown" || type === "mouseup") && (tag === "canvas" || tag === "body")) {
                EM.mouseButtonTarget = EM.mouseButtonTarget || this;
                if (tag === "canvas") EM.capturedCanvas = EM.capturedCanvas || this;
            }
            if ((type === "keydown" || type === "keyup") && (tag === "canvas" || this === window || this === document || tag === "body")) {
                EM.keyTarget = EM.keyTarget || this;
            }
        } catch (e) { /* ignore */ }
        return _origAddEventListener.call(this, type, listener, options);
    };

    /* ---------- Find game canvas after load ---------- */
    function findGameCanvas() {
        // EaglercraftX 1.20.4 uses a <canvas> inside the container div
        var canvases = document.querySelectorAll("canvas");
        for (var i = 0; i < canvases.length; i++) {
            var c = canvases[i];
            // Pick the largest canvas (game canvas)
            if (c.width >= 200 && c.height >= 200) return c;
        }
        return null;
    }

    /* ---------- Synthesize a mouse event ----------
     * The 1.20.4 mousemove handler (Fvj) reads:
     *   b.offsetX, b.offsetY, b.movementX, b.movementY
     * The mousedown/up handlers (FY6/Fl5) read:
     *   b.button (0=left, 1=middle, 2=right)
     * We need to construct events with these properties.
     */
    function synthMouseEvent(type, target, opts) {
        opts = opts || {};
        var ev = new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            button: opts.button || 0,
            buttons: opts.buttons || 0,
            clientX: opts.clientX || 0,
            clientY: opts.clientY || 0,
            screenX: opts.clientX || 0,
            screenY: opts.clientY || 0,
            movementX: opts.movementX || 0,
            movementY: opts.movementY || 0,
            relatedTarget: null,
            // Needed so the game's preventDefault() doesn't fail
            ctrlKey: false, altKey: false, shiftKey: false, metaKey: false
        });
        // offsetX / offsetY are read-only on MouseEvent, so override via property descriptor
        try {
            Object.defineProperty(ev, "offsetX", { get: function () { return opts.offsetX || 0; } });
            Object.defineProperty(ev, "offsetY", { get: function () { return opts.offsetY || 0; } });
            // Some game code reads b.which (legacy)
            Object.defineProperty(ev, "which", { get: function () { return (opts.button || 0) + 1; } });
        } catch (e) { /* ignore */ }
        target.dispatchEvent(ev);
    }

    /* ---------- Synthesize a keyboard event ---------- */
    function synthKeyEvent(type, keyCode, opts) {
        opts = opts || {};
        var ev = new KeyboardEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            key: opts.key || String.fromCharCode(keyCode),
            code: opts.code || "",
            keyCode: keyCode,
            which: keyCode,
            location: opts.location || 0,
            repeat: !!opts.repeat,
            ctrlKey: false, altKey: false, shiftKey: !!opts.shiftKey, metaKey: false
        });
        // Some browsers don't allow setting keyCode via constructor
        try {
            Object.defineProperty(ev, "keyCode", { get: function () { return keyCode; } });
            Object.defineProperty(ev, "which", { get: function () { return keyCode; } });
        } catch (e) { /* ignore */ }
        var target = EM.keyTarget || window;
        target.dispatchEvent(ev);
    }

    /* ---------- Helpers to press / release a game key ---------- */
    function pressKey(kc) { synthKeyEvent("keydown", kc); }
    function releaseKey(kc) { synthKeyEvent("keyup", kc); }

    /* ---------- Helpers to click / release mouse buttons ---------- */
    function mouseDownAt(clientX, clientY, button) {
        var target = EM.capturedCanvas || EM.mouseButtonTarget || window;
        synthMouseEvent("mousedown", target, {
            button: button, buttons: (1 << button),
            clientX: clientX, clientY: clientY,
            offsetX: clientX, offsetY: clientY
        });
    }
    function mouseUpAt(clientX, clientY, button) {
        var target = EM.capturedCanvas || EM.mouseButtonTarget || window;
        synthMouseEvent("mouseup", target, {
            button: button, buttons: 0,
            clientX: clientX, clientY: clientY,
            offsetX: clientX, offsetY: clientY
        });
    }
    function mouseMove(dx, dy) {
        var target = EM.capturedCanvas || EM.mouseMoveTarget || window;
        // Last known position
        var cx = EM._lastClientX || (window.innerWidth / 2);
        var cy = EM._lastClientY || (window.innerHeight / 2);
        cx += dx; cy += dy;
        EM._lastClientX = cx; EM._lastClientY = cy;
        synthMouseEvent("mousemove", target, {
            movementX: dx, movementY: dy,
            clientX: cx, clientY: cy,
            offsetX: cx, offsetY: cy
        });
    }

    /* ---------- Pointer lock disable ----------
     * On mobile, requestPointerLock either does nothing useful or throws.
     * The 1.20.4 game still calls it when entering "ingame focus".
     * We stub it out so the game thinks pointer lock is active but the
     * browser doesn't actually enter pointer-lock mode.
     */
    function disablePointerLock() {
        if (document._emPLDisabled) return;
        document._emPLDisabled = true;
        var origRequest = HTMLElement.prototype.requestPointerLock;
        HTMLElement.prototype.requestPointerLock = function () {
            // Fire a fake pointerlockchange event so the game's FJH handler runs
            // and updates Glv state.
            try {
                var ev = new Event("pointerlockchange");
                document.dispatchEvent(ev);
                if (window.__eaglerMobile.capturedCanvas) {
                    // Some game code checks document.pointerLockElement === canvas
                    // We can't really fake that, but we can dispatch the event
                }
            } catch (e) { /* ignore */ }
        };
        // Also stub exitPointerLock
        document.exitPointerLock = function () {
            try {
                var ev = new Event("pointerlockchange");
                document.dispatchEvent(ev);
            } catch (e) { /* ignore */ }
        };
        // Make pointerLockElement return the canvas when stubbed
        try {
            Object.defineProperty(document, "pointerLockElement", {
                get: function () {
                    return window.__eaglerMobile && window.__eaglerMobile.active
                        ? (window.__eaglerMobile.capturedCanvas || null)
                        : null;
                },
                configurable: true
            });
        } catch (e) { /* ignore */ }
    }
    function enablePointerLock() {
        if (!document._emPLDisabled) return;
        document._emPLDisabled = false;
        // We can't easily restore the original, but we can reset our stub to no-op
        HTMLElement.prototype.requestPointerLock = function () { /* no-op */ };
        document.exitPointerLock = function () { /* no-op */ };
        try {
            delete document.pointerLockElement; // restore default getter
        } catch (e) {
            Object.defineProperty(document, "pointerLockElement", {
                get: function () { return null; },
                configurable: true
            });
        }
    }

    /* =====================================================================
     * UI Construction
     * ===================================================================== */
    function buildUI() {
        if (document.getElementById("eagler-mobile-root")) return;

        var root = document.createElement("div");
        root.id = "eagler-mobile-root";

        /* ---- Toggle button (always present once UI built) ---- */
        var toggle = document.createElement("button");
        toggle.id = "em-toggle-btn";
        toggle.innerHTML = "&#9776;"; // hamburger
        toggle.title = "Toggle mobile controls";
        toggle.className = "em-interactive";
        toggle.addEventListener("click", function () {
            setActive(!EM.active);
        });
        document.body.appendChild(toggle);

        /* ---- D-Pad (left side) ---- */
        var dpad = document.createElement("div");
        dpad.className = "em-dpad em-interactive";

        function mkDpadBtn(label, cls, dir) {
            var b = document.createElement("button");
            b.className = "em-dpad-btn " + cls;
            b.textContent = label;
            b.dataset.dir = dir;
            attachHoldButton(b, function () {
                pressKey(EM.keys[dir]);
                EM.moveDir[dir] = true;
            }, function () {
                releaseKey(EM.keys[dir]);
                EM.moveDir[dir] = false;
            });
            dpad.appendChild(b);
            return b;
        }
        mkDpadBtn("\u25B2", "em-dpad-up", "forward");   // up arrow
        mkDpadBtn("\u25BC", "em-dpad-down", "back");     // down arrow
        mkDpadBtn("\u25C0", "em-dpad-left", "left");     // left arrow
        mkDpadBtn("\u25B6", "em-dpad-right", "right");   // right arrow
        // center decorative
        var center = document.createElement("div");
        center.className = "em-dpad-btn em-dpad-center";
        dpad.appendChild(center);

        root.appendChild(dpad);

        /* ---- Look zone (right side) ---- */
        var look = document.createElement("div");
        look.className = "em-lookzone em-interactive em-hint";
        var lookHint = document.createElement("div");
        lookHint.className = "em-lookzone-hint";
        lookHint.textContent = "Drag here to look around\nTap = place  |  Hold = break";
        look.appendChild(lookHint);
        attachLookZone(look);
        root.appendChild(look);

        /* ---- Hotbar (bottom center) ---- */
        var hotbar = document.createElement("div");
        hotbar.className = "em-hotbar em-interactive";
        for (var i = 0; i < 9; i++) {
            (function (slot) {
                var b = document.createElement("button");
                b.className = "em-slot" + (slot === 0 ? " em-active" : "");
                b.textContent = String(slot + 1);
                b.addEventListener("click", function (e) {
                    e.preventDefault();
                    selectSlot(slot);
                });
                // Long-press to swap (mimic MCPE) - just click for now
                hotbar.appendChild(b);
            })(i);
        }
        root.appendChild(hotbar);

        /* ---- Action buttons (right side) ---- */
        var actions = document.createElement("div");
        actions.className = "em-actions";

        // Jump button
        var jumpBtn = mkActionButton("JUMP", "em-jump");
        attachHoldButton(jumpBtn,
            function () { pressKey(EM.keys.jump); },
            function () { releaseKey(EM.keys.jump); }
        );
        actions.appendChild(jumpBtn);

        // Sneak button
        var sneakBtn = mkActionButton("SNEAK", "em-sneak");
        attachHoldButton(sneakBtn,
            function () { pressKey(EM.keys.sneak); },
            function () { releaseKey(EM.keys.sneak); }
        );
        actions.appendChild(sneakBtn);

        // Inventory button
        var invBtn = mkActionButton("INV", "em-inv");
        attachTapButton(invBtn, function () {
            pressKey(EM.keys.inventory);
            setTimeout(function () { releaseKey(EM.keys.inventory); }, 60);
        });
        actions.appendChild(invBtn);

        // Chat button
        var chatBtn = mkActionButton("CHAT", "em-chat");
        attachTapButton(chatBtn, function () {
            pressKey(EM.keys.chat);
            setTimeout(function () { releaseKey(EM.keys.chat); }, 60);
            // Also try to focus a hidden input so mobile keyboard opens
            var inp = document.getElementById("em-keyboard-input");
            if (inp) {
                try { inp.focus({ preventScroll: true }); } catch (e) {}
            }
        });
        actions.appendChild(chatBtn);

        // Drop button
        var dropBtn = mkActionButton("DROP", "em-drop");
        attachTapButton(dropBtn, function () {
            pressKey(EM.keys.drop);
            setTimeout(function () { releaseKey(EM.keys.drop); }, 60);
        });
        actions.appendChild(dropBtn);

        // Break button (hold for continuous breaking)
        var breakBtn = mkActionButton("BREAK", "em-break");
        attachHoldButton(breakBtn,
            function () {
                var cx = EM._lastClientX || (window.innerWidth / 2);
                var cy = EM._lastClientY || (window.innerHeight / 2);
                mouseDownAt(cx, cy, 0); // left mouse
            },
            function () {
                var cx = EM._lastClientX || (window.innerWidth / 2);
                var cy = EM._lastClientY || (window.innerHeight / 2);
                mouseUpAt(cx, cy, 0);
            }
        );
        actions.appendChild(breakBtn);

        // Place button (tap = single right-click-style place)
        var placeBtn = mkActionButton("PLACE", "em-place");
        attachTapButton(placeBtn, function () {
            var cx = EM._lastClientX || (window.innerWidth / 2);
            var cy = EM._lastClientY || (window.innerHeight / 2);
            // In MC 1.20.4, place block = right-click = mouse button 1 (which game remaps to 2 internally)
            mouseDownAt(cx, cy, 2);
            setTimeout(function () { mouseUpAt(cx, cy, 2); }, 80);
        });
        actions.appendChild(placeBtn);

        root.appendChild(actions);

        /* ---- Hidden keyboard input (for chat typing on mobile) ---- */
        var kbInput = document.createElement("input");
        kbInput.id = "em-keyboard-input";
        kbInput.type = "text";
        kbInput.autocomplete = "off";
        kbInput.autocapitalize = "off";
        kbInput.spellcheck = false;
        kbInput.setAttribute("aria-hidden", "true");
        document.body.appendChild(kbInput);

        // Forward typing to game
        kbInput.addEventListener("input", function (e) {
            var val = kbInput.value;
            if (val) {
                // For each character, fire keypress / keydown
                for (var i = 0; i < val.length; i++) {
                    var ch = val.charCodeAt(i);
                    synthKeyEvent("keydown", ch);
                    synthKeyEvent("keypress", ch);
                    synthKeyEvent("keyup", ch);
                }
                kbInput.value = "";
            }
        });
        kbInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                synthKeyEvent("keydown", 13);
                synthKeyEvent("keyup", 13);
                kbInput.blur();
            } else if (e.key === "Backspace" && !kbInput.value) {
                synthKeyEvent("keydown", 8);
                synthKeyEvent("keyup", 8);
                e.preventDefault();
            }
        });

        /* ---- Status pill ---- */
        var statusPill = document.createElement("div");
        statusPill.id = "em-status-pill";
        document.body.appendChild(statusPill);

        document.body.appendChild(root);
    }

    function mkActionButton(label, cls) {
        var b = document.createElement("button");
        b.className = "em-btn " + (cls || "");
        b.textContent = label;
        return b;
    }

    /* ---------- Attach hold-button behavior (pointerdown/up + touchstart/end) ---------- */
    function attachHoldButton(el, onDown, onUp) {
        var active = false;
        function down(e) {
            e.preventDefault();
            if (active) return;
            active = true;
            el.classList.add("em-pressed");
            onDown && onDown();
        }
        function up(e) {
            if (!active) return;
            active = false;
            el.classList.remove("em-pressed");
            onUp && onUp();
        }
        // Mouse
        el.addEventListener("mousedown", down);
        el.addEventListener("mouseup", up);
        el.addEventListener("mouseleave", up);
        // Touch
        el.addEventListener("touchstart", down, { passive: false });
        el.addEventListener("touchend", up);
        el.addEventListener("touchcancel", up);
        // Click fallback for desktop testing
        el.addEventListener("click", function (e) {
            // Already handled by mousedown/up; just prevent default behaviors
            e.preventDefault();
        });
    }

    function attachTapButton(el, onTap) {
        var lastTouchTime = 0;
        el.addEventListener("click", function (e) {
            e.preventDefault();
            if (Date.now() - lastTouchTime < 500) return; // ignore synthetic click after touch
            onTap && onTap();
        });
        el.addEventListener("touchstart", function (e) {
            e.preventDefault();
            lastTouchTime = Date.now();
            el.classList.add("em-pressed");
            onTap && onTap();
        }, { passive: false });
        el.addEventListener("touchend", function (e) {
            e.preventDefault();
            el.classList.remove("em-pressed");
        });
    }

    /* ---------- Attach look zone (drag-to-look + tap-to-place) ---------- */
    function attachLookZone(el) {
        var LOOK_SENSITIVITY = 0.6;

        // Track touch state
        function onTouchStart(e) {
            // Only handle single-touch for looking
            if (EM.lookTouchId !== null) return;
            var t = e.changedTouches[0];
            EM.lookTouchId = t.identifier;
            EM.lookLastX = t.clientX;
            EM.lookLastY = t.clientY;
            EM.lookActive = true;
            // Hide hint after first use
            el.classList.remove("em-hint");
            var hint = el.querySelector(".em-lookzone-hint");
            if (hint) hint.style.display = "none";
            e.preventDefault();
        }
        function onTouchMove(e) {
            if (EM.lookTouchId === null) return;
            // Find our touch
            var t = null;
            for (var i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === EM.lookTouchId) {
                    t = e.changedTouches[i];
                    break;
                }
            }
            if (!t) return;
            var dx = (t.clientX - EM.lookLastX) * LOOK_SENSITIVITY;
            var dy = (t.clientY - EM.lookLastY) * LOOK_SENSITIVITY;
            EM.lookLastX = t.clientX;
            EM.lookLastY = t.clientY;
            // Dispatch to game's mousemove handler
            if (dx !== 0 || dy !== 0) {
                mouseMove(dx, dy);
            }
            e.preventDefault();
        }
        function onTouchEnd(e) {
            // Check if our touch ended
            for (var i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === EM.lookTouchId) {
                    EM.lookTouchId = null;
                    EM.lookActive = false;
                    // If the touch was very brief (no significant move), treat as a "tap" = place block
                    // The actual movement is tracked in onTouchMove, so if we got here without
                    // significant movement, dispatch a tap (place)
                    // We'll just use a tap duration heuristic
                    // (already handled by separate Place button, so do nothing here)
                    break;
                }
            }
            e.preventDefault();
        }
        el.addEventListener("touchstart", onTouchStart, { passive: false });
        el.addEventListener("touchmove", onTouchMove, { passive: false });
        el.addEventListener("touchend", onTouchEnd, { passive: false });
        el.addEventListener("touchcancel", onTouchEnd, { passive: false });

        // Mouse fallback (for testing on desktop)
        var mouseDown = false;
        el.addEventListener("mousedown", function (e) {
            mouseDown = true;
            EM.lookLastX = e.clientX;
            EM.lookLastY = e.clientY;
            EM.lookActive = true;
            el.classList.remove("em-hint");
            var hint = el.querySelector(".em-lookzone-hint");
            if (hint) hint.style.display = "none";
            e.preventDefault();
        });
        el.addEventListener("mousemove", function (e) {
            if (!mouseDown) return;
            var dx = (e.clientX - EM.lookLastX) * LOOK_SENSITIVITY;
            var dy = (e.clientY - EM.lookLastY) * LOOK_SENSITIVITY;
            EM.lookLastX = e.clientX;
            EM.lookLastY = e.clientY;
            if (dx !== 0 || dy !== 0) mouseMove(dx, dy);
        });
        window.addEventListener("mouseup", function () {
            if (mouseDown) {
                mouseDown = false;
                EM.lookActive = false;
            }
        });
    }

    /* ---------- Hotbar slot selection ---------- */
    function selectSlot(idx) {
        if (idx === EM.activeSlot) return;
        // Update UI
        var slots = document.querySelectorAll(".em-slot");
        for (var i = 0; i < slots.length; i++) {
            slots[i].classList.toggle("em-active", i === idx);
        }
        EM.activeSlot = idx;
        // Press number key 1..9 (keycode 49..57)
        var kc = 49 + idx;
        pressKey(kc);
        setTimeout(function () { releaseKey(kc); }, 50);
    }

    /* ---------- Activate / deactivate mobile mode ---------- */
    function setActive(active) {
        EM.active = !!active;
        var root = document.getElementById("eagler-mobile-root");
        if (root) root.classList.toggle("em-active", EM.active);

        if (EM.active) {
            disablePointerLock();
            // Try to find the canvas now (might not be ready yet)
            if (!EM.capturedCanvas) {
                EM.capturedCanvas = findGameCanvas();
                EM.mouseMoveTarget = EM.capturedCanvas || EM.mouseMoveTarget;
                EM.mouseButtonTarget = EM.capturedCanvas || EM.mouseButtonTarget;
            }
            showStatus("Mobile controls ON");
        } else {
            enablePointerLock();
            showStatus("Mobile controls OFF");
            // Release any held keys/buttons
            for (var k in EM.keys) {
                releaseKey(EM.keys[k]);
            }
            // Release any held mouse buttons
            var cx = EM._lastClientX || (window.innerWidth / 2);
            var cy = EM._lastClientY || (window.innerHeight / 2);
            mouseUpAt(cx, cy, 0);
            mouseUpAt(cx, cy, 2);
        }
    }
    EM.setActive = setActive;

    function showStatus(msg) {
        var pill = document.getElementById("em-status-pill");
        if (!pill) return;
        pill.textContent = msg;
        pill.classList.add("em-show");
        clearTimeout(EM._statusTimer);
        EM._statusTimer = setTimeout(function () {
            pill.classList.remove("em-show");
        }, 1600);
    }
    EM.showStatus = showStatus;

    /* =====================================================================
     * Boot sequence
     * ===================================================================== */
    function boot() {
        buildUI();

        // Auto-activate on touch devices
        if (EM.autoDetected) {
            // Wait for canvas to appear (game may still be loading)
            var tries = 0;
            var iv = setInterval(function () {
                EM.capturedCanvas = EM.capturedCanvas || findGameCanvas();
                if (EM.capturedCanvas || tries > 30) {
                    clearInterval(iv);
                    setActive(true);
                }
                tries++;
            }, 500);
        } else {
            // On desktop, just show the toggle button
            showStatus("Tap \u2630 for mobile controls");
        }
    }

    if (document.readyState === "complete" || document.readyState === "interactive") {
        setTimeout(boot, 100);
    } else {
        window.addEventListener("DOMContentLoaded", boot);
        window.addEventListener("load", function () {
            // Re-check for canvas
            if (!EM.capturedCanvas) {
                EM.capturedCanvas = findGameCanvas();
            }
        });
    }

    // Public API
    window.eaglerMobile = {
        activate: function () { setActive(true); },
        deactivate: function () { setActive(false); },
        toggle: function () { setActive(!EM.active); },
        isTouchDevice: function () { return EM.autoDetected; },
        isActive: function () { return EM.active; },
        showStatus: showStatus,
        // For debugging
        _state: EM
    };

    console.log("[Eaglercraft Mobile] Loaded. Auto-detected touch device:", EM.autoDetected);
})();
