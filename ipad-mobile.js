(function () {
  'use strict';
  var touchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (!touchDevice) return;

  // iOS Safari does not implement Pointer Lock. Eaglercraft expects the API to exist.
  var locked = false, lockTarget = null;
  try {
    if (!Element.prototype.requestPointerLock) {
      Element.prototype.requestPointerLock = function () {
        lockTarget = this; locked = true;
        try { document.dispatchEvent(new Event('pointerlockchange')); } catch (_) {}
        return Promise.resolve();
      };
    }
    if (!document.exitPointerLock) {
      document.exitPointerLock = function () {
        locked = false; lockTarget = null;
        try { document.dispatchEvent(new Event('pointerlockchange')); } catch (_) {}
      };
    }
    if (!('pointerLockElement' in document)) {
      Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: function () { return locked ? lockTarget : null; } });
    }
  } catch (_) {}

  // Safari's fullscreen API is also inconsistent on iPad. Keep Eagler from crashing.
  try {
    if (!Element.prototype.requestFullscreen) Element.prototype.requestFullscreen = function () { return Promise.resolve(); };
    if (!document.exitFullscreen) document.exitFullscreen = function () {};
    if (!('fullscreenElement' in document)) Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: function () { return null; } });
  } catch (_) {}

  function key(code, type) {
    var el = document.activeElement || document.body;
    var ev = new KeyboardEvent(type, { key: code === 'KeyW' ? 'w' : code === 'KeyA' ? 'a' : code === 'KeyS' ? 's' : code === 'KeyD' ? 'd' : code === 'Space' ? ' ' : code === 'ShiftLeft' ? 'Shift' : code === 'ControlLeft' ? 'Control' : code === 'KeyE' ? 'e' : code, code: code, bubbles: true, cancelable: true });
    try { Object.defineProperty(ev, 'keyCode', { get: function () { return code === 'KeyW' ? 87 : code === 'KeyA' ? 65 : code === 'KeyS' ? 83 : code === 'KeyD' ? 68 : code === 'Space' ? 32 : code === 'ShiftLeft' ? 16 : code === 'ControlLeft' ? 17 : code === 'KeyE' ? 69 : 0; } }); } catch (_) {}
    el.dispatchEvent(ev);
  }

  function mouse(type, button, x, y, movementX, movementY) {
    var target = document.querySelector('canvas') || document.body;
    var ev = new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: button || 0, buttons: type === 'mouseup' ? 0 : (button === 2 ? 2 : 1), clientX: x || 0, clientY: y || 0, screenX: x || 0, screenY: y || 0 });
    try { Object.defineProperty(ev, 'movementX', { get: function () { return movementX || 0; } }); Object.defineProperty(ev, 'movementY', { get: function () { return movementY || 0; } }); } catch (_) {}
    target.dispatchEvent(ev);
  }

  function inject() {
    if (document.getElementById('ecx-ipad-ui')) return;
    var css = document.createElement('style');
    css.id = 'ecx-ipad-style';
    css.textContent = `
      #ecx-ipad-ui{position:fixed;inset:0;z-index:2147483646;pointer-events:none;font-family:Arial,sans-serif;touch-action:none;user-select:none;-webkit-user-select:none}
      #ecx-ipad-ui .ctrl{position:absolute;pointer-events:auto;box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;text-shadow:2px 2px #333;background:rgba(55,55,55,.48);border:2px solid rgba(255,255,255,.48);box-shadow:0 2px 3px rgba(0,0,0,.35);-webkit-tap-highlight-color:transparent}
      #ecx-ipad-ui .round{border-radius:50%}.ctrl.down{background:rgba(255,255,255,.32);transform:scale(.94)}
      #ecx-look{position:absolute;left:34%;right:0;top:0;bottom:25%;pointer-events:auto}
      #ecx-dpad{left:20px;bottom:28px;width:154px;height:154px}
      #ecx-dpad .ctrl{width:54px;height:54px;border-radius:7px;font-size:27px}
      #ecx-up{left:50px;top:0}.ecx-left{left:0;top:50px}.ecx-right{right:0;top:50px}.ecx-down{left:50px;bottom:0}
      #ecx-strafeL,#ecx-strafeR{display:none;width:48px;height:48px;font-size:22px;top:53px}
      #ecx-strafeL{left:-52px}#ecx-strafeR{right:-52px}
      #ecx-actions{right:20px;bottom:28px;width:190px;height:180px}
      #ecx-actions .ctrl{width:64px;height:64px}
      #ecx-jump{right:58px;top:0;border-radius:50%;font-size:28px}.ecx-attack{right:0;top:62px;border-radius:50%;font-size:25px}.ecx-use{left:0;top:62px;border-radius:50%;font-size:23px}.ecx-sneak{right:58px;bottom:0;border-radius:50%;font-size:20px}
      #ecx-hotbar{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);height:46px;display:flex;gap:3px;pointer-events:auto}
      #ecx-hotbar .slot{width:38px;height:38px;border:2px solid rgba(255,255,255,.45);background:rgba(0,0,0,.38);box-shadow:inset 0 0 0 1px rgba(0,0,0,.55)}
      #ecx-menu{right:12px;top:12px;display:flex;gap:7px;pointer-events:auto}.ecx-small{width:42px;height:42px;border-radius:6px;font-size:18px}
      @media (orientation:portrait){#ecx-look{bottom:30%}#ecx-dpad{transform:scale(.82);transform-origin:bottom left}#ecx-actions{transform:scale(.82);transform-origin:bottom right}}
    `;
    document.head.appendChild(css);

    var ui = document.createElement('div'); ui.id='ecx-ipad-ui';
    ui.innerHTML = `
      <div id="ecx-look"></div>
      <div id="ecx-dpad">
        <div id="ecx-up" class="ctrl">▲</div><div id="ecx-dpad-left" class="ctrl ecx-left">◀</div><div id="ecx-dpad-right" class="ctrl ecx-right">▶</div><div id="ecx-dpad-down" class="ctrl ecx-down">▼</div>
        <div id="ecx-strafeL" class="ctrl">◀</div><div id="ecx-strafeR" class="ctrl">▶</div>
      </div>
      <div id="ecx-actions"><div id="ecx-jump" class="ctrl">↑</div><div id="ecx-use" class="ctrl">▣</div><div id="ecx-attack" class="ctrl">✚</div><div id="ecx-sneak" class="ctrl">⌄</div></div>
      <div id="ecx-hotbar"></div>
      <div id="ecx-menu"><div id="ecx-inv" class="ctrl ecx-small">▤</div><div id="ecx-pause" class="ctrl ecx-small">Ⅱ</div></div>
    `;
    document.body.appendChild(ui);

    function bindHold(id, code) {
      var b=document.getElementById(id), active=false;
      var on=function(e){e.preventDefault(); if(active)return; active=true; b.classList.add('down'); key(code,'keydown'); try{b.setPointerCapture&&b.setPointerCapture(e.pointerId)}catch(_){} };
      var off=function(e){e.preventDefault(); if(!active)return; active=false; b.classList.remove('down'); key(code,'keyup'); };
      b.addEventListener('pointerdown',on); b.addEventListener('pointerup',off); b.addEventListener('pointercancel',off); b.addEventListener('pointerleave',function(e){if(e.buttons===0)off(e)});
    }
    bindHold('ecx-up','KeyW'); bindHold('ecx-dpad-left','KeyA'); bindHold('ecx-dpad-right','KeyD'); bindHold('ecx-dpad-down','KeyS');
    bindHold('ecx-jump','Space'); bindHold('ecx-sneak','ShiftLeft');

    var strafeL=document.getElementById('ecx-strafeL'), strafeR=document.getElementById('ecx-strafeR');
    document.getElementById('ecx-up').addEventListener('pointerdown',function(){strafeL.style.display='flex';strafeR.style.display='flex'});
    bindHold('ecx-strafeL','KeyA'); bindHold('ecx-strafeR','KeyD');

    function clickBtn(id,button){var b=document.getElementById(id);b.addEventListener('pointerdown',function(e){e.preventDefault();mouse('mousedown',button,e.clientX,e.clientY);b.classList.add('down')});b.addEventListener('pointerup',function(e){e.preventDefault();mouse('mouseup',button,e.clientX,e.clientY);b.classList.remove('down')});b.addEventListener('pointercancel',function(e){mouse('mouseup',button,e.clientX,e.clientY);b.classList.remove('down')})}
    clickBtn('ecx-attack',0); clickBtn('ecx-use',2);
    document.getElementById('ecx-inv').addEventListener('pointerup',function(e){e.preventDefault();key('KeyE','keydown');setTimeout(function(){key('KeyE','keyup')},35)});
    document.getElementById('ecx-pause').addEventListener('pointerup',function(e){e.preventDefault();key('Escape','keydown');setTimeout(function(){key('Escape','keyup')},35)});

    // Camera: emulate relative mouse motion while dragging on the right side.
    var look=document.getElementById('ecx-look'), last=null;
    look.addEventListener('pointerdown',function(e){e.preventDefault();last={x:e.clientX,y:e.clientY};locked=true;lockTarget=document.querySelector('canvas')||look;});
    look.addEventListener('pointermove',function(e){if(!last)return;e.preventDefault();var dx=e.clientX-last.x,dy=e.clientY-last.y;last={x:e.clientX,y:e.clientY};if(dx||dy)mouse('mousemove',0,e.clientX,e.clientY,dx,dy);});
    function endLook(){last=null} look.addEventListener('pointerup',endLook);look.addEventListener('pointercancel',endLook);look.addEventListener('pointerleave',function(e){if(e.buttons===0)endLook()});

    // Hide touch layer while menus are open; restore when canvas is visible and has focus.
    function visibility(){var c=document.querySelector('canvas');var visible=!!c && c.offsetWidth>0 && c.offsetHeight>0;ui.style.display=visible?'block':'none'}
    setInterval(visibility,500); visibility();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject); else inject();
})();
