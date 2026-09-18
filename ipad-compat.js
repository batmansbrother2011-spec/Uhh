/* iPad/iOS Pointer Lock compatibility layer for Eaglercraft 1.20.x.
 * This emulates the small part of Pointer Lock used by the client.
 * Touch movement is translated into relative mouse movement.
 */
(function(){
  "use strict";
  var d=document, locked=false, target=null, lastX=0, lastY=0;
  try {
    Object.defineProperty(d, "pointerLockElement", { configurable:true, get:function(){ return locked ? target : null; } });
  } catch(e) {}
  if (!d.exitPointerLock) {
    d.exitPointerLock=function(){ locked=false; target=null; d.dispatchEvent(new Event("pointerlockchange")); };
  } else {
    var nativeExit=d.exitPointerLock.bind(d);
    d.exitPointerLock=function(){ try { nativeExit(); } catch(e) {} locked=false; target=null; d.dispatchEvent(new Event("pointerlockchange")); };
  }
  function install(c){
    if(!c || c.__eaglerIPadPatch) return;
    c.__eaglerIPadPatch=true;
    c.requestPointerLock=function(){
      locked=true; target=c;
      c.style.cursor="none";
      d.dispatchEvent(new Event("pointerlockchange"));
    };
    c.addEventListener("touchstart",function(ev){
      if(!ev.touches.length) return;
      var t=ev.touches[0]; lastX=t.clientX; lastY=t.clientY;
      if(!locked) c.requestPointerLock();
      ev.preventDefault();
    },{passive:false});
    c.addEventListener("touchmove",function(ev){
      if(!locked || !ev.touches.length) return;
      var t=ev.touches[0], dx=t.clientX-lastX, dy=t.clientY-lastY;
      lastX=t.clientX; lastY=t.clientY;
      var e=new MouseEvent("mousemove",{bubbles:true,cancelable:true,view:window,clientX:t.clientX,clientY:t.clientY,movementX:dx,movementY:dy,buttons:1});
      c.dispatchEvent(e); ev.preventDefault();
    },{passive:false});
    c.addEventListener("touchend",function(ev){ ev.preventDefault(); },{passive:false});
    c.addEventListener("touchcancel",function(ev){ ev.preventDefault(); },{passive:false});
  }
  var oldAppend=Element.prototype.appendChild;
  Element.prototype.appendChild=function(el){
    var r=oldAppend.call(this,el);
    if(el && el.tagName === "CANVAS") install(el);
    return r;
  };
  Array.prototype.forEach.call(d.querySelectorAll("canvas"),install);
  window.addEventListener("load",function(){ Array.prototype.forEach.call(d.querySelectorAll("canvas"),install); });
})();
