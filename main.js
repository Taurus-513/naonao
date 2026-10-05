const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { defaults, semantics, PetModel } = require('./renderer/model');
const ROOT = __dirname;
const { smoothDisplay } = require('./renderer/animation');
function scanAssets(root = path.join(ROOT, 'assets')) {
  const actions = {};
  if (!fs.existsSync(root)) return actions;
  for (const dir of fs.readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const files = fs.readdirSync(path.join(root, dir.name))
      .filter(name => /^frame[1-9]\d*\.png$/.test(name))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    if (files.length) actions[dir.name] = files.map(name => pathToFileURL(path.join(root, dir.name, name)).href);
  }
  return actions;
}
const missing = new Set();
function resolveAction(assets, name) {
  if (assets[name]) return { action: name, frames: assets[name], fallback: false };
  if (!missing.has(name)) { console.log(`[assets] missing action: ${name}, falling back to idle`); missing.add(name); }
  return { action: 'idle', frames: assets.idle || [], fallback: true };
}
function groundPosition(area, scale) { return Math.round(area.y + area.height - 248 * scale); }
function displayFor(assets, pet, config, selectedAction = 'idle', actionStarted = 0) {
  const smooth = smoothDisplay(assets, pet, selectedAction);
  if (smooth) return smooth;
  const stateAction = ['sleep', 'petted', 'dragged', 'alert'].includes(pet.state);
  const requested = selectedAction === 'falling' && pet.state !== 'dragged' ? 'falling' : stateAction ? (pet.state === 'dragged' ? 'lifted' : pet.state) : pet.state === 'idle' ? selectedAction : 'idle';
  const action = resolveAction(assets, requested);
  if (action.fallback) return { action: 'idle', frame: 1 };
  if (['lifted','falling'].includes(requested)) return { action: requested, frame: 1 };
  if (requested === 'idle') return { action: 'idle', frame: pet.frame };
  const elapsed = stateAction ? pet.stateElapsed : pet.time - actionStarted;
  const frameMs = config[`${requested}FrameDurationMs`] || 1000 / config.fps;
  const index = Math.floor(elapsed / frameMs);
  if (requested === 'alert' && action.frames.length === 4) return {action: requested, frame: [1,2,1,3,4][Math.min(index,4)]};
  return { action: requested, frame: ['petted','alert'].includes(requested) ? Math.min(index, action.frames.length - 1) + 1 : index % action.frames.length + 1 };
}
function selftest() {
  const assets = scanAssets();
  assert.equal(assets.idle?.length, 4);
  for (let i = 0; i < 4; i++) assert(assets.idle[i].endsWith(`/frame${i + 1}.png`));
  assert(Object.values(assets).flat().every(url => /\/frame\d+\.png$/.test(url)));
  assert.equal(resolveAction(assets, '__missing_test__').fallback, true);
  assert.equal(resolveAction({ idle: assets.idle, walk: ['a', 'b', 'c', 'd'] }, 'walk').frames.length, 4);
  for (const action of ['sleep', 'petted', 'dragged', 'alert', 'lifted', 'falling']) {
    assert.equal(assets[action]?.length, ['lifted','falling'].includes(action) ? 1 : 4, `Unexpected ${action} frame count`);
    for (const url of assets[action]) {
      const png = fs.readFileSync(require('node:url').fileURLToPath(url));
      assert.equal(png.readUInt32BE(16), 256); assert.equal(png.readUInt32BE(20), 256);
      assert.equal(png[25], 6, 'New animation frames must be RGBA PNG');
    }
  }
  console.log('[selftest] resource scan and missing-action fallback: PASS');
  const config = { ...defaults, blinkIntervalMs: [3000, 3000], idleVariants: false };
  const pet = new PetModel(config, () => .25);
  pet.tick(3000); assert.equal(pet.state, 'idle'); assert.equal(pet.frame, 2);
  pet.tick(239); assert.equal(pet.frame, 2); pet.tick(1); assert.equal(pet.frame, 1);
  pet.enter('sleep', 20000); pet.tick(4000); assert.equal(pet.state, 'sleep'); assert.equal(pet.frame, 2);
  pet.enter('alert', 2500); pet.enter('petted', 900); pet.enter('dragged'); assert.equal(pet.state, 'dragged');
  pet.leave('dragged'); assert.equal(pet.state, 'petted'); pet.tick(900); assert.equal(pet.state, 'alert');
  pet.proximity(false); assert.equal(pet.state, 'sleep'); pet.proximity(true); assert.equal(pet.state, 'idle');
  pet.enter('alert', 2500); pet.tick(2500); assert.equal(pet.state, 'idle');
  const sleepy = new PetModel(config, () => 0); sleepy.tick(20000); assert.equal(sleepy.state, 'sleep');
  sleepy.tick(19999); assert.equal(sleepy.state, 'sleep'); sleepy.tick(1); assert.equal(sleepy.state, 'idle');
  const alert = new PetModel({ ...config, sleepEnabled: false }, () => 0); alert.tick(20000); assert.equal(alert.state, 'alert');
  const variant = new PetModel(defaults, () => 0); variant.tick(7000); assert.equal(variant.frame, 2);
  variant.tick(240); assert.equal(variant.frame, 1);
  variant.tick(300); assert.equal(variant.frame, 4);
  variant.nextBlink = variant.time + 50;
  variant.tick(50); assert.equal(variant.frame, 4); // No head snap to the closed-eye pose.
  variant.tick(1750); assert.equal(variant.frame, 1);
  variant.tick(300); assert.equal(variant.frame, 2);
  console.log('[selftest] priority, blink overlay, wake, alert, variants and timing: PASS');
  assert.deepEqual(semantics, { idle: 1, blink: 2, sleep: 2, alert: 3, variant: 4 });
  for (const scale of [.5, 1, 1.5, 2]) {
    const area = { y: 30, height: 800 }; const top = groundPosition(area, scale);
    assert.equal(top + 248 * scale, 830); assert.equal(top + 256 * scale, 830 + 8 * scale);
  }
  console.log('[selftest] frame semantics and scaled ground anchor: PASS');
  const legacyAssets = Object.fromEntries(Object.entries(assets).filter(([name]) => ['idle','sleep','petted','dragged','alert','lifted','falling'].includes(name)));
  const animated = new PetModel(config, () => .25);
  animated.enter('sleep', 60000);
  assert.deepEqual(displayFor(legacyAssets, animated, config), { action: 'sleep', frame: 1 });
  animated.tick(config.sleepFrameDurationMs); assert.equal(displayFor(legacyAssets, animated, config).frame, 2);
  animated.tick(config.sleepFrameDurationMs * 3); assert.equal(displayFor(legacyAssets, animated, config).frame, 1);
  animated.proximity(true); assert.equal(displayFor(legacyAssets, animated, config).action, 'idle');
  animated.enter('petted', 10000); assert.equal(displayFor(legacyAssets, animated, config).frame, 1);
  animated.tick(config.pettedFrameDurationMs * 2); assert.equal(displayFor(legacyAssets, animated, config).frame, 3);
  animated.tick(config.pettedFrameDurationMs * 5); assert.equal(displayFor(legacyAssets, animated, config).frame, 4);
  animated.enter('dragged'); assert.equal(displayFor(legacyAssets, animated, config).action, 'lifted');
  animated.tick(config.draggedFrameDurationMs); assert.equal(displayFor(legacyAssets, animated, config).frame,1);
  assert.deepEqual(displayFor({idle:assets.idle}, animated, config), {action:'idle',frame:1});
  animated.leave('dragged');
  assert.deepEqual(displayFor({ idle: assets.idle }, animated, config), { action: 'idle', frame: 1 });
  animated.active.clear();
  assert.deepEqual(displayFor(legacyAssets, animated, config, 'falling', 0), {action:'falling',frame:1});
  animated.tick(700); assert.deepEqual(displayFor(legacyAssets, animated, config, 'falling', 0), {action:'falling',frame:1});
  animated.enter('alert',2500);
  assert.deepEqual(displayFor({idle:assets.idle}, animated, config), {action:'idle',frame:1});
  for (const frame of [1,2,1,3,4]) { assert.equal(displayFor(legacyAssets, animated, config).frame,frame); animated.tick(500); }
  assert.equal(animated.state,'idle');
  console.log('[selftest] new RGBA frames, sleep loop/wake, pet playback/clamp, drag priority and fallback: PASS');
  require('./renderer/animation-selftest').run(assets, config, PetModel, displayFor);
}
if (process.argv.includes('--selftest')) {
  try { selftest(); process.exit(0); } catch (error) { console.error('[selftest] FAIL', error); process.exit(1); }
} else start();

function start() {
  const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, globalShortcut } = require('electron');
  let win, tray, assets, pet, config, timer, drag, fall = null, paused = false, interactive = false;
  let selectedAction = 'idle', actionStarted = 0, lastSnapshot = '', lastTime = performance.now(), trayMenu, verifyingAnimation = false;
  const configPath = path.join(ROOT, 'config.json');
  const diagnostics = process.argv.includes('--diagnostics');
  const log = (...values) => { if (diagnostics) console.log('[pet]', ...values); };
  function loadConfig() {
    if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2) + '\n');
    let stored = {};
    try { stored = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (error) { console.warn('[config]', error.message); }
    const value = { ...defaults, ...stored };
    if (![.5, 1, 1.5, 2].includes(value.scale)) value.scale = defaults.scale;
    if (!Number.isFinite(value.fps) || value.fps < 1 || value.fps > 60) value.fps = defaults.fps;
    if (!Array.isArray(value.blinkIntervalMs) || value.blinkIntervalMs.length !== 2 ||
        !value.blinkIntervalMs.every(n => Number.isFinite(n) && n >= 120) || value.blinkIntervalMs[1] < value.blinkIntervalMs[0]) value.blinkIntervalMs = defaults.blinkIntervalMs;
    if (!Number.isFinite(value.blinkDurationMs) || value.blinkDurationMs < 1) value.blinkDurationMs = defaults.blinkDurationMs;
    for (const key of ['sleepFrameDurationMs', 'pettedFrameDurationMs', 'draggedFrameDurationMs', 'alertFrameDurationMs'])
      if (!Number.isFinite(value[key]) || value[key] < 120 || value[key] > 3000) value[key] = defaults[key];
    return value;
  }
  function save() { fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n'); }
  function setInteractive(hit) {
    if (hit === interactive) return;
    interactive = hit;
    win.setIgnoreMouseEvents(!hit, hit ? {} : { forward: true });
    log('interactive', hit);
  }
  function snapshot() {
    return { state: pet.state, ...displayFor(assets, pet, config, fall ? 'falling' : selectedAction, fall?.started ?? actionStarted), paused, scale: config.scale };
  }
  function publish(force = false) {
    const value = snapshot(); const key = JSON.stringify(value);
    if (force || key !== lastSnapshot) { lastSnapshot = key; win.webContents.send('snapshot', value); log('display', value.state, value.action, value.frame); }
  }
  function endDrag() {
    if (!drag) return;
    const click = !drag.moved; const started = pet.entered.get('dragged') ?? pet.time; drag = null; pet.leave('dragged');
    log('release', click ? 'pet' : 'fall');
    win.setFocusable(false); setInteractive(false);
    if (click) { pet.active.clear(); pet.enter('petted', Math.max(900, assets['petted-smooth'] ? assets['petted-smooth'].length * 150 : (assets.petted?.length || 0) * config.pettedFrameDurationMs)); }
    else { pet.active.clear(); fall = { velocity: 0, started }; }
    publish(true);
  }
  function tick() {
    if (!win || win.isDestroyed()) return;
    const now = performance.now(), dt = Math.min(now - lastTime, 80); lastTime = now;
    const cursor = screen.getCursorScreenPoint(); const bounds = win.getBounds();
    if (!drag && fall) {
      const area = screen.getDisplayMatching(bounds).workArea;
      const target = groundPosition(area, config.scale);
      fall.velocity += 1800 * dt / 1000;
      const y = bounds.y + fall.velocity * dt / 1000;
      if (y >= target) {
        win.setPosition(Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width))), target, false); fall = null; log('landed', win.getBounds());
      } else win.setPosition(bounds.x, Math.round(y), false);
    }
    if (!paused) {
      const near = Math.hypot(cursor.x - (bounds.x + bounds.width / 2), cursor.y - (bounds.y + bounds.height / 2)) < 155 * config.scale;
      // Wake on approach; alert ends on a near -> far transition, not immediately upon spontaneous entry.
      if (!verifyingAnimation) { if (near || pet.near) pet.proximity(near); else pet.near = false; }
      pet.tick(dt);
      if (config.followCursor && !drag && !fall && pet.state === 'idle') {
        const area = screen.getDisplayMatching(bounds).workArea;
        const targetX = Math.max(area.x, Math.min(cursor.x - bounds.width / 2, area.x + area.width - bounds.width));
        const delta = targetX - bounds.x;
        if (Math.abs(delta) > 2) {
          if (selectedAction !== 'walk') { selectedAction = 'walk'; actionStarted = pet.time; }
          win.setPosition(Math.round(bounds.x + Math.sign(delta) * Math.min(Math.abs(delta), 90 * dt / 1000)), bounds.y, false);
        } else selectedAction = 'idle';
      }
    }
    publish();
  }
  function scaleTo(scale) {
    if (drag) endDrag();
    const b = win.getBounds(); const foot = b.y + 248 * config.scale; const center = b.x + b.width / 2;
    config.scale = scale; const size = Math.round(256 * scale);
    const x = Math.round(center - size / 2), y = Math.round(foot - 248 * scale);
    win.setBounds({ x, y, width: size, height: size });
    // macOS can clamp bounds at the workArea edge; restore the deliberate transparent overshoot.
    win.setPosition(x, y, false);
    save(); win.webContents.send('settings', { scale }); publish(true); menu();
    log('scale', scale, win.getBounds());
  }
  function menu() {
    trayMenu = Menu.buildFromTemplate([
      { id: 'pause', label: paused ? '恢复动画' : '暂停动画', click: () => { paused = !paused; publish(true); menu(); } },
      { label: '缩放', submenu: [.5, 1, 1.5, 2].map(scale => ({ id: `scale-${scale}`, label: `${scale} 倍`, type: 'radio', checked: config.scale === scale, click: () => scaleTo(scale) })) },
      { id: 'visibility', label: win.isVisible() ? '隐藏' : '显示', click: () => { if (win.isVisible()) { endDrag(); win.hide(); } else win.showInactive(); menu(); } },
      { label: '动作', submenu: Object.keys(assets).map(action => ({ id: `action-${action}`, label: action, type: 'radio',
        checked: ['sleep','petted','alert'].includes(action) ? pet.state === action : selectedAction === action && pet.state === 'idle',
        click: () => {
          pet.active.clear(); pet.entered.clear();
          if (['sleep','petted','alert'].includes(action)) {
            selectedAction = 'idle'; pet.enter(action, action === 'sleep' ? pet.range([20000, 60000]) : action === 'alert' ? 2500 : (assets['petted-smooth'] ? assets['petted-smooth'].length * 150 : assets.petted.length * config.pettedFrameDurationMs));
          } else { selectedAction = action; actionStarted = pet.time; }
          publish(true); menu();
        } })) },
      { id: 'login', label: '开机自启', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
        click: item => {
          try { app.setLoginItemSettings({ openAtLogin: item.checked }); log('login', app.getLoginItemSettings()); }
          catch (error) { console.warn('[login]', error.message); }
          menu();
        } },
      { type: 'separator' }, { id: 'quit', label: '退出', click: () => app.quit() }
    ]);
    tray.setContextMenu(trayMenu);
  }
  async function verifyAnimation() {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    verifyingAnimation = true;
    try {
      pet.active.clear(); selectedAction = 'idle'; pet.enter('sleep', 20000); publish(true);
      assert.equal(snapshot().action, 'sleep-enter');
      await wait(1800); assert.equal(snapshot().action, 'sleep-breathe');
      pet.proximity(true); publish(true); assert.equal(snapshot().action, 'sleep-wake');
      await wait(1000); assert.equal(snapshot().state, 'idle');
      pet.enter('petted', 1200); publish(true); assert.equal(snapshot().action, 'petted-smooth');
      await wait(1400); assert.equal(snapshot().state, 'idle');
      pet.enter('alert', 2500); publish(true); assert.equal(snapshot().action, 'alert-left');
      await wait(1400); assert.equal(snapshot().action, 'alert-right');
      await wait(1300); assert.equal(snapshot().state, 'idle');
      console.log('[native-animation] entry/breath/wake, pet, left/right alert and idle recovery: PASS');
    } catch (error) { console.error('[native-animation] FAIL', error); }
    finally { verifyingAnimation = false; }
  }
  async function verifyNativeMenu() {
    const originalScale = config.scale;
    const invoke = id => { const item = trayMenu.getMenuItemById(id); assert(item); item.click(item, win, {}); };
    try {
      invoke('pause'); assert.equal(paused, true); const time = pet.time;
      await new Promise(resolve => setTimeout(resolve, 180)); assert.equal(pet.time, time);
      invoke('pause'); assert.equal(paused, false);
      console.log('[native-check] pause/resume via real menu callbacks: PASS');
      const before = win.getBounds(), foot = before.y + 248 * config.scale;
      for (const scale of [.5, 1, 1.5, 2]) {
        invoke(`scale-${scale}`); const b = win.getBounds();
        assert.equal(b.width, 256 * scale); assert.equal(b.height, 256 * scale);
        assert.equal(b.y + 248 * scale, foot);
      }
      scaleTo(originalScale); console.log('[native-check] four scales and native foot position: PASS');
      invoke('visibility'); assert.equal(win.isVisible(), false);
      invoke('visibility'); assert.equal(win.isVisible(), true);
      console.log('[native-check] hide/show native window: PASS');
      const login = app.getLoginItemSettings();
      const item = trayMenu.getMenuItemById('login'); item.checked = !login.openAtLogin; item.click(item, win, {});
      const changed = app.getLoginItemSettings();
      console.log('[native-check] login-item registration:', JSON.stringify(changed));
      if (changed.openAtLogin !== !login.openAtLogin)
        console.log('[native-check] login: UNVERIFIED (macOS development runtime restriction or system approval required)');
      else console.log('[native-check] login setting toggled: PASS; reboot launch remains unverified');
      app.setLoginItemSettings({ openAtLogin: login.openAtLogin }); menu();
      console.log('[native-check] restored original scale and login settings; exercising quit');
      invoke('quit');
    } catch (error) { scaleTo(originalScale); console.error('[native-check] FAIL', error); app.exit(1); }
  }
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    config = loadConfig(); assets = scanAssets(); pet = new PetModel(config);
    if (!assets.idle || assets.idle.length < 4) throw new Error('Required assets/idle/frame1.png .. frame4.png are missing');
    app.dock?.hide();
    const area = screen.getPrimaryDisplay().workArea, size = Math.round(256 * config.scale);
    win = new BrowserWindow({ width: size, height: size, x: Math.round(area.x + (area.width - size) / 2), y: groundPosition(area, config.scale),
      transparent: true, frame: false, alwaysOnTop: config.alwaysOnTop, hasShadow: false, resizable: false,
      skipTaskbar: true, focusable: false, show: false, backgroundColor: '#00000000',
      webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    const trusted = event => event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame;
    ipcMain.handle('initialize', event => {
      if (!trusted(event)) throw new Error('Untrusted sender');
      return { assets, snapshot: snapshot(), frameDisplayScale: config.frameDisplayScale };
    });
    ipcMain.on('hit', (event, hit) => { if (trusted(event) && !drag) setInteractive(hit === true); });
    const validPoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
    ipcMain.on('drag-start', (event, point) => {
      if (!trusted(event) || !interactive || drag) return;
      if (!validPoint(point) || !Number.isFinite(point.offsetX) || !Number.isFinite(point.offsetY)) return;
      fall = null; drag = { cursor: point, offset: { x: point.offsetX, y: point.offsetY }, moved: false };
      // Reserve the pointer without changing pose; a press can still be a simple click.
      win.setFocusable(true);
    });
    ipcMain.on('drag-move', (event, point) => {
      if (!trusted(event) || !drag || !validPoint(point)) return;
      if (!drag.moved && Math.hypot(point.x - drag.cursor.x, point.y - drag.cursor.y) > 3) {
        drag.moved = true;
        pet.enter('dragged'); publish(true);
      }
      if (drag.moved) win.setPosition(Math.round(point.x - drag.offset.x), Math.round(point.y - drag.offset.y), false);
    });
    ipcMain.on('drag-end', event => { if (trusted(event)) endDrag(); });
    // Native template icon drawn from inline SVG; no additional project assets.
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><path fill="black" d="M3 3L8 6Q11 4 14 6L19 3L19 13Q19 20 11 20Q3 20 3 13Z"/><circle cx="8" cy="11" r="1.3" fill="white"/><circle cx="14" cy="11" r="1.3" fill="white"/></svg>';
    const icon = nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
    // macOS nativeImage does not decode SVG on every Electron release; use the existing PNG as fallback.
    const trayIcon = icon.isEmpty() ? nativeImage.createFromPath(path.join(ROOT, 'assets/idle/frame1.png')).resize({ width: 22, height: 22 }) : icon;
    trayIcon.setTemplateImage(true); tray = new Tray(trayIcon); tray.setToolTip('Golden Cat');
    if (diagnostics) globalShortcut.register('CommandOrControl+Alt+Shift+P', () => tray.popUpContextMenu());
    win.webContents.on('console-message', (_event, ...args) => console.log('[renderer]', ...args));
    win.webContents.on('did-finish-load', () => publish(true));
    win.once('ready-to-show', () => {
      win.showInactive();
      win.setPosition(Math.round(area.x + (area.width - size) / 2), groundPosition(area, config.scale), false);
      menu(); log('ready', win.getBounds(), area);
      if (diagnostics && process.argv.includes('--verify-tray')) setTimeout(() => tray.popUpContextMenu(), 100);
      if (process.argv.includes('--verify-menu')) setTimeout(verifyNativeMenu, 200);
      if (process.argv.includes('--verify-animation')) setTimeout(verifyAnimation, 500);
    });
    win.loadFile(path.join(ROOT, 'renderer/index.html'));
    menu(); lastTime = performance.now(); timer = setInterval(tick, 16);
    screen.on('display-metrics-changed', () => { if (!drag) fall = { velocity: 0, started: pet.time }; });
    screen.on('display-removed', () => { if (!drag) fall = { velocity: 0, started: pet.time }; });
  }).catch(error => { console.error('[startup]', error); app.exit(1); });
  app.on('before-quit', () => clearInterval(timer));
  app.on('window-all-closed', () => app.quit());
}
