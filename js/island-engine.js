/* =====================================================================================
 *  אקדמיית כוכבים — מנוע האי התלת-מימדי המשותף (island-engine.js)
 *  ---------------------------------------------------------------------------------
 *  סוכן A. מציית ל-SPEC.md פרק 5 (אפס עומס למורה + מסך מקרן).
 *  תלוי ב-window.AK (המתאם) וב-window.IslandContent (סוכן B) — שניהם אופציונליים
 *  בזמן טעינה; המנוע חייב לרוץ ולא לקרוס גם אם IslandContent עדיין לא נטען.
 *  Three.js r128 גלובלי בלבד (THREE). ES5-friendly, אין import/export, אין תלות חדשה.
 *  חשיפה יחידה החוצה: window.Island = {open,close,tick,unlockRegion,place,remove,
 *  focusRegion,groundHeightAt,setAmbient}.
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
  signFrame: 0,          /* מונה-פריימים זול לעדכון דעיכת שלטי-שם כל פריים שני */
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
  ctx.font = '900 ' + fontSize + 'px Heebo, Arial, sans-serif';
  var w = Math.ceil(ctx.measureText(text).width) + padX * 2;
  var h = fontSize + padY * 2;
  cvs.width = w * scale; cvs.height = h * scale;
  ctx = cvs.getContext('2d');
  ctx.scale(scale, scale);
  ctx.font = '900 ' + fontSize + 'px Heebo, Arial, sans-serif';
  ctx.direction = 'rtl';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  /* רקע כמו שלט עץ/אבן עגול */
  ctx.fillStyle = opts.bg || 'rgba(30,26,20,0.82)';
  roundRect(ctx, 2, 2, w - 4, h - 4, 14); ctx.fill();
  ctx.strokeStyle = opts.border || '#a9713f'; ctx.lineWidth = 2;
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
    ctx.strokeStyle = opts.border || '#a9713f'; ctx.lineWidth = 2;
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
 * 6.5 טופוגרפיה — שדה גובה דטרמיניסטי לכל אזור: גבעה מרכזית + רכס/דיונה בשוליים +
 * קו-חוף אורגני (לא גיאומטרי) + מדרגות-סלע ברדות לים. הכל "מדורג" (terrace) בסגנון
 * voxel/low-poly שכבר קיים בבוני-התוכן, וממוין ע"פ seed=אינדקס האזור כדי שאותו אי
 * ייבנה בכל טעינה מחדש (לא רנדומלי בכל רענון).
 * המשבצות (הרשת GRID×GRID) יושבות בפועל על שדה הגובה הזה: buildRegionItems /
 * buildPersonalPlots למטה מדגמים אותו per-item, כך שבנייה אף פעם לא מרחפת/שוקעת.
 * =================================================================================== */
var TWO_PI = Math.PI * 2;
var TERRACE_STEP = 0.24;         /* גובה כל "מדרגה" — נותן מראה מדורג/voxel, לא שיפוע חלק */
var HILL_R = 4.1;                /* רדיוס הגבעה המרכזית סביב לב האזור */
var HILL_AMP = 0.95;             /* גובה שיא הגבעה */
var DUNE_R0 = HALF + 0.9;        /* היכן מתחיל רכס/דיונת השוליים (מעבר לרשת הבנייה) */
var DUNE_W = 2.1;                /* רוחב רכס השוליים */
var SHORE_BASE = DUNE_R0 + DUNE_W + 3.4; /* רדיוס בסיס לקו החוף, לפני עיוות אורגני */
var SHELF_W = 1.7;               /* "מדף" תת-ימי מוסתר מתחת לים — מונע מרווח/תפר נראה */
function terrace(h) { return Math.round(h / TERRACE_STEP) * TERRACE_STEP; }
var _terrainParamsCache = {};
/* פרמטרים דטרמיניסטיים ייחודיים לכל אזור — פאזות לרעש הזוויתי של הדיונות/קו-החוף */
function terrainParams(idx) {
  var cached = _terrainParamsCache[idx];
  if (cached) return cached;
  var rnd = seedRand(idx * 7919 + 401);
  var p = {
    duneSeed1: rnd() * TWO_PI, duneSeed2: rnd() * TWO_PI, duneSeed3: rnd() * TWO_PI,
    shoreA: rnd() * TWO_PI, shoreB: rnd() * TWO_PI, shoreC: rnd() * TWO_PI,
    hillWobble: rnd() * TWO_PI,
    islet: rnd() > 0.45,              /* קצת יותר מחצי מהאזורים מקבלים אי-זעיר סמוך לחוף */
    isletAngle: rnd() * TWO_PI
  };
  _terrainParamsCache[idx] = p;
  return p;
}
/* רדיוס קו-החוף בזווית נתונה (יחסית למרכז האזור) — לא עיגול מושלם, מפרצים/לשונות יבשה */
function regionShoreDist(idx, angle) {
  var p = terrainParams(idx);
  var j = Math.sin(angle * 2 + p.shoreA) * 2.4
        + Math.sin(angle * 3 + p.shoreB) * 1.5
        + Math.sin(angle * 5 + p.shoreC) * 0.9;
  return Math.max(DUNE_R0 + DUNE_W + 1.4, SHORE_BASE + j);
}
/* גובה הקרקע המקומי (יחסי למרכז האזור idx) בנקודה (lx,lz) — משמש גם לבניית מש
 * הטופוגרפיה וגם למיקום כל דבר שיושב עליה (מבנים/חלקות/עיטורים), כך שהם תמיד תואמים */
function regionLocalHeight(idx, lx, lz) {
  var r = Math.sqrt(lx * lx + lz * lz);
  var a = Math.atan2(lz, lx);
  var p = terrainParams(idx);
  var hill = 0;
  if (r < HILL_R) {
    var hk = r / HILL_R;
    hill = HILL_AMP * (0.5 + 0.5 * Math.cos(Math.PI * hk));
    hill += Math.sin(a * 3 + p.hillWobble) * 0.05 * (1 - hk);
  }
  if (r <= DUNE_R0) return terrace(hill); /* לב הרשת + השוליים הקרובים — גבעה או שטוח */
  var duneEnd = DUNE_R0 + DUNE_W;
  var duneNoise = Math.sin(a * 5 + p.duneSeed1) * 0.5 + Math.sin(a * 8 + p.duneSeed2) * 0.3 + Math.sin(a * 2 + p.duneSeed3) * 0.35;
  if (r <= duneEnd) {
    var dk = (r - DUNE_R0) / DUNE_W;
    var duneShape = Math.sin(Math.PI * clamp(dk, 0, 1));
    return terrace(Math.max(0, 0.55 * duneShape + duneNoise * 0.32 * duneShape));
  }
  var shoreD = regionShoreDist(idx, a);
  if (r <= shoreD) {
    var tk = clamp((r - duneEnd) / Math.max(0.6, shoreD - duneEnd), 0, 1);
    var startH = Math.max(0, duneNoise * 0.1);
    return terrace(lerp(startH, -0.08, tk));
  }
  var beyond = clamp((r - shoreD) / SHELF_W, 0, 1);
  return terrace(lerp(-0.08, -0.6, beyond));
}

/* ===================================================================================
 * 7. עולם משותף — ים מונפש, שמיים גרדיאנט, עננים, ציפורים, מחזור יום/לילה
 * =================================================================================== */
function glowSprite(size, inner, outer) {
  /* ספרייט זוהר radial-gradient — לשמש, הילה וכו'. בלי טקסטורות חיצוניות */
  var cv = document.createElement('canvas'); cv.width = cv.height = 128;
  var c2 = cv.getContext('2d');
  var gr = c2.createRadialGradient(64, 64, 2, 64, 64, 64);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  c2.fillStyle = gr; c2.fillRect(0, 0, 128, 128);
  var tx = new THREE.CanvasTexture(cv);
  tx.minFilter = THREE.LinearFilter;
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tx, transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending
  }));
  sp.scale.set(size, size, 1);
  return sp;
}
function buildSky() {
  /* כיפת שמיים תלת-שכבתית: אופק שמנת חם → תכלת אמצע → כחול עמוק בזנית,
   * + דיסקת שמש זוהרת עם הילה — נקודת-עיגון ויזואלית לכיוון האור והצללים */
  var g = new THREE.Group();
  var geo = new THREE.SphereGeometry(220, 24, 16);
  var colors = [];
  var zen = new THREE.Color(0x2468d8), mid = new THREE.Color(0x6fb4f4), hor = new THREE.Color(0xe6f4ff), warm = new THREE.Color(0xfff0d2);
  var pos = geo.attributes.position;
  for (var i = 0; i < pos.count; i++) {
    var y = pos.getY(i) / 220;
    var t = clamp((y + 1) / 2, 0, 1);
    var c;
    if (t <= 0.5) c = hor.clone();
    else if (t < 0.56) c = hor.clone().lerp(warm, Math.sin(((t - 0.5) / 0.06) * Math.PI) * 0.5); /* פס-אופק חם דק */
    else if (t < 0.68) c = hor.clone().lerp(mid, (t - 0.56) / 0.12);
    else c = mid.clone().lerp(zen, Math.pow((t - 0.68) / 0.32, 0.85));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  var m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  var dome = new THREE.Mesh(geo, m);
  dome.renderOrder = -10;
  g.add(dome);
  /* השמש — באותו כיוון כמו ה-DirectionalLight (20,34,14) מנורמל * 185 */
  var sunDir = new THREE.Vector3(20, 34, 14).normalize().multiplyScalar(185);
  var halo = glowSprite(95, 'rgba(255,242,196,0.5)', 'rgba(255,242,196,0)');
  halo.position.copy(sunDir); halo.renderOrder = -9;
  g.add(halo);
  var disc = glowSprite(30, 'rgba(255,252,240,1)', 'rgba(255,234,170,0)');
  disc.position.copy(sunDir); disc.renderOrder = -8;
  g.add(disc);
  ISL.sky = g;
  return g;
}
function buildSea() {
  /* seg הוגבר מ-44 ל-56 (גלים חלקים יותר) + צבעי-קודקוד לעומק (רדוד/בהיר ליד
   * החוף, כהה/עמוק רחוק) + נצנוץ-שמש זול ב-updateSea. בלי טקסטורות/geometry ענק. */
  var seg = 56;
  var size = (RING_R0 + REGION_DEFS.length * RING_STEP) * 2 + 60;
  var geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  var shallow = new THREE.Color(0x5fcdec), deep = new THREE.Color(0x0b4a8f);
  var centers = [];
  for (var ci = 0; ci < REGION_DEFS.length; ci++) centers.push(regionCenter(ci));
  var colors = [];
  var p0 = geo.attributes.position;
  for (var i = 0; i < p0.count; i++) {
    var x = p0.getX(i), z = p0.getZ(i);
    var minD = 1e9;
    for (var cj = 0; cj < centers.length; cj++) {
      var dxp = x - centers[cj].x, dzp = z - centers[cj].z;
      var dd = Math.sqrt(dxp * dxp + dzp * dzp);
      if (dd < minD) minD = dd;
    }
    var depthT = clamp((minD - 7) / 26, 0, 1);
    var c = shallow.clone().lerp(deep, depthT);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  var m = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 240, specular: new THREE.Color(0x8fb4d8), transparent: true, opacity: 0.93 });
  var mesh = new THREE.Mesh(geo, m);
  mesh.position.y = -0.35;
  mesh.receiveShadow = true;
  ISL.seaGeo = geo;
  ISL.seaBaseY = [];
  ISL.seaBaseColor = colors;
  var p = geo.attributes.position;
  for (var j = 0; j < p.count; j++) ISL.seaBaseY.push(p.getY(j));
  return mesh;
}
function updateSea(t) {
  if (!ISL.seaGeo) return;
  var p = ISL.seaGeo.attributes.position;
  var cAttr = ISL.seaGeo.attributes.color;
  var baseCol = ISL.seaBaseColor;
  for (var i = 0; i < p.count; i++) {
    var x = p.getX(i), z = p.getZ(i);
    var wave = Math.sin(x * 0.12 + t * 1.1) * 0.22 + Math.sin(z * 0.09 - t * 0.8) * 0.18 + Math.sin((x + z) * 0.05 + t * 0.55) * 0.1;
    p.setY(i, ISL.seaBaseY[i] + wave);
    if (cAttr && baseCol) {
      /* נצנוץ-שמש זול: פס בהירות נעה שמאירה נקודות פזורות על פני הים */
      var sparkle = Math.max(0, Math.sin(x * 0.6 + t * 2.1) * Math.sin(z * 0.5 - t * 1.7));
      var boost = sparkle > 0.82 ? (sparkle - 0.82) * 2.2 : 0;
      var bi = i * 3;
      cAttr.array[bi] = Math.min(1, baseCol[bi] + boost);
      cAttr.array[bi + 1] = Math.min(1, baseCol[bi + 1] + boost);
      cAttr.array[bi + 2] = Math.min(1, baseCol[bi + 2] + boost * 0.9);
    }
  }
  p.needsUpdate = true;
  if (cAttr) cAttr.needsUpdate = true;
  /* נורמלים מתעדכנים כל פריים שני — בלעדיהם הברק הספקולרי קפוא והים נראה כמו פלסטיק */
  ISL.seaFrame = (ISL.seaFrame | 0) + 1;
  if (ISL.seaFrame % 2 === 0) ISL.seaGeo.computeVertexNormals();
}
function buildClouds(scene) {
  /* עננים "פחזניים" מאשכולות כדורים — סגנון פיקסאר, לא קופסאות */
  ISL.clouds = [];
  var span = RING_R0 + REGION_DEFS.length * RING_STEP + 30;
  var puffGeo = new THREE.SphereGeometry(1, 9, 7);
  var mTop = new THREE.MeshLambertMaterial({ color: 0xffffff });
  var mBot = new THREE.MeshLambertMaterial({ color: 0xdde9f8 });
  for (var i = 0; i < 10; i++) {
    var g = new THREE.Group();
    var n = 4 + Math.floor(Math.random() * 3);
    var w = 2.2 + Math.random() * 1.6;
    for (var j = 0; j < n; j++) {
      var fr = n <= 1 ? 0.5 : j / (n - 1);
      var px = (fr - 0.5) * w * 2;
      var edge = Math.abs(fr - 0.5) * 2; /* 0 באמצע, 1 בקצוות */
      var s = (1.15 - edge * 0.55) * (0.9 + Math.random() * 0.5);
      var puff = new THREE.Mesh(puffGeo, mTop);
      puff.position.set(px, (1 - edge) * 0.45 + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.9);
      puff.scale.set(s * 1.25, s * 0.78, s);
      g.add(puff);
    }
    /* "בטן" שטוחה מעט כהה מתחת — נותנת לענן נפח ומשקל */
    var belly = new THREE.Mesh(puffGeo, mBot);
    belly.position.set(0, -0.35, 0);
    belly.scale.set(w * 0.95, 0.42, 1.15);
    g.add(belly);
    g.children.forEach(function (c) { c.castShadow = false; c.receiveShadow = false; });
    g.position.set((Math.random() - 0.5) * span * 2, 26 + Math.random() * 10, (Math.random() - 0.5) * span * 2);
    g.userData.speed = 0.4 + Math.random() * 0.5;
    g.userData.baseY = g.position.y;
    g.userData.phase = Math.random() * Math.PI * 2;
    scene.add(g); ISL.clouds.push(g);
  }
}
function updateClouds(dt) {
  var span = RING_R0 + REGION_DEFS.length * RING_STEP + 30;
  var te = ISL.clock.elapsed;
  ISL.clouds.forEach(function (c) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > span) c.position.x = -span;
    c.position.y = c.userData.baseY + Math.sin(te * 0.25 + c.userData.phase) * 0.5;
  });
}
function buildBirds(scene) {
  ISL.birds = [];
  for (var i = 0; i < 6; i++) {
    var g = new THREE.Group();
    var wm = mat(0xf4f7fb); /* שחף — כנפיים בהירות עם קצה כהה */
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), wm);
    body.scale.set(2.1, 1, 1); g.add(body);
    var beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 5), mat(0xffb020));
    beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.02, 0.2); g.add(beak);
    var w1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.16), wm); w1.position.x = -0.28; g.add(w1);
    var w2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.16), wm); w2.position.x = 0.28; g.add(w2);
    var tip1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.032, 0.16), mat(0x3a4250)); tip1.position.x = -0.28; w1.add(tip1);
    var tip2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.032, 0.16), mat(0x3a4250)); tip2.position.x = 0.28; w2.add(tip2);
    g.traverse(function (c) { c.castShadow = false; });
    g.userData.w1 = w1; g.userData.w2 = w2;
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
    if (b.userData.w1) b.userData.w1.rotation.z = flap;
    if (b.userData.w2) b.userData.w2.rotation.z = -flap;
  });
}
/* גובה הגל בנקודה — אותה נוסחה בדיוק כמו updateSea, כדי שהסירות ישבו על המים באמת */
function seaWaveAt(x, z, t) {
  return Math.sin(x * 0.12 + t * 1.1) * 0.22 + Math.sin(z * 0.09 - t * 0.8) * 0.18 + Math.sin((x + z) * 0.05 + t * 0.55) * 0.1;
}
function buildBoats(scene) {
  /* מפרשיות קטנות שמפליגות לאט סביב הארכיפלג — עולם שחי גם כשלא נוגעים בו */
  ISL.boats = [];
  var hullMat = new THREE.MeshLambertMaterial({ color: 0x9a6a3f });
  var hullMat2 = new THREE.MeshLambertMaterial({ color: 0x7d5430 });
  var mastMat = new THREE.MeshLambertMaterial({ color: 0x6b4a28 });
  var sailShape = new THREE.Shape();
  sailShape.moveTo(0, 0); sailShape.lineTo(0, 1.15); sailShape.lineTo(0.72, 0.08); sailShape.lineTo(0, 0);
  var sailGeo = new THREE.ShapeGeometry(sailShape);
  var sailColors = [0xffffff, 0xff5d5d, 0x2ea8ff];
  var defs = [
    { radius: RING_R0 * 0.55, speed: 0.055, phase: 0.4 },
    { radius: RING_R0 + 2.5 * RING_STEP, speed: -0.038, phase: 2.6 },
    { radius: RING_R0 + 5.5 * RING_STEP, speed: 0.03, phase: 4.4 }
  ];
  defs.forEach(function (bd, i) {
    var g = new THREE.Group();
    var hull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 0.6), hullMat);
    hull.castShadow = true; g.add(hull);
    var bow = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.55, 4), hullMat2);
    bow.rotation.z = -Math.PI / 2; bow.rotation.y = Math.PI / 4;
    bow.scale.set(1, 1, 0.72); bow.position.set(1.0, 0, 0); g.add(bow);
    var stern = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.42, 0.62), hullMat2);
    stern.position.set(-0.72, 0.05, 0); g.add(stern);
    var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.5, 6), mastMat);
    mast.position.set(0.1, 0.85, 0); g.add(mast);
    var sail = new THREE.Mesh(sailGeo, new THREE.MeshLambertMaterial({ color: sailColors[i % sailColors.length], side: THREE.DoubleSide }));
    sail.position.set(0.14, 0.28, 0); g.add(sail);
    var flag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.02), new THREE.MeshLambertMaterial({ color: 0xffb800 }));
    flag.position.set(0.2, 1.62, 0); g.add(flag);
    g.userData = { radius: bd.radius, speed: bd.speed, phase: bd.phase };
    scene.add(g); ISL.boats.push(g);
  });
}
function updateBoats(t) {
  if (!ISL.boats) return;
  ISL.boats.forEach(function (bg) {
    var u = bg.userData;
    var a = u.phase + t * u.speed;
    var x = Math.cos(a) * u.radius, z = Math.sin(a) * u.radius;
    var w = seaWaveAt(x, z, t);
    bg.position.set(x, -0.35 + w * 0.85 + 0.18, z);
    /* חרטום לכיוון ההפלגה + טלטול גלים עדין */
    bg.rotation.y = -a - (u.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
    bg.rotation.z = Math.sin(t * 1.25 + u.phase * 3) * 0.055;
    bg.rotation.x = Math.sin(t * 0.9 + u.phase * 5) * 0.045;
  });
}
function buildPollen(scene) {
  /* "אבקת אור" זהובה מרחפת סביב האזור הפעיל — עומק אטמוספרי בזיל הזול */
  var COUNT = 70;
  var positions = new Float32Array(COUNT * 3);
  for (var i = 0; i < COUNT; i++) {
    var a = Math.random() * Math.PI * 2;
    var r = 2 + Math.random() * 15;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = 0.4 + Math.random() * 7;
    positions[i * 3 + 2] = Math.sin(a) * r;
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  var pm = new THREE.PointsMaterial({
    color: 0xffe9a8, size: 0.13, transparent: true, opacity: 0.65,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
  });
  var pts = new THREE.Points(geo, pm);
  scene.add(pts);
  ISL.pollen = pts;
}
function updatePollen(t) {
  if (!ISL.pollen) return;
  ISL.pollen.position.set(ISL.cam.cx, Math.sin(t * 0.5) * 0.35, ISL.cam.cz);
  ISL.pollen.rotation.y = t * 0.045;
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
  if (ISL.sun) ISL.sun.intensity = 0.38 + day * 0.78;
  if (ISL.hemi) ISL.hemi.intensity = 0.27 + day * 0.46;
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
  /* אזור נעול נראה כמו "אי בערפל" — גבעת-צל שטוחה-רכה + הילה, לא קופסה אפורה */
  var def = REGION_DEFS[idx], c = regionCenter(idx);
  var g = new THREE.Group();
  g.position.set(c.x, 0, c.z);
  var fogColor = new THREE.Color(def.theme.fog).lerp(new THREE.Color(0x44526a), 0.55);
  var moundR = GRID * 0.42;
  var mound = new THREE.Mesh(new THREE.SphereGeometry(moundR, 12, 8),
    new THREE.MeshBasicMaterial({ color: fogColor, transparent: true, opacity: 0.5, fog: false, side: THREE.DoubleSide }));
  mound.scale.set(1, 0.5, 1);
  mound.position.y = -(moundR * 0.5) + 0.4;
  g.add(mound);
  var halo = new THREE.Mesh(new THREE.RingGeometry(moundR * 0.9, moundR * 1.3, 20),
    new THREE.MeshBasicMaterial({ color: fogColor, transparent: true, opacity: 0.22, fog: false, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = -0.28;
  g.add(halo);
  var sign = makeLabel(def.icon + ' ' + def.name + '  🔒', { worldHeight: 1.5, fontSize: 46 });
  sign.position.set(0, 3.6, 0);
  g.add(sign);
  var sub = makeLabel('נפתח ב־… אבנים', { worldHeight: 1.0, fontSize: 34, bg: 'rgba(255,250,238,0.94)', color: '#3d2a17' });
  sub.position.set(0, 2.2, 0);
  g.add(sub);
  g.userData.sub = sub;
  g.userData.updateLock = function (isl) {
    var need = Math.max(0, def.threshold - totalEarned(isl));
    sub.userData.setText(need > 0 ? ('נפתח בעוד ' + need + ' 🪙') : 'נפתח עכשיו!');
  };
  return g;
}
/* טבעות המש (רדיוס לפי k, יכול להיות תלוי-זווית ברדיוסים החיצוניים — קו-חוף אורגני) */
var TERRAIN_SEG = 28, TERRAIN_RINGS = 13; /* 28 סגמנטים — קו חוף חלק, עדיין זול (364 קודקודים) */
/* חצאית-צוק (פער A ב-RESEARCH_VISUAL_PRO): בין קו-החוף (k=9) למדף התת-ימי המוסתר (k=12)
 * הוספנו 2 טבעות-ביניים מדורגות (k=10,11) — undercut קל של הרדיוס פנימה + גובה יורד
 * במדרגות, כדי שהצד ייראה כמו צוק-סלע מקצועי ולא קיר כהה שטוח. */
var CLIFF_UNDERCUT_1 = 0.05, CLIFF_UNDERCUT_2 = 0.10;   /* % נסיגת-רדיוס פנימה, מצטבר, לכל טבעת-מדף */
var CLIFF_SHORE_H = -0.08;                              /* גובה קו-החוף לפני terrace() — זהה לקבוע המקביל ב-regionLocalHeight */
var CLIFF_DROP_1 = 0.4, CLIFF_DROP_2 = 0.4, CLIFF_DROP_3 = 0.35; /* מדרגות-צוק כלפי מטה, עד מתחת לשפל הגלים */
function terrainRingRadius(k, a, idx) {
  var duneEnd = DUNE_R0 + DUNE_W;
  var shoreD = regionShoreDist(idx, a);
  switch (k) {
    case 0: return 0;
    case 1: return 1.4;
    case 2: return 2.8;
    case 3: return HILL_R;
    case 4: return (HILL_R + DUNE_R0) / 2;
    case 5: return DUNE_R0;
    case 6: return DUNE_R0 + DUNE_W * 0.5;
    case 7: return duneEnd;
    case 8: return lerp(duneEnd, shoreD, 0.5);
    case 9: return shoreD;                              /* קו-החוף עצמו — קצה עליון של הצוק */
    case 10: return shoreD * (1 - CLIFF_UNDERCUT_1);     /* מדף-צוק עליון — undercut קל */
    case 11: return shoreD * (1 - CLIFF_UNDERCUT_2);     /* מדף-צוק תחתון — undercut נוסף, צמוד למים */
    case 12: return shoreD + SHELF_W;                    /* מדף תת-ימי מוסתר מתחת לים */
  }
  return 0;
}
/* בונה את מש הקרקע האורגני (גבעה+דיונות+חוף+מדף) לאזור idx — קודקוד-צבע מפלטת האזור.
 * side:DoubleSide כדי שכיוון-הפנים (winding) של המניפה לעולם לא ייצור מש "בלתי-נראה". */
function buildTerrainMesh(idx, def) {
  var seg = TERRAIN_SEG, rings = TERRAIN_RINGS;
  var groundColor = new THREE.Color(def.theme.ground);
  var accentColor = new THREE.Color(def.theme.accent);
  var rockColor = accentColor.clone().multiplyScalar(0.62);
  /* שכבות-סלע לחצאית-הצוק: עליונה מובהרת (שיא הצוק, קרוב ליבשה) → אמצעית → תחתונה
   * כהה (פס-מגע צמוד למים) — value-structure כהה-למטה/בהיר-למעלה נותן נפח מיידי */
  var rockBright = rockColor.clone().lerp(new THREE.Color(0xffffff), 0.32);
  var rockDark = rockColor.clone().multiplyScalar(0.5);
  var deepColor = new THREE.Color(0x1c3550);
  var rnd = seedRand(idx * 331 + 71);
  var posArr = [], colArr = [];
  for (var k = 0; k < rings; k++) {
    for (var s = 0; s < seg; s++) {
      var a = (s / seg) * TWO_PI;
      var rad = terrainRingRadius(k, a, idx);
      var lx = Math.cos(a) * rad, lz = Math.sin(a) * rad;
      var h;
      if (k === 0) h = regionLocalHeight(idx, 0, 0);
      else if (k === 10) h = terrace(CLIFF_SHORE_H - CLIFF_DROP_1);
      else if (k === 11) h = terrace(CLIFF_SHORE_H - CLIFF_DROP_1 - CLIFF_DROP_2);
      else if (k === 12) h = terrace(CLIFF_SHORE_H - CLIFF_DROP_1 - CLIFF_DROP_2 - CLIFF_DROP_3);
      else h = regionLocalHeight(idx, lx, lz);
      if (k > 0 && k < rings - 1) h += (rnd() - 0.5) * 0.05; /* חספוס עדין, לא על הגבול החיצוני */
      posArr.push(lx, h, lz);
      var col = (k <= 5) ? groundColor : (k <= 7) ? accentColor
              : (k === 8) ? rockColor : (k === 9) ? rockBright
              : (k === 10) ? rockColor : (k === 11) ? rockDark : deepColor;
      /* גיוון-צבע דטרמיניסטי (mottling) — עדין! מרכז האזור כמעט אחיד (העין צריכה
         מקום לנוח — עקרון הניקיון של מריו/LEGO), הטקסטורה רק בטבעת החיצונית */
      var mottAmp = (k <= 5) ? 0.018 : 0.04;
      var mott = (k < rings - 2) ? (rnd() - 0.5) * mottAmp : 0;
      colArr.push(clamp(col.r + mott, 0, 1), clamp(col.g + mott * 1.15, 0, 1), clamp(col.b + mott * 0.85, 0, 1));
    }
  }
  function vi(kk, ss) { return kk * seg + (((ss % seg) + seg) % seg); }
  var index = [];
  for (var k2 = 0; k2 < rings - 1; k2++) {
    for (var s2 = 0; s2 < seg; s2++) {
      var a0 = vi(k2, s2), a1 = vi(k2, s2 + 1), b0 = vi(k2 + 1, s2), b1 = vi(k2 + 1, s2 + 1);
      if (k2 === 0) { index.push(a0, b0, b1); }
      else { index.push(a0, b0, b1); index.push(a0, b1, a1); }
    }
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  var mat3 = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  var mesh = new THREE.Mesh(geo, mat3);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}
/* אי-זעיר נפרד ליד החוף — רק לאזורים שנבחרו דטרמיניסטית (terrainParams(idx).islet) */
function buildIslet(idx, def) {
  var p = terrainParams(idx);
  if (!p.islet) return null;
  var a = p.isletAngle;
  var r = regionShoreDist(idx, a) + 1.6 + hash01('islet' + idx) * 1.2;
  var lx = Math.cos(a) * r, lz = Math.sin(a) * r;
  var g = new THREE.Group();
  var top = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.55, 7), new THREE.MeshLambertMaterial({ color: def.theme.ground }));
  top.position.y = 0.1; top.receiveShadow = true; g.add(top);
  var rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), new THREE.MeshLambertMaterial({ color: def.theme.accent }));
  rock.position.set(0.35, 0.35, -0.2); rock.castShadow = true; g.add(rock);
  g.position.set(lx, -0.15, lz);
  return g;
}
/* קצף-גלים לבן לאורך קו החוף האורגני — טבעת חלקיקים "נושמת" (userData.animate,
 * מונע ע"י לולאת ה-tick הראשית הקיימת ב-stepFrame, אותו חוזה כמו BUILDERS) */
function buildCoastFoam(idx, def) {
  var seg = TERRAIN_SEG;
  var geo = new THREE.BoxGeometry(0.6, 0.07, 0.34);
  var m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72 });
  var im = new THREE.InstancedMesh(geo, m, seg);
  im.castShadow = false; im.receiveShadow = false;
  var base = [];
  for (var s = 0; s < seg; s++) {
    var a = (s / seg) * TWO_PI;
    var r = Math.max(0.5, regionShoreDist(idx, a) - 0.3);
    var lx = Math.cos(a) * r, lz = Math.sin(a) * r;
    var h = regionLocalHeight(idx, lx, lz);
    base.push({ x: lx, y: h + 0.05, z: lz, rot: a, phase: s * 1.7 });
  }
  var dummy = new THREE.Object3D();
  function applyFrame(t) {
    for (var i = 0; i < seg; i++) {
      var bpt = base[i];
      var sc = 0.8 + Math.sin((t || 0) * 1.5 + bpt.phase) * 0.25;
      dummy.position.set(bpt.x, bpt.y, bpt.z);
      dummy.rotation.set(0, bpt.rot, 0);
      dummy.scale.set(sc, 1, sc);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
  }
  applyFrame(0);
  im.userData.animate = applyFrame;
  return im;
}
function buildRegionBase(idx, detailed) {
  var def = REGION_DEFS[idx];
  var g = new THREE.Group();
  var c = regionCenter(idx);
  g.position.set(c.x, 0, c.z);
  var terrainMesh = buildTerrainMesh(idx, def);
  g.add(terrainMesh);
  g.userData.terrainMesh = terrainMesh; /* ריי-קאסטינג מדויק לבחירת משבצת — ראו pickGroundPoint */
  if (detailed) {
    /* עיטור ביומה — דשא/סלעים/קרח/חול מפוזרים ב-InstancedMesh (זול לביצועים), יושבים
     * על גובה הקרקע המקומי כדי לא לרחף/לשקוע כשיש גבעה */
    var rnd = seedRand(idx * 977 + 13);
    var deco = biomeDecoMesh(idx, def, rnd);
    if (deco) g.add(deco);
    var flora = duneFloraMesh(idx, def);
    if (flora) g.add(flora);
    var foam = buildCoastFoam(idx, def);
    if (foam) g.add(foam);
    var islet = buildIslet(idx, def);
    if (islet) g.add(islet);
  }
  g.userData.regionId = def.id;
  return g;
}
function biomeDecoMesh(idx, def, rnd) {
  /* צפיפות מצומצמת (~40% פחות) — עומס פרטים קטן = מראה נקי, לא "רעש" */
  var geo, color, count = 28, scaleFn;
  if (def.id === 'forest' || def.id === 'village' || def.id === 'farm') {
    geo = new THREE.BoxGeometry(0.14, 0.32, 0.14); color = new THREE.Color(def.theme.accent).multiplyScalar(0.7).getHex(); scaleFn = function () { return 0.7 + rnd() * 0.7; };
  } else if (def.id === 'mountain' || def.id === 'sky') {
    geo = new THREE.OctahedronGeometry(0.16, 0); color = 0xffffff; scaleFn = function () { return 0.8 + rnd() * 0.6; };
  } else if (def.id === 'desert' || def.id === 'beach') {
    geo = new THREE.DodecahedronGeometry(0.14, 0); color = 0xc79447; scaleFn = function () { return 0.7 + rnd() * 0.5; }; count = 16;
  } else if (def.id === 'volcano') {
    geo = new THREE.DodecahedronGeometry(0.16, 0); color = 0x2b241f; scaleFn = function () { return 0.8 + rnd() * 0.7; }; count = 18;
  } else return null;
  var m = new THREE.MeshLambertMaterial({ color: color });
  var im = new THREE.InstancedMesh(geo, m, count);
  im.castShadow = true; im.receiveShadow = true;
  var dummy = new THREE.Object3D();
  for (var i = 0; i < count; i++) {
    var x = (rnd() - 0.5) * (GRID - 1.5), z = (rnd() - 0.5) * (GRID - 1.5);
    /* מרחיק מהמרכז (חלקת ה"שלנו") ומהחלקות האישיות בהיקף */
    var y = regionLocalHeight(idx, x, z) + 0.14;
    dummy.position.set(x, y, z);
    var s = scaleFn();
    dummy.scale.set(s, s, s);
    dummy.rotation.y = rnd() * Math.PI * 2;
    dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
  }
  im.instanceMatrix.needsUpdate = true;
  return im;
}
/* צמחייה על טבעת הדיונות — אשכולות עשב + פרחים צבעוניים. יושבים מחוץ לרשת הבנייה
 * (רדיוס DUNE_R0 ומעלה) ולכן לעולם לא מתנגשים במבנים. דטרמיניסטי per-region. */
function duneFloraMesh(idx, def) {
  var kind = def.id;
  if (kind === 'volcano' || kind === 'mountain' || kind === 'sky') return null;
  var dry = (kind === 'desert');
  var g = new THREE.Group();
  var rnd = seedRand(idx * 1543 + 29);
  var duneEnd = DUNE_R0 + DUNE_W;
  /* --- עשב: קונוסים קטנים בשני גוונים --- */
  var grassGeo = new THREE.ConeGeometry(0.07, 0.3, 5);
  grassGeo.translate(0, 0.15, 0);
  /* גוונים נגזרים מצבע האזור עצמו — סולם צבעים אחוד, לא ירוק רביעי */
  var accCol = new THREE.Color(def.theme.accent);
  var greens = dry ? [0xb8a15c, 0x9b8a4e] : [accCol.getHex(), accCol.clone().multiplyScalar(0.76).getHex()];
  for (var gi = 0; gi < 2; gi++) {
    var gCount = dry ? 8 : 13;
    var gim = new THREE.InstancedMesh(grassGeo, new THREE.MeshLambertMaterial({ color: greens[gi] }), gCount);
    gim.castShadow = true; gim.receiveShadow = true;
    var dummy = new THREE.Object3D();
    for (var i = 0; i < gCount; i++) {
      var a = rnd() * TWO_PI;
      var r = DUNE_R0 - 0.3 + rnd() * (DUNE_W + 1.6);
      var x = Math.cos(a) * r, z = Math.sin(a) * r;
      dummy.position.set(x, regionLocalHeight(idx, x, z) + 0.02, z);
      var s = 0.7 + rnd() * 0.9;
      dummy.scale.set(s, s * (0.8 + rnd() * 0.6), s);
      dummy.rotation.set((rnd() - 0.5) * 0.25, rnd() * TWO_PI, (rnd() - 0.5) * 0.25);
      dummy.updateMatrix();
      gim.setMatrixAt(i, dummy.matrix);
    }
    gim.instanceMatrix.needsUpdate = true;
    g.add(gim);
  }
  /* --- פרחים: גבעול + ראש צבעוני (שני InstancedMesh עם אותן מטריצות) --- */
  if (!dry) {
    var fCount = 7;
    var stemGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.22, 4);
    stemGeo.translate(0, 0.11, 0);
    var headGeo = new THREE.SphereGeometry(0.055, 8, 6);
    headGeo.translate(0, 0.24, 0);
    var petal = [0xff5d5d, 0xffb800, 0xffffff, 0xff8fc0][idx % 4];
    var sim = new THREE.InstancedMesh(stemGeo, new THREE.MeshLambertMaterial({ color: accCol.clone().multiplyScalar(0.76).getHex() }), fCount);
    var him = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: petal }), fCount);
    him.castShadow = true;
    var d2 = new THREE.Object3D();
    for (var f = 0; f < fCount; f++) {
      var fa = rnd() * TWO_PI;
      var fr = DUNE_R0 + rnd() * (DUNE_W + 1.2);
      var fx = Math.cos(fa) * fr, fz = Math.sin(fa) * fr;
      d2.position.set(fx, regionLocalHeight(idx, fx, fz) + 0.02, fz);
      var fs = 0.8 + rnd() * 0.7;
      d2.scale.set(fs, fs, fs);
      d2.rotation.set((rnd() - 0.5) * 0.2, 0, (rnd() - 0.5) * 0.2);
      d2.updateMatrix();
      sim.setMatrixAt(f, d2.matrix);
      him.setMatrixAt(f, d2.matrix);
    }
    sim.instanceMatrix.needsUpdate = true;
    him.instanceMatrix.needsUpdate = true;
    g.add(sim); g.add(him);
  }
  return g;
}
/* צל-מגע (contact shadow) — דיסקה שחורה שקופה צמודה לקרקע מתחת לכל מבנה. גיאומטריה
 * משותפת (זולה) בין כל הדיסקאות, חומר עצמאי לכל דיסקה כדי שלא ייווצר תלות-שחרור
 * חוצה-אזורים ב-disposeGroup. userData.noRaycast מסמן לדלג עליה בבחירת/הסרת פריטים
 * (ראו onTap) — היא לא אמורה להיות "ניתנת ללחיצה" בעצמה. פער A ב-RESEARCH_VISUAL_PRO:
 * בלי עיגון-קרקע העין קוראת "מרחף" = זול; זה סימן ההיכר מספר 1 של רנדור מקצועי. */
var _contactShadowGeo = null;
function contactShadowGeometry() {
  if (!_contactShadowGeo) _contactShadowGeo = new THREE.CircleGeometry(0.55, 8); /* 8 סגמנטים — זול גם כשמצטבר על עשרות פריטים */
  return _contactShadowGeo;
}
function makeContactShadow() {
  var geo = contactShadowGeometry();
  var m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
  var disc = new THREE.Mesh(geo, m);
  disc.rotation.x = -Math.PI / 2;
  disc.castShadow = false; disc.receiveShadow = false;
  disc.userData.sharedGeo = true;  /* הגיאומטריה משותפת — לא לשחרר ב-disposeGroup */
  disc.userData.noRaycast = true;  /* לדלג עליה בריי-קאסטינג של בחירת/הסרת פריטים */
  return disc;
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
    /* מיקום מוחלט בעולם (מרכז האזור + היסט מקומי) — עקבי עם tileFromWorld.
     * הגובה נדגם מתוך regionLocalHeight כדי שהמבנה ישב על הקרקע המקומית (גבעה/דיונה/
     * שטוח) ולעולם לא ירחף/ישקע — זה בדיוק חוזה groundHeightAt החשוף למטה. */
    var lx = (it.x - HALF) * TILE, lz = (it.z - HALF) * TILE;
    var groundY = regionLocalHeight(idx, lx, lz);
    var ly = groundY + 0.1;
    node.position.set(c.x + lx, ly, c.z + lz);
    node.rotation.y = it.rot || 0;
    node.userData.tile = it.x + '_' + it.z;
    node.userData.itemId = it.id;
    node.userData.regionKey = def.id;
    grp.add(node);
    var shadow = makeContactShadow();
    shadow.position.set(c.x + lx, groundY + 0.02, c.z + lz);
    grp.add(shadow);
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
  var lbl = makeLabel(cat ? cat.em || '❔' : '❔', { worldHeight: 0.38, fontSize: 40, bg: 'rgba(0,0,0,0.18)' });
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
    var lx = Math.cos(angle) * plotR, lz = Math.sin(angle) * plotR;
    var px = c.x + lx, pz = c.z + lz;
    /* החלקה יושבת על גובה הקרקע המקומי באותה נקודה (לרוב קרוב לחוף/שונית) — כך היא
     * נראית כמו אי-לוויין קטן בארכיפלג, לא כמו פלטפורמה מרחפת סתמית */
    var baseY = regionLocalHeight(idx, lx, lz);
    var pg = new THREE.Group();
    pg.position.set(px, baseY, pz);
    pg.rotation.y = -angle + Math.PI / 2;
    var base = box(PLOT + 0.5, 0.5, PLOT + 0.5, 0xd8c48a, 0, -0.28, 0); base.castShadow = false; pg.add(base);
    var top = box(PLOT + 0.6, 0.18, PLOT + 0.6, 0x6fae4a, 0, -0.05, 0); top.castShadow = false; pg.add(top);
    /* גשר קטן לחיבור לאי הראשי */
    var bridgeLen = plotR - GRID / 2 - 0.2;
    var bridge = box(0.8, 0.12, bridgeLen, 0x8a5a2b, 0, -0.1, -(PLOT / 2 + bridgeLen / 2 + 0.3));
    pg.add(bridge);
    var sign = makeLabel('🌟 ' + (st.name || 'תלמיד/ה'), { worldHeight: 0.7, fontSize: 34, bg: 'rgba(255,250,238,0.94)', color: '#3d2a17' });
    sign.position.set(0, 1.5, 0);
    sign.userData.isPlotSign = true; /* מסומן לדעיכה-לפי-מרחק, ראו updatePlotSignLOD */
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
    pg.userData.plotOrigin = { x: px, z: pz, rotY: pg.rotation.y, y: baseY };
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
      var baseGroup = buildRegionBase(i, true);
      group.add(baseGroup);
      group.userData.terrainMesh = baseGroup.userData.terrainMesh; /* לריי-קאסטינג — ראו pickGroundPoint */
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
/* גשרים בין אזורים פתוחים סמוכים — מגיעים בפועל לקצה קו-החוף של כל אזור (לא נמשכים
 * ל"שום מקום" כמו קודם), עם שקע קל באמצע (תחושת גשר חבלים) ואבני-קפיצה/סלעים
 * לאורך הדרך — מחזק את תחושת "ארכיפלג" אחד מחובר */
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
    var dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 1) continue;
    var dirx = dx / dist, dirz = dz / dist;
    var angA = Math.atan2(dz, dx);       /* זווית מ-a אל b, בפריים המקומי של a (אין סיבוב לקבוצות אזור) */
    var angB = Math.atan2(-dz, -dx);     /* זווית מ-b אל a */
    var shoreA = regionShoreDist(i, angA);
    var shoreB = regionShoreDist(i + 1, angB);
    var startX = ca.x + dirx * shoreA, startZ = ca.z + dirz * shoreA;
    var endX = cb.x - dirx * shoreB, endZ = cb.z - dirz * shoreB;
    var span = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endZ - startZ, 2));
    if (span <= 0.6) continue;
    var startY = regionLocalHeight(i, dirx * shoreA, dirz * shoreA) - 0.05;
    var endY = regionLocalHeight(i + 1, -dirx * shoreB, -dirz * shoreB) - 0.05;
    var segs = Math.max(3, Math.round(span / 1.4));
    var rnd = seedRand(i * 5011 + 3);
    var prevPos = null;
    for (var s = 0; s <= segs; s++) {
      var tt = s / segs;
      var px = lerp(startX, endX, tt), pz = lerp(startZ, endZ, tt);
      var sag = Math.sin(Math.PI * tt) * 0.35; /* שקע קל באמצע — גשר חבלים, לא לוח נוקשה */
      var py = lerp(startY, endY, tt) - sag;
      if (prevPos) {
        var segLen = Math.sqrt(Math.pow(px - prevPos.x, 2) + Math.pow(pz - prevPos.z, 2));
        var plank = box(1.05, 0.14, segLen + 0.15, 0x9c7a45, (px + prevPos.x) / 2, (py + prevPos.y) / 2 - 0.06, (pz + prevPos.z) / 2);
        plank.rotation.y = Math.atan2(px - prevPos.x, pz - prevPos.z);
        plank.castShadow = false;
        grp.add(plank);
        if (s % 2 === 0) { /* אבן-קפיצה/סלע קטן מתחת לגשר, מחבר חזותית בין האיים */
          var rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + rnd() * 0.12, 0), mat(0x8a8578));
          rock.position.set(px + (rnd() - 0.5) * 0.6, py - 0.32, pz + (rnd() - 0.5) * 0.6);
          rock.castShadow = true; rock.receiveShadow = true;
          grp.add(rock);
        }
      }
      prevPos = { x: px, z: pz, y: py };
    }
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
/* דעיכת שלטי-שם לפי מרחק (פער B ב-RESEARCH_VISUAL_PRO): ~24 שלטי-חלקה לבנים גדולים
 * סביב האי הם רעש ויזואלי אדיר. שלט קרוב — מלא; מעבר ל-FADE_START דוהה (opacity) וכווץ
 * (scale) עד ~55%, לעולם לא מוסתר לגמרי כדי שהמורה עדיין יראה מי שייך לאיזו חלקה.
 * נקרא רק כל פריים שני (stepFrame) ולא יוצר אף אובייקט — רק traverse + עדכון שדות קיימים. */
var SIGN_FADE_START = 18, SIGN_FADE_RANGE = 12, SIGN_OPACITY_FLOOR = 0.4, SIGN_SCALE_FLOOR = 0.55;
function updatePlotSignLOD() {
  var group = ISL.regionGroups[ISL.activeId];
  if (!group || !ISL.camera) return;
  var camPos = ISL.camera.position;
  group.traverse(function (o) {
    if (!o.userData || !o.userData.isPlotSign) return;
    if (!o.userData.baseScale) o.userData.baseScale = o.scale.clone();
    if (!o.userData.wp) o.userData.wp = new THREE.Vector3();
    o.getWorldPosition(o.userData.wp);
    var d = o.userData.wp.distanceTo(camPos);
    var k = clamp((d - SIGN_FADE_START) / SIGN_FADE_RANGE, 0, 1);
    var base = o.userData.baseScale;
    var sMul = lerp(1, SIGN_SCALE_FLOOR, k);
    o.scale.set(base.x * sMul, base.y * sMul, base.z);
    if (o.material) o.material.opacity = lerp(1, SIGN_OPACITY_FLOOR, k);
  });
}
function updateCamera(dt) {
  ISL.cam.cx = lerp(ISL.cam.cx, ISL.cam.tx, clamp(dt * 1.6, 0, 1));
  ISL.cam.cz = lerp(ISL.cam.cz, ISL.cam.tz, clamp(dt * 1.6, 0, 1));
  if (ISL.ambient) {
    ISL.cam.yaw += dt * 0.06;
  }
  /* נשימת-מצלמה עדינה — תחושת "יד חיה" גם כשאף אחד לא נוגע */
  var te = ISL.clock.elapsed;
  var swayYaw = Math.sin(te * 0.16) * 0.016;
  var swayY = Math.sin(te * 0.42) * 0.1;
  var yaw = ISL.cam.yaw + swayYaw, pitch = ISL.cam.pitch, r = ISL.cam.radius;
  var cx = ISL.cam.cx, cz = ISL.cam.cz;
  ISL.camera.position.set(
    cx + Math.sin(yaw) * Math.cos(pitch) * r,
    Math.sin(pitch) * r + 2 + swayY,
    cz + Math.cos(yaw) * Math.cos(pitch) * r
  );
  ISL.camera.lookAt(cx, 1, cz);
  /* השמש (ומצלמת הצל שלה) עוקבת אחרי מרכז האזור הפעיל — בלי זה
     אזורים חיצוניים בטבעת נשארים בלי צללים בכלל */
  if (ISL.sun) {
    ISL.sun.position.set(cx + 20, 34, cz + 14);
    ISL.sun.target.position.set(cx, 0, cz);
  }
  /* כיפת השמיים + השמש הוויזואלית נגררות עם המצלמה — שמיים "אינסופיים" */
  if (ISL.sky) ISL.sky.position.set(cx, 0, cz);
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
  canvas.addEventListener('wheel', function (e) { ISL.cam.radius = clamp(ISL.cam.radius + e.deltaY * 0.012, 4.5, 70); pauseAmbient(); }, { passive: true });
}
function pauseAmbient() { if (ISL.ambient) ISL.ambientPauseUntil = performance.now() / 1000 + 20; }
function pickPoint(x, y) {
  var rect = ISL.canvas.getBoundingClientRect();
  var mx = ((x - rect.left) / rect.width) * 2 - 1;
  var my = -((y - rect.top) / rect.height) * 2 + 1;
  ISL.raycaster.setFromCamera(new THREE.Vector2(mx, my), ISL.camera);
  return ISL.raycaster;
}
/* בחירת נקודת-קרקע לריי-קאסט: מנסה קודם את מש הטופוגרפיה האמיתי של האזור הפעיל
 * (מדויק גם כשיש גבעה/דיונה), ונופל בחזרה למישור השטוח הבלתי-נראה אם אין התאמה
 * (למשל בזמן טעינה) — כך שבחירת משבצת/בנייה לעולם לא נשברת. */
function pickGroundPoint(ray) {
  var grp = ISL.regionGroups[ISL.activeId];
  var terrain = grp && grp.userData && grp.userData.terrainMesh;
  if (terrain) {
    var hits = ray.intersectObject(terrain);
    if (hits.length) return hits;
  }
  return ray.intersectObject(ISL.groundPlaneMesh);
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
  var hit = pickGroundPoint(ray);
  if (!hit.length) { if (ISL.highlightTile) ISL.highlightTile.visible = false; return; }
  var ctx = activeRegionOriginAndGrid();
  var t = tileFromWorld(hit[0].point.x, hit[0].point.z, ctx);
  if (!t.ok) { if (ISL.highlightTile) ISL.highlightTile.visible = false; return; }
  var half = (ctx.size - 1) / 2;
  var wx = ctx.origin.x + (t.tx - half), wz = ctx.origin.z + (t.tz - half);
  /* גובה הסמן עוקב אחרי הקרקע המקומית (גבעה/דיונה/חלקה) — לא מרחף/שוקע ביחס למה שרואים */
  var markY;
  if (ctx.origin.y != null) {
    markY = ctx.origin.y + 0.2; /* על גבי סיפון החלקה האישית */
  } else {
    var actIdx = regionIndex(ISL.activeId);
    var rc = regionCenter(actIdx);
    markY = (actIdx >= 0 ? regionLocalHeight(actIdx, wx - rc.x, wz - rc.z) : 0) + 0.06;
  }
  ISL.highlightTile.position.set(wx, markY, wz);
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
      if (o.userData && o.userData.noRaycast) continue; /* צל-מגע וכד' — לא ניתן לבחירה בעצמו */
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
  var hit = pickGroundPoint(ray);
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
  /* גיבוי: מרכז האזור/החלקה בקירוב, כולל דגימת גובה הקרקע המקומי */
  if (regionKey.indexOf('plot_') === 0) return new THREE.Vector3(ISL.cam.cx, 0.3, ISL.cam.cz);
  var idx2 = regionIndex(regionKey);
  var c = regionCenter(idx2);
  var half = (GRID - 1) / 2;
  var lx = x - half, lz = z - half;
  var ly = idx2 >= 0 ? regionLocalHeight(idx2, lx, lz) + 0.3 : 0.3;
  return new THREE.Vector3(c.x + lx, ly, c.z + lz);
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
    + '.ak-isl-hud{position:absolute;inset:0;pointer-events:none;font-family:Heebo,Arial,sans-serif;direction:rtl;z-index:5;}'
    + '.ak-isl-top{position:absolute;top:18px;left:0;right:0;display:flex;justify-content:space-between;align-items:flex-start;padding:0 24px;}'
    + '.ak-isl-badge{pointer-events:none;background:rgba(255,250,238,0.94);border:3px solid #a9713f;border-radius:20px;padding:10px 22px;color:#3d2a17;font-weight:900;font-size:30px;box-shadow:0 6px 18px rgba(60,40,20,.28);}'
    + '.ak-isl-region{font-size:48px;font-weight:900;color:#3d2a17;background:rgba(255,250,238,0.94);border:3px solid #a9713f;border-radius:22px;padding:10px 30px;box-shadow:0 6px 18px rgba(60,40,20,.28);}'
    + '.ak-isl-progress-wrap{position:absolute;top:152px;left:50%;transform:translateX(-50%);width:min(70vw,720px);pointer-events:none;}'
    + '.ak-isl-progress-label{color:#2a3550;font-size:28px;font-weight:900;text-align:center;margin-bottom:6px;text-shadow:0 2px 0 rgba(255,255,255,.85);}'
    + '.ak-isl-progress-bar{height:26px;border-radius:14px;background:rgba(255,250,238,0.9);border:3px solid #a9713f;overflow:hidden;}'
    + '.ak-isl-progress-fill{height:100%;background:linear-gradient(90deg,#ffd54a,#ff9a3c);border-radius:14px;transition:width .6s ease;}'
    + '.ak-isl-shop{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:6px;background:rgba(255,250,238,0.94);border:3px solid #a9713f;border-radius:18px;padding:7px 10px;pointer-events:auto;max-width:96vw;overflow-x:auto;}'
    + '.ak-isl-item{flex:0 0 auto;width:96px;text-align:center;color:#3d2a17;background:rgba(169,113,63,0.12);border-radius:12px;padding:5px 6px;cursor:pointer;border:2px solid transparent;font-size:22px;}'
    + '.ak-isl-item .em{font-size:26px;display:block;line-height:1.1;}'
    + '.ak-isl-item .nm{font-size:15px;font-weight:700;margin-top:1px;line-height:1.1;height:2.2em;overflow:hidden;}'
    + '.ak-isl-item .cs{font-size:17px;color:#a06a12;font-weight:800;margin-top:1px;white-space:nowrap;}'
    + '.ak-isl-item.sel{border-color:#c8891f;background:#ffd54a;}'
    + '.ak-isl-item.cant{opacity:.45;}'
    + '.ak-isl-item.del{background:rgba(255,90,90,.18);}'
    + '.ak-isl-hint{position:absolute;bottom:190px;left:50%;transform:translateX(-50%);color:#3d2a17;font-size:30px;font-weight:900;background:rgba(255,250,238,0.94);border:3px solid #a9713f;padding:10px 26px;border-radius:18px;pointer-events:none;box-shadow:0 6px 18px rgba(60,40,20,.28);}'
    + '.ak-isl-ambientflag{position:absolute;top:18px;left:24px;font-size:28px;color:#fff;background:rgba(255,213,74,.85);color:#3a2c00;font-weight:900;padding:8px 18px;border-radius:16px;display:none;}'
    + '.ak-isl-ambientflag.on{display:block;}'
    + '.ak-isl-regions{position:absolute;top:96px;left:50%;transform:translateX(-50%);display:flex;gap:6px;background:rgba(255,250,238,0.94);border:3px solid #a9713f;border-radius:16px;padding:6px 10px;pointer-events:auto;max-width:94vw;overflow-x:auto;}.ak-isl-rchip{white-space:nowrap;font-size:20px;font-weight:900;color:#3d2a17;background:rgba(169,113,63,0.14);border-radius:12px;padding:5px 14px;cursor:pointer;border:2px solid transparent;}.ak-isl-rchip.on{border-color:#c8891f;background:#ffd54a;}.ak-isl-rchip.lock{opacity:.45;cursor:not-allowed;}.ak-isl-plots{position:absolute;bottom:126px;left:50%;transform:translateX(-50%);display:flex;gap:8px;background:rgba(255,250,238,0.94);border:3px solid #a9713f;border-radius:20px;padding:8px 14px;pointer-events:auto;max-width:90vw;overflow-x:auto;}'
    + '.ak-isl-plot-chip{white-space:nowrap;font-size:18px;font-weight:900;color:#3d2a17;background:rgba(169,113,63,0.14);border-radius:12px;padding:4px 12px;cursor:pointer;border:2px solid transparent;}'
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
    '<div class="ak-isl-regions" data-role="regions"></div>' +
    '<div class="ak-isl-plots" data-role="plots"></div>' +
    '<div class="ak-isl-shop" data-role="shop"></div>';
  /* ויניטה קולנועית עדינה — ממקדת את העין למרכז, בלי לגעת בקריאות ה-HUD */
  var vin = document.createElement('div');
  vin.className = 'ak-isl-vignette';
  vin.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;' +
    'background:radial-gradient(ellipse 130% 105% at 50% 42%, transparent 62%, rgba(16,36,72,0.20) 100%);';
  container.appendChild(vin);
  container.appendChild(hud);
  ISL.hud = {
    root: hud,
    coins: hud.querySelector('[data-role=coins]'),
    region: hud.querySelector('[data-role=region]'),
    regions: hud.querySelector('[data-role=regions]'),
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
  renderRegionNav();
}
/* סרגל ניווט בין אזורים — בלעדיו אין שום דרך לעבור לאזורים האחרים
 * (focusRegion היה קיים ב-API אבל בלי ממשק). אזור נעול מוצג עם המחיר. */
function renderRegionNav() {
  if (!ISL.hud || !ISL.hud.regions) return;
  var klass = activeClass();
  var isl = klass ? ensureIslandState(klass) : { regions: ['beach'], coins: 0, spent: 0 };
  var el = ISL.hud.regions;
  el.innerHTML = '';
  for (var i = 0; i < REGION_DEFS.length; i++) {
    (function (def) {
      var unlocked = isl.regions.indexOf(def.id) >= 0;
      var d = document.createElement('div');
      d.className = 'ak-isl-rchip' + (def.id === ISL.activeId ? ' on' : '') + (unlocked ? '' : ' lock');
      d.innerHTML = unlocked
        ? (def.icon + ' ' + def.name)
        : ('🔒 ' + def.icon + ' ' + def.threshold);
      d.onclick = function () {
        if (!unlocked) { akToast('האזור נפתח ב-' + def.threshold + ' אבני בנייה 🔒'); akSound('error'); return; }
        focusRegionInternal(def.id, false);
        renderRegionNav();
      };
      el.appendChild(d);
    })(REGION_DEFS[i]);
  }
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
  /* בלי tone-mapping ובלי sRGB output — צבעי החומרים בכל הקבצים הם hex-ים של sRGB
     שמכוילים לסגנון מצויר רווי; ACES/sRGB כפול שוטפים את הסצנה לחלבי (נבדק) */
  ISL.renderer = renderer;
  var scene = new THREE.Scene();
  var farEdge = RING_R0 + REGION_DEFS.length * RING_STEP + 40;
  /* ערפל דחוי — התחלה קרובה מדי צובעת את כל הים במרחק־ביניים בחלבי ומוחקת רוויה */
  scene.fog = new THREE.Fog(0xc8e6fa, farEdge * 0.6, farEdge * 1.45);
  ISL.scene = scene;
  scene.add(buildSky());
  var camera = new THREE.PerspectiveCamera(50, 1, 0.1, farEdge * 2.2);
  ISL.camera = camera;
  ISL.hemi = new THREE.HemisphereLight(0xffffff, 0x2a5a3a, 0.5); scene.add(ISL.hemi);
  var sun = new THREE.DirectionalLight(0xfff2d0, 1.25);
  sun.position.set(20, 34, 14); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28; sun.shadow.camera.right = 28; sun.shadow.camera.top = 28; sun.shadow.camera.bottom = -28;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0005;
  scene.add(sun); scene.add(sun.target); ISL.sun = sun;
  var sea = buildSea(); scene.add(sea); ISL.sea = sea;
  buildClouds(scene);
  buildBirds(scene);
  buildBoats(scene);
  buildPollen(scene);
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
  updateBoats(t);
  updatePollen(t);
  updateDayNight(t, ISL.scene);
  updateAnims(dt);
  ISL.signFrame = (ISL.signFrame | 0) + 1;
  if (ISL.signFrame % 2 === 0) updatePlotSignLOD();

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
  /* groundHeightAt(x,z,regionId?) — גובה הקרקע המקומי בנקודת עולם (x,z), לפי הטופוגרפיה
   * האורגנית (גבעה מרכזית/דיונות/מדרגות-חוף) של regionId (ברירת מחדל: האזור הפעיל).
   * מיועד למודולים אחרים (כגון island-life.js) שמציבים מסקוט/עץ/דמויות ורוצים לשבת
   * נכון על הטופוגרפיה במקום y=0 קבוע. ראו js/island-terrain.README.md לדוגמת שימוש. */
  groundHeightAt: function (x, z, regionId) {
    var id = regionId || ISL.activeId || 'beach';
    var idx = regionIndex(id);
    if (idx < 0) return 0;
    var c = regionCenter(idx);
    return regionLocalHeight(idx, x - c.x, z - c.z);
  },
  setAmbient: function (on) {
    ISL.ambient = !!on;
    ISL.ambientTimer = 0; ISL.ambientNextSwap = 10;
    ISL.ambientPauseUntil = 0;
    if (ISL.hud) ISL.hud.ambientflag.className = 'ak-isl-ambientflag' + (ISL.ambient ? ' on' : '');
  }
};

})();
