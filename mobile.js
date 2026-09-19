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
        // Browser key codes (which Eaglercraft reads via b.which)
        keys: {
            forward: 87, back: 83, left: 65, right: 68,
            jump: 32, sneak: 16, inventory: 69, chat: 84, drop: 81,
            esc: 27, f3: 114, f5: 116
        }
    };
    window.__eaglerMobile = EM;

    /* ---------- Touch detection ---------- */
    function isTouchDevice() {
        return !!(
            ("ontouchstart" in window) ||
            (navigator.maxTouchPoints > 0)
        ) && /Mobi|Android|iPhone|iPad|iPod|Tablet|Touch/i.test(navigator.userAgent);
    }
    EM.autoDetected = isTouchDevice();

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

    /* ---------- Pointer lock disable ---------- */
    function disablePointerLock() {
        if (document._emPLDisabled) return;
        document._emPLDisabled = true;
        HTMLElement.prototype.requestPointerLock = function () {
            try {
                var ev = new Event("pointerlockchange");
                document.dispatchEvent(ev);
            } catch (e) { /* ignore */ }
        };
        document.exitPointerLock = function () {
            try {
                var ev = new Event("pointerlockchange");
                document.dispatchEvent(ev);
            } catch (e) { /* ignore */ }
        };
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
        HTMLElement.prototype.requestPointerLock = function () { /* no-op */ };
        document.exitPointerLock = function () { /* no-op */ };
        try {
            Object.defineProperty(document, "pointerLockElement", {
                get: function () { return null; },
                configurable: true
            });
        } catch (e) { /* ignore */ }
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

        // Up arrow (W = forward)
        var dpadUp = mkMCBtn("dpad", "em-dpad-up");
        dpadUp.appendChild(mkArrow("up"));
        attachHoldButton(dpadUp,
            function () { pressKey(EM.keys.forward); EM.moveDir.up = true; },
            function () { releaseKey(EM.keys.forward); EM.moveDir.up = false; }
        );
        dpad.appendChild(dpadUp);

        // Down arrow (S = back)
        var dpadDown = mkMCBtn("dpad", "em-dpad-down");
        dpadDown.appendChild(mkArrow("down"));
        attachHoldButton(dpadDown,
            function () { pressKey(EM.keys.back); EM.moveDir.down = true; },
            function () { releaseKey(EM.keys.back); EM.moveDir.down = false; }
        );
        dpad.appendChild(dpadDown);

        // Left arrow (A = strafe left)
        var dpadLeft = mkMCBtn("dpad", "em-dpad-left");
        dpadLeft.appendChild(mkArrow("left"));
        attachHoldButton(dpadLeft,
            function () { pressKey(EM.keys.left); EM.moveDir.left = true; },
            function () { releaseKey(EM.keys.left); EM.moveDir.left = false; }
        );
        dpad.appendChild(dpadLeft);

        // Right arrow (D = strafe right)
        var dpadRight = mkMCBtn("dpad", "em-dpad-right");
        dpadRight.appendChild(mkArrow("right"));
        attachHoldButton(dpadRight,
            function () { pressKey(EM.keys.right); EM.moveDir.right = true; },
            function () { releaseKey(EM.keys.right); EM.moveDir.right = false; }
        );
        dpad.appendChild(dpadRight);

        // Center button - sneak (Shift) - diamond icon
        var dpadCenter = mkMCBtn("dpad", "em-dpad-center");
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

    function mkIcon(type) {
        var el = document.createElement("div");
        el.className = "em-icon em-icon-" + type;
        if (type === "pause") {
            // Use CSS pseudo-elements for pause bars
        } else if (type === "chat") {
            // Use CSS pseudo-elements for chat bubble
        }
        return el;
    }

    function mkArrow(dir) {
        var el = document.createElement("div");
        el.className = "em-arrow em-arrow-" + dir;
        return el;
    }

    function mkDiamond() {
        var el = document.createElement("div");
        el.className = "em-diamond";
        return el;
    }

    function mkJumpIcon() {
        var el = document.createElement("div");
        el.className = "em-icon-jump";
        return el;
    }

    function mkInventoryIcon() {
        var el = document.createElement("div");
        el.className = "em-icon-inventory";
        return el;
    }

    function mkDropIcon() {
        var el = document.createElement("div");
        el.className = "em-icon-drop";
        return el;
    }

    function mkBreakIcon() {
        var el = document.createElement("div");
        el.className = "em-icon-break";
        return el;
    }

    function mkPlaceIcon() {
        var el = document.createElement("div");
        el.className = "em-icon-place";
        return el;
    }

    function mkFKeyLabel(text) {
        var el = document.createElement("span");
        el.className = "em-f-key";
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
            disablePointerLock();
            if (!EM.capturedCanvas) {
                EM.capturedCanvas = findGameCanvas();
                EM.mouseMoveTarget = EM.capturedCanvas || EM.mouseMoveTarget;
                EM.mouseButtonTarget = EM.capturedCanvas || EM.mouseButtonTarget;
            }
            showStatus("Mobile controls ON");
        } else {
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
            showStatus("Tap \u2630 for mobile controls");
        }
    }

    if (document.readyState === "complete" || document.readyState === "interactive") {
        setTimeout(boot, 100);
    } else {
        window.addEventListener("DOMContentLoaded", boot);
        window.addEventListener("load", function () {
            if (!EM.capturedCanvas) {
                EM.capturedCanvas = findGameCanvas();
            }
        });
    }

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
