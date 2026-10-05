// Display clips are overlays on the existing priority state machine.
function smoothDisplay(assets, pet, selectedAction) {
  const clip = (action, index, loop = false) => {
    const frames = assets[action];
    if (!frames?.length) return null;
    return { action, frame: (loop ? index % frames.length : Math.min(index, frames.length - 1)) + 1, fadeMs: 30 };
  };
  if (selectedAction === 'falling' || pet.state === 'dragged') return null;
  if (pet.state === 'petted') return clip('petted-smooth', Math.floor(pet.stateElapsed / 150));
  if (pet.state === 'alert' && assets['alert-left'] && assets['alert-right']) {
    const left = assets['alert-left'].length, right = assets['alert-right'].length;
    const total = 2 * (left + right);
    const index = Math.min(total - 1, Math.floor(pet.stateElapsed / 2500 * total));
    if (index < left) return clip('alert-left', index);
    if (index < left * 2) return clip('alert-left', left * 2 - index - 1);
    if (index < left * 2 + right) return clip('alert-right', index - left * 2);
    return clip('alert-right', total - index - 1);
  }
  if (pet.state === 'sleep') {
    const entryMs = (assets['sleep-enter']?.length || 0) * 100;
    if (pet.stateElapsed < entryMs) return clip('sleep-enter', Math.floor(pet.stateElapsed / 100));
    const value = clip('sleep-breathe', Math.floor((pet.stateElapsed - entryMs) / 350), true);
    return value ? { ...value, fadeMs: 220 } : null;
  }
  if (pet.state !== 'idle' || selectedAction !== 'idle') return null;
  if (pet.wakeUntil > pet.time) {
    const index = Math.floor((pet.time - pet.wakeStarted) / 100);
    return pet.wakeFromEntry === null ? clip('sleep-wake', index) : clip('sleep-enter', Math.max(0, pet.wakeFromEntry - index));
  }
  if (pet.blinkUntil > pet.time && assets['idle-blink']) {
    const durations = [20,20,20,pet.config.blinkDurationMs / 2,pet.config.blinkDurationMs / 2,20,20,20];
    let elapsed = pet.time - pet.blinkStarted, index = 0;
    while (index < durations.length - 1 && elapsed >= durations[index]) elapsed -= durations[index++];
    return { ...clip('idle-blink', index), fadeMs: 0 };
  }
  if (pet.variantUntil > pet.time && assets['idle-tilt']) {
    const n = assets['idle-tilt'].length, elapsed = pet.time - pet.variantStarted;
    const index = elapsed < 500 ? Math.floor(elapsed / 500 * n) : elapsed < 1300 ? n - 1 : Math.floor((1800 - elapsed) / 500 * n);
    return clip('idle-tilt', Math.max(0, index));
  }
  return null;
}
module.exports = { smoothDisplay };
