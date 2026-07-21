/* =====================================================================================
 *  אקדמיית כוכבים — מנוע האי התלת-מימדי המשותף (island-engine.js)
 *  ---------------------------------------------------------------------------------
 *  סוכן A. מציית ל-SPEC.md פרק 5 (אפס עומס למורה + מסך מקרן).
 *  תלוי ב-window.AK (המתאם) וב-window.IslandContent (סוכן B) — שניהם אופציונליים
 *  בזמן טעינה; המנוע חייב לרוץ ולא לקרוס גם אם IslandContent עדיין לא נטען.
 *  Three.js r128 גלובלי בלבד (THREE). ES5-friendly, אין import/export, אין תלות חדשה.
 *  חשיפה יחידה החוצה: window.Island = {open,close,tick,unlockRegion,place,remove,
 *  focusRegion,setAmbient}.
 * ===================================================================================== */
(function () {
'use strict';

/* אם Three.js לא נטען — נחשוף API "דומם" שלא מקריס את שאר האפליקציה */
if (typeof THREE === 'undefined') {
  console.error('[Island] THREE.js לא נמצא (window.THREE) — מנוע האי מבוטל, מוצג API ריק.');
  window.Island = {
    open: function () {}, close: function () {}, tick: function () {},
    unlockRegion: function () {}, place: function () { return false; },
    remove: function () { return false; }, focusRegion: function () {},
    setAmbient: function () {}
  };
  return;
}

/* ===================================================================================
 * 1. קבועים גלובליים — גיאומטריית האי, כלכלה (מפרק 3 של ה-SPEC — לא לשנות!)
 * =================================================================================== */
var TILE = 1;                 /* גודל משבצת בעולם */
var GRID = 14, HALF = (GRID - 1) / 2;   /* כל אזור = רשת 14x14 */
var PLOT = 3;                 /* חלקה אישית = 3x3 */
var RING_R0 = 30, RING_STEP = 7.5;      /* רדיוס בסיס + הגדלה כל אזור -> טבעת/ספירלה */
var ANGLE_STEP = (Math.PI * 2) / 8;

/* טבלת האזורים — סדר, שם, סף פתיחה מצטבר (coins+spent), צבעי ביומה, אימוג'י.
 * זה חוזה הכלכלה מה-SPEC. סוכן B יכול להוסיף עיטורים דרך IslandContent.REGIONS
 * (theme/items) אבל לא לשנות threshold/order — אלו קבועים כאן. */
var REGION_DEFS = [
  { id: 'beach',    name: 'חוף הכוכבים', threshold: 0,    icon: '🏖️',
    theme: { sky: 0x8fd8ff, fog: 0xbfe8ff, ground: 0xe6cf94, accent: 0xf5e7ae } },
  { id: 'forest',   name: 'יער הלחישות', threshold: 120,  icon: '🌲',
    theme: { sky: 0xbfe8c8, fog: 0xcfead2, ground: 0x3f8b3f, accent: 0x2f6a30 } },
  { id: 'farm',     name: 'חוות האלופים', threshold: 300,  icon: '🐑',
    theme: { sky: 0xffe9b0, fog: 0xffe9c0, ground: 0x6fae4a, accent: 0xd8b25a } },
  { id: 'village',  name: 'כפר הידע',    threshold: 520,  icon: '🏘️',
    theme: { sky: 0xd9c9ff, fog: 0xe3d6ff, ground: 0x7fae5a, accent: 0xc79a5b } },
  { id: 'mountain', name: 'הר הקרח',     threshold: 780,  icon: '🏔️',
    theme: { sky: 0xdfeeff, fog: 0xeaf4ff, ground: 0xe8eef2, accent: 0x9fc2d8 } },
  { id: 'desert',   name: 'מדבר הזהב',   threshold: 1050, icon: '🏜️',
    theme: { sky: 0xffe0a0, fog: 0xffe9bd, ground: 0xe0c07a, accent: 0xc79447 } },
  { id: 'volcano',  name: 'הר האש',      threshold: 1350, icon: '🌋',
    theme: { sky: 0xffb37a, fog: 0xff9a6a, ground: 0x4a4038, accent: 0xd8451f } },
  { id: 'sky',      name: 'איי השמיים',  threshold: 1700, icon: '☁️',
    theme: { sky: 0xfff6e0, fog: 0xfff2f8, ground: 0xc9b8ff, accent: 0xffffff } }
];
function regionIndex(id) { for (var i = 0; i < REGION_DEFS.length; i++) if (REGION_DEFS[i].id === id) return i; return -1; }
function regionDef(id) { var i = regionIndex(id); return i < 0 ? null : REGION_DEFS[i]; }

/* קטלוג פריטים גיבוי — משמש רק אם IslandContent חסר לגמרי (מצב הדגמה/הגנה) */
var FALLBACK_ITEMS = [
  { id: 'flower', em: '🌸', n: 'פרח', cost: 8 },
  { id: 'bush', em: '🌿', n: 'שיח', cost: 12 },
  { id: 'tree', em: '🌳', n: 'עץ', cost: 18 },
  { id: 'flag', em: '🚩', n: 'דגל', cost: 25 },
  { id: 'house', em: '🏠', n: 'בית', cost: 60 },
  { id: 'tower', em: '🗼', n: 'מגדל', cost: 140 }
];

/* ===================================================================================
 * 2. עזרי בטיחות — AK / IslandContent אופציונליים, בלי לקרוס אף פעם
 * =================================================================================== */
var _warned = {};
function warnOnce(key, msg) { if (_warned[key]) return; _warned[key] = true; console.warn('[Island] ' + msg); }
function AKref() { return window.AK || null; }
function akSave() { var ak = AKref(); if (ak && typeof ak.save === 'function') { try { ak.save(); } catch (e) {} } }
function akToast(msg) { var ak = AKref(); if (ak && typeof ak.toast === 'function') { try { ak.toast(msg); } catch (e) {} } }
function akSound(t) { var ak = AKref(); if (ak && typeof ak.playSound === 'function') { try { ak.playSound(t); } catch (e) {} } }
function akConfetti(x, y, n) { var ak = AKref(); if (ak && typeof ak.burstConfetti === 'function') { try { ak.burstConfetti(x, y, n); } catch (e) {} } }
function akEsc(s) { var ak = AKref(); if (ak && typeof ak.escapeHtml === 'function') { try { return ak.escapeHtml(s); } catch (e) {} } return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function activeClass() { var ak = AKref(); if (ak && typeof ak.getActiveClass === 'function') { try { return ak.getActiveClass(); } catch (e) {} } return null; }
function contentRef() { return window.IslandContent || null; }
function contentRegion(id) {
  var c = contentRef();
  if (c && c.REGIONS) { for (var i = 0; i < c.REGIONS.length; i++) if (c.REGIONS[i] && c.REGIONS[i].id === id) return c.REGIONS[i]; }
  return null;
}
function regionCatalog(id) {
  var cr = contentRegion(id);
  if (cr && cr.items && cr.items.length) return cr.items;
  warnOnce('cat_' + id, 'IslandContent.REGIONS["' + id + '"].items חסר — משתמש בקטלוג ברירת מחדל.');
  return FALLBACK_ITEMS;
}
function catalogItem(regionId, itemId) {
  var cat = regionCatalog(regionId);
  for (var i = 0; i < cat.length; i++) if (cat[i].id === itemId) return cat[i];
  return null;
}
function builderFor(itemId) {
  var c = contentRef();
  if (c && c.BUILDERS && typeof c.BUILDERS[itemId] === 'function') return c.BUILDERS[itemId];
  warnOnce('build_' + itemId, 'IslandContent.BUILDERS["' + itemId + '"] חסר — מוצג קובייה placeholder.');
  return null;
}

/* ===================================================================================
 * 3. state — הגנה מלאה על שדות ישנים/חסרים (klass.island / klass.games)
 * =================================================================================== */
function ensureIslandState(klass) {
  klass.island = klass.island || {};
  var isl = klass.island;
  if (typeof isl.coins !== 'number') isl.coins = 0;
  if (typeof isl.spent !== 'number') isl.spent = 0;
  if (!isl.regions || !isl.regions.length) isl.regions = ['beach'];
  if (!isl.items) isl.items = [];
  if (typeof isl.level !== 'number') isl.level = 1;
  if (!isl.history) isl.history = [];
  /* הערה: klass.games (משחקי הצהריים) הוא בבעלות js/class-games.js — לא נוגעים בו כאן,
     כל סוכן מגן רק על תחום ה-state שבאחריותו. */
  return isl;
}
function totalEarned(isl) { return (isl.coins || 0) + (isl.spent || 0); }
function pushHistory(isl, txt) {
  isl.history = isl.history || [];
  isl.history.unshift({ t: Date.now(), txt: txt });
  if (isl.history.length > 50) isl.history.length = 50;
}

/* ===================================================================================
 * 4. מצב פנימי של המנוע (ISL) — סצנה, מצלמה, קאשים, לולאת רינדור
 * =================================================================================== */
var ISL = {
  inited: false, running: false, ambient: false,
  container: null, canvas: null, renderer: null, scene: null, camera: null,
  clock: { t0: 0, last: 0, elapsed: 0 },
  sea: null, seaGeo: null, seaBaseY: [],
  sky: null, sun: null, moon: null, hemi: null,
  clouds: [], birds: [],
  regionGroups: {},      /* id -> THREE.Group (מוצג בסצנה) */
  regionTier: {},        /* id -> 'locked' | 'lod' | 'full' */
  regionDirty: {},       /* id -> true אם צריך רה-בילד */
  activeId: 'beach',
  cam: { yaw: 0.6, pitch: 0.55, radius: 23, cx: 0, cz: 0, tx: 0, tz: 0 },
  raycaster: new THREE.Raycaster(),
  buildPlane: null,
  highlightTile: null,
  buildSel: null,        /* {regionId, itemId} */
  delMode: false,
  plotTarget: null,      /* מזהה תלמיד/ה אם בונים כרגע בחלקה האישית שלו/ה, אחרת null (בניה משותפת) */
  anims: [],             /* פריטים בצניחה מהשמיים */
  particles: [],         /* חלקיקים */
  raf: null,
  input: null,
  hud: null,
  lastAutoUnlockCheck: 0,
  lastHudUpdate: 0,
  ambientTimer: 0, ambientPauseUntil: 0, ambientNextSwap: 0,
  contentPoll: null
};

/* ===================================================================================
 * 5. עזרי Three.js — geometry/masking/labels
 * =================================================================================== */
function mat(c, opts) { opts = opts || {}; var m = new THREE.MeshLambertMaterial({ color: c }); if (opts.transparent) { m.transparent = true; m.opacity = opts.opacity == null ? 0.6 : opts.opacity; } return m; }
function box(w, h, d, c, x, y, z) {
  var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
  m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true; return m;
}
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function hash01(str) { var h = 0; for (var i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; } return ((h % 1000) + 1000) % 1000 / 1000; }
function seedRand(seed) { var s = seed >>> 0 || 1; return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

/* שלט/תווית טקסט תלת-מימדי מבוססת canvas->sprite (בלי טעינת פונט חיצוני) */
function makeLabel(text, opts) {
  opts = opts || {};
  var scale = 2; /* רזולוציית canvas לחדות על מקרן */
  var padX = 26, padY = 16, fontSize = opts.fontSize || 40;
  var cvs = document.createElement('canvas');
  var ctx = cvs.getContext('2d');
  ctx.font = 'bold ' + fontSize + 'px Arial, Rubik, sans-serif';
  var w = Math.ceil(ctx.measureText(text).width) + padX * 2;
  var h = fontSize + padY * 2;
  cvs.width = w * scale; cvs.height = h * scale;
  ctx = cvs.getContext('2d');
  ctx.scale(scale, scale);
  ctx.font = 'bold ' + fontSize + 'px Arial, Rubik, sans-serif';
  ctx.direction = 'rtl';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  /* רקע כמו שלט עץ/אבן עגול */
  ctx.fillStyle = opts.bg || 'rgba(30,26,20,0.82)';
  roundRect(ctx, 2, 2, w - 4, h - 4, 14); ctx.fill();
  ctx.strokeStyle = opts.border || 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
  roundRect(ctx, 2, 2, w - 4, h - 4, 14); ctx.stroke();
  ctx.fillStyle = opts.color || '#ffffff';
  ctx.fillText(text, w / 2, h / 2 + 1);
  var tex = new THREE.CanvasTexture(cvs);
  tex.minFilter = THREE.LinearFilter;
  var sm = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: opts.depthTest !== false });
  var spr = new THREE.Sprite(sm);
  var worldH = (opts.worldHeight || 0.9);
  spr.scale.set(worldH * (w / h), worldH, 1);
  spr.userData.setText = function (newText) {
    /* עדכון טקסט זול — רק אם השתנה, לא כל פריים */
    if (spr.userData.lastText === newText) return;
    spr.userData.lastText = newText;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = opts.bg || 'rgba(30,26,20,0.82)';
    roundRect(ctx, 2, 2, w - 4, h - 4, 14); ctx.fill();
    ctx.strokeStyle = opts.border || 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
    roundRect(ctx, 2, 2, w - 4, h - 4, 14); ctx.stroke();
    ctx.fillStyle = opts.color || '#ffffff';
    ctx.fillText(newText, w / 2, h / 2 + 1);
    tex.needsUpdate = true;
  };
  spr.userData.lastText = text;
  return spr;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ===================================================================================
 * 6. מיקום אזורים על הטבעת/ספירלה
 * =================================================================================== */
function regionCenter(idx) {
  var angle = idx * ANGLE_STEP;
  var radius = RING_R0 + idx * RING_STEP;
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

/* ===================================================================================
 * 7. עולם משותף — ים מונפש, שמיים גרדיאנט, עננים, ציפורים, מחזור יום/לילה
 * =================================================================================== */
function buildSky() {
  /* כיפת שמיים גרדיאנט פשוטה (BackSide sphere עם צבעי קודקוד) */
  var geo = new THREE.SphereGeometry(220, 20, 14);
  var colors = [];
  var top = new THREE.Color(0x2a6fd8), bottom = new THREE.Color(0xdcefff);
  var pos = geo.attributes.position;
  for (var i = 0; i < pos.count; i++) {
    var y = pos.getY(i) / 220;
    var t = clamp((y + 1) / 2, 0, 1);
    var c = bottom.clone().lerp(top, Math.pow(t, 0.7));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  var m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  var dome = new THREE.Mesh(geo, m);
  ISL.sky = dome;
  return dome;
}
function buildSea() {
  var seg = 44;
  var size = (RING_R0 + REGION_DEFS.length * RING_STEP) * 2 + 60;
  var geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  var m = new THREE.MeshPhongMaterial({ color: 0x2a7fd4, shininess: 60, transparent: true, opacity: 0.92 });
  var mesh = new THREE.Mesh(geo, m);
  mesh.position.y = -0.35;
  mesh.receiveShadow = true;
  ISL.seaGeo = geo;
  ISL.seaBaseY = [];
  var p = geo.attributes.position;
  for (var i = 0; i < p.count; i++) ISL.seaBaseY.push(p.getY(i));
  return mesh;
}
function updateSea(t) {
  if (!ISL.seaGeo) return;
  var p = ISL.seaGeo.attributes.position;
  for (var i = 0; i < p.count; i++) {
    var x = p.getX(i), z = p.getZ(i);
    var wave = Math.sin(x * 0.12 + t * 1.1) * 0.22 + Math.sin(z * 0.09 - t * 0.8) * 0.18;
    p.setY(i, ISL.seaBaseY[i] + wave);
  }
  p.needsUpdate = true;
}
function buildClouds(scene) {
  ISL.clouds = [];
  var span = RING_R0 + REGION_DEFS.length * RING_STEP + 30;
  for (var i = 0; i < 10; i++) {
    var g = new THREE.Group();
    var mC = mat(0xffffff);
    var b1 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1, 1.8), mC); g.add(b1);
    var b2 = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 1.4), mC); b2.position.set(1.8, 0.3, 0.2); g.add(b2);
    var b3 = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 1.4), mC); b3.position.set(-1.8, 0.2, -0.2); g.add(b3);
    g.children.forEach(function (c) { c.castShadow = false; c.receiveShadow = false; });
    g.position.set((Math.random() - 0.5) * span * 2, 26 + Math.random() * 10, (Math.random() - 0.5) * span * 2);
    g.userData.speed = 0.4 + Math.random() * 0.5;
    scene.add(g); ISL.clouds.push(g);
  }
}
function updateClouds(dt) {
  var span = RING_R0 + REGION_DEFS.length * RING_STEP + 30;
  ISL.clouds.forEach(function (c) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > span) c.position.x = -span;
  });
}
function buildBirds(scene) {
  ISL.birds = [];
  for (var i = 0; i < 6; i++) {
    var g = new THREE.Group();
    var wm = mat(0x2a2a2a);
    var w1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.14), wm); w1.position.x = -0.22; g.add(w1);
    var w2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.14), wm); w2.position.x = 0.22; g.add(w2);
    g.children.forEach(function (c) { c.castShadow = false; });
    g.userData.radius = 10 + Math.random() * 14;
    g.userData.speed = 0.25 + Math.random() * 0.3;
    g.userData.a0 = Math.random() * Math.PI * 2;
    g.userData.h = 9 + Math.random() * 4;
    g.userData.wing = 0;
    scene.add(g); ISL.birds.push(g);
  }
}
function updateBirds(t) {
  var c = regionCenter(regionIndex(ISL.activeId));
  ISL.birds.forEach(function (b) {
    var a = b.userData.a0 + t * b.userData.speed;
    b.position.set(c.x + Math.cos(a) * b.userData.radius, b.userData.h + Math.sin(t * 2 + b.userData.a0) * 0.6, c.z + Math.sin(a) * b.userData.radius);
    b.rotation.y = -a + Math.PI / 2;
    var flap = Math.sin(t * 14 + b.userData.a0) * 0.6;
    if (b.children[0]) b.children[0].rotation.z = flap;
    if (b.children[1]) b.children[1].rotation.z = -flap;
  });
}
/* מחזור יום/לילה איטי — מקזז אור/שמיים/ים לאורך מחזור של כ-6 דקות ambient בלבד;
 * במצב רגיל (לא ambient) נשמר על "יום" קבוע ובהיר כדי לא להטריד שיעור פעיל. */
function updateDayNight(t, scene) {
  var cycle = 360; /* שניות למחזור מלא */
  /* phase=0 הוא צהריים מלאים. במצב רגיל חייבים אור מלא — האי מוצג על מקרן
     כיתתי דהוי (SPEC §5.2), וכל עמעום הופך אותו ללא קריא מהשורה האחורית. */
  var phase = ISL.ambient ? (t % cycle) / cycle : 0;
  var day = 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);
  /* גם במחזור היממה של מצב אמביינט לא יורדים מתחת ל-0.55 — "לילה" מלא
     על מקרן נראה כמו מסך שחור, לא כמו אווירה. */
  day = clamp(day, 0.55, 1);
  if (ISL.sun) ISL.sun.intensity = 0.35 + day * 0.75;
  if (ISL.hemi) ISL.hemi.intensity = 0.25 + day * 0.45;
  var fogCol = regionDef(ISL.activeId) ? regionDef(ISL.activeId).theme.fog : 0xbfe8ff;
  var nightTint = 0x0c1533;
  var fc = new THREE.Color(fogCol).lerp(new THREE.Color(nightTint), 1 - day);
  if (scene.fog) scene.fog.color.copy(fc);
  if (ISL.renderer) ISL.renderer.setClearColor(fc, 1);
}

/* ===================================================================================
 * 8. בניית אזור — שלוש רמות פירוט: locked / lod / full
 * =================================================================================== */
function buildRegionLocked(idx) {
  var def = REGION_DEFS[idx], c = regionCenter(idx);
  var g = new THREE.Group();
  g.position.set(c.x, 0, c.z);
  var silo = new THREE.Mesh(new THREE.BoxGeometry(GRID * 0.72, 1.4, GRID * 0.72),
    new THREE.MeshBasicMaterial({ color: 0x1c2433, transparent: true, opacity: 0.55, fog: false }));
  silo.position.y = -0.2;
  g.add(silo);
  var sign = makeLabel(def.icon + ' ' + def.name + '  🔒', { worldHeight: 1.5, fontSize: 46 });
  sign.position.set(0, 4.2, 0);
  g.add(sign);
  var sub = makeLabel('נפתח ב־… אבנים', { worldHeight: 1.0, fontSize: 34, bg: 'rgba(20,20,20,0.75)' });
  sub.position.set(0, 2.6, 0);
  g.add(sub);
  g.userData.sub = sub;
  g.userData.updateLock = function (isl) {
    var need = Math.max(0, def.threshold - totalEarned(isl));
    sub.userData.setText(need > 0 ? ('נפתח בעוד ' + need + ' 🪙') : 'נפתח עכשיו!');
  };
  return g;
}
function biomeGroundColor(def) { return def.theme.ground; }
function buildRegionBase(idx, detailed) {
  var def = REGION_DEFS[idx];
  var g = new THREE.Group();
  var c = regionCenter(idx);
  g.position.set(c.x, 0, c.z);
  var dirt = box(GRID + 1.4, 1.1, GRID + 1.4, 0x8a5a2b, 0, -0.55, 0); dirt.castShadow = false; g.add(dirt);
  var top = box(GRID + 1.6, 0.24, GRID + 1.6, biomeGroundColor(def), 0, -0.02, 0); top.castShadow = false; g.add(top);
  var rim = box(GRID + 2.6, 0.5, GRID + 2.6, def.theme.accent, 0, -0.62, 0); rim.castShadow = false; rim.receiveShadow = false; g.add(rim);
  if (detailed) {
    /* עיטור ביומה — דשא/סלעים/קרח/חול מפוזרים ב-InstancedMesh (זול לביצועים) */
    var rnd = seedRand(idx * 977 + 13);
    var deco = biomeDecoMesh(def, rnd);
    if (deco) g.add(deco);
  }
  g.userData.regionId = def.id;
  return g;
}
function biomeDecoMesh(def, rnd) {
  var geo, color, count = 46, yOff = 0.14, scaleFn;
  if (def.id === 'forest' || def.id === 'village' || def.id === 'farm') {
    geo = new THREE.BoxGeometry(0.14, 0.32, 0.14); color = 0x2f6a30; scaleFn = function () { return 0.7 + rnd() * 0.7; };
  } else if (def.id === 'mountain' || def.id === 'sky') {
    geo = new THREE.OctahedronGeometry(0.16, 0); color = 0xffffff; scaleFn = function () { return 0.8 + rnd() * 0.6; };
  } else if (def.id === 'desert' || def.id === 'beach') {
    geo = new THREE.DodecahedronGeometry(0.14, 0); color = 0xc79447; scaleFn = function () { return 0.7 + rnd() * 0.5; }; count = 26;
  } else if (def.id === 'volcano') {
    geo = new THREE.DodecahedronGeometry(0.16, 0); color = 0x2b241f; scaleFn = function () { return 0.8 + rnd() * 0.7; }; count = 30;
  } else return null;
  var m = new THREE.MeshLambertMaterial({ color: color });
  var im = new THREE.InstancedMesh(geo, m, count);
  im.castShadow = true; im.receiveShadow = true;
  var dummy = new THREE.Object3D();
  for (var i = 0; i < count; i++) {
    var x = (rnd() - 0.5) * (GRID - 1.5), z = (rnd() - 0.5) * (GRID - 1.5);
    /* מרחיק מהמרכז (חלקת ה"שלנו") ומהחלקות האישיות בהיקף */
    dummy.position.set(x, yOff, z);
    var s = scaleFn();
    dummy.scale.set(s, s, s);
    dummy.rotation.y = rnd() * Math.PI * 2;
    dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
  }
  im.instanceMatrix.needsUpdate = true;
  return im;
}
function buildRegionItems(idx, isl) {
  var def = REGION_DEFS[idx];
  var c = regionCenter(idx);
  var grp = new THREE.Group();
  var items = isl.items.filter(function (it) { return it.r === def.id; });
  items.forEach(function (it) {
    var b = builderFor(it.id);
    var node;
    if (b) {
      try { node = b(); } catch (e) { console.error('[Island] שגיאת builder עבור "' + it.id + '":', e); node = null; }
    }
    if (!node) node = placeholderMesh(it.id, def.id);
    /* מיקום מוחלט בעולם (מרכז האזור + היסט מקומי) — עקבי עם tileFromWorld */
    node.position.set(c.x + (it.x - HALF) * TILE, 0.1, c.z + (it.z - HALF) * TILE);
    node.rotation.y = it.rot || 0;
    node.userData.tile = it.x + '_' + it.z;
    node.userData.itemId = it.id;
    node.userData.regionKey = def.id;
    grp.add(node);
  });
  return grp;
}
function placeholderMesh(itemId, regionId) {
  var col = 0x999999 + Math.floor(hash01(itemId) * 0x555555);
  var g = new THREE.Group();
  g.add(box(0.5, 0.5, 0.5, col, 0, 0.25, 0));
  var cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.4, 6), mat(col));
  cone.position.y = 0.7; cone.castShadow = true; g.add(cone);
  var cat = catalogItem(regionId, itemId);
  var lbl = makeLabel(cat ? cat.em || '❔' : '❔', { worldHeight: 0.5, fontSize: 44, bg: 'rgba(0,0,0,0.35)' });
  lbl.position.y = 1.2; g.add(lbl);
  return g;
}

/* ---------- חלקות אישיות: "שלי בתוך שלנו" ---------- */
/* חלקה אישית לכל תלמיד היא פלטפורמת לוויין 3x3 המחוברת בגשר לאזור הפעיל, מסודרת
 * בטבעת סביב האי — כך שהמנגנון מתפקד עבור כל גודל כיתה בלי להתנגש בשטח הבנייה
 * המשותף של ה-14x14. הפריטים עליה נשמרים באותו klass.island.items עם r='plot_<sid>'. */
function studentPlotItems(isl, sid) { return isl.items.filter(function (it) { return it.r === 'plot_' + sid; }); }
function buildPersonalPlots(idx, isl) {
  var grp = new THREE.Group();
  var klass = activeClass();
  if (!klass || !klass.students || !klass.students.length) return grp;
  var students = klass.students;
  var n = students.length;
  var plotR = GRID / 2 + 3.2;
  var c = regionCenter(idx);
  students.forEach(function (st, i) {
    var angle = (i / n) * Math.PI * 2;
    var px = c.x + Math.cos(angle) * plotR, pz = c.z + Math.sin(angle) * plotR;
    var pg = new THREE.Group();
    pg.position.set(px, 0, pz);
    pg.rotation.y = -angle + Math.PI / 2;
    var base = box(PLOT + 0.5, 0.5, PLOT + 0.5, 0xd8c48a, 0, -0.28, 0); base.castShadow = false; pg.add(base);
    var top = box(PLOT + 0.6, 0.18, PLOT + 0.6, 0x6fae4a, 0, -0.05, 0); top.castShadow = false; pg.add(top);
    /* גשר קטן לחיבור לאי הראשי */
    var bridgeLen = plotR - GRID / 2 - 0.2;
    var bridge = box(0.8, 0.12, bridgeLen, 0x8a5a2b, 0, -0.1, -(PLOT / 2 + bridgeLen / 2 + 0.3));
    pg.add(bridge);
    var sign = makeLabel('🌟 ' + (st.name || 'תלמיד/ה'), { worldHeight: 0.7, fontSize: 34, bg: 'rgba(40,60,40,0.8)' });
    sign.position.set(0, 1.5, 0);
    pg.add(sign);
    /* פריטים אישיים שהתלמיד/ה הציבו בחלקה (0..2 מקומי) */
    var pItems = studentPlotItems(isl, st.id);
    pItems.forEach(function (it) {
      var b = builderFor(it.id); var node;
      if (b) { try { node = b(); } catch (e) { node = null; } }
      if (!node) node = placeholderMesh(it.id, 'plot_' + st.id);
      node.position.set((it.x - (PLOT - 1) / 2) * TILE, 0.05, (it.z - (PLOT - 1) / 2) * TILE);
      node.rotation.y = it.rot || 0;
      node.userData.tile = it.x + '_' + it.z;
      node.userData.itemId = it.id;
      node.userData.regionKey = 'plot_' + st.id;
      pg.add(node);
    });
    pg.userData.plotId = st.id;
    pg.userData.plotOrigin = { x: px, z: pz, rotY: pg.rotation.y };
    grp.add(pg);
  });
  return grp;
}

/* ===================================================================================
 * 9. ניהול תצוגת אזורים — locked / lod / full + cache + dirty flags
 * =================================================================================== */
function markDirty(regionId) { ISL.regionDirty[regionId] = true; }
function disposeGroup(g) {
  if (!g) return;
  g.traverse(function (o) {
    if (o.geometry && o.geometry.dispose && !o.userData.sharedGeo) o.geometry.dispose();
    if (o.material) {
      if (o.material.map) o.material.map.dispose();
      o.material.dispose();
    }
  });
}
function refreshRegions() {
  var klass = activeClass();
  var isl = klass ? ensureIslandState(klass) : { coins: 0, spent: 0, regions: ['beach'], items: [] };
  var activeIdx = regionIndex(ISL.activeId);
  for (var i = 0; i < REGION_DEFS.length; i++) {
    var def = REGION_DEFS[i];
    var unlocked = isl.regions.indexOf(def.id) >= 0;
    var isNeighbor = Math.abs(i - activeIdx) <= 1 || (activeIdx === 0 && i === REGION_DEFS.length - 1) || (activeIdx === REGION_DEFS.length - 1 && i === 0);
    var wantTier = !unlocked ? 'locked' : (i === activeIdx || isNeighbor ? 'full' : 'lod');
    var curTier = ISL.regionTier[def.id];
    if (curTier === wantTier && !ISL.regionDirty[def.id]) {
      if (curTier === 'locked' && ISL.regionGroups[def.id] && ISL.regionGroups[def.id].userData.updateLock) {
        ISL.regionGroups[def.id].userData.updateLock(isl);
      }
      continue;
    }
    if (ISL.regionGroups[def.id]) { ISL.scene.remove(ISL.regionGroups[def.id]); disposeGroup(ISL.regionGroups[def.id]); }
    var group;
    if (wantTier === 'locked') {
      group = buildRegionLocked(i);
      group.userData.updateLock(isl);
    } else if (wantTier === 'lod') {
      group = buildRegionBase(i, false);
    } else {
      /* base/items/plots כולם ממקמים את עצמם במיקום מוחלט בעולם (regionCenter(i) פנימי
       * לכל אחד), כך שהעטיפה כאן נשארת ב-(0,0,0) בלי צורך בהיסט נוסף */
      group = new THREE.Group();
      group.add(buildRegionBase(i, true));
      group.add(buildRegionItems(i, isl));
      if (def.id === ISL.activeId) group.add(buildPersonalPlots(i, isl));
    }
    group.userData.regionId = def.id;
    ISL.scene.add(group);
    ISL.regionGroups[def.id] = group;
    ISL.regionTier[def.id] = wantTier;
    ISL.regionDirty[def.id] = false;
  }
  buildBridges();
}
/* גשרים בין אזורים פתוחים סמוכים — מחזק את תחושת "ארכיפלג" אחד מחובר */
function buildBridges() {
  if (ISL.bridgesGroup) { ISL.scene.remove(ISL.bridgesGroup); disposeGroup(ISL.bridgesGroup); }
  var klass = activeClass();
  var isl = klass ? ensureIslandState(klass) : { regions: ['beach'] };
  var grp = new THREE.Group();
  for (var i = 0; i < REGION_DEFS.length - 1; i++) {
    var a = REGION_DEFS[i], b = REGION_DEFS[i + 1];
    if (isl.regions.indexOf(a.id) < 0 || isl.regions.indexOf(b.id) < 0) continue;
    var ca = regionCenter(i), cb = regionCenter(i + 1);
    var dx = cb.x - ca.x, dz = cb.z - ca.z;
    var len = Math.sqrt(dx * dx + dz * dz) - GRID * 0.7;
    if (len <= 0) continue;
    var mid = { x: (ca.x + cb.x) / 2, z: (ca.z + cb.z) / 2 };
    var plank = box(1.1, 0.14, len, 0x9c7a45, mid.x, -0.15, 0);
    plank.rotation.y = Math.atan2(dx, dz);
    plank.position.set(mid.x, -0.15, mid.z);
    grp.add(plank);
  }
  ISL.bridgesGroup = grp;
  ISL.scene.add(grp);
}

/* ===================================================================================
 * 10. פוקוס מצלמה + אורביט + סיור אוטומטי (ambient)
 * =================================================================================== */
function focusRegionInternal(id, snap) {
  var idx = regionIndex(id);
  if (idx < 0) return;
  ISL.activeId = id;
  var c = regionCenter(idx);
  ISL.cam.tx = c.x; ISL.cam.tz = c.z;
  if (snap) { ISL.cam.cx = c.x; ISL.cam.cz = c.z; }
  ISL.buildSel = null; ISL.delMode = false;
  refreshRegions();
  updateHudRegionName();
}
function updateCamera(dt) {
  ISL.cam.cx = lerp(ISL.cam.cx, ISL.cam.tx, clamp(dt * 1.6, 0, 1));
  ISL.cam.cz = lerp(ISL.cam.cz, ISL.cam.tz, clamp(dt * 1.6, 0, 1));
  if (ISL.ambient) {
    ISL.cam.yaw += dt * 0.06;
  }
  var yaw = ISL.cam.yaw, pitch = ISL.cam.pitch, r = ISL.cam.radius;
  var cx = ISL.cam.cx, cz = ISL.cam.cz;
  ISL.camera.position.set(
    cx + Math.sin(yaw) * Math.cos(pitch) * r,
    Math.sin(pitch) * r + 2,
    cz + Math.cos(yaw) * Math.cos(pitch) * r
  );
  ISL.camera.lookAt(cx, 1, cz);
}
function updateAmbientTour(dt, now) {
  if (!ISL.ambient) return;
  if (now < ISL.ambientPauseUntil) return;
  ISL.ambientTimer += dt;
  if (ISL.ambientTimer >= ISL.ambientNextSwap) {
    ISL.ambientTimer = 0; ISL.ambientNextSwap = 14 + Math.random() * 8;
    var klass = activeClass();
    var isl = klass ? ensureIslandState(klass) : { regions: ['beach'] };
    var unlocked = REGION_DEFS.filter(function (d) { return isl.regions.indexOf(d.id) >= 0; });
    var cur = regionIndex(ISL.activeId);
    var pool = unlocked.filter(function (d) { return d.id !== ISL.activeId; });
    var next = pool.length ? pool[Math.floor(Math.random() * pool.length)] : REGION_DEFS[(cur + 1) % REGION_DEFS.length];
    focusRegionInternal(next.id, false);
  }
}

/* ===================================================================================
 * 11. קלט — גרירה לאורביט, גלגלת לזום, הקשה לבחירת משבצת/בנייה/הסרה
 * =================================================================================== */
function setupInput(canvas) {
  var down = false, sx = 0, sy = 0, moved = false, t0 = 0;
  function pd(x, y) { down = true; sx = x; sy = y; moved = false; t0 = Date.now(); pauseAmbient(); }
  function pm(x, y) {
    if (!down) return;
    var dx = x - sx, dy = y - sy;
    if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
    ISL.cam.yaw -= dx * 0.007;
    ISL.cam.pitch = clamp(ISL.cam.pitch + dy * 0.004, 0.18, 1.15);
    sx = x; sy = y;
    updateHoverTile(x, y);
  }
  function pu(x, y) { if (!down) return; down = false; if (!moved && Date.now() - t0 < 400) onTap(x, y); }
  canvas.addEventListener('mousedown', function (e) { pd(e.clientX, e.clientY); });
  window.addEventListener('mousemove', function (e) { if (ISL.running) pm(e.clientX, e.clientY); });
  window.addEventListener('mouseup', function (e) { if (ISL.running) pu(e.clientX, e.clientY); });
  canvas.addEventListener('touchstart', function (e) { var t = e.touches[0]; pd(t.clientX, t.clientY); }, { passive: true });
  canvas.addEventListener('touchmove', function (e) { var t = e.touches[0]; pm(t.clientX, t.clientY); }, { passive: true });
  canvas.addEventListener('touchend', function (e) { var t = e.changedTouches[0]; pu(t.clientX, t.clientY); }, { passive: true });
  canvas.addEventListener('wheel', function (e) { ISL.cam.radius = clamp(ISL.cam.radius + e.deltaY * 0.012, 12, 70); pauseAmbient(); }, { passive: true });
}
function pauseAmbient() { if (ISL.ambient) ISL.ambientPauseUntil = performance.now() / 1000 + 20; }
function pickPoint(x, y) {
  var rect = ISL.canvas.getBoundingClientRect();
  var mx = ((x - rect.left) / rect.width) * 2 - 1;
  var my = -((y - rect.top) / rect.height) * 2 + 1;
  ISL.raycaster.setFromCamera(new THREE.Vector2(mx, my), ISL.camera);
  return ISL.raycaster;
}
function activeRegionOriginAndGrid() {
  /* אם המשתמש בוחר משבצת בחלקה אישית, buildSel.regionId יתחיל ב-'plot_' */
  if (ISL.buildSel && ISL.buildSel.regionId && ISL.buildSel.regionId.indexOf('plot_') === 0) {
    var sid = ISL.buildSel.regionId.slice(5);
    var group = ISL.regionGroups[ISL.activeId];
    var plotGrp = null;
    if (group) group.traverse(function (o) { if (o.userData && o.userData.plotId === sid) plotGrp = o; });
    if (plotGrp) return { origin: plotGrp.userData.plotOrigin, size: PLOT, rotY: plotGrp.userData.plotOrigin.rotY };
  }
  var idx = regionIndex(ISL.activeId);
  var c = regionCenter(idx);
  return { origin: { x: c.x, z: c.z, rotY: 0 }, size: GRID, rotY: 0 };
}
function tileFromWorld(px, pz, ctx) {
  var local = new THREE.Vector3(px - ctx.origin.x, 0, pz - ctx.origin.z);
  if (ctx.rotY) local.applyAxisAngle(new THREE.Vector3(0, 1, 0), -ctx.rotY);
  var half = (ctx.size - 1) / 2;
  var tx = Math.round(local.x + half), tz = Math.round(local.z + half);
  return { tx: tx, tz: tz, ok: tx >= 0 && tz >= 0 && tx < ctx.size && tz < ctx.size };
}
function updateHoverTile(x, y) {
  if (!ISL.buildSel && !ISL.delMode) { if (ISL.highlightTile) ISL.highlightTile.visible = false; return; }
  var ray = pickPoint(x, y);
  var hit = ray.intersectObject(ISL.groundPlaneMesh);
  if (!hit.length) { if (ISL.highlightTile) ISL.highlightTile.visible = false; return; }
  var ctx = activeRegionOriginAndGrid();
  var t = tileFromWorld(hit[0].point.x, hit[0].point.z, ctx);
  if (!t.ok) { if (ISL.highlightTile) ISL.highlightTile.visible = false; return; }
  var half = (ctx.size - 1) / 2;
  var wx = ctx.origin.x + (t.tx - half), wz = ctx.origin.z + (t.tz - half);
  ISL.highlightTile.position.set(wx, 0.16, wz);
  ISL.highlightTile.visible = true;
}
function onTap(x, y) {
  var ray = pickPoint(x, y);
  if (ISL.delMode) {
    var group = ISL.regionGroups[ISL.activeId];
    if (!group) return;
    var hits = ray.intersectObjects(group.children, true);
    for (var i = 0; i < hits.length; i++) {
      var o = hits[i].object;
      while (o && !(o.userData && o.userData.tile) && o.parent) o = o.parent;
      if (o && o.userData && o.userData.tile) {
        var parts = o.userData.tile.split('_');
        var regionKey = o.userData.regionKey || ISL.activeId;
        removeAt(regionKey, +parts[0], +parts[1]);
        return;
      }
    }
    return;
  }
  if (!ISL.buildSel) return;
  var hit = ray.intersectObject(ISL.groundPlaneMesh);
  if (!hit.length) return;
  var ctx = activeRegionOriginAndGrid();
  var t = tileFromWorld(hit[0].point.x, hit[0].point.z, ctx);
  if (!t.ok) return;
  placeAt(ISL.buildSel.regionId, ISL.buildSel.itemId, t.tx, t.tz);
}

/* ===================================================================================
 * 12. בנייה / הסרה — עם אנימציית צניחה, חלקיקים, סאונד, שמירה
 * =================================================================================== */
function tileOccupied(isl, regionKey, x, z) {
  return isl.items.some(function (it) { return it.r === regionKey && it.x === x && it.z === z; });
}
function placeAt(regionKey, itemId, x, z, studentId) {
  var klass = activeClass();
  if (!klass) { warnOnce('noclass', 'אין כיתה פעילה (AK.getActiveClass) — לא ניתן לבנות.'); return false; }
  var isl = ensureIslandState(klass);
  var regionOk = regionKey.indexOf('plot_') === 0 ? true : (isl.regions.indexOf(regionKey) >= 0);
  if (!regionOk) { akToast('האזור עוד נעול 🔒'); akSound('error'); return false; }
  if (tileOccupied(isl, regionKey, x, z)) { akToast('המשבצת הזו כבר תפוסה'); akSound('error'); return false; }
  var cat = catalogItem(regionKey.indexOf('plot_') === 0 ? ISL.activeId : regionKey, itemId);
  var cost = cat ? cat.cost : 10;
  if (isl.coins < cost) { akToast('חסרות ' + (cost - isl.coins) + ' 🪙 אבני בנייה'); akSound('error'); return false; }
  isl.coins -= cost;
  isl.spent = (isl.spent || 0) + cost;
  var entry = { id: itemId, r: regionKey, x: x, z: z, rot: Math.floor(Math.random() * 4) * (Math.PI / 2), by: studentId || null, t: Date.now() };
  isl.items.push(entry);
  pushHistory(isl, '🧱 נוסף ' + (cat ? cat.n : itemId) + ' ל' + (regionKey.indexOf('plot_') === 0 ? 'חלקה אישית' : regionDefName(regionKey)));
  recalcLevel(isl);
  markDirty(regionKey.indexOf('plot_') === 0 ? ISL.activeId : regionKey);
  refreshRegions();
  spawnDropAnim(regionKey, entry);
  akSound('buy');
  akSave();
  checkAutoUnlocks(klass, isl);
  return true;
}
function removeAt(regionKey, x, z) {
  var klass = activeClass();
  if (!klass) return false;
  var isl = ensureIslandState(klass);
  var idx = -1;
  for (var i = 0; i < isl.items.length; i++) { if (isl.items[i].r === regionKey && isl.items[i].x === x && isl.items[i].z === z) { idx = i; break; } }
  if (idx < 0) return false;
  var it = isl.items[idx];
  var cat = catalogItem(regionKey.indexOf('plot_') === 0 ? ISL.activeId : regionKey, it.id);
  var refund = Math.floor((cat ? cat.cost : 10) / 2);
  var poofPos = findNodeWorldPos(regionKey, x, z, it.id); /* חייב להימצא לפני שהצומת נהרס ב-rebuild */
  isl.coins += refund;
  isl.items.splice(idx, 1);
  pushHistory(isl, '🗑️ הוסר ' + (cat ? cat.n : it.id));
  markDirty(regionKey.indexOf('plot_') === 0 ? ISL.activeId : regionKey);
  refreshRegions();
  spawnPoofAt(poofPos);
  akSound('coin');
  akToast('הוסר — חזרו ' + refund + ' 🪙');
  akSave();
  return true;
}
function regionDefName(id) { var d = regionDef(id); return d ? d.name : id; }
function recalcLevel(isl) {
  var total = totalEarned(isl);
  isl.level = clamp(1 + Math.floor(total / 45), 1, 40);
}

/* --- אנימציית צניחה מהשמיים + חלקיקים --- */
function spawnDropAnim(regionKey, entry) {
  var group = ISL.regionGroups[ISL.activeId];
  if (!group) return;
  var targetNode = null;
  group.traverse(function (o) { if (o.userData && o.userData.regionKey === entry.r && o.userData.tile === entry.x + '_' + entry.z && o.userData.itemId === entry.id) targetNode = o; });
  if (!targetNode) return;
  var endY = targetNode.position.y;
  targetNode.position.y = endY + 16;
  ISL.anims.push({ node: targetNode, t: 0, dur: 0.65, endY: endY });
  var wp = new THREE.Vector3(); targetNode.getWorldPosition(wp);
  spawnBurst(wp, 0xffe08a, 18);
}
/* מאתר את המיקום בעולם של פריט קיים (לפני שהוא נהרס ברה-בילד) — לצורך "פוץ'" מדויק */
function findNodeWorldPos(regionKey, x, z, itemId) {
  var group = ISL.regionGroups[ISL.activeId];
  var found = null;
  if (group) {
    group.traverse(function (o) {
      if (found) return;
      if (o.userData && o.userData.regionKey === regionKey && o.userData.tile === x + '_' + z && o.userData.itemId === itemId) found = o;
    });
  }
  if (found) { var wp = new THREE.Vector3(); found.getWorldPosition(wp); return wp; }
  /* גיבוי: מרכז האזור/החלקה בקירוב */
  if (regionKey.indexOf('plot_') === 0) return new THREE.Vector3(ISL.cam.cx, 0.3, ISL.cam.cz);
  var c = regionCenter(regionIndex(regionKey));
  var half = (GRID - 1) / 2;
  return new THREE.Vector3(c.x + (x - half), 0.3, c.z + (z - half));
}
function spawnPoofAt(worldPos) {
  spawnBurst(worldPos, 0xffffff, 12);
}
function spawnBurst(pos, color, count) {
  /* גיאומטריה משותפת לכל החלקיקים בפיצוץ הזה (זול), אבל חומר בנפרד לכל חלקיק כי
   * ה-opacity משתנה עצמאית לכל אחד בזמן הדעיכה. הגיאומטריה משוחררת פעם אחת כשכל
   * חלקיקי הפיצוץ סיימו (counter), כדי לא לשחרר geometry שעדיין בשימוש. */
  var geo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
  var remaining = count;
  function releaseShared() { remaining--; if (remaining <= 0) geo.dispose(); }
  for (var i = 0; i < count; i++) {
    var m = new THREE.MeshBasicMaterial({ color: color, transparent: true });
    var mesh = new THREE.Mesh(geo, m);
    mesh.position.copy(pos);
    ISL.scene.add(mesh);
    var ang = Math.random() * Math.PI * 2, spd = 1.2 + Math.random() * 1.6;
    ISL.particles.push({
      node: mesh, vx: Math.cos(ang) * spd, vz: Math.sin(ang) * spd, vy: 2.2 + Math.random() * 1.6,
      t: 0, dur: 0.7 + Math.random() * 0.4, onDone: releaseShared
    });
  }
}
function updateAnims(dt) {
  for (var i = ISL.anims.length - 1; i >= 0; i--) {
    var a = ISL.anims[i];
    a.t += dt;
    var k = clamp(a.t / a.dur, 0, 1);
    var ease = 1 - Math.pow(1 - k, 3);
    a.node.position.y = (a.endY + 16) * (1 - ease) + a.endY * ease;
    if (k >= 1) {
      a.node.position.y = a.endY;
      a.node.scale.set(1.15, 0.85, 1.15);
      ISL.anims.splice(i, 1);
    }
  }
  for (var j = ISL.particles.length - 1; j >= 0; j--) {
    var p = ISL.particles[j];
    p.t += dt;
    p.node.position.x += p.vx * dt;
    p.node.position.z += p.vz * dt;
    p.node.position.y += p.vy * dt;
    p.vy -= 6 * dt;
    p.node.material.opacity = clamp(1 - p.t / p.dur, 0, 1);
    if (p.t >= p.dur) {
      ISL.scene.remove(p.node);
      p.node.material.dispose();
      if (p.onDone) p.onDone();
      ISL.particles.splice(j, 1);
    }
  }
}

/* ===================================================================================
 * 13. פתיחת אזורים — אוטומטית (אפס עומס למורה) + ידנית (unlockRegion)
 * =================================================================================== */
function checkAutoUnlocks(klass, isl) {
  isl = isl || ensureIslandState(klass);
  var total = totalEarned(isl);
  for (var i = 0; i < REGION_DEFS.length; i++) {
    var def = REGION_DEFS[i];
    if (isl.regions.indexOf(def.id) < 0 && total >= def.threshold) {
      doUnlock(klass, isl, def.id, true);
    }
  }
}
function doUnlock(klass, isl, id, auto) {
  if (isl.regions.indexOf(id) >= 0) return false;
  isl.regions.push(id);
  pushHistory(isl, '🎉 נפתח אזור חדש: ' + regionDefName(id));
  markDirty(id);
  akSound('rankup');
  akConfetti(window.innerWidth / 2, window.innerHeight / 3, 90);
  akToast((auto ? '🎉 האי גדל! נפתח אזור חדש: ' : '🔓 נפתח: ') + regionDefName(id) + '!');
  akSave();
  if (ISL.running) { refreshRegions(); focusRegionInternal(id, false); }
  return true;
}

/* ===================================================================================
 * 14. HUD למקרן — כותרות ענק, מונה אבנים, פס התקדמות, פלטת פריטים
 * =================================================================================== */
var HUD_CSS_ID = 'ak-island-style';
function ensureHudCss() {
  if (document.getElementById(HUD_CSS_ID)) return;
  var css = ''
    + '.ak-isl-hud{position:absolute;inset:0;pointer-events:none;font-family:Rubik,Arial,sans-serif;direction:rtl;z-index:5;}'
    + '.ak-isl-top{position:absolute;top:18px;left:0;right:0;display:flex;justify-content:space-between;align-items:flex-start;padding:0 24px;}'
    + '.ak-isl-badge{pointer-events:none;background:rgba(15,20,35,0.72);border:2px solid rgba(255,255,255,0.35);border-radius:20px;padding:10px 22px;color:#fff;font-weight:800;font-size:30px;box-shadow:0 6px 18px rgba(0,0,0,.35);}'
    + '.ak-isl-region{font-size:48px;font-weight:900;color:#fff;text-shadow:0 3px 10px rgba(0,0,0,.6);background:rgba(15,20,35,0.55);border-radius:22px;padding:10px 30px;}'
    + '.ak-isl-progress-wrap{position:absolute;top:96px;left:50%;transform:translateX(-50%);width:min(70vw,720px);pointer-events:none;}'
    + '.ak-isl-progress-label{color:#fff;font-size:28px;font-weight:700;text-align:center;margin-bottom:6px;text-shadow:0 2px 6px rgba(0,0,0,.6);}'
    + '.ak-isl-progress-bar{height:26px;border-radius:14px;background:rgba(10,14,24,0.55);border:2px solid rgba(255,255,255,.4);overflow:hidden;}'
    + '.ak-isl-progress-fill{height:100%;background:linear-gradient(90deg,#ffd54a,#ff9a3c);border-radius:14px;transition:width .6s ease;}'
    + '.ak-isl-shop{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:6px;background:rgba(15,20,35,0.72);border:2px solid rgba(255,255,255,.3);border-radius:18px;padding:7px 10px;pointer-events:auto;max-width:96vw;overflow-x:auto;}'
    + '.ak-isl-item{flex:0 0 auto;width:96px;text-align:center;color:#fff;background:rgba(255,255,255,0.08);border-radius:12px;padding:5px 6px;cursor:pointer;border:2px solid transparent;font-size:22px;}'
    + '.ak-isl-item .em{font-size:26px;display:block;line-height:1.1;}'
    + '.ak-isl-item .nm{font-size:15px;font-weight:700;margin-top:1px;line-height:1.1;height:2.2em;overflow:hidden;}'
    + '.ak-isl-item .cs{font-size:17px;color:#ffe08a;font-weight:800;margin-top:1px;white-space:nowrap;}'
    + '.ak-isl-item.sel{border-color:#ffd54a;background:rgba(255,213,74,0.22);}'
    + '.ak-isl-item.cant{opacity:.45;}'
    + '.ak-isl-item.del{background:rgba(255,90,90,.18);}'
    + '.ak-isl-hint{position:absolute;bottom:190px;left:50%;transform:translateX(-50%);color:#fff;font-size:30px;font-weight:800;text-shadow:0 3px 10px rgba(0,0,0,.7);background:rgba(15,20,35,.55);padding:10px 26px;border-radius:18px;pointer-events:none;}'
    + '.ak-isl-ambientflag{position:absolute;top:18px;left:24px;font-size:28px;color:#fff;background:rgba(255,213,74,.85);color:#3a2c00;font-weight:900;padding:8px 18px;border-radius:16px;display:none;}'
    + '.ak-isl-ambientflag.on{display:block;}'
    + '.ak-isl-plots{position:absolute;bottom:126px;left:50%;transform:translateX(-50%);display:flex;gap:8px;background:rgba(15,20,35,0.6);border:2px solid rgba(255,255,255,.25);border-radius:20px;padding:8px 14px;pointer-events:auto;max-width:90vw;overflow-x:auto;}'
    + '.ak-isl-plot-chip{white-space:nowrap;font-size:18px;font-weight:700;color:#fff;background:rgba(255,255,255,0.08);border-radius:12px;padding:4px 12px;cursor:pointer;border:2px solid transparent;}'
    + '.ak-isl-plot-chip.sel{border-color:#7dffa8;background:rgba(125,255,168,0.25);}';
  var style = document.createElement('style');
  style.id = HUD_CSS_ID;
  style.textContent = css;
  document.head.appendChild(style);
}
function buildHud(container) {
  ensureHudCss();
  var hud = document.createElement('div');
  hud.className = 'ak-isl-hud';
  hud.innerHTML =
    '<div class="ak-isl-top">' +
    '  <div class="ak-isl-badge" data-role="coins">🪙 0</div>' +
    '  <div class="ak-isl-region" data-role="region">🏖️ חוף הכוכבים</div>' +
    '</div>' +
    '<div class="ak-isl-ambientflag" data-role="ambientflag">🌙 מצב אמביינט — סיור אוטומטי</div>' +
    '<div class="ak-isl-progress-wrap">' +
    '  <div class="ak-isl-progress-label" data-role="proglabel">עוד 120 אבנים לאזור הבא</div>' +
    '  <div class="ak-isl-progress-bar"><div class="ak-isl-progress-fill" data-role="progfill" style="width:0%"></div></div>' +
    '</div>' +
    '<div class="ak-isl-hint" data-role="hint" style="display:none">🏗️ בחרו פריט למטה ואז הקישו על הדשא</div>' +
    '<div class="ak-isl-plots" data-role="plots"></div>' +
    '<div class="ak-isl-shop" data-role="shop"></div>';
  container.appendChild(hud);
  ISL.hud = {
    root: hud,
    coins: hud.querySelector('[data-role=coins]'),
    region: hud.querySelector('[data-role=region]'),
    proglabel: hud.querySelector('[data-role=proglabel]'),
    progfill: hud.querySelector('[data-role=progfill]'),
    shop: hud.querySelector('[data-role=shop]'),
    plots: hud.querySelector('[data-role=plots]'),
    hint: hud.querySelector('[data-role=hint]'),
    ambientflag: hud.querySelector('[data-role=ambientflag]')
  };
  renderPlotPicker();
  renderShopPalette();
}
/* פס בחירה: "בונים במשותף" מול "בחלקה האישית של תלמיד/ה פלוני" — זה מה שהופך את
 * מנגנון החלקות האישיות (סעיף 6 ב-SPEC) לזמין בפועל דרך קלט יחיד על המקרן */
function renderPlotPicker() {
  if (!ISL.hud) return;
  var el = ISL.hud.plots;
  var klass = activeClass();
  var students = (klass && klass.students) || [];
  el.innerHTML = '';
  if (!students.length) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  var shared = document.createElement('div');
  shared.className = 'ak-isl-plot-chip' + (!ISL.plotTarget ? ' sel' : '');
  shared.textContent = '🏗️ בונים במשותף';
  shared.onclick = function () { ISL.plotTarget = null; ISL.buildSel = null; renderPlotPicker(); renderShopPalette(); };
  el.appendChild(shared);
  students.forEach(function (st) {
    var chip = document.createElement('div');
    chip.className = 'ak-isl-plot-chip' + (ISL.plotTarget === st.id ? ' sel' : '');
    chip.textContent = '⭐ ' + (st.name || 'תלמיד/ה');
    chip.onclick = function () { ISL.plotTarget = (ISL.plotTarget === st.id) ? null : st.id; ISL.buildSel = null; renderPlotPicker(); renderShopPalette(); };
    el.appendChild(chip);
  });
}
function updateHudRegionName() {
  if (!ISL.hud) return;
  var def = regionDef(ISL.activeId);
  if (def) ISL.hud.region.textContent = def.icon + ' ' + def.name;
  ISL.plotTarget = null; /* מעבר אזור מאפס בחירת חלקה, כדי לא לבנות בטעות באזור הלא נכון */
  renderPlotPicker();
  renderShopPalette();
}
function renderShopPalette() {
  if (!ISL.hud) return;
  var klass = activeClass();
  var isl = klass ? ensureIslandState(klass) : { coins: 0, items: [] };
  var targetRegion = ISL.plotTarget ? ('plot_' + ISL.plotTarget) : ISL.activeId;
  var el = ISL.hud.shop;
  el.innerHTML = '';
  var del = document.createElement('div');
  del.className = 'ak-isl-item del' + (ISL.delMode ? ' sel' : '');
  del.innerHTML = '<span class="em">🗑️</span><div class="nm">להסיר</div><div class="cs">+חצי מחיר</div>';
  del.onclick = function () { ISL.delMode = !ISL.delMode; ISL.buildSel = null; renderShopPalette(); };
  el.appendChild(del);
  var cat = regionCatalog(ISL.activeId); /* חלקה אישית משתמשת בקטלוג האזור המארח אותה */
  cat.forEach(function (it) {
    var d = document.createElement('div');
    var isSel = ISL.buildSel && ISL.buildSel.itemId === it.id && ISL.buildSel.regionId === targetRegion;
    d.className = 'ak-isl-item' + (isSel ? ' sel' : '') + (isl.coins < it.cost ? ' cant' : '');
    d.innerHTML = '<span class="em">' + (it.em || '❔') + '</span><div class="nm">' + akEsc(it.n || it.id) + '</div><div class="cs">🪙 ' + it.cost + '</div>';
    d.onclick = function () {
      if (isl.coins < it.cost) { akToast('צריך עוד ' + (it.cost - isl.coins) + ' 🪙'); akSound('error'); return; }
      ISL.delMode = false;
      ISL.buildSel = (isSel) ? null : { regionId: targetRegion, itemId: it.id };
      renderShopPalette();
    };
    el.appendChild(d);
  });
  if (ISL.hud.hint) ISL.hud.hint.style.display = (ISL.buildSel || ISL.delMode) ? 'block' : 'none';
}
function updateHud(now) {
  if (!ISL.hud) return;
  if (now - ISL.lastHudUpdate < 0.5) return;
  ISL.lastHudUpdate = now;
  var klass = activeClass();
  var isl = klass ? ensureIslandState(klass) : { coins: 0, spent: 0, regions: ['beach'] };
  ISL.hud.coins.textContent = '🪙 ' + isl.coins;
  var total = totalEarned(isl);
  var next = null;
  for (var i = 0; i < REGION_DEFS.length; i++) { if (isl.regions.indexOf(REGION_DEFS[i].id) < 0) { next = REGION_DEFS[i]; break; } }
  if (next) {
    var prevThreshold = 0;
    for (var j = REGION_DEFS.length - 1; j >= 0; j--) { if (isl.regions.indexOf(REGION_DEFS[j].id) >= 0) { prevThreshold = REGION_DEFS[j].threshold; } }
    var span = Math.max(1, next.threshold - prevThreshold);
    var pct = clamp(((total - prevThreshold) / span) * 100, 0, 100);
    ISL.hud.progfill.style.width = pct.toFixed(0) + '%';
    ISL.hud.proglabel.textContent = 'עוד ' + Math.max(0, next.threshold - total) + ' 🪙 עד ' + next.icon + ' ' + next.name;
  } else {
    ISL.hud.progfill.style.width = '100%';
    ISL.hud.proglabel.textContent = '🌟 כל האי נפתח — כל הכבוד לכיתה!';
  }
  ISL.hud.ambientflag.className = 'ak-isl-ambientflag' + (ISL.ambient ? ' on' : '');
}

/* ===================================================================================
 * 15. אתחול סצנה, שינוי גודל, לולאת רינדור ראשית
 * =================================================================================== */
function initScene(container) {
  if (window.IslandLife && typeof window.IslandLife.detach === 'function') window.IslandLife.detach();
  ISL.container = container;
  var canvas = document.createElement('canvas');
  canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.display = 'block';
  container.style.position = container.style.position || 'relative';
  container.appendChild(canvas);
  ISL.canvas = canvas;
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  ISL.renderer = renderer;
  var scene = new THREE.Scene();
  var farEdge = RING_R0 + REGION_DEFS.length * RING_STEP + 40;
  scene.fog = new THREE.Fog(0xbfe8ff, farEdge * 0.35, farEdge * 1.05);
  ISL.scene = scene;
  scene.add(buildSky());
  var camera = new THREE.PerspectiveCamera(50, 1, 0.1, farEdge * 2.2);
  ISL.camera = camera;
  ISL.hemi = new THREE.HemisphereLight(0xffffff, 0x2a5a3a, 0.5); scene.add(ISL.hemi);
  var sun = new THREE.DirectionalLight(0xfff2d0, 0.95);
  sun.position.set(20, 34, 14); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -28; sun.shadow.camera.right = 28; sun.shadow.camera.top = 28; sun.shadow.camera.bottom = -28;
  sun.shadow.camera.far = 90;
  scene.add(sun); ISL.sun = sun;
  var sea = buildSea(); scene.add(sea); ISL.sea = sea;
  buildClouds(scene);
  buildBirds(scene);
  ISL.groundPlaneMesh = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicMaterial({ visible: false }));
  ISL.groundPlaneMesh.rotation.x = -Math.PI / 2; ISL.groundPlaneMesh.position.y = 0.1;
  scene.add(ISL.groundPlaneMesh);
  var hl = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 1), new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.55 }));
  hl.visible = false; hl.position.y = 0.16; scene.add(hl); ISL.highlightTile = hl;
  setupInput(canvas);
  buildHud(container);
  setupResize(container);
  resizeNow();
  window.__ISL = ISL; /* לאבחון/בדיקות בלבד — לא ממשק ציבורי */
  if (window.IslandLife && typeof window.IslandLife.attach === 'function') window.IslandLife.attach(ISL);
}
function setupResize(container) {
  if (ISL.resizeObs) { try { ISL.resizeObs.disconnect(); } catch (e) {} }
  if (typeof ResizeObserver !== 'undefined') {
    try {
      ISL.resizeObs = new ResizeObserver(function () { resizeNow(); });
      ISL.resizeObs.observe(container);
    } catch (e) { window.addEventListener('resize', resizeNow); }
  } else {
    window.addEventListener('resize', resizeNow);
  }
}
function resizeNow() {
  if (!ISL.renderer || !ISL.container) return;
  var w = ISL.container.clientWidth || window.innerWidth;
  var h = ISL.container.clientHeight || window.innerHeight;
  if (!w || !h) return;
  ISL.renderer.setSize(w, h, false);
  ISL.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  ISL.camera.aspect = w / h;
  ISL.camera.updateProjectionMatrix();
}

/* לולאת התיקטוק המרכזית — נקראת גם אוטומטית מ-rAF וגם זמינה לקריאה ידנית (Island.tick) */
function stepFrame() {
  var now = performance.now() / 1000;
  if (!ISL.clock.last) ISL.clock.last = now;
  var dt = Math.min(0.05, now - ISL.clock.last);
  ISL.clock.last = now;
  ISL.clock.elapsed += dt;
  var t = ISL.clock.elapsed;

  updateCamera(dt);
  updateAmbientTour(dt, now);
  updateSea(t);
  updateClouds(dt);
  updateBirds(t);
  updateDayNight(t, ISL.scene);
  updateAnims(dt);

  /* אנימציית "userData.animate" — חוזה עם BUILDERS של סוכן B */
  for (var id in ISL.regionGroups) {
    var grp = ISL.regionGroups[id];
    grp.traverse(function (o) { if (o.userData && typeof o.userData.animate === 'function') { try { o.userData.animate(t, dt); } catch (e) {} } });
  }

  if (now - ISL.lastAutoUnlockCheck > 2) {
    ISL.lastAutoUnlockCheck = now;
    var klass = activeClass();
    if (klass) { var isl = ensureIslandState(klass); checkAutoUnlocks(klass, isl); }
    /* עדכון שילוט "נפתח בעוד X" באזורים הנעולים המוצגים כרגע */
    if (klass) {
      var islForLock = ensureIslandState(klass);
      for (var rid in ISL.regionGroups) { var g2 = ISL.regionGroups[rid]; if (g2.userData && g2.userData.updateLock) g2.userData.updateLock(islForLock); }
    }
  }

  updateHud(t);
  if (window.IslandLife && typeof window.IslandLife.tick === 'function') window.IslandLife.tick(t, dt);
  ISL.renderer.render(ISL.scene, ISL.camera);
}
function loop() {
  if (!ISL.running) return;
  stepFrame();
  ISL.raf = requestAnimationFrame(loop);
}

/* אם IslandContent עוד לא נטען בזמן open() — נבדוק כל שנייה עד 20 שניות ונרענן */
function pollForContent() {
  if (ISL.contentPoll) return;
  var tries = 0;
  ISL.contentPoll = setInterval(function () {
    tries++;
    if (window.IslandContent) { clearInterval(ISL.contentPoll); ISL.contentPoll = null; markAllDirty(); refreshRegions(); }
    else if (tries > 20) { clearInterval(ISL.contentPoll); ISL.contentPoll = null; }
  }, 1000);
}
function markAllDirty() { REGION_DEFS.forEach(function (d) { markDirty(d.id); }); }

/* ===================================================================================
 * 16. ה-API הציבורי — window.Island
 * =================================================================================== */
function resolveContainer(container) {
  if (container && container.nodeType === 1) return container;
  if (typeof container === 'string') { var el = document.getElementById(container); if (el) return el; }
  var el2 = document.getElementById('ak-island-root');
  if (!el2) {
    el2 = document.createElement('div');
    el2.id = 'ak-island-root';
    el2.style.cssText = 'position:fixed;inset:0;z-index:9000;background:#000;';
    document.body.appendChild(el2);
  }
  return el2;
}
window.Island = {
  /* open(container?, opts?) — container: DOM element או id; opts:{ambient:bool} */
  open: function (container, opts) {
    opts = opts || {};
    var target = resolveContainer(container);
    if (!ISL.inited) {
      initScene(target);
      ISL.inited = true;
      if (!window.IslandContent) { warnOnce('nocontent', 'IslandContent לא נמצא בזמן open() — מוצגים placeholders, ממתין לטעינה...'); pollForContent(); }
    } else if (ISL.container !== target) {
      /* הועבר למכולה אחרת — נעביר את הקנבס והHUD */
      target.appendChild(ISL.canvas);
      if (ISL.hud) target.appendChild(ISL.hud.root);
      ISL.container = target;
      setupResize(target);
      resizeNow();
    }
    var klass = activeClass();
    if (klass) { var isl = ensureIslandState(klass); checkAutoUnlocks(klass, isl); }
    markAllDirty();
    focusRegionInternal(ISL.activeId || 'beach', true);
    refreshRegions();
    ISL.running = true;
    if (opts.ambient) window.Island.setAmbient(true);
    if (!ISL.raf) { ISL.clock.last = 0; ISL.raf = requestAnimationFrame(loop); }
  },
  close: function () {
    ISL.running = false;
    if (ISL.raf) { cancelAnimationFrame(ISL.raf); ISL.raf = null; }
  },
  /* tick() — לרוב לא נדרש לקרוא ידנית (open() מפעיל לולאה עצמאית); חשוף גם כאן
     לתאימות ולמצבים בהם מארח רוצה לדחוף פריים ידנית (למשל אחרי פעולה חשובה) */
  tick: function () { if (ISL.inited) stepFrame(); },
  unlockRegion: function (id) {
    var klass = activeClass();
    if (!klass) return false;
    var isl = ensureIslandState(klass);
    return doUnlock(klass, isl, id, false);
  },
  place: function (regionId, itemId, x, z, rot, studentId) {
    var ok = placeAt(regionId, itemId, x, z, studentId);
    if (ok && rot != null) {
      var isl = ensureIslandState(activeClass());
      var it = isl.items[isl.items.length - 1];
      if (it) it.rot = rot;
      refreshRegions();
    }
    return ok;
  },
  remove: function (regionId, x, z) { return removeAt(regionId, x, z); },
  focusRegion: function (id) { focusRegionInternal(id, false); },
  setAmbient: function (on) {
    ISL.ambient = !!on;
    ISL.ambientTimer = 0; ISL.ambientNextSwap = 10;
    ISL.ambientPauseUntil = 0;
    if (ISL.hud) ISL.hud.ambientflag.className = 'ak-isl-ambientflag' + (ISL.ambient ? ' on' : '');
  }
};

})();
