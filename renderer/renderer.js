const canvas = document.getElementById('pet');
const ctx = canvas.getContext('2d');
const frames = new Map();
let manifest, current, lastHit = false, dragging = false, pointer = null, ready = false;
let pending;
let transition = null, previousSnapshot = null, paused = false, animationRequest = 0, lastPaint = 0;
function hitTest() {
  if (!ready || dragging || !pointer || !current) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((pointer.x - rect.left) * 256 / rect.width);
  const y = Math.floor((pointer.y - rect.top) * 256 / rect.height);
  let alpha = 0;
  if (x >= 0 && x < 256 && y >= 0 && y < 256) {
    const index = (y * 256 + x) * 4 + 3;
    alpha = transition ? transition.from.alpha[index] * (1 - transition.mix) + current.alpha[index] * transition.mix : current.alpha[index];
  }
  const hit = alpha > 20;
  if (hit !== lastHit) { lastHit = hit; window.pet.hit(hit); }
}
function draw(snapshot) {
  if (!ready) { pending = snapshot; return; }
  const urls = manifest[snapshot.action] || manifest.idle;
  const next = frames.get(urls[(snapshot.frame - 1) % urls.length]);
  const old = current;
  const idleChange = previousSnapshot?.state === 'idle' && snapshot.state === 'idle' &&
    previousSnapshot.action === 'idle' && snapshot.action === 'idle';
  const alertChange = previousSnapshot && previousSnapshot.action === 'idle' && snapshot.action === 'idle' &&
    ((previousSnapshot.state === 'idle' && snapshot.state === 'alert') ||
     (previousSnapshot.state === 'alert' && snapshot.state === 'idle'));
  const specialChange = previousSnapshot &&
    (['sleep', 'petted', 'dragged', 'alert', 'lifted', 'falling'].includes(previousSnapshot.action) || ['sleep', 'petted', 'dragged', 'alert', 'lifted', 'falling'].includes(snapshot.action));
  if (next !== current) {
    const specialDuration = previousSnapshot?.action === 'sleep' && snapshot.action === 'sleep' ? 180 :
      previousSnapshot?.action === 'sleep' || snapshot.action === 'sleep' ? 420 :
      previousSnapshot?.action === 'alert' || snapshot.action === 'alert' ? 200 : 110;
    const duration = old ? (Number.isFinite(snapshot.fadeMs) ? snapshot.fadeMs : Number.isFinite(previousSnapshot?.fadeMs) ? 50 : specialChange ? specialDuration : alertChange ? 260 : idleChange ?
      (snapshot.frame === 2 || previousSnapshot.frame === 2 ? 24 : 140) : 0) : 0;
    transition = duration ? { from: old, elapsed: 0, duration, mix: 0 } : null;
    current = next;
  }
  paused = snapshot.paused; previousSnapshot = snapshot;
  canvas.classList.toggle('petted', snapshot.state === 'petted' && snapshot.action === 'idle');
  cancelAnimationFrame(animationRequest); lastPaint = performance.now();
  paint(lastPaint);
}
function paint(now) {
  if (transition && !paused) {
    transition.elapsed += now - lastPaint;
    const t = Math.min(1, transition.elapsed / transition.duration);
    transition.mix = t * t * (3 - 2 * t);
    if (t === 1) transition = null;
  }
  lastPaint = now;
  ctx.clearRect(0, 0, 256, 256);
  if (transition) {
    ctx.globalAlpha = 1 - transition.mix;
    ctx.drawImage(transition.from.image, 0, 0);
    // Add premultiplied colors to interpolate without fading the opaque body.
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = transition.mix;
    ctx.drawImage(current.image, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  } else ctx.drawImage(current.image, 0, 0);
  hitTest();
  if (transition && !paused) animationRequest = requestAnimationFrame(paint);
}
window.pet.onSnapshot(draw);
window.pet.onSettings(() => hitTest());
canvas.addEventListener('mousemove', e => {
  pointer = { x: e.clientX, y: e.clientY };
  hitTest();
});
canvas.addEventListener('mouseleave', () => { pointer = null; if (!dragging && lastHit) { lastHit = false; window.pet.hit(false); } });
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0 || !lastHit) return;
  dragging = true; canvas.setPointerCapture(e.pointerId);
  window.pet.dragStart({ x: e.screenX, y: e.screenY, offsetX: e.clientX, offsetY: e.clientY });
});
let movePending = false, movePoint;
canvas.addEventListener('pointermove', e => {
  if (!dragging) return;
  movePoint = { x: e.screenX, y: e.screenY };
  if (!movePending) {
    movePending = true;
    requestAnimationFrame(() => { movePending = false; if (dragging) window.pet.dragMove(movePoint); });
  }
});
function release(e) { if (dragging) {
  dragging = false;
  if (movePoint) { window.pet.dragMove(movePoint); movePoint = null; }
  if (e && Number.isFinite(e.clientX)) pointer = { x: e.clientX, y: e.clientY };
  window.pet.dragEnd(); lastHit = null; hitTest();
} }
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('lostpointercapture', release);
window.addEventListener('blur', release);
window.addEventListener('mouseup', release, true);
(async () => {
  const init = await window.pet.initialize(); manifest = init.assets;
  await Promise.all(Object.entries(manifest).flatMap(([action, urls]) => urls.map(async (url, index) => {
    const image = new Image(); image.src = url; await image.decode();
    const offscreen = document.createElement('canvas'); offscreen.width = 256; offscreen.height = 256;
    const offctx = offscreen.getContext('2d', { willReadFrequently: true });
    const requested = init.frameDisplayScale?.[action]?.[String(index + 1)];
    const scale = Number.isFinite(requested) && requested >= .8 && requested <= 1.12 ? requested : 1;
    // Display-only correction around the shared foot anchor; the original PNG stays untouched.
    const x = 128 * (1 - scale), y = 248 * (1 - scale);
    offctx.drawImage(image, x, y, 256 * scale, 256 * scale);
    // Cache precisely the rendered alpha so corrected silhouettes remain click-through outside the cat.
    frames.set(url, { image: offscreen, alpha: offctx.getImageData(0, 0, 256, 256).data });
  })));
  ready = true; draw(pending || init.snapshot);
})().catch(error => console.error('[renderer] initialization failed', error));
