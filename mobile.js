/* =====================================================================
 * Eaglercraft 1.20.4 - Mobile Touch Controls (v2)
 * Faithfully styled to match Eaglercraft 1.8.8 mobile UI
 *
 * Layout (matches 1.8.8 screenshot):
 *   - Top bar:    Pause | Chat | F5 | F3   (4 stone buttons)
 *   - Bottom-left:  D-pad (Up/Left/Right/Down + center diamond)
 *   - Bottom-right: Jump (diamond) + Inventory (grid icon)
 *   - Bottom-center: 9-slot hotbar (Minecraft style)
 *   - Right half:  Drag-to-look zone (transparent overlay)
 *
 * Strategy:
 *   - Monkey-patch addEventListener to capture game's mouse/keyboard handlers
 *   - Synthesize MouseEvent/KeyboardEvent and dispatch to captured targets
 *   - Stub requestPointerLock (mobile browsers don't support it)
 * ===================================================================== */
(function () {
    "use strict";

    if (window.__eaglerMobileLoaded) return;
    window.__eaglerMobileLoaded = true;

    var EM = {
        active: false,
        autoDetected: false,
        isMobileDevice: false,   // explicit mobile-device flag
        capturedCanvas: null,
        capturedRoot: null,
        mouseMoveTarget: null,
        mouseButtonTarget: null,
        keyTarget: null,
        lookActive: false,
        lookLastX: 0,
        lookLastY: 0,
        lookTouchId: null,
        moveDir: { up: false, down: false, left: false, right: false },
        activeSlot: 0,
        // The element that the game called requestPointerLock() on.
        // We track this so document.pointerLockElement returns the same
        // reference the game is comparing against.
        pointerLockedElement: null,
        // Browser key codes (which Eaglercraft reads via b.which)
        keys: {
            forward: 87, back: 83, left: 65, right: 68,
            jump: 32, sneak: 16, inventory: 69, chat: 84, drop: 81,
            esc: 27, f3: 114, f5: 116
        }
    };
    window.__eaglerMobile = EM;

    /* ---------- Mobile device detection (single source of truth) ----------
     * Detects mobile devices using multiple signals:
     *   1. Touch API support (ontouchstart, maxTouchPoints)
     *   2. User-Agent hint (Mobi, Android, iPhone, iPad, etc.)
     *   3. Coarse pointer media query (no fine pointer = touch-only)
     *   4. Narrow viewport (typical phone width <= 820px)
     * If ANY two of these match, we treat it as a mobile device.
     */
    function detectMobileDevice() {
        var signals = 0;
        // 1. Touch API
        var hasTouchAPI = !!(
            ("ontouchstart" in window) ||
            (navigator.maxTouchPoints > 0) ||
            (window.DocumentTouch && document instanceof window.DocumentTouch)
        );
        if (hasTouchAPI) signals++;
        // 2. User-Agent
        var uaMatch = /Mobi|Android|iPhone|iPad|iPod|Tablet|Touch|Silk|Kindle|BlackBerry|Opera Mini|IEMobile/i.test(navigator.userAgent || "");
        if (uaMatch) signals++;
        // 3. Coarse pointer media query
        try {
            if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) signals++;
        } catch (e) { /* ignore */ }
        // 4. Narrow viewport (phone)
        if (window.innerWidth <= 820 && window.innerHeight <= 1180) signals++;
        // Also detect iPadOS 13+ which reports as Mac desktop
        var isIpad = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
        if (isIpad) signals++;
        return signals >= 2 || (hasTouchAPI && uaMatch);
    }
    EM.isMobileDevice = detectMobileDevice();
    EM.autoDetected = EM.isMobileDevice;

    /* ---------- Monkey-patch addEventListener to capture game handlers ---------- */
    var _origAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
        try {
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

    function findGameCanvas() {
        var canvases = document.querySelectorAll("canvas");
        for (var i = 0; i < canvases.length; i++) {
            var c = canvases[i];
            if (c.width >= 200 && c.height >= 200) return c;
        }
        return null;
    }

    /* ---------- Event synthesis ---------- */
    function synthMouseEvent(type, target, opts) {
        opts = opts || {};
        var ev = new MouseEvent(type, {
            bubbles: true, cancelable: true, composed: true, view: window,
            button: opts.button || 0,
            buttons: opts.buttons || 0,
            clientX: opts.clientX || 0,
            clientY: opts.clientY || 0,
            screenX: opts.clientX || 0,
            screenY: opts.clientY || 0,
            movementX: opts.movementX || 0,
            movementY: opts.movementY || 0,
            relatedTarget: null,
            ctrlKey: false, altKey: false, shiftKey: false, metaKey: false
        });
        try {
            Object.defineProperty(ev, "offsetX", { get: function () { return opts.offsetX || 0; } });
            Object.defineProperty(ev, "offsetY", { get: function () { return opts.offsetY || 0; } });
            Object.defineProperty(ev, "which", { get: function () { return (opts.button || 0) + 1; } });
        } catch (e) { /* ignore */ }
        target.dispatchEvent(ev);
    }

    function synthKeyEvent(type, keyCode, opts) {
        opts = opts || {};
        var ev = new KeyboardEvent(type, {
            bubbles: true, cancelable: true, composed: true, view: window,
            key: opts.key || String.fromCharCode(keyCode),
            code: opts.code || "",
            keyCode: keyCode,
            which: keyCode,
            location: opts.location || 0,
            repeat: !!opts.repeat,
            ctrlKey: false, altKey: false, shiftKey: !!opts.shiftKey, metaKey: false
        });
        try {
            Object.defineProperty(ev, "keyCode", { get: function () { return keyCode; } });
            Object.defineProperty(ev, "which", { get: function () { return keyCode; } });
        } catch (e) { /* ignore */ }
        var target = EM.keyTarget || window;
        target.dispatchEvent(ev);
    }

    function pressKey(kc) { synthKeyEvent("keydown", kc); }
    function releaseKey(kc) { synthKeyEvent("keyup", kc); }

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

    /* ---------- Pointer lock handling ----------
     * The Eaglercraft 1.20.4 game's pointer-lock chain works like this:
     *
     *   1. Game calls `AQI(true)` -> calls `canvas.requestPointerLock()`
     *   2. Browser fires `pointerlockchange` event
     *   3. Game's `FJH` handler runs:
     *        Glv = (document.pointerLockElement != null) ? 1 : 0
     *   4. Game's main loop checks `Glv` to decide whether mouse
     *      movement deltas should rotate the camera.
     *   5. The mousemove handler `Fvj` ALSO checks `BLe()`:
     *        BLe() = navigator.userActivation.hasBeenActive
     *      If that's false, camera rotation is ignored entirely.
     *
     * On mobile, both pieces break:
     *   - requestPointerLock() is a no-op (mobile browsers reject it)
     *   - navigator.userActivation.hasBeenActive returns false until
     *     the user has clicked/tapped something the browser considers
     *     an activation gesture
     *
     * Our fix:
     *   1. When the game calls `canvas.requestPointerLock()`, we remember
     *      WHICH canvas was passed, then dispatch `pointerlockchange`
     *      asynchronously (so the game's requestPointerLock returns first,
     *      matching real browser behavior).
     *   2. `document.pointerLockElement` returns that exact canvas, so the
     *      game's `pointerLockElement === canvas` check succeeds.
     *   3. We stub `navigator.userActivation` so `hasBeenActive` is always
     *      true while mobile mode is active.
     */
    var _origRequestPointerLock = HTMLElement.prototype.requestPointerLock;
    var _origExitPointerLock = document.exitPointerLock ? document.exitPointerLock.bind(document) : function () {};
    var _origUserActivation = navigator.userActivation ? Object.getOwnPropertyDescriptor(navigator, "userActivation") || Object.getOwnPropertyDescriptor(Navigator.prototype, "userActivation") : null;

    function disablePointerLock() {
        if (document._emPLDisabled) return;
        document._emPLDisabled = true;

        // 1. Stub requestPointerLock to remember which element was locked
        HTMLElement.prototype.requestPointerLock = function () {
            // Remember the exact element that called requestPointerLock
            EM.pointerLockedElement = this;
            // Dispatch pointerlockchange ASYNCHRONOUSLY.
            // Real browsers fire it after requestPointerLock returns,
            // so we use setTimeout(0) to mimic that ordering.
            var self = this;
            setTimeout(function () {
                try {
                    var ev = new Event("pointerlockchange");
                    document.dispatchEvent(ev);
                    // Some browsers also fire it on the element itself
                    try { self.dispatchEvent(new Event("pointerlockchange", { bubbles: true })); } catch (e) { /* ignore */ }
                } catch (e) { /* ignore */ }
            }, 0);
            // Return undefined (real requestPointerLock returns undefined)
            return undefined;
        };

        // 2. Stub exitPointerLock to clear the locked element
        document.exitPointerLock = function () {
            var wasLocked = EM.pointerLockedElement;
            EM.pointerLockedElement = null;
            setTimeout(function () {
                try {
                    var ev = new Event("pointerlockchange");
                    document.dispatchEvent(ev);
                } catch (e) { /* ignore */ }
            }, 0);
            return undefined;
        };

        // 3. Make document.pointerLockElement return the element the game locked
        try {
            Object.defineProperty(document, "pointerLockElement", {
                get: function () {
                    // Only fake a locked element while mobile mode is active
                    if (window.__eaglerMobile && window.__eaglerMobile.active) {
                        return EM.pointerLockedElement || null;
                    }
                    return null;
                },
                configurable: true
            });
        } catch (e) { /* ignore — some browsers don't allow redefining, but most do */ }

        // 4. Stub navigator.userActivation so BLe() returns true
        //    This is what the mousemove handler Fvj checks.
        try {
            var fakeUserActivation = {
                hasBeenActive: true,
                isActive: true,
                wasRecentlyActive: true
            };
            // Try to define on navigator (works in most browsers)
            try {
                Object.defineProperty(navigator, "userActivation", {
                    get: function () { return fakeUserActivation; },
                    configurable: true
                });
            } catch (e) {
                // If direct define fails, try on Navigator.prototype
                try {
                    Object.defineProperty(Navigator.prototype, "userActivation", {
                        get: function () { return fakeUserActivation; },
                        configurable: true
                    });
                } catch (e2) { /* ignore */ }
            }
        } catch (e) { /* ignore */ }

        console.log("[Eaglercraft Mobile] Pointer lock stubbed for mobile mode");
    }

    function enablePointerLock() {
        if (!document._emPLDisabled) return;
        document._emPLDisabled = false;

        // Restore requestPointerLock
        HTMLElement.prototype.requestPointerLock = _origRequestPointerLock;
        document.exitPointerLock = _origExitPointerLock;

        // Restore pointerLockElement to default (returns null normally)
        try {
            Object.defineProperty(document, "pointerLockElement", {
                get: function () { return null; },
                configurable: true
            });
        } catch (e) { /* ignore */ }

        // Restore userActivation (delete our fake so the native getter works)
        try { delete navigator.userActivation; } catch (e) { /* ignore */ }
        try { delete Navigator.prototype.userActivation; } catch (e) { /* ignore */ }

        EM.pointerLockedElement = null;
        console.log("[Eaglercraft Mobile] Pointer lock restored to native behavior");
    }

    /* =====================================================================
     * UI Construction - matches Eaglercraft 1.8.8 layout
     * ===================================================================== */
    function buildUI() {
        if (document.getElementById("eagler-mobile-root")) return;

        var root = document.createElement("div");
        root.id = "eagler-mobile-root";

        /* ---- Toggle button (top-right) ---- */
        var toggle = document.createElement("button");
        toggle.id = "em-toggle-btn";
        toggle.className = "em-interactive";
        toggle.title = "Toggle mobile controls";
        toggle.innerHTML = '<div class="em-hamburger"><span></span></div>';
        toggle.addEventListener("click", function (e) {
            e.preventDefault();
            setActive(!EM.active);
        });
        document.body.appendChild(toggle);

        /* ---- Top bar: Pause | Chat | F5 | F3 ---- */
        var topbar = document.createElement("div");
        topbar.className = "em-topbar em-interactive";

        // Pause button (Esc key)
        var pauseBtn = mkMCBtn("topbar", "em-pause");
        pauseBtn.appendChild(mkIcon("pause"));
        attachTapButton(pauseBtn, function () {
            pressKey(EM.keys.esc);
            setTimeout(function () { releaseKey(EM.keys.esc); }, 60);
        });
        topbar.appendChild(pauseBtn);

        // Chat button (T key)
        var chatBtn = mkMCBtn("topbar", "em-chat");
        chatBtn.appendChild(mkIcon("chat"));
        attachTapButton(chatBtn, function () {
            pressKey(EM.keys.chat);
            setTimeout(function () { releaseKey(EM.keys.chat); }, 60);
            // Focus hidden input to open mobile keyboard
            var inp = document.getElementById("em-keyboard-input");
            if (inp) { try { inp.focus({ preventScroll: true }); } catch (e) {} }
        });
        topbar.appendChild(chatBtn);

        // F5 button (perspective toggle)
        var f5Btn = mkMCBtn("topbar", "em-f5");
        f5Btn.appendChild(mkFKeyLabel("F5"));
        attachTapButton(f5Btn, function () {
            pressKey(EM.keys.f5);
            setTimeout(function () { releaseKey(EM.keys.f5); }, 60);
        });
        topbar.appendChild(f5Btn);

        // F3 button (debug screen)
        var f3Btn = mkMCBtn("topbar", "em-f3");
        f3Btn.appendChild(mkFKeyLabel("F3"));
        attachTapButton(f3Btn, function () {
            pressKey(EM.keys.f3);
            setTimeout(function () { releaseKey(EM.keys.f3); }, 60);
        });
        topbar.appendChild(f3Btn);

        root.appendChild(topbar);

        /* ---- D-Pad (bottom-left) ---- */
        var dpad = document.createElement("div");
        dpad.className = "em-dpad em-interactive";

        // Up arrow (W = forward) - uses sprite (44,56) 22x22 from touch_gui.png
        var dpadUp = mkDpadBtn("em-dpad-up");
        attachHoldButton(dpadUp,
            function () { pressKey(EM.keys.forward); EM.moveDir.up = true; },
            function () { releaseKey(EM.keys.forward); EM.moveDir.up = false; }
        );
        dpad.appendChild(dpadUp);

        // Down arrow (S = back) - uses sprite (0,56) 22x22 flipped vertically
        var dpadDown = mkDpadBtn("em-dpad-down");
        attachHoldButton(dpadDown,
            function () { pressKey(EM.keys.back); EM.moveDir.down = true; },
            function () { releaseKey(EM.keys.back); EM.moveDir.down = false; }
        );
        dpad.appendChild(dpadDown);

        // Left arrow (A = strafe left) - uses sprite (0,56) 22x22
        var dpadLeft = mkDpadBtn("em-dpad-left");
        attachHoldButton(dpadLeft,
            function () { pressKey(EM.keys.left); EM.moveDir.left = true; },
            function () { releaseKey(EM.keys.left); EM.moveDir.left = false; }
        );
        dpad.appendChild(dpadLeft);

        // Right arrow (D = strafe right) - uses sprite (66,56) 22x22 flipped horizontally
        var dpadRight = mkDpadBtn("em-dpad-right");
        attachHoldButton(dpadRight,
            function () { pressKey(EM.keys.right); EM.moveDir.right = true; },
            function () { releaseKey(EM.keys.right); EM.moveDir.right = false; }
        );
        dpad.appendChild(dpadRight);

        // Center button - sneak (Shift) - diamond icon (uses sprite)
        var dpadCenter = mkDpadBtn("em-dpad-center");
        dpadCenter.appendChild(mkDiamond());
        attachHoldButton(dpadCenter,
            function () { pressKey(EM.keys.sneak); },
            function () { releaseKey(EM.keys.sneak); }
        );
        dpad.appendChild(dpadCenter);

        root.appendChild(dpad);

        /* ---- Look zone (right half) ---- */
        var look = document.createElement("div");
        look.className = "em-lookzone em-interactive em-hint";
        var lookHint = document.createElement("div");
        lookHint.className = "em-lookzone-hint";
        lookHint.textContent = "Drag to look\nTap = place  |  Hold = break";
        look.appendChild(lookHint);
        attachLookZone(look);
        root.appendChild(look);

        /* ---- Action buttons (bottom-right) - Jump + Inventory ---- */
        var actions = document.createElement("div");
        actions.className = "em-actions em-interactive";

        var actionsRow = document.createElement("div");
        actionsRow.className = "em-actions-row";

        // Jump button (Space) - diamond icon
        var jumpBtn = mkMCBtn("actions", "em-jump");
        jumpBtn.appendChild(mkJumpIcon());
        attachHoldButton(jumpBtn,
            function () { pressKey(EM.keys.jump); },
            function () { releaseKey(EM.keys.jump); }
        );
        actionsRow.appendChild(jumpBtn);

        // Inventory button (E) - 3x3 grid icon
        var invBtn = mkMCBtn("actions", "em-inv");
        invBtn.appendChild(mkInventoryIcon());
        attachTapButton(invBtn, function () {
            pressKey(EM.keys.inventory);
            setTimeout(function () { releaseKey(EM.keys.inventory); }, 60);
        });
        actionsRow.appendChild(invBtn);

        actions.appendChild(actionsRow);

        // Secondary actions: Drop, Break, Place (smaller buttons)
        var secondary = document.createElement("div");
        secondary.className = "em-secondary-actions";

        // Drop button (Q)
        var dropBtn = mkMCBtn("secondary", "em-drop");
        dropBtn.appendChild(mkDropIcon());
        attachTapButton(dropBtn, function () {
            pressKey(EM.keys.drop);
            setTimeout(function () { releaseKey(EM.keys.drop); }, 60);
        });
        secondary.appendChild(dropBtn);

        // Break button (hold left mouse)
        var breakBtn = mkMCBtn("secondary", "em-break");
        breakBtn.appendChild(mkBreakIcon());
        attachHoldButton(breakBtn,
            function () {
                var cx = EM._lastClientX || (window.innerWidth / 2);
                var cy = EM._lastClientY || (window.innerHeight / 2);
                mouseDownAt(cx, cy, 0);
            },
            function () {
                var cx = EM._lastClientX || (window.innerWidth / 2);
                var cy = EM._lastClientY || (window.innerHeight / 2);
                mouseUpAt(cx, cy, 0);
            }
        );
        secondary.appendChild(breakBtn);

        // Place button (right-click)
        var placeBtn = mkMCBtn("secondary", "em-place");
        placeBtn.appendChild(mkPlaceIcon());
        attachTapButton(placeBtn, function () {
            var cx = EM._lastClientX || (window.innerWidth / 2);
            var cy = EM._lastClientY || (window.innerHeight / 2);
            mouseDownAt(cx, cy, 2);
            setTimeout(function () { mouseUpAt(cx, cy, 2); }, 80);
        });
        secondary.appendChild(placeBtn);

        actions.appendChild(secondary);
        root.appendChild(actions);

        /* ---- Hotbar (bottom-center) - 9 slots ---- */
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
                b.addEventListener("touchstart", function (e) {
                    e.preventDefault();
                    selectSlot(slot);
                }, { passive: false });
                hotbar.appendChild(b);
            })(i);
        }
        root.appendChild(hotbar);

        /* ---- Hidden keyboard input ---- */
        var kbInput = document.createElement("input");
        kbInput.id = "em-keyboard-input";
        kbInput.type = "text";
        kbInput.autocomplete = "off";
        kbInput.autocapitalize = "off";
        kbInput.spellcheck = false;
        kbInput.setAttribute("aria-hidden", "true");
        document.body.appendChild(kbInput);

        kbInput.addEventListener("input", function (e) {
            var val = kbInput.value;
            if (val) {
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

    /* ---------- Builder helpers ---------- */
    function mkMCBtn(group, cls) {
        var b = document.createElement("button");
        b.className = "em-mc-btn " + (cls || "");
        b.dataset.group = group;
        return b;
    }

    // D-pad button - uses sprite from touch_gui.png as full button background
    // (matches 1.8.8's approach where the sprite includes both button bg + arrow icon)
    function mkDpadBtn(cls) {
        var b = document.createElement("button");
        if (cls === "em-dpad-center") {
            b.className = "em-dpad-center";
        } else {
            b.className = "em-dpad-sprite " + cls;
        }
        b.dataset.group = "dpad";
        return b;
    }

    /* ---------- Icon builders - use ACTUAL 1.8.8 touch_gui.png sprites ---------- */

    function mkIcon(type) {
        var el = document.createElement("div");
        el.className = "em-sprite em-sprite-" + type;
        return el;
    }

    function mkArrow(dir) {
        // No longer used - D-pad buttons now use full sprite backgrounds via .em-dpad-sprite class
        var el = document.createElement("div");
        el.className = "em-arrow em-arrow-" + dir;
        return el;
    }

    function mkDiamond() {
        var el = document.createElement("div");
        el.className = "em-dpad-center-icon";
        return el;
    }

    function mkJumpIcon() {
        var el = document.createElement("div");
        el.className = "em-sprite em-sprite-jump";
        return el;
    }

    function mkInventoryIcon() {
        var el = document.createElement("div");
        el.className = "em-sprite em-sprite-inventory";
        return el;
    }

    function mkDropIcon() {
        // 1.8.8 renders this dynamically; use text label
        var el = document.createElement("span");
        el.className = "em-label-drop";
        el.textContent = "DROP";
        return el;
    }

    function mkBreakIcon() {
        // 1.8.8 renders this dynamically; use text label
        var el = document.createElement("span");
        el.className = "em-label-break";
        el.textContent = "BREAK";
        return el;
    }

    function mkPlaceIcon() {
        // 1.8.8 renders this dynamically; use text label
        var el = document.createElement("span");
        el.className = "em-label-place";
        el.textContent = "PLACE";
        return el;
    }

    function mkFKeyLabel(text) {
        // 1.8.8 renders F5/F3 using game's font; we use CSS text
        var el = document.createElement("span");
        el.className = "em-text-" + text.toLowerCase();
        el.textContent = text;
        return el;
    }

    /* ---------- Button behaviors ---------- */
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
        el.addEventListener("mousedown", down);
        el.addEventListener("mouseup", up);
        el.addEventListener("mouseleave", up);
        el.addEventListener("touchstart", down, { passive: false });
        el.addEventListener("touchend", up);
        el.addEventListener("touchcancel", up);
        el.addEventListener("click", function (e) { e.preventDefault(); });
    }

    function attachTapButton(el, onTap) {
        var lastTouchTime = 0;
        el.addEventListener("click", function (e) {
            e.preventDefault();
            if (Date.now() - lastTouchTime < 500) return;
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

    /* ---------- Look zone (drag-to-look) ---------- */
    function attachLookZone(el) {
        var LOOK_SENSITIVITY = 0.7;

        function onTouchStart(e) {
            if (EM.lookTouchId !== null) return;
            var t = e.changedTouches[0];
            EM.lookTouchId = t.identifier;
            EM.lookLastX = t.clientX;
            EM.lookLastY = t.clientY;
            EM.lookActive = true;
            el.classList.remove("em-hint");
            var hint = el.querySelector(".em-lookzone-hint");
            if (hint) hint.style.display = "none";
            e.preventDefault();
        }
        function onTouchMove(e) {
            if (EM.lookTouchId === null) return;
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
            if (dx !== 0 || dy !== 0) mouseMove(dx, dy);
            e.preventDefault();
        }
        function onTouchEnd(e) {
            for (var i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === EM.lookTouchId) {
                    EM.lookTouchId = null;
                    EM.lookActive = false;
                    break;
                }
            }
            e.preventDefault();
        }
        el.addEventListener("touchstart", onTouchStart, { passive: false });
        el.addEventListener("touchmove", onTouchMove, { passive: false });
        el.addEventListener("touchend", onTouchEnd, { passive: false });
        el.addEventListener("touchcancel", onTouchEnd, { passive: false });

        // Mouse fallback for desktop testing
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
            if (mouseDown) { mouseDown = false; EM.lookActive = false; }
        });
    }

    /* ---------- Hotbar slot selection ---------- */
    function selectSlot(idx) {
        if (idx === EM.activeSlot) return;
        var slots = document.querySelectorAll(".em-slot");
        for (var i = 0; i < slots.length; i++) {
            slots[i].classList.toggle("em-active", i === idx);
        }
        EM.activeSlot = idx;
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
            // Disable pointer lock FIRST (so the game's requestPointerLock calls get stubbed)
            disablePointerLock();
            // Then find the game canvas
            if (!EM.capturedCanvas) {
                EM.capturedCanvas = findGameCanvas();
                EM.mouseMoveTarget = EM.capturedCanvas || EM.mouseMoveTarget;
                EM.mouseButtonTarget = EM.capturedCanvas || EM.mouseButtonTarget;
            }
            showStatus("Mobile controls ON");

            // Pre-emptively set the pointer lock state so the game's `Glv` flag
            // gets set to 1 once the canvas exists. We poll for the canvas because
            // it might not exist yet (the 13 MB classes.js is still loading).
            function lockCanvasWhenReady() {
                if (!EM.capturedCanvas) {
                    EM.capturedCanvas = findGameCanvas();
                    if (EM.capturedCanvas) {
                        EM.mouseMoveTarget = EM.capturedCanvas;
                        EM.mouseButtonTarget = EM.capturedCanvas;
                    }
                }
                if (EM.capturedCanvas && !EM.pointerLockedElement) {
                    // Simulate the game calling requestPointerLock on the canvas
                    // (this sets pointerLockedElement and dispatches pointerlockchange)
                    try { EM.capturedCanvas.requestPointerLock(); } catch (e) { /* ignore */ }
                    console.log("[Eaglercraft Mobile] Auto-locked pointer to canvas");
                }
                if (!EM.pointerLockedElement) {
                    // Try again in 500ms (canvas might still be loading)
                    setTimeout(lockCanvasWhenReady, 500);
                }
            }
            setTimeout(lockCanvasWhenReady, 100);
        } else {
            // Release any pointer lock we faked
            if (EM.pointerLockedElement) {
                try { document.exitPointerLock(); } catch (e) { /* ignore */ }
            }
            enablePointerLock();
            showStatus("Mobile controls OFF");
            for (var k in EM.keys) {
                releaseKey(EM.keys[k]);
            }
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

    /* ---------- Boot ---------- */
    function boot() {
        buildUI();

        if (EM.autoDetected) {
            // Activate immediately on touch devices — don't wait for canvas
            // (the canvas can take many seconds to appear on slow connections)
            setActive(true);
            showStatus("Mobile controls active");

            // Also try to capture the canvas once it appears
            var tries = 0;
            var iv = setInterval(function () {
                if (!EM.capturedCanvas) {
                    EM.capturedCanvas = findGameCanvas();
                    if (EM.capturedCanvas) {
                        // Re-bind targets now that we have the canvas
                        EM.mouseMoveTarget = EM.capturedCanvas;
                        EM.mouseButtonTarget = EM.capturedCanvas;
                        if (!EM.keyTarget) EM.keyTarget = EM.capturedCanvas;
                        console.log("[Eaglercraft Mobile] Captured game canvas:", EM.capturedCanvas);
                    }
                }
                if (EM.capturedCanvas || tries > 60) {
                    // 60 tries × 500ms = 30 seconds max wait
                    clearInterval(iv);
                    if (!EM.capturedCanvas && tries > 60) {
                        console.warn("[Eaglercraft Mobile] Game canvas not found after 30s. Toggle button still works.");
                    }
                }
                tries++;
            }, 500);
        } else {
            showStatus("Tap \u2630 for mobile controls");
        }
    }

    // Run boot as soon as DOM is ready (don't wait for full page load)
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        // DOM already parsed (interactive or complete)
        setTimeout(boot, 0);
    }
    // Also try to find canvas after window fully loads
    window.addEventListener("load", function () {
        if (!EM.capturedCanvas) {
            EM.capturedCanvas = findGameCanvas();
            if (EM.capturedCanvas && EM.active) {
                EM.mouseMoveTarget = EM.capturedCanvas;
                EM.mouseButtonTarget = EM.capturedCanvas;
                if (!EM.keyTarget) EM.keyTarget = EM.capturedCanvas;
            }
        }
    });

    window.eaglerMobile = {
        activate: function () { setActive(true); },
        deactivate: function () { setActive(false); },
        toggle: function () { setActive(!EM.active); },
        isTouchDevice: function () { return EM.autoDetected; },
        isActive: function () { return EM.active; },
        showStatus: showStatus,
        _state: EM
    };

    console.log("[Eaglercraft Mobile v2] Loaded. Auto-detected touch device:", EM.autoDetected);
})();
