/* =====================================================================================
 *  אקדמיית כוכבים — island-life.js — מזריק חיים לאי (מודול נפרד, לא נוגע ב-island-engine.js)
 *  ---------------------------------------------------------------------------------
 *  חוזה: window.IslandLife = { attach(ISL), tick(t,dt), detach(), setReducedMotion(bool) }.
 *  attach(ISL) מקבל את ה-state הפנימי החי של island-engine.js (הפניה ישירה, לא עותק) —
 *  scene/camera/regionGroups/regionTier/activeId/clock/ambient/container. המתאם מוסיף
 *  שלוש שורות קריאה ל-island-engine.js (ראו island-life.README.md), ואנחנו לא נוגעים בקובץ הזה.
 *  אם build3DCharacter/window.AK/window.IslandLife תלויות חסרות — מתדרדר בעדינות, לא קורס.
 *  Vanilla ES5, IIFE יחיד, Three.js r128 גלובלי בלבד. בלי תלויות חדשות.
 * ===================================================================================== */
(function () {
'use strict';

if (typeof THREE === 'undefined') {
  console.error('[IslandLife] THREE.js לא נמצא — מודול החיים מבוטל.');
  window.IslandLife = { attach: function () {}, tick: function () {}, detach: function () {}, setReducedMotion: function () {} };
  return;
}

/* ===================================================================================
 * 1. קבועים — שכפול מכוון של קבועי island-engine.js (הם "מקור אמת" קבוע לפי ה-README,
 *    אז שכפול כאן בטוח ולא שובר סנכרון; אנחנו לא יכולים לייבא אותם כי הם פרטיים ל-IIFE שם).
 * =================================================================================== */
var GRID = 14, HALF = (GRID - 1) / 2;
var PLOT = 3;
var RING_R0 = 30, RING_STEP = 7.5;
var ANGLE_STEP = (Math.PI * 2) / 8;
var REGION_IDS = ['beach', 'forest', 'farm', 'village', 'mountain', 'desert', 'volcano', 'sky'];
var REGION_NAME = { beach: 'חוף הכוכבים', forest: 'יער הלחישות', farm: 'חוות האלופים', village: 'כפר הידע', mountain: 'הר הקרח', desert: 'מדבר הזהב', volcano: 'הר האש', sky: 'איי השמיים' };
var REGION_THRESHOLDS = [0, 120, 300, 520, 780, 1050, 1350, 1700];
function regionIndex(id) { return REGION_IDS.indexOf(id); }
function regionCenter(idx) { var a = idx * ANGLE_STEP, r = RING_R0 + idx * RING_STEP; return { x: Math.cos(a) * r, z: Math.sin(a) * r }; }

/* מין העץ הבוטני לכל אזור — מוטיבים ארץ-ישראליים (RESEARCH.md פרק 7) */
var TREE_SPECIES = {
  beach: { name: 'דקל', trunk: 0x8a5a2b, trunkDk: 0x6b4220, canopy: [0x2f9e44, 0x3fb457, 0x27853a], fruit: null },
  forest: { name: 'אלון', trunk: 0x6b4423, trunkDk: 0x4f3119, canopy: [0x2f6a30, 0x3f8b3f, 0x4fae4a], fruit: 0x8a5a2b },
  farm: { name: 'זית', trunk: 0x9a8a68, trunkDk: 0x7a6a4a, canopy: [0x8a9a5a, 0x9aac6a, 0x7c8c4c], fruit: 0x3a3a2a },
  village: { name: 'רימון', trunk: 0x7a5a3a, trunkDk: 0x5c4128, canopy: [0x3f8b3f, 0x4fae4a, 0x357a35], fruit: 0xcc2244 },
  mountain: { name: 'ארז', trunk: 0x5a4632, trunkDk: 0x40311f, canopy: [0x1f4a2f, 0x2a5a3a, 0x163a24], fruit: 0x6a4a2a },
  desert: { name: 'תמר', trunk: 0x9a6a3a, trunkDk: 0x7a4f28, canopy: [0x4a8a3a, 0x5a9a4a, 0x3d7530], fruit: 0x7a3a1a },
  volcano: { name: 'חרוב', trunk: 0x3a2a22, trunkDk: 0x241b16, canopy: [0x2a4a2a, 0x3a5a2a, 0x203a20], fruit: 0x2a1a10 },
  sky: { name: 'עץ קסום', trunk: 0xd8c8ff, trunkDk: 0xb8a0ff, canopy: [0xe8e0ff, 0xfff6e0, 0xffe0f5], fruit: 0xffe08a }
};

/* טבלת חגים — טווחי תאריכים לועזיים (חובה קשיחה מותרת מפורשות לפי המשימה).
 * 2026–2028 מבוססים על חיפוש מאומת (Chabad/Hebcal); 2029 נגזר מקירוב אורך-חודש
 * סטנדרטי עם טווח מורחב לביטחון. יש לוודא/לעדכן מדי שנה מול לוח שנה עברי רשמי. */
var HOLIDAY_TABLE = {
  2026: { /* שנה"ל תשפ"ז — 5787 (מעוברת) */
    sukkot: ['2026-09-26', '2026-10-04'], hanukkah: ['2026-12-05', '2026-12-13'],
    tuBishvat: ['2027-01-22', '2027-01-24'], purim: ['2027-03-21', '2027-03-23'],
    pesach: ['2027-04-21', '2027-04-29'], yomHaatzmaut: ['2027-05-11', '2027-05-13']
  },
  2027: { /* תשפ"ח — 5788 */
    sukkot: ['2027-10-15', '2027-10-23'], hanukkah: ['2027-12-24', '2028-01-01'],
    tuBishvat: ['2028-02-11', '2028-02-13'], purim: ['2028-03-10', '2028-03-12'],
    pesach: ['2028-04-10', '2028-04-18'], yomHaatzmaut: ['2028-05-01', '2028-05-03']
  },
  2028: { /* תשפ"ט — 5789 */
    sukkot: ['2028-10-04', '2028-10-12'], hanukkah: ['2028-12-12', '2028-12-21'],
    tuBishvat: ['2029-01-29', '2029-02-02'], purim: ['2029-02-27', '2029-03-03'],
    pesach: ['2029-03-30', '2029-04-07'], yomHaatzmaut: ['2029-04-18', '2029-04-22']
  },
  2029: { /* תש"ץ — 5790 (מעוברת, נגזר) */
    sukkot: ['2029-09-24', '2029-10-02'], hanukkah: ['2029-12-03', '2029-12-11'],
    tuBishvat: ['2030-01-18', '2030-01-22'], purim: ['2030-03-17', '2030-03-23'],
    pesach: ['2030-04-17', '2030-04-24'], yomHaatzmaut: ['2030-05-07', '2030-05-11']
  }
};

var REDUCED_MOTION = false;
try { REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}

/* ===================================================================================
 * 2. עזרי בטיחות — עצמאיים לגמרי מ-island-engine.js (אין גישה לפנימיות שלו חוץ מ-ISL עצמו)
 * =================================================================================== */
function AKref() { return window.AK || null; }
function activeClass() { var ak = AKref(); if (ak && typeof ak.getActiveClass === 'function') { try { return ak.getActiveClass(); } catch (e) {} } return null; }
function akSave() { var ak = AKref(); if (ak && typeof ak.save === 'function') { try { ak.save(); } catch (e) {} } }
function akToast(msg) { var ak = AKref(); if (ak && typeof ak.toast === 'function') { try { ak.toast(msg); } catch (e) {} } }
function akSound(t) { var ak = AKref(); if (ak && typeof ak.playSound === 'function') { try { ak.playSound(t); } catch (e) {} } }
function akConfetti(x, y, n) { var ak = AKref(); if (ak && typeof ak.burstConfetti === 'function') { try { ak.burstConfetti(x, y, n); } catch (e) {} } }
function akEsc(s) { var ak = AKref(); if (ak && typeof ak.escapeHtml === 'function') { try { return ak.escapeHtml(s); } catch (e) {} } return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

function ensureLifeState(klass) {
  klass.island = klass.island || {};
  var isl = klass.island;
  if (typeof isl.coins !== 'number') isl.coins = 0;
  if (typeof isl.spent !== 'number') isl.spent = 0;
  if (!isl.regions || !isl.regions.length) isl.regions = ['beach'];
  if (!isl.items) isl.items = [];
  if (typeof isl.level !== 'number') isl.level = 1;
  if (!isl.history) isl.history = [];
  if (!isl.pet || typeof isl.pet !== 'object') isl.pet = {};
  isl.pet.stage = typeof isl.pet.stage === 'number' ? isl.pet.stage : 0;
  isl.pet.fine = typeof isl.pet.fine === 'number' ? isl.pet.fine : 0;
  isl.pet.lastGrow = typeof isl.pet.lastGrow === 'number' ? isl.pet.lastGrow : 0;
  isl.pet.born = typeof isl.pet.born === 'number' ? isl.pet.born : 0;
  if (!isl.pet.monthMark || typeof isl.pet.monthMark !== 'object') isl.pet.monthMark = { stage: 0, t: 0 };
  if (!isl.tree || typeof isl.tree !== 'object') isl.tree = {};
  return isl;
}
function totalEarned(isl) { return (isl.coins || 0) + (isl.spent || 0); }
function ensureTreeEntry(isl, regionId) {
  if (!isl.tree[regionId] || typeof isl.tree[regionId] !== 'object') isl.tree[regionId] = {};
  var t = isl.tree[regionId];
  if (typeof t.stage !== 'number') t.stage = 0;
  if (typeof t.fine !== 'number') t.fine = 0;
  if (typeof t.lastGrow !== 'number') t.lastGrow = 0;
  if (!t.monthMark || typeof t.monthMark !== 'object') t.monthMark = { stage: 0, t: 0 };
  return t;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function hash01(str) { var h = 0; str = String(str); for (var i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; } return ((h % 1000) + 1000) % 1000 / 1000; }
function seedRand(seed) { var s = (seed >>> 0) || 1; return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

/* ===================================================================================
 * 3. עזרי Three.js — mesh/label בסיסיים (עותק עצמאי, קטן, בסגנון island-engine.js)
 * =================================================================================== */
function mat(c, opts) { opts = opts || {}; var m = new THREE.MeshLambertMaterial({ color: c }); if (opts.transparent) { m.transparent = true; m.opacity = opts.opacity == null ? 0.6 : opts.opacity; } if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity == null ? 0.6 : opts.emissiveIntensity; } return m; }
function box(w, h, d, c, x, y, z) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true; return m; }
function sph(r, c, x, y, z, segs) { var m = new THREE.Mesh(new THREE.SphereGeometry(r, segs || 10, segs || 8), mat(c)); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; return m; }
function cone(r, h, c, x, y, z, segs) { var m = new THREE.Mesh(new THREE.ConeGeometry(r, h, segs || 8), mat(c)); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; return m; }
function cyl(rt, rb, h, c, x, y, z, segs) { var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segs || 8), mat(c)); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; return m; }
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
/* תווית טקסט זולה — canvas -> sprite, עברית RTL, קונטרסט גבוה (SPEC §5.2) */
function makeSprite(text, opts) {
  opts = opts || {};
  var scale = 2, padX = 18, padY = 10, fontSize = opts.fontSize || 30;
  var cvs = document.createElement('canvas'); var ctx = cvs.getContext('2d');
  ctx.font = '900 ' + fontSize + 'px Heebo, Arial, sans-serif';
  var w = Math.ceil(ctx.measureText(text).width) + padX * 2, h = fontSize + padY * 2;
  cvs.width = w * scale; cvs.height = h * scale;
  ctx = cvs.getContext('2d'); ctx.scale(scale, scale);
  ctx.font = '900 ' + fontSize + 'px Heebo, Arial, sans-serif';
  ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (!opts.noBg) { ctx.fillStyle = opts.bg || 'rgba(20,20,20,0.6)'; roundRect(ctx, 2, 2, w - 4, h - 4, 10); ctx.fill(); }
  ctx.fillStyle = opts.color || '#ffffff';
  ctx.fillText(text, w / 2, h / 2 + 1);
  var tex = new THREE.CanvasTexture(cvs); tex.minFilter = THREE.LinearFilter;
  var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: opts.depthTest !== false, sizeAttenuation: opts.sizeAttenuation !== false }));
  var worldH = opts.worldHeight || 0.5;
  spr.scale.set(worldH * (w / h), worldH, 1);
  spr.userData.tex = tex; spr.userData.w = w; spr.userData.h = h; spr.userData.baseCtx = ctx;
  return spr;
}
/* עיגול-תג צבעוני עם ראשי-תיבות — impostor זול לתלמידים רחוקים מהמצלמה */
function badgeSprite(letter, colorHex) {
  var scale = 2, size = 64;
  var cvs = document.createElement('canvas'); cvs.width = size * scale; cvs.height = size * scale;
  var ctx = cvs.getContext('2d'); ctx.scale(scale, scale);
  var col = '#' + ('000000' + colorHex.toString(16)).slice(-6);
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = col; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 30px Arial, Rubik, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(letter, size / 2, size / 2 + 2);
  var tex = new THREE.CanvasTexture(cvs); tex.minFilter = THREE.LinearFilter;
  var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  spr.scale.set(0.62, 0.62, 1);
  return spr;
}

/* ===================================================================================
 * 4. מצב המודול (LIFE) — הכל מה שהקובץ הזה מנהל, נפרד לגמרי מ-ISL
 * =================================================================================== */
var LIFE = {
  attached: false, ISL: null, group: null, reducedMotion: REDUCED_MOTION,
  villagers: [], villagerById: {}, fullRigCache: {}, fullRigOrder: [],
  petObj: null, trees: {},
  weather: { type: 'sun', mesh: {}, dwell: 0, next: 8 + Math.random() * 10, rainbow: null, rainbowT: 0 },
  season: 'summer', seasonProps: {},
  growthQueue: [], overlay: null, overlayTimer: 0,
  dailyBaseline: { day: '', map: {} },
  lastPeriodic: 0, lastLodSweep: 0, lastHoliday: '',
  lastCounts: { items: -1, regions: -1 },
  discovery: { ship: null, shipT: 25, merchant: null, merchantT: -1, star: null, starT: 12, bottle: null, bottleT: 35 },
  mood: 0.5, cheerUntil: 0, cheerTargets: [],
  holidayGroup: null, holidayActive: {},
  clockT: 0
};

function scene() { return LIFE.ISL && LIFE.ISL.scene; }
function camPos() { return LIFE.ISL && LIFE.ISL.camera ? LIFE.ISL.camera.position : new THREE.Vector3(0, 10, 20); }
/* אזורים שכרגע ברמת 'full' (מפורט) — רק שם יש טעם להציג חיים תלת-מימדיים מלאים */
function fullRegionIds() {
  var out = [];
  var ISL = LIFE.ISL; if (!ISL || !ISL.regionTier) return out;
  for (var i = 0; i < REGION_IDS.length; i++) if (ISL.regionTier[REGION_IDS[i]] === 'full') out.push(REGION_IDS[i]);
  return out;
}
function activeIslState() { var k = activeClass(); return k ? ensureLifeState(k) : null; }

/* ===================================================================================
 * 5. תושבים — 24 התלמידים כדמויות תלת-מימדיות אמיתיות (build3DCharacter הקיים)
 * =================================================================================== */
var MAX_FULL_VILLAGERS = 8;      /* LOD: כמה דמויות מלאות בו-זמנית (הועלה 6->8 לפי המשימה) */
var VILLAGER_SCALE = 0.36;   /* קטנטנות — 0.58 היה גדול מדי ביחס למבנים ולאי */
var _tempCharScene = null;
function tempCharScene() { if (!_tempCharScene) _tempCharScene = new THREE.Scene(); return _tempCharScene; }

/* בונה rig מלא לתלמיד/ה דרך build3DCharacter הקיים — משתמש בסצנה זמנית כי
 * build3DCharacter מנקה את ה-scene שמקבל ומזריק אליה תאורה משלו; לא ניתן להעביר
 * את סצנת האי עצמה (זה ימחק את כל האי!). מוציאים משם רק את charGroup + חיית המחמד. */
/* מחזיר {rig, pet} — pet הוא Group נפרד (לא מקונן בתוך ה-rig!) כדי שאפשר יהיה למקם אותו
 * בעולם עצמאית (טרייל-מעקב אחרי הבעלים, ראו updatePetTrail/applyVillagerTransform) בלי
 * להתמודד עם ה-scale/offset הפנימיים של גוף הדמות. null אם אין חיית מחמד מצוידת. */
function buildFullRig(student) {
  if (typeof window.build3DCharacter !== 'function') return null;
  var ts = tempCharScene();
  while (ts.children.length) ts.remove(ts.children[0]);
  var charGroup;
  try { charGroup = window.build3DCharacter(ts, student.equipped || {}, 0); } catch (e) { console.warn('[IslandLife] build3DCharacter נכשל עבור ' + student.name, e); return null; }
  if (!charGroup) return null;
  ts.remove(charGroup);
  var petNode = null;
  var extras = ts.children.slice();
  for (var i = 0; i < extras.length; i++) {
    var o = extras[i];
    ts.remove(o);
    if (o.isLight) continue; /* תאורה נזרקת — לא רוצים 5 אורות חדשים לכל תלמיד בסצנת האי */
    if (!petNode) petNode = o; /* build3DCharacter מוסיפה לכל היותר חיית מחמד אחת */
  }
  while (ts.children.length) ts.remove(ts.children[0]);
  /* נירמול גובה: הרגליים נוחתות על y=0 בתוך ה-rig, לא משנה מה ה-offset הפנימי של build3DCharacter.
   * bbox של charGroup בלבד (לא כולל חיית מחמד) כדי שאאורות מהבהבות (אש/קרח/טבעת-קדושה)
   * שמתפשטות מתחת לרגליים לא "יתפסו" כרצפה ויגרמו לדמות לרחף/לשקוע — עם קלאמפ שפוי כרשת ביטחון
   * נוספת למקרה שגם charGroup עצמו כולל עיטור אאורה קיצוני. */
  var box3 = new THREE.Box3().setFromObject(charGroup);
  var footY = isFinite(box3.min.y) ? box3.min.y : -2.08;
  if (footY < -3.2 || footY > -1.2) footY = -2.08; /* ברירת מחדל: רגל טיפוסית ~-1.3(charGroup)+ -0.78(נעל) */
  var content = new THREE.Group();
  content.add(charGroup);
  content.position.y -= footY;
  var rig = new THREE.Group();
  rig.add(content);
  rig.scale.setScalar(VILLAGER_SCALE);
  rig.userData.isFullRig = true;
  var petWrap = null;
  if (petNode) {
    var pbox = new THREE.Box3().setFromObject(petNode);
    var petFootY = isFinite(pbox.min.y) ? pbox.min.y : -0.5;
    if (petFootY < -2 || petFootY > 0.5) petFootY = -0.5;
    petNode.position.y -= petFootY;
    petWrap = new THREE.Group();
    petWrap.add(petNode);
    petWrap.scale.setScalar(VILLAGER_SCALE);
  }
  return { rig: rig, pet: petWrap };
}
function equippedKey(student) { try { return student.id + '|' + JSON.stringify(student.equipped || {}); } catch (e) { return student.id; } }
/* קאש LRU קטן — עד 10 rigs מלאים בזיכרון; בנייה חדשה מוגבלת לאחת לפריים כדי לא לגמגם */
var FULLRIG_CACHE_CAP = 10;
var _rigBuildQueue = [];
/* onReady מקבל {rig, pet} — pet יכול להיות null אם אין חיית מחמד מצוידת */
function requestFullRig(student, onReady) {
  var key = equippedKey(student);
  var cached = LIFE.fullRigCache[key];
  if (cached) { touchRigCache(key); onReady(cached); return; }
  _rigBuildQueue.push({ key: key, student: student, cb: onReady });
}
function touchRigCache(key) {
  var idx = LIFE.fullRigOrder.indexOf(key);
  if (idx >= 0) LIFE.fullRigOrder.splice(idx, 1);
  LIFE.fullRigOrder.push(key);
}
function processRigQueue() {
  if (!_rigBuildQueue.length) return;
  var job = _rigBuildQueue.shift();
  var key = job.key;
  if (LIFE.fullRigCache[key]) { touchRigCache(key); job.cb(LIFE.fullRigCache[key]); return; }
  var built = buildFullRig(job.student);
  if (!built || !built.rig) return;
  LIFE.fullRigCache[key] = built;
  touchRigCache(key);
  if (LIFE.fullRigOrder.length > FULLRIG_CACHE_CAP) {
    var oldKey = LIFE.fullRigOrder.shift();
    var old = LIFE.fullRigCache[oldKey];
    if (old) { if (old.rig) disposeObj(old.rig); if (old.pet) disposeObj(old.pet); }
    delete LIFE.fullRigCache[oldKey];
  }
  job.cb(built);
}
function disposeObj(o) {
  if (!o) return;
  o.traverse(function (n) {
    if (n.geometry && n.geometry.dispose) n.geometry.dispose();
    if (n.material) {
      var mats = Array.isArray(n.material) ? n.material : [n.material];
      mats.forEach(function (m) { if (m.map) m.map.dispose(); if (m.dispose) m.dispose(); });
    }
  });
}

/* ===================================================================================
 * 5א. מיני-דמות אימפוסטור — קפסולת-גוף (צינור+שתי כיפות) + ראש + כיפת-שיער, במקום
 *     עיגול-תג-על-מקל הישן. גיאומטריה משותפת (נבנית פעם אחת) + קאש חומרים גלובלי
 *     לפי צבע (לא יוצרים Material חדש לכל תלמיד אם הצבע חוזר) — תקציב ~30-40 משולשים.
 * =================================================================================== */
var IMP_CAP_R = 0.15;                                                        /* רדיוס הקפסולה */
var IMP_CYL_H = 0.30;                                                        /* גובה הצינור הישר באמצע */
var IMP_CYL_GEO = new THREE.CylinderGeometry(IMP_CAP_R, IMP_CAP_R, IMP_CYL_H, 6, 1, true);
var IMP_CAP_GEO = new THREE.SphereGeometry(IMP_CAP_R, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2); /* חצי-כדור עליון; הופך לתחתית ע"י rotation.x=PI */
var IMP_HEAD_GEO = new THREE.SphereGeometry(0.17, 8, 6);                     /* ראש — כדור מלא, משותף */
var IMP_HAIR_GEO = new THREE.SphereGeometry(0.15, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2); /* כיפת-שיער — חצי-כדור נפרד */
var _impMatCache = {}; /* Map גלובלי: צבע-hex -> MeshLambertMaterial, קאש לפי צבע (סעיף 3 עקרון #2) */
function impMat(colorHex) {
  var key = 'c' + colorHex;
  if (!_impMatCache[key]) _impMatCache[key] = new THREE.MeshLambertMaterial({ color: colorHex });
  return _impMatCache[key];
}
/* פלטת ברירת-מחדל עליזה — לתלמיד/ה בלי צבע חולצה מצויד, נבחר דטרמיניסטית לפי hash של השם */
var IMP_DEFAULT_PALETTE = [0xff6b6b, 0xffa94d, 0xffd43b, 0x69db7c, 0x4dabf7, 0x9775fa, 0xff8fab, 0x63e6be];
function defaultImpColor(seedStr) { return IMP_DEFAULT_PALETTE[Math.floor(hash01(seedStr) * IMP_DEFAULT_PALETTE.length) % IMP_DEFAULT_PALETTE.length]; }
/* צל-מגע משותף — דיסקה כהה שקופה מתחת לכל תושב (גיאומטריה+חומר יחידים, לא נוצרים מחדש) */
var CONTACT_SHADOW_GEO = new THREE.CircleGeometry(0.34, 12);
CONTACT_SHADOW_GEO.rotateX(-Math.PI / 2); /* שוכב שטוח על XZ, פונה למעלה */
var CONTACT_SHADOW_MAT = new THREE.MeshBasicMaterial({ color: 0x140f08, transparent: true, opacity: 0.25, depthWrite: false });
function makeContactShadow() {
  var m = new THREE.Mesh(CONTACT_SHADOW_GEO, CONTACT_SHADOW_MAT);
  m.position.y = 0.02; m.renderOrder = -1;
  return m;
}

function makeImpostor(student) {
  var g = new THREE.Group();
  var color = 0x66ccff, skinColor = 0xffd9a8, hairCol = 0x6b3410, hasShirt = false;
  try {
    var bodyItem = window.findItem && window.findItem(student.equipped && student.equipped.body);
    if (bodyItem) {
      if (bodyItem.shirt != null) { color = bodyItem.shirt; hasShirt = true; }
      if (bodyItem.skin != null) skinColor = bodyItem.skin;
      if (bodyItem.hair != null) hairCol = bodyItem.hair;
    }
  } catch (e) {}
  if (!hasShirt) color = defaultImpColor(student.name || student.id || 'x'); /* אין צבע מצויד — פלטת ברירת-מחדל */
  var bodyM = impMat(color), skinM = impMat(skinColor), hairM = impMat(hairCol);

  /* קפסולה מדומה: צינור ישר + שתי כיפות חצי-כדור (התחתונה — אותה גיאומטריה הפוכה) */
  var cylY = IMP_CAP_R + IMP_CYL_H / 2;
  var body = new THREE.Mesh(IMP_CYL_GEO, bodyM); body.position.y = cylY; body.castShadow = true; g.add(body);
  var capBottom = new THREE.Mesh(IMP_CAP_GEO, bodyM); capBottom.position.y = IMP_CAP_R; capBottom.rotation.x = Math.PI; g.add(capBottom);
  var capTop = new THREE.Mesh(IMP_CAP_GEO, bodyM); capTop.position.y = cylY + IMP_CYL_H / 2; g.add(capTop);

  /* ראש בצבע עור, יושב ישר על קודקוד הקפסולה */
  var headY = cylY + IMP_CYL_H / 2 + 0.17;
  var head = new THREE.Mesh(IMP_HEAD_GEO, skinM); head.position.y = headY; head.castShadow = true; g.add(head);

  /* כיפת-שיער — חצי-כדור נפרד, מעט גדול ושטוח, בלעדיו הדמויות הרחוקות נראו קירחות */
  var hair = new THREE.Mesh(IMP_HAIR_GEO, hairM);
  hair.position.y = headY + 0.03; hair.scale.set(1.12, 0.8, 1.12); g.add(hair);

  g.userData.impostor = true; g.userData.headMesh = head; g.userData.bodyColor = color;
  return g;
}

function makeVillager(student, idx) {
  var v = {
    id: student.id, student: student, idx: idx,
    homeRegion: null, pos: { x: 0, z: 0 }, target: { x: 0, z: 0 }, rot: 0,
    speed: 1.1 + hash01(student.id + 'sp') * 0.6,
    state: 'idle', stateT: 0, stateDur: 2 + hash01(student.id + 'd0') * 3,
    lod: 'none', rig: null, impostor: null, nameSprite: null, heart: null,
    happy: false, jumpPhase: hash01(student.id + 'j') * 10,
    petTrail: [], hasPet: false, petWrap: null,
    wrapper: null /* THREE.Group שנוסף לסצנה — position/rotation מתעדכנים כל פריים */
  };
  v.wrapper = new THREE.Group();
  v.wrapper.visible = false;
  v.shadow = makeContactShadow(); v.wrapper.add(v.shadow); /* צל-מגע — קבוע לאורך חיי התושב, לא תלוי ב-LOD */
  return v;
}

function assignHomes() {
  var full = fullRegionIds();
  if (!full.length) return;
  for (var i = 0; i < LIFE.villagers.length; i++) {
    var v = LIFE.villagers[i];
    var region = full[i % full.length];
    if (v.homeRegion !== region) {
      v.homeRegion = region;
      var c = regionCenter(regionIndex(region));
      var rnd = seedRand(hash01(v.id) * 100000 + 1);
      var ang = rnd() * Math.PI * 2, rad = 1.5 + rnd() * (GRID / 2 - 1.5);
      v.pos.x = c.x + Math.cos(ang) * rad; v.pos.z = c.z + Math.sin(ang) * rad;
      v.target.x = v.pos.x; v.target.z = v.pos.z;
    }
  }
}

/* מיקום "הבית" של תלמיד/ה בחלקה האישית — שכפול מדויק של הנוסחה ב-buildPersonalPlots
 * של island-engine.js (טבעת סביב האזור הפעיל), רק כדי לדעת לאן ללכת מדי פעם */
function plotHomeOf(student, students, activeId) {
  var n = students.length; if (!n) return null;
  var i = -1;
  for (var k = 0; k < n; k++) if (students[k].id === student.id) { i = k; break; }
  if (i < 0) return null;
  var idx = regionIndex(activeId); if (idx < 0) return null;
  var c = regionCenter(idx);
  var plotR = GRID / 2 + 3.2;
  var angle = (i / n) * Math.PI * 2;
  return { x: c.x + Math.cos(angle) * plotR, z: c.z + Math.sin(angle) * plotR };
}

function syncVillagerRoster() {
  var klass = activeClass();
  var students = (klass && klass.students) || [];
  var seen = {};
  for (var i = 0; i < students.length; i++) {
    var s = students[i]; seen[s.id] = true;
    if (!LIFE.villagerById[s.id]) {
      var v = makeVillager(s, i);
      LIFE.villagerById[s.id] = v;
      LIFE.villagers.push(v);
      if (LIFE.group) LIFE.group.add(v.wrapper);
    } else {
      LIFE.villagerById[s.id].student = s; /* points/equipped יכולים להשתנות */
    }
  }
  /* תלמיד/ה שהוסרו מהכיתה (נדיר) — ניקוי */
  for (var j = LIFE.villagers.length - 1; j >= 0; j--) {
    if (!seen[LIFE.villagers[j].id]) {
      var rem = LIFE.villagers[j];
      if (rem.wrapper && LIFE.group) LIFE.group.remove(rem.wrapper);
      if (rem.petWrap && LIFE.group) LIFE.group.remove(rem.petWrap);
      LIFE.villagers.splice(j, 1);
      delete LIFE.villagerById[rem.id];
    }
  }
  assignHomes();
}

/* בחירת עד MAX_FULL_VILLAGERS תלמידים לפירוט מלא — הקרובים ביותר למצלמה, בין אלו
 * שהאזור-בית שלהם כרגע ב-'full' tier. שאר התלמידים מקבלים impostor זול (Sprite). */
function updateLod() {
  var cp = camPos();
  var candidates = [];
  for (var i = 0; i < LIFE.villagers.length; i++) {
    var v = LIFE.villagers[i];
    if (!v.homeRegion) { v.wrapper.visible = false; continue; }
    var dx = v.pos.x - cp.x, dz = v.pos.z - cp.z, dy = 0 - cp.y;
    v.distSq = dx * dx + dz * dz + dy * dy * 0.2;
    candidates.push(v);
  }
  candidates.sort(function (a, b) { return a.distSq - b.distSq; });
  for (var k = 0; k < candidates.length; k++) {
    var want = k < MAX_FULL_VILLAGERS ? 'full' : 'impostor';
    var v2 = candidates[k];
    v2.wrapper.visible = true;
    if (v2.lod !== want) setVillagerLod(v2, want);
  }
}
function detachVillagerPet(v) {
  if (v.petWrap) { if (LIFE.group) LIFE.group.remove(v.petWrap); v.petWrap = null; }
  v.hasPet = false; v.petTrail.length = 0;
}
function setVillagerLod(v, want) {
  v.lod = want;
  if (want === 'full') {
    if (v.impostor) { v.wrapper.remove(v.impostor); v.impostor = null; }
    requestFullRig(v.student, function (entry) {
      if (v.lod !== 'full') return; /* התחלף בינתיים */
      var rig = entry.rig, pet = entry.pet;
      if (v.rig && v.rig !== rig) v.wrapper.remove(v.rig);
      if (!v.rig || v.rig !== rig) { v.rig = rig; v.wrapper.add(rig); }
      /* חיית מחמד — Group נפרד שמצטרף ישירות ל-LIFE.group (לא ל-wrapper המסתובב) כדי
       * שהמעקב-בעיכוב אחרי הבעלים (updatePetTrail) יעבוד בקואורדינטות עולם פשוטות */
      if (pet && v.petWrap !== pet) {
        if (v.petWrap && LIFE.group) LIFE.group.remove(v.petWrap);
        v.petWrap = pet; v.hasPet = true;
        if (LIFE.group && pet.parent !== LIFE.group) LIFE.group.add(pet);
      } else if (!pet && v.hasPet) {
        detachVillagerPet(v);
      }
      ensureNameSprite(v);
      if (LIFE.lastHoliday === 'purim') applyPurimHat(v, v.idx);
    });
  } else {
    if (v.rig) { v.wrapper.remove(v.rig); v.rig = null; }
    detachVillagerPet(v);
    if (!v.impostor) { v.impostor = makeImpostor(v.student); v.wrapper.add(v.impostor); }
    ensureNameSprite(v);
  }
}
function ensureNameSprite(v) {
  if (v.nameSprite) return;
  var spr = makeSprite(v.student.name || 'תלמיד/ה', { fontSize: 26, worldHeight: 0.26, bg: 'rgba(255,250,238,0.9)', color: '#3d2a17' });
  spr.position.y = 2.35;
  v.wrapper.add(spr);
  v.nameSprite = spr;
}

/* --- התנהגות: מכניקת מצבים פשוטה (idle/walk/sit/group/gohome) — "מכוונת" לא אקראית טהורה --- */
function regionBoundsFor(v) {
  var idx = regionIndex(v.homeRegion);
  var c = regionCenter(idx);
  var isActive = LIFE.ISL && LIFE.ISL.activeId === v.homeRegion;
  return { cx: c.x, cz: c.z, radius: isActive ? (GRID / 2 + 2.5) : (GRID / 2 - 1) };
}
function pickWanderTarget(v) {
  var b = regionBoundsFor(v);
  var ang = Math.random() * Math.PI * 2, rad = Math.random() * b.radius;
  return { x: b.cx + Math.cos(ang) * rad, z: b.cz + Math.sin(ang) * rad };
}
function nearbyItemSpot(v) {
  var isl = activeIslState(); if (!isl) return null;
  var items = isl.items.filter(function (it) { return it.r === v.homeRegion; });
  if (!items.length) return null;
  var it = items[Math.floor(Math.random() * items.length)];
  var idx = regionIndex(v.homeRegion); var c = regionCenter(idx);
  var ang = Math.random() * Math.PI * 2;
  return { x: c.x + (it.x - HALF) + Math.cos(ang) * 0.9, z: c.z + (it.z - HALF) + Math.sin(ang) * 0.9 };
}
function nearbyVillagerSpot(v) {
  var pool = LIFE.villagers.filter(function (o) { return o.id !== v.id && o.homeRegion === v.homeRegion && o.wrapper.visible; });
  if (!pool.length) return null;
  var other = pool[Math.floor(Math.random() * pool.length)];
  var ang = Math.random() * Math.PI * 2;
  return { x: other.pos.x + Math.cos(ang) * 0.9, z: other.pos.z + Math.sin(ang) * 0.9, withId: other.id };
}
function enterState(v, state) {
  v.state = state; v.stateT = 0;
  if (state === 'idle') { v.stateDur = 3 + Math.random() * 4; }
  else if (state === 'walk') { var t = pickWanderTarget(v); v.target.x = t.x; v.target.z = t.z; v.stateDur = 999; }
  else if (state === 'sit') { var s = nearbyItemSpot(v); if (s) { v.target.x = s.x; v.target.z = s.z; } v.stateDur = 999; }
  else if (state === 'group') { var g = nearbyVillagerSpot(v); if (g) { v.target.x = g.x; v.target.z = g.z; v.groupWith = g.withId; } v.stateDur = 999; }
  else if (state === 'gohome') {
    var klass = activeClass(); var home = klass ? plotHomeOf(v.student, klass.students, v.homeRegion) : null;
    if (home && v.homeRegion === (LIFE.ISL && LIFE.ISL.activeId)) { v.target.x = home.x; v.target.z = home.z; v.stateDur = 999; }
    else { v.state = 'idle'; v.stateDur = 2; }
  } else if (state === 'wave') { v.stateDur = 1.4; }
}
function stepVillagerBehavior(v, dt) {
  v.stateT += dt;
  var arrived = false;
  if (v.state === 'walk' || v.state === 'sit' || v.state === 'group' || v.state === 'gohome' || v.state === 'gather') {
    var dx = v.target.x - v.pos.x, dz = v.target.z - v.pos.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.05) {
      var mv = Math.min(d, v.speed * dt * (v.state === 'gather' ? 1.3 : 1) * (LIFE.reducedMotion ? 0 : 1));
      if (mv > 0) { v.pos.x += (dx / d) * mv; v.pos.z += (dz / d) * mv; v.rot = Math.atan2(dx, dz); }
    } else arrived = true;
    if (LIFE.reducedMotion) arrived = true;
  }
  if (v.state === 'idle' && v.stateT >= v.stateDur) {
    var r = Math.random();
    if (r < 0.42) enterState(v, 'walk');
    else if (r < 0.58) enterState(v, 'sit');
    else if (r < 0.74) enterState(v, 'group');
    else if (r < 0.82 && v.homeRegion === (LIFE.ISL && LIFE.ISL.activeId)) enterState(v, 'gohome');
    else if (r < 0.9) enterState(v, 'wave');
    else enterState(v, 'idle');
  } else if (v.state === 'wave' && v.stateT >= v.stateDur) enterState(v, 'idle');
  else if (v.state === 'gather' && v.stateT >= v.stateDur) enterState(v, 'idle');
  else if (arrived && v.state !== 'idle' && v.state !== 'wave') {
    v.stateT = 0; v.idleAfterArriveDur = 2.5 + Math.random() * 4;
    v.state = 'arrived-idle';
  } else if (v.state === 'arrived-idle') {
    if (v.stateT >= (v.idleAfterArriveDur || 3)) enterState(v, 'idle');
  }
}

/* חיית מחמד עוקבת אחרי הבעלים — עם "עיכוב" קליל (טרייל מיקומים) לתחושת מעקב טבעית */
function updatePetTrail(v) {
  if (!v.hasPet) return;
  v.petTrail.push({ x: v.pos.x, z: v.pos.z, rot: v.rot });
  if (v.petTrail.length > 14) v.petTrail.shift();
}

function applyVillagerTransform(v, t) {
  v.wrapper.position.set(v.pos.x, 0, v.pos.z);
  v.wrapper.rotation.y = v.rot;
  var bob = 0;
  if (!LIFE.reducedMotion) {
    if (v.state === 'walk' || v.state === 'gohome') bob = Math.abs(Math.sin(t * 6 + v.jumpPhase)) * 0.05;
    else bob = Math.sin(t * 1.6 + v.jumpPhase) * 0.02;
    if (v.state === 'wave' && v.rig) { var arm = v.rig.children[0]; if (arm) arm.rotation.z = Math.sin(t * 10) * 0.3; }
    /* אנימציה זולה לאימפוסטור: טלטול הליכה קל בעת תנועה בלבד (בלי לולאת tick נפרדת) */
    if (v.impostor) v.impostor.rotation.z = (v.state === 'walk' || v.state === 'gohome') ? Math.sin(t * 8 + v.jumpPhase) * 0.12 : 0;
  }
  if (v.happy && !LIFE.reducedMotion) bob += Math.abs(Math.sin(t * 9 + v.jumpPhase)) * 0.12;
  v.wrapper.position.y = bob;
  /* חיית מחמד: Group עצמאי (ילד של LIFE.group, לא של wrapper המסתובב) — ממוקם בקואורדינטות
   * עולם ישירות מתוך הטרייל, כדי לקבל "עיכוב" טבעי בלי סיבוכי מרחב מקומי/סקייל */
  if (v.hasPet && v.petWrap) {
    var back = v.petTrail.length > 8 ? v.petTrail[v.petTrail.length - 8] : (v.petTrail[0] || { x: v.pos.x, z: v.pos.z, rot: v.rot });
    v.petWrap.position.set(back.x, bob * 0.6, back.z);
    v.petWrap.rotation.y = back.rot;
  }
}

var _lodTimer = 0, _dailyCheckTimer = 0;
function tickVillagers(t, dt) {
  syncVillagerRosterThrottled(dt);
  /* בעיית סדר אתחול: attach() רץ בסוף initScene, לפני ש-refreshRegions() מילא את
     ISL.regionTier. לכן ב-assignHomes הראשון אין אף אזור ב-'full' והוא יוצא מיד —
     ואז אף תושב לא מקבל homeRegion ו-updateLod מסתיר את כולם. בלי הבדיקה הזו האי
     נשאר ריק עד שהטיימר האיטי (3 שנ' של dt מצטבר) מריץ שוב את הסנכרון. */
  if (LIFE.villagers.length && !LIFE.villagers[0].homeRegion) assignHomes();
  processRigQueue();
  _lodTimer += dt;
  if (_lodTimer > 0.6) { _lodTimer = 0; updateLod(); }
  refreshDailyBaseline();
  for (var i = 0; i < LIFE.villagers.length; i++) {
    var v = LIFE.villagers[i];
    if (!v.wrapper.visible) continue;
    stepVillagerBehavior(v, dt);
    updatePetTrail(v);
    updateHappy(v);
    applyVillagerTransform(v, t);
  }
}
var _rosterTimer = 0;
function syncVillagerRosterThrottled(dt) { _rosterTimer += dt; if (_rosterTimer > 3 || LIFE.villagers.length === 0) { _rosterTimer = 0; syncVillagerRoster(); } }

/* --- "קיבל נקודות היום" — נגזר מקומית (localStorage) כי אין שדה timestamp על נקודות ב-state --- */
var LS_DAILY = 'ak_island_life_daily_v1';
function refreshDailyBaseline() {
  var klass = activeClass(); if (!klass) return;
  var todayKey = new Date().toDateString();
  if (LIFE.dailyBaseline.day === todayKey) return;
  var raw = null; try { raw = localStorage.getItem(LS_DAILY); } catch (e) {}
  var data = null; try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }
  if (!data || data.day !== todayKey) {
    data = { day: todayKey, map: {} };
    (klass.students || []).forEach(function (s) { data.map[s.id] = s.points || 0; });
    try { localStorage.setItem(LS_DAILY, JSON.stringify(data)); } catch (e) {}
  } else {
    var changed = false;
    (klass.students || []).forEach(function (s) { if (!(s.id in data.map)) { data.map[s.id] = s.points || 0; changed = true; } });
    if (changed) { try { localStorage.setItem(LS_DAILY, JSON.stringify(data)); } catch (e) {} }
  }
  LIFE.dailyBaseline = data;
}
function updateHappy(v) {
  var base = LIFE.dailyBaseline.map ? LIFE.dailyBaseline.map[v.id] : null;
  var pts = (v.student.points || 0);
  var wasHappy = v.happy;
  v.happy = base != null && (pts - base) > 0;
  if (v.happy && !wasHappy) spawnHeart(v);
  else if (v.happy && Math.random() < 0.002) spawnHeart(v);
}
function spawnHeart(v) {
  if (LIFE.reducedMotion) return;
  var h = makeSprite('💗', { noBg: true, fontSize: 34, worldHeight: 0.4 });
  h.position.set(0, 2.9, 0);
  v.wrapper.add(h);
  LIFE.anims = LIFE.anims || [];
  LIFE.anims.push({ node: h, t: 0, dur: 1.4, kind: 'heart', parent: v.wrapper });
}

/* ===================================================================================
 * 6. חיית הכיתה (המסקוט) — מלווה שנתי אחד, קופץ שלב בכל פתיחת אזור (8 אבני-דרך גדולות)
 * =================================================================================== */
var PET_HATCH_TOTAL = 15; /* אבני בניין ראשונות שהכיתה צריכה כדי שהביצה תבקע */
function petBigStage(isl) { return clamp(isl.regions.length, 1, 8); } /* 1..8 = מס' אזורים פתוחים */
function petEraProgress(isl) {
  var big = petBigStage(isl);
  var cur = REGION_THRESHOLDS[big - 1];
  var next = big < 8 ? REGION_THRESHOLDS[big] : (cur + 350);
  return clamp((totalEarned(isl) - cur) / Math.max(1, next - cur), 0, 1);
}
function buildPetMesh(stage, fineFrac) {
  var g = new THREE.Group();
  var scaleBase = 0.62 + stage * 0.05;
  var pulse = 0.92 + 0.16 * fineFrac;
  var skin = 0xffce54, belly = 0xfff3cf, eyeC = 0x2a2a2a;
  var bodyR = 0.42 * scaleBase * pulse;
  var body = sph(bodyR, skin, 0, bodyR * 0.95, 0, 14); g.add(body); body.userData.ak = 'body';
  var belly1 = sph(bodyR * 0.68, belly, 0, bodyR * 0.62, bodyR * 0.55, 10); g.add(belly1);
  var head = sph(bodyR * 0.72, skin, 0, bodyR * 1.75, bodyR * 0.35, 12); g.add(head); head.userData.ak = 'head';
  for (var ex = -1; ex <= 1; ex += 2) { g.add(sph(bodyR * 0.16, 0xffffff, ex * bodyR * 0.32, bodyR * 1.85, bodyR * 0.9, 8)); g.add(sph(bodyR * 0.08, eyeC, ex * bodyR * 0.32, bodyR * 1.85, bodyR * 1.02, 6)); }
  var beak = cone(bodyR * 0.18, bodyR * 0.32, 0xff8c3c, 0, bodyR * 1.6, bodyR * 1.05, 6); beak.rotation.x = Math.PI / 2; g.add(beak);
  /* רגליים קטנות */
  for (var lx = -1; lx <= 1; lx += 2) g.add(cyl(0.05, 0.05, bodyR * 0.4, 0xff8c3c, lx * bodyR * 0.32, bodyR * 0.1, 0, 5));
  if (stage >= 2) { var crest = cone(bodyR * 0.14, bodyR * 0.4, 0xff5a7a, 0, bodyR * 2.15, bodyR * 0.1, 6); g.add(crest); }
  if (stage >= 3) { var band = new THREE.Mesh(new THREE.TorusGeometry(bodyR * 0.55, bodyR * 0.07, 6, 14), mat(0x7ad1ff)); band.position.y = bodyR * 0.9; band.rotation.x = Math.PI / 2; g.add(band); }
  if (stage >= 4) { for (var hx = -1; hx <= 1; hx += 2) { var horn = cone(bodyR * 0.09, bodyR * 0.32, 0xe8e8e8, hx * bodyR * 0.28, bodyR * 2.05, -bodyR * 0.1, 5); horn.rotation.z = -hx * 0.35; g.add(horn); } }
  if (stage >= 5) {
    for (var wx = -1; wx <= 1; wx += 2) {
      var wing = new THREE.Mesh(new THREE.SphereGeometry(bodyR * 0.5, 8, 6, 0, Math.PI), mat(0xfff0b0));
      wing.scale.set(0.25, 1, 1.5); wing.position.set(wx * bodyR * 0.75, bodyR * 0.85, -bodyR * 0.1);
      wing.rotation.y = wx > 0 ? Math.PI / 2 : -Math.PI / 2; wing.userData.ak = 'wing' + wx; g.add(wing);
    }
  }
  if (stage >= 6) {
    var glowMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.28 });
    var glow = new THREE.Mesh(new THREE.SphereGeometry(bodyR * 1.5, 10, 8), glowMat); glow.position.y = bodyR * 1.0; g.add(glow); g.userData.glow = glow;
  }
  if (stage >= 7) {
    var tail = new THREE.Mesh(new THREE.ConeGeometry(bodyR * 0.16, bodyR * 0.9, 6), mat(0xffb0d0));
    tail.position.set(0, bodyR * 0.5, -bodyR * 0.9); tail.rotation.x = Math.PI * 0.42; g.add(tail);
  }
  if (stage >= 8) {
    var crown = new THREE.Mesh(new THREE.TorusGeometry(bodyR * 0.5, bodyR * 0.06, 6, 16), mat(0xffd700, { emissive: 0xffd700, emissiveIntensity: 0.6 }));
    crown.position.y = bodyR * 2.25; crown.rotation.x = Math.PI / 2; g.add(crown);
    var sparkGeo = new THREE.OctahedronGeometry(bodyR * 0.06, 0);
    var spark = new THREE.InstancedMesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xfff2b0 }), 10);
    var dummy = new THREE.Object3D();
    for (var si = 0; si < 10; si++) { var a = (si / 10) * Math.PI * 2; dummy.position.set(Math.cos(a) * bodyR * 1.5, bodyR * (0.8 + Math.sin(si) * 0.5), Math.sin(a) * bodyR * 1.5); dummy.updateMatrix(); spark.setMatrixAt(si, dummy.matrix); }
    spark.instanceMatrix.needsUpdate = true; g.add(spark); g.userData.sparkles = spark;
  }
  g.userData.baseY = 0;
  return g;
}
function buildEggMesh() {
  var g = new THREE.Group();
  var shell = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), mat(0xfff6e6));
  shell.scale.set(1, 1.3, 1); shell.position.y = 0.36; g.add(shell);
  var rnd = seedRand(7); for (var i = 0; i < 6; i++) g.add(sph(0.03, 0xffd9a0, (rnd() - 0.5) * 0.4, 0.2 + rnd() * 0.5, (rnd() - 0.5) * 0.2, 6));
  var shine = sph(0.06, 0xffffff, -0.13, 0.62, 0.2, 6); shine.material.transparent = true; shine.material.opacity = 0.85; g.add(shine);
  return g;
}
function petHomePos() {
  var ISL = LIFE.ISL; var idx = regionIndex(ISL ? ISL.activeId : 'beach'); if (idx < 0) idx = 0;
  var c = regionCenter(idx);
  return { x: c.x - 2.2, z: c.z - 2.2 };
}
function refreshPetObj(stage, fineFrac, hatched) {
  var sc = scene(); if (!sc) return;
  if (LIFE.petObj) {
    sc.remove(LIFE.petObj.group); disposeObj(LIFE.petObj.group);
    if (LIFE.petObj.ruler) { sc.remove(LIFE.petObj.ruler); disposeObj(LIFE.petObj.ruler); }
  }
  var g = hatched ? buildPetMesh(stage, fineFrac) : buildEggMesh();
  var home = petHomePos();
  g.position.set(home.x, 0, home.z);
  g.userData.animate = function (t, dt) {
    if (LIFE.reducedMotion) return;
    g.rotation.y = Math.sin(t * 0.5) * 0.25;
    g.position.y = home.y0 || 0;
    var b = 0.06 * Math.abs(Math.sin(t * (LIFE.petAwake ? 3 : 0.6)));
    g.position.y = b;
    if (g.userData.glow) g.userData.glow.material.opacity = 0.2 + 0.12 * Math.sin(t * 2);
    if (g.userData.sparkles) g.userData.sparkles.rotation.y = t * 0.6;
  };
  sc.add(g);
  LIFE.petObj = { group: g, stage: stage, fine: fineFrac, hatched: hatched, home: home };
  buildGrowthRuler('pet', LIFE.petObj, 0, 8, home.x + 0.9, home.z - 0.4);
}
function tickPetGrowth() {
  var isl = activeIslState(); if (!isl) return;
  var total = totalEarned(isl);
  var pet = isl.pet;
  var hatched = total >= PET_HATCH_TOTAL || pet.stage > 0;
  var bigStage = petBigStage(isl);
  var fineFrac = petEraProgress(isl);
  var fineTick = Math.floor(fineFrac * 8);
  var grew = false;
  if (hatched && pet.stage === 0) { pet.stage = 1; pet.born = pet.born || Date.now(); grew = true; queueGrowth('🐣 הביצה בקעה! ברוכים הבאים, יצור האי!'); }
  else if (hatched && bigStage > pet.stage) {
    pet.stage = bigStage; grew = true;
    queueGrowth('🐣 חיית הכיתה גדלה שלב גדול! (אזור חדש נפתח)');
    rollMonthMark(pet, bigStage);
  } else if (hatched && fineTick !== pet.fine) { pet.fine = fineTick; grew = true; }
  if (!hatched && pet.stage === 0) { /* עדיין ביצה — כלום */ }
  if (grew) {
    pet.lastGrow = Date.now();
    rollMonthMarkMaybe(pet, hatched ? pet.stage : 0);
    akSave();
    refreshPetObj(pet.stage, fineFrac, hatched);
    if (bigStage === pet.stage && hatched) { spawnGrowthBurst(petHomePos()); akSound('rankup'); }
  } else if (!LIFE.petObj) {
    refreshPetObj(pet.stage, fineFrac, hatched);
  } else {
    LIFE.petObj.fine = fineFrac;
    /* אין גדילה כרגע, אבל ייתכן שהמצלמה/HUD עברו לאזור אחר — היצור "מלווה את הכיתה"
     * אז עוקב אחרי האזור הפעיל גם בלי אירוע גדילה (עדכון מיקום זול, בלי rebuild גיאומטריה) */
    var home = petHomePos();
    if (LIFE.petObj.home.x !== home.x || LIFE.petObj.home.z !== home.z) {
      LIFE.petObj.home = home;
      LIFE.petObj.group.position.x = home.x; LIFE.petObj.group.position.z = home.z;
      if (LIFE.petObj.ruler) { LIFE.petObj.ruler.position.x = home.x + 0.9; LIFE.petObj.ruler.position.z = home.z - 0.4; }
    }
    updateGrowthRuler('pet', LIFE.petObj, hatched ? pet.stage : 0, 8);
  }
  LIFE.petAwake = (Date.now() - pet.lastGrow) < 6 * 24 * 3600 * 1000 || wasStudentHappyToday();
}
function wasStudentHappyToday() {
  var m = LIFE.dailyBaseline.map; if (!m) return false;
  var klass = activeClass(); if (!klass) return false;
  for (var i = 0; i < klass.students.length; i++) { var s = klass.students[i]; if (m[s.id] != null && (s.points || 0) > m[s.id]) return true; }
  return false;
}
function rollMonthMark(obj, curStage) { obj.monthMark = obj.monthMark || { stage: 0, t: 0 }; if (!obj.monthMark.t) { obj.monthMark = { stage: curStage, t: Date.now() }; } }
function rollMonthMarkMaybe(obj, curStage) {
  obj.monthMark = obj.monthMark || { stage: 0, t: 0 };
  var THIRTY_D = 30 * 24 * 3600 * 1000;
  if (!obj.monthMark.t || (Date.now() - obj.monthMark.t) > THIRTY_D) obj.monthMark = { stage: curStage, t: Date.now() };
}

/* ===================================================================================
 * 7. עץ הכיתה — מסלול גדילה נפרד לכל אזור (~חודש), לפי % התקדמות באזור, לא תאריך.
 *    אזור שכבר לא ה"נוכחי" (נפתח אזור מתקדם ממנו) → נשאר קפוא בשלב הבשל/פורח לתמיד.
 * =================================================================================== */
function treeProgressForRegion(isl, regionId) {
  var rank = regionIndex(regionId); if (rank < 0) return 0;
  var unlockedCount = isl.regions.length;
  if (rank > unlockedCount - 1) return -1; /* לא פתוח בכלל */
  if (rank < unlockedCount - 1) return 1;  /* אזור קודם — עבר את הכל, קפוא בשל */
  var total = totalEarned(isl);
  var cur = REGION_THRESHOLDS[rank];
  var next = rank < 7 ? REGION_THRESHOLDS[rank + 1] : (cur + 350);
  return clamp((total - cur) / Math.max(1, next - cur), 0, 1);
}
function buildTreeMesh(regionId, majorStage, fineFrac) {
  var sp = TREE_SPECIES[regionId] || TREE_SPECIES.beach;
  var g = new THREE.Group();
  var rnd = seedRand(hash01(regionId + 'tree') * 99999 + 3);
  if (majorStage <= 0) {
    var mound = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x6b4a2c));
    g.add(mound);
    var sizeSeed = 0.03 + 0.05 * fineFrac;
    g.add(sph(sizeSeed, sp.canopy[0], 0, 0.1 + sizeSeed, 0, 6));
    return g;
  }
  if (majorStage === 1) {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x6b4a2c)));
    var h1 = 0.12 + 0.1 * fineFrac;
    g.add(cyl(0.02, 0.025, h1, sp.trunk, 0, h1 / 2, 0, 5));
    for (var lx = -1; lx <= 1; lx += 2) {
      var leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16 + 0.06 * fineFrac, 5), mat(sp.canopy[0]));
      leaf.position.set(lx * 0.05, h1, 0); leaf.rotation.z = lx * 0.7; g.add(leaf);
    }
    return g;
  }
  var height = majorStage === 2 ? 0.55 + 0.25 * fineFrac : majorStage === 3 ? 0.95 + 0.35 * fineFrac : majorStage === 4 ? 1.4 + 0.35 * fineFrac : 1.75 + 0.3 * fineFrac;
  var trunkR = 0.05 + majorStage * 0.02;
  var trunk = cyl(trunkR, trunkR * 1.3, height, sp.trunk, 0, height / 2, 0, 7); g.add(trunk);
  var bark = box(trunkR * 0.5, height * 0.5, trunkR * 0.3, sp.trunkDk, trunkR * 0.9, height * 0.5, trunkR * 0.9); g.add(bark);
  var canopyY = height * (regionId === 'beach' || regionId === 'desert' ? 1.0 : 0.92);
  var leafCountBase = majorStage === 2 ? 5 : majorStage === 3 ? 8 : majorStage === 4 ? 12 : 16;
  var leafCount = Math.max(3, Math.round(leafCountBase * (0.5 + 0.5 * fineFrac)));
  var canopyGeo = (regionId === 'mountain') ? new THREE.ConeGeometry(0.16, 0.34, 6) : new THREE.SphereGeometry(0.15, 7, 6);
  var im = new THREE.InstancedMesh(canopyGeo, mat(sp.canopy[Math.floor(rnd() * sp.canopy.length)]), leafCount);
  var dummy = new THREE.Object3D();
  for (var i = 0; i < leafCount; i++) {
    var a = rnd() * Math.PI * 2, rad = 0.08 + rnd() * 0.22 * (majorStage / 5);
    dummy.position.set(Math.cos(a) * rad, canopyY + (rnd() - 0.3) * 0.22 * (majorStage / 4), Math.sin(a) * rad);
    var s = 0.6 + rnd() * 0.6;
    dummy.scale.set(s, s, s); dummy.rotation.y = rnd() * Math.PI * 2; dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
  }
  im.instanceMatrix.needsUpdate = true; im.castShadow = true; g.add(im); g.userData.canopy = im;
  if (majorStage >= 5 && sp.fruit) {
    var fruitCount = Math.max(2, Math.round(6 * fineFrac) + 2);
    var fruitGeo = new THREE.SphereGeometry(0.035, 6, 5);
    var fim = new THREE.InstancedMesh(fruitGeo, mat(sp.fruit), fruitCount);
    for (var f = 0; f < fruitCount; f++) {
      var fa = rnd() * Math.PI * 2, frad = 0.1 + rnd() * 0.2;
      dummy.position.set(Math.cos(fa) * frad, canopyY - 0.06 + rnd() * 0.12, Math.sin(fa) * frad);
      dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      fim.setMatrixAt(f, dummy.matrix);
    }
    fim.instanceMatrix.needsUpdate = true; g.add(fim); g.userData.fruit = fim;
  }
  g.userData.canopyBaseY = canopyY;
  return g;
}
function treeSpot(regionId) {
  var idx = regionIndex(regionId); var c = regionCenter(idx);
  return { x: c.x - 2.2, z: c.z + 1.4 };
}
function refreshTreeObj(regionId, majorStage, fineFrac) {
  var sc = scene(); if (!sc) return;
  var existing = LIFE.trees[regionId];
  if (existing) {
    sc.remove(existing.group); disposeObj(existing.group);
    if (existing.ruler) { sc.remove(existing.ruler); disposeObj(existing.ruler); }
  }
  var g = buildTreeMesh(regionId, majorStage, fineFrac);
  var spot = treeSpot(regionId);
  g.position.set(spot.x, 0, spot.z);
  g.userData.animate = function (t) {
    if (LIFE.reducedMotion) return;
    var sway = Math.sin(t * 0.9 + hash01(regionId) * 10) * 0.03 * majorStage;
    g.rotation.z = sway;
  };
  sc.add(g);
  LIFE.trees[regionId] = { group: g, stage: majorStage, fine: fineFrac, spot: spot };
  var sp = TREE_SPECIES[regionId] || TREE_SPECIES.beach;
  buildGrowthRuler('tree_' + regionId, LIFE.trees[regionId], 0, 5, spot.x + 0.7, spot.z + 0.5, sp.name);
}
function tickTreeGrowth() {
  var isl = activeIslState(); if (!isl) return;
  var full = fullRegionIds();
  for (var i = 0; i < full.length; i++) {
    var regionId = full[i];
    var frac = treeProgressForRegion(isl, regionId);
    if (frac < 0) continue;
    var entry = ensureTreeEntry(isl, regionId);
    var majorStage = clamp(Math.floor(frac * 6), 0, 5);
    var fineTick = Math.floor(frac * 30);
    var grew = false;
    if (majorStage > entry.stage) { entry.stage = majorStage; grew = true; queueGrowth('🌱 העץ ב' + (REGION_NAME[regionId] || regionId) + ' גדל שלב!'); rollMonthMark(entry, majorStage); }
    else if (fineTick !== entry.fine) { entry.fine = fineTick; grew = grew || false; }
    entry.fine = fineTick;
    rollMonthMarkMaybe(entry, entry.stage);
    var existing = LIFE.trees[regionId];
    if (grew || !existing) {
      if (grew) { entry.lastGrow = Date.now(); akSave(); }
      refreshTreeObj(regionId, entry.stage, frac);
      if (grew) spawnGrowthBurst(treeSpot(regionId));
    } else if (existing.stage !== entry.stage || Math.abs(existing.fine - frac) > 0.05) {
      existing.fine = frac;
      updateGrowthRuler('tree_' + regionId, existing, entry.stage, 5, (TREE_SPECIES[regionId] || {}).name);
    }
  }
  /* אזורים ב-lod/locked לא מוצגים כרגע — הסר מהסצנה אם קיימים, ה-state (isl.tree) נשמר */
  for (var rid in LIFE.trees) {
    if (full.indexOf(rid) < 0) {
      var t = LIFE.trees[rid];
      var sc = scene(); if (sc && t.group) sc.remove(t.group);
      disposeObj(t.group);
      if (t.ruler) { if (sc) sc.remove(t.ruler); disposeObj(t.ruler); }
      delete LIFE.trees[rid];
    }
  }
}
function spawnGrowthBurst(pos) {
  var sc = scene(); if (!sc || LIFE.reducedMotion) return;
  var geo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
  var count = 14, remaining = count;
  for (var i = 0; i < count; i++) {
    var m = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true });
    var mesh = new THREE.Mesh(geo, m); mesh.position.set(pos.x, 0.3, pos.z); sc.add(mesh);
    var ang = Math.random() * Math.PI * 2, spd = 1 + Math.random() * 1.4;
    LIFE.particles = LIFE.particles || [];
    LIFE.particles.push({ node: mesh, vx: Math.cos(ang) * spd, vz: Math.sin(ang) * spd, vy: 1.8 + Math.random() * 1.2, t: 0, dur: 0.6 + Math.random() * 0.3, onDone: function () { remaining--; if (remaining <= 0) geo.dispose(); } });
  }
}

/* --- סרגל מדידה — עמוד עם סימוני שלב + "כאן היינו לפני חודש" (SPEC §5.2: קריא מ-8מ') --- */
function buildGrowthRuler(key, obj, minStage, maxStage, x, z, speciesName) {
  var sc = scene(); if (!sc) return;
  if (obj.ruler) { sc.remove(obj.ruler); disposeObj(obj.ruler); }
  var g = new THREE.Group();
  var postH = 0.9 + (maxStage - minStage) * 0.06;
  g.add(cyl(0.025, 0.03, postH, 0x8a6a44, 0, postH / 2, 0, 6));
  var stage = obj.stage || 0;
  var n = maxStage - minStage;
  for (var s = 0; s <= n; s++) {
    var y = 0.08 + (s / n) * (postH - 0.16);
    var mark = box(0.14, 0.02, 0.02, s <= stage ? 0xffd54a : 0xcbb98a, 0.08, y, 0);
    g.add(mark);
  }
  var mm = obj.monthMark || { stage: 0 };
  var mmY = 0.08 + (clamp(mm.stage, 0, n) / n) * (postH - 0.16);
  var flag = box(0.12, 0.1, 0.015, 0x4ac9ff, -0.1, mmY, 0);
  g.add(flag);
  var flagLbl = makeSprite('לפני חודש', { fontSize: 20, worldHeight: 0.16, bg: 'rgba(255,250,238,0.92)', color: '#3d2a17' });
  flagLbl.position.set(-0.32, mmY, 0); g.add(flagLbl);
  var title = makeSprite((speciesName ? ('עץ ' + speciesName) : 'חיית הכיתה') + ' · שלב ' + stage, { fontSize: 22, worldHeight: 0.2, bg: 'rgba(255,250,238,0.92)', color: '#3d2a17' });
  title.position.set(0, postH + 0.16, 0); g.add(title);
  g.position.set(x, 0, z);
  sc.add(g);
  obj.ruler = g;
}
function updateGrowthRuler(key, obj, stage, maxStage, speciesName) {
  if (!obj.ruler) return;
  buildGrowthRuler(key, obj, 0, maxStage, obj.ruler.position.x, obj.ruler.position.z, speciesName || null);
}

/* --- "מה גדל היום" — באנר DOM קצר (3.5 שנ') בכל פעם שמתגלה קפיצת גדילה --- */
function queueGrowth(msg) { LIFE.growthQueue.push(msg); }
function ensureOverlay() {
  var ISL = LIFE.ISL; if (!ISL || !ISL.container || LIFE.overlay) return LIFE.overlay;
  var el = document.createElement('div');
  el.style.cssText = 'position:absolute;top:20%;left:50%;transform:translate(-50%,-20px);' +
    'background:linear-gradient(135deg,rgba(255,213,74,0.96),rgba(255,154,60,0.96));color:#3a2600;' +
    'font-family:Rubik,Arial,sans-serif;font-weight:900;font-size:34px;padding:18px 40px;border-radius:22px;' +
    'box-shadow:0 10px 30px rgba(0,0,0,.4);direction:rtl;text-align:center;z-index:20;pointer-events:none;' +
    'opacity:0;transition:opacity .4s ease, transform .4s ease;';
  ISL.container.appendChild(el);
  LIFE.overlay = el;
  return el;
}
function tickGrowthOverlay(dt) {
  var el = ensureOverlay(); if (!el) return;
  if (LIFE.overlayTimer > 0) {
    LIFE.overlayTimer -= dt;
    if (LIFE.overlayTimer <= 0) { el.style.opacity = '0'; el.style.transform = 'translate(-50%,-20px)'; }
    return;
  }
  if (LIFE.growthQueue.length) {
    var msg = LIFE.growthQueue.shift();
    el.textContent = msg;
    el.style.opacity = '1'; el.style.transform = 'translate(-50%,0)';
    LIFE.overlayTimer = 3.5;
    akSound('rankup');
  }
}

/* ===================================================================================
 * 8. מזג אוויר ועונות
 * =================================================================================== */
var RAIN_COUNT = 220;
function ensureWeatherMeshes() {
  var sc = scene(); if (!sc || LIFE.weather.mesh.rain) return;
  var geo = new THREE.BoxGeometry(0.02, 0.35, 0.02);
  var m = new THREE.MeshBasicMaterial({ color: 0xbcdcff, transparent: true, opacity: 0.55 });
  var rain = new THREE.InstancedMesh(geo, m, RAIN_COUNT);
  rain.visible = false;
  var span = RING_R0 + REGION_IDS.length * RING_STEP;
  var drops = [];
  var dummy = new THREE.Object3D();
  for (var i = 0; i < RAIN_COUNT; i++) {
    var dx = (Math.random() - 0.5) * span * 1.6, dz = (Math.random() - 0.5) * span * 1.6, dy = Math.random() * 26;
    drops.push({ x: dx, y: dy, z: dz, spd: 9 + Math.random() * 5 });
    dummy.position.set(dx, dy, dz); dummy.updateMatrix(); rain.setMatrixAt(i, dummy.matrix);
  }
  sc.add(rain);
  LIFE.weather.mesh.rain = rain; LIFE.weather.drops = drops;
  var rainbowGroup = new THREE.Group(); rainbowGroup.visible = false;
  var cols = [0xff5a5a, 0xffb03c, 0xffe64a, 0x5adf6a, 0x4ac9ff, 0x8a6aff];
  for (var c = 0; c < cols.length; c++) {
    var arc = new THREE.Mesh(new THREE.TorusGeometry(14 - c * 0.35, 0.14, 6, 32, Math.PI), new THREE.MeshBasicMaterial({ color: cols[c], transparent: true, opacity: 0.55, fog: false }));
    arc.rotation.z = Math.PI; rainbowGroup.add(arc);
  }
  sc.add(rainbowGroup);
  LIFE.weather.mesh.rainbow = rainbowGroup;
}
var WEATHER_TYPES = ['sun', 'cloud', 'rain', 'fog'];
function computeSeason() {
  var m = new Date().getMonth(); /* 0=ינו */
  if (m >= 8 && m <= 10) return 'autumn';
  if (m === 11 || m <= 1) return 'winter';
  if (m >= 2 && m <= 4) return 'spring';
  return 'summer';
}
function weatherWeights(season) {
  if (season === 'winter') return { sun: 0.3, cloud: 0.3, rain: 0.3, fog: 0.1 };
  if (season === 'autumn') return { sun: 0.4, cloud: 0.32, rain: 0.18, fog: 0.1 };
  if (season === 'spring') return { sun: 0.55, cloud: 0.28, rain: 0.07, fog: 0.1 };
  return { sun: 0.7, cloud: 0.24, rain: 0.02, fog: 0.04 };
}
function pickWeather() {
  var w = weatherWeights(LIFE.season); var r = Math.random(), acc = 0;
  for (var i = 0; i < WEATHER_TYPES.length; i++) { acc += w[WEATHER_TYPES[i]]; if (r <= acc) return WEATHER_TYPES[i]; }
  return 'sun';
}
function tickWeather(t, dt) {
  ensureWeatherMeshes();
  LIFE.weather.dwell += dt;
  if (LIFE.weather.dwell > LIFE.weather.next) {
    var prev = LIFE.weather.type;
    LIFE.weather.type = pickWeather();
    LIFE.weather.dwell = 0; LIFE.weather.next = 90 + Math.random() * 150;
    if (prev === 'rain' && LIFE.weather.type !== 'rain') { LIFE.weather.rainbowT = 22; }
  }
  var sc = scene(); if (!sc) return;
  var raining = LIFE.weather.type === 'rain';
  var rain = LIFE.weather.mesh.rain;
  if (rain) {
    rain.visible = raining && !LIFE.reducedMotion;
    if (raining && !LIFE.reducedMotion) {
      var dummy = new THREE.Object3D(); var drops = LIFE.weather.drops;
      for (var i = 0; i < drops.length; i++) {
        var d = drops[i]; d.y -= d.spd * dt; if (d.y < 0) d.y = 22 + Math.random() * 4;
        dummy.position.set(d.x, d.y, d.z); dummy.updateMatrix(); rain.setMatrixAt(i, dummy.matrix);
      }
      rain.instanceMatrix.needsUpdate = true;
    }
  }
  /* עננות: מכפיל שקיפות/כמות דרך fog קיים של האי — לא נוגעים בערכי הבסיס של המנוע,
   * רק מוסיפים אטימות fog קלה נוספת בזמן גשם/עננות (מוחל אחרי updateDayNight של המנוע) */
  if (sc.fog) {
    var extra = LIFE.weather.type === 'rain' ? 0.22 : LIFE.weather.type === 'fog' ? 0.4 : LIFE.weather.type === 'cloud' ? 0.08 : 0;
    var grey = new THREE.Color(0x9fb0c0);
    if (extra > 0) sc.fog.color.lerp(grey, extra);
  }
  if (LIFE.weather.rainbowT > 0) {
    LIFE.weather.rainbowT -= dt;
    var rb = LIFE.weather.mesh.rainbow;
    if (rb) {
      rb.visible = true;
      var c = regionCenter(regionIndex(LIFE.ISL ? LIFE.ISL.activeId : 'beach'));
      rb.position.set(c.x, 0, c.z - 16);
      rb.children.forEach(function (arc) { arc.material.opacity = clamp(LIFE.weather.rainbowT / 22, 0, 1) * 0.55; });
    }
  } else if (LIFE.weather.mesh.rainbow) LIFE.weather.mesh.rainbow.visible = false;
}

/* --- עונות: עלים נושרים (סתיו), פריחה/פרפרים (אביב), ריפ הים קייצי כבר קיים במנוע --- */
var LEAF_COUNT = 60, BUTTERFLY_COUNT = 10;
function ensureSeasonMeshes() {
  var sc = scene(); if (!sc || LIFE.seasonProps.leaves) return;
  var leafGeo = new THREE.PlaneGeometry(0.08, 0.08);
  var leaf = new THREE.InstancedMesh(leafGeo, new THREE.MeshBasicMaterial({ color: 0xd88a2a, side: THREE.DoubleSide, transparent: true }), LEAF_COUNT);
  leaf.visible = false; sc.add(leaf);
  var span = RING_R0 + REGION_IDS.length * RING_STEP;
  var leafData = [];
  for (var i = 0; i < LEAF_COUNT; i++) leafData.push({ x: (Math.random() - 0.5) * span, y: Math.random() * 14, z: (Math.random() - 0.5) * span, sway: Math.random() * 10, spd: 0.6 + Math.random() * 0.6 });
  LIFE.seasonProps.leaves = leaf; LIFE.seasonProps.leafData = leafData;
  var flyGeo = new THREE.SphereGeometry(0.03, 5, 4);
  var fly = new THREE.InstancedMesh(flyGeo, new THREE.MeshBasicMaterial({ color: 0xff7ab0 }), BUTTERFLY_COUNT);
  fly.visible = false; sc.add(fly);
  var flyData = [];
  for (var j = 0; j < BUTTERFLY_COUNT; j++) flyData.push({ a0: Math.random() * Math.PI * 2, r: 1 + Math.random() * 2, spd: 0.6 + Math.random() * 0.5, h: 0.3 + Math.random() * 1.2, phase: Math.random() * 10 });
  LIFE.seasonProps.butterflies = fly; LIFE.seasonProps.flyData = flyData;
}
function tickSeason(t, dt) {
  ensureSeasonMeshes();
  LIFE.season = computeSeason();
  var c = regionCenter(regionIndex(LIFE.ISL ? LIFE.ISL.activeId : 'beach'));
  var leaf = LIFE.seasonProps.leaves;
  if (leaf) {
    leaf.visible = LIFE.season === 'autumn' && !LIFE.reducedMotion;
    if (leaf.visible) {
      var dummy = new THREE.Object3D(); var data = LIFE.seasonProps.leafData;
      for (var i = 0; i < data.length; i++) {
        var d = data[i]; d.y -= d.spd * dt; d.sway += dt;
        if (d.y < 0) d.y = 12 + Math.random() * 3;
        dummy.position.set(c.x + d.x * 0.35 + Math.sin(d.sway) * 1.2, d.y, c.z + d.z * 0.35 + Math.cos(d.sway * 0.8) * 1.2);
        dummy.rotation.set(d.sway, d.sway * 0.7, 0); dummy.updateMatrix(); leaf.setMatrixAt(i, dummy.matrix);
      }
      leaf.instanceMatrix.needsUpdate = true;
    }
  }
  var fly = LIFE.seasonProps.butterflies;
  if (fly) {
    fly.visible = LIFE.season === 'spring' && !LIFE.reducedMotion;
    if (fly.visible) {
      var dummy2 = new THREE.Object3D(); var fdata = LIFE.seasonProps.flyData;
      for (var k = 0; k < fdata.length; k++) {
        var f = fdata[k]; var a = f.a0 + t * f.spd;
        dummy2.position.set(c.x + Math.cos(a) * f.r, f.h + Math.sin(t * 3 + f.phase) * 0.25, c.z + Math.sin(a) * f.r);
        dummy2.updateMatrix(); fly.setMatrixAt(k, dummy2.matrix);
      }
      fly.instanceMatrix.needsUpdate = true;
    }
  }
}

/* ===================================================================================
 * 9. יום/לילה אמביינטי — כוכבים/ירח/פנסים/מדורה (רק כש-ISL.ambient===true, לפי README §6.4)
 * =================================================================================== */
function ensureNightProps() {
  var sc = scene(); if (!sc || LIFE.nightProps) return;
  var starGeo = new THREE.BufferGeometry();
  var starCount = 140, pos = new Float32Array(starCount * 3);
  for (var i = 0; i < starCount; i++) { var a = Math.random() * Math.PI * 2, el = 0.15 + Math.random() * 0.8, r = 150; pos[i * 3] = Math.cos(a) * Math.cos(el) * r; pos[i * 3 + 1] = Math.sin(el) * r + 20; pos[i * 3 + 2] = Math.sin(a) * Math.cos(el) * r; }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  var stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, transparent: true, opacity: 0, fog: false }));
  sc.add(stars);
  var moon = sph(1.4, 0xfff6da, 60, 30, -40, 12); moon.material.transparent = true; moon.material.opacity = 0;
  sc.add(moon);
  var campfire = new THREE.Group();
  campfire.add(cyl(0.25, 0.3, 0.12, 0x4a3a2a, 0, 0.06, 0, 6));
  var flame = cone(0.14, 0.4, 0xff8a3c, 0, 0.32, 0, 6); flame.material.transparent = true; flame.material.opacity = 0;
  campfire.add(flame); campfire.userData.flame = flame;
  var light = new THREE.PointLight(0xff8a3c, 0, 5); campfire.add(light); campfire.userData.light = light;
  sc.add(campfire);
  LIFE.nightProps = { stars: stars, moon: moon, campfire: campfire, lanterns: [] };
}
function tickNight(t, dt) {
  ensureNightProps();
  var ISL = LIFE.ISL; if (!ISL) return;
  var np = LIFE.nightProps;
  var cycle = 360;
  var phase = ISL.ambient ? (t % cycle) / cycle : 0;
  var day = ISL.ambient ? clamp(0.5 + 0.5 * Math.cos(phase * Math.PI * 2), 0.55, 1) : 1;
  var nightAmt = ISL.ambient ? clamp((0.85 - day) / 0.3, 0, 1) : 0;
  np.stars.material.opacity = lerp(np.stars.material.opacity, nightAmt * 0.9, 0.05);
  np.moon.material.opacity = lerp(np.moon.material.opacity, nightAmt * 0.85, 0.05);
  var c = regionCenter(regionIndex(ISL.activeId));
  np.moon.position.set(c.x + 55, 30, c.z - 30);
  var flame = np.campfire.userData.flame, light = np.campfire.userData.light;
  flame.material.opacity = lerp(flame.material.opacity, nightAmt * 0.95, 0.05);
  light.intensity = lerp(light.intensity, nightAmt * 1.6, 0.05);
  if (!LIFE.reducedMotion && nightAmt > 0.1) flame.scale.set(1, 0.85 + Math.sin(t * 9) * 0.15, 1);
  np.campfire.position.set(c.x + 3, 0, c.z + 3);
  /* פנסים קטנים ליד חלקת ה"שלנו" — בונים פעם אחת (2 מספיק, זול), עוצמה משתנה */
  if (!np.lanterns.length) {
    for (var lx = -1; lx <= 1; lx += 2) {
      var lg = new THREE.Group();
      lg.add(cyl(0.02, 0.02, 0.55, 0x6b4a2c, 0, 0.27, 0, 5));
      var lamp = sph(0.08, 0xffe08a, 0, 0.58, 0, 6); lamp.material.transparent = true; lg.add(lamp);
      var lt = new THREE.PointLight(0xffcf7a, 0, 3); lamp.add(lt);
      lg.userData.lamp = lamp; lg.userData.light = lt;
      scene().add(lg); np.lanterns.push(lg);
    }
  }
  for (var i = 0; i < np.lanterns.length; i++) {
    var lg2 = np.lanterns[i]; lg2.position.set(c.x + i * 2 - 1, 0, c.z - 4);
    lg2.userData.lamp.material.opacity = lerp(lg2.userData.lamp.material.opacity || 0, 0.25 + nightAmt * 0.75, 0.05);
    lg2.userData.light.intensity = lerp(lg2.userData.light.intensity, nightAmt * 1.1, 0.05);
  }
}

/* ===================================================================================
 * 10. חגי ישראל — היחיד שכן פועל לפי תאריך לועזי אמיתי (טבלה קשיחה, ראו סעיף 1)
 * =================================================================================== */
function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function inRange(todayStr, range) { return todayStr >= range[0] && todayStr <= range[1]; }
function currentHoliday() {
  var now = new Date(); var todayStr = ymd(now);
  var y = now.getFullYear();
  var keys = [y - 1, y]; /* חג יכול להיות שייך לרשומת שנה"ל של השנה הקודמת (למשל ינואר-מאי) */
  for (var ki = 0; ki < keys.length; ki++) {
    var row = HOLIDAY_TABLE[keys[ki]]; if (!row) continue;
    for (var name in row) { if (row.hasOwnProperty(name) && inRange(todayStr, row[name])) return name; }
  }
  return null;
}
function holidayGroupEnsure() {
  var sc = scene(); if (!sc) return null;
  if (!LIFE.holidayGroup) { LIFE.holidayGroup = new THREE.Group(); sc.add(LIFE.holidayGroup); }
  return LIFE.holidayGroup;
}
function clearHoliday() {
  if (LIFE.holidayGroup) { disposeObj(LIFE.holidayGroup); LIFE.holidayGroup.children.slice().forEach(function (c) { LIFE.holidayGroup.remove(c); }); }
  LIFE.holidayActive = {};
  /* כובעי פורים חיים ב-cache של ה-rigs המלאים (חוזרים לשימוש בין LOD toggles) — אם לא
   * נסיר אותם כאן במעבר-חג, הם יישארו על הדמויות לצמיתות גם אחרי שפורים נגמר */
  for (var key in LIFE.fullRigCache) {
    var rig = LIFE.fullRigCache[key].rig;
    var h = rig && rig.getObjectByName('purimHat');
    if (h) { rig.remove(h); if (h.geometry) h.geometry.dispose(); if (h.material) h.material.dispose(); }
  }
}
/* כובע פורים קטן וצנוע לדמות מלאה — קרוא גם מבניית הקישוט וגם כשתלמיד/ה מקבל/ת LOD מלא
 * תוך כדי החג (כדי שלא "יישכחו" תלמידים שלא היו קרובים למצלמה ברגע שהחג התחיל) */
function applyPurimHat(v, vi) {
  if (!v || !v.rig) return;
  if (v.rig.getObjectByName('purimHat')) return;
  var hat = cone(0.16, 0.22, [0xff5a7a, 0x4ac9ff, 0xffd54a, 0x7ad17a][(vi || 0) % 4], 0, 0, 0, 6);
  /* כובע קטן מוצמד לראש — ביחידות מקומיות של תוכן ה-rig (לפני VILLAGER_SCALE החיצוני) */
  hat.position.set(0, 3.3, 0); hat.scale.setScalar(0.9); hat.name = 'purimHat';
  v.rig.add(hat);
}
function buildHolidayDecor(name) {
  var g = holidayGroupEnsure(); if (!g) return;
  var c = regionCenter(regionIndex(LIFE.ISL ? LIFE.ISL.activeId : 'beach'));
  if (name === 'sukkot') {
    var sukkah = new THREE.Group();
    sukkah.add(box(1.1, 0.06, 1.1, 0x9c7a45, 0, 0.03, 0));
    var frameM = mat(0x8a6a3a);
    var corners = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]];
    corners.forEach(function (p) { var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.85, 6), frameM); pole.position.set(p[0], 0.45, p[1]); sukkah.add(pole); });
    var roofRnd = seedRand(11);
    var roofGeo = new THREE.PlaneGeometry(0.06, 0.4);
    var roof = new THREE.InstancedMesh(roofGeo, mat(0x5a8a3a), 26);
    var dummy = new THREE.Object3D();
    for (var i = 0; i < 26; i++) { dummy.position.set((roofRnd() - 0.5) * 1.05, 0.9 + roofRnd() * 0.04, (roofRnd() - 0.5) * 1.05); dummy.rotation.set(-Math.PI / 2, roofRnd() * Math.PI, 0); dummy.updateMatrix(); roof.setMatrixAt(i, dummy.matrix); }
    roof.instanceMatrix.needsUpdate = true; sukkah.add(roof);
    sukkah.position.set(c.x + 3, 0, c.z + 3);
    g.add(sukkah);
    var lulav = cone(0.03, 0.5, 0x4fae4a, c.x + 3.7, 0.9, c.z + 2.8, 5); g.add(lulav);
  } else if (name === 'hanukkah') {
    var han = new THREE.Group();
    var base = box(0.7, 0.05, 0.14, 0xd7b04a, 0, 0.15, 0); han.add(base);
    var nightIdx = clamp(hanukkahNightIndex(), 0, 7);
    for (var n = -4; n <= 4; n++) {
      var cupR = n === 0 ? 0.035 : 0.028;
      var cup = cyl(cupR, cupR * 0.7, 0.1, 0xd7b04a, n * 0.075, 0.15 + (n === 0 ? 0.14 : 0.1), 0, 6);
      han.add(cup);
      var lit = n === 0 || (n <= nightIdx && n > 0);
      if (lit) { var fl = cone(0.02, 0.06, 0xffcf5a, n * 0.075, (n === 0 ? 0.15 + 0.14 : 0.15 + 0.1) + 0.09, 0, 5); fl.material = mat(0xffe08a, { emissive: 0xffcf5a, emissiveIntensity: 1 }); han.add(fl); }
    }
    han.position.set(c.x - 2.5, 0, c.z - 3);
    g.add(han);
  } else if (name === 'tuBishvat') {
    var petalGeo = new THREE.PlaneGeometry(0.05, 0.05);
    var petals = new THREE.InstancedMesh(petalGeo, new THREE.MeshBasicMaterial({ color: 0xffb0d0, side: THREE.DoubleSide, transparent: true }), 40);
    var rnd = seedRand(21); var dummy2 = new THREE.Object3D();
    for (var p = 0; p < 40; p++) { dummy2.position.set(c.x + (rnd() - 0.5) * 6, 1 + rnd() * 3, c.z + (rnd() - 0.5) * 6); dummy2.rotation.set(rnd(), rnd(), 0); dummy2.updateMatrix(); petals.setMatrixAt(p, dummy2.matrix); }
    petals.instanceMatrix.needsUpdate = true; g.add(petals); g.userData.petals = petals;
  } else if (name === 'purim') {
    /* מסכות/כובעים צנועים וצבעוניים על התושבים — לא תחפושות מפחידות/לא-צנועות */
    for (var vi = 0; vi < LIFE.villagers.length; vi++) applyPurimHat(LIFE.villagers[vi], vi);
  } else if (name === 'pesach') {
    var matzaGeo = new THREE.BoxGeometry(0.16, 0.015, 0.16);
    var matza = new THREE.InstancedMesh(matzaGeo, mat(0xe8d19a), 5);
    var dummy3 = new THREE.Object3D();
    for (var mI = 0; mI < 5; mI++) { dummy3.position.set(c.x - 3 + mI * 0.03, 0.05 + mI * 0.02, c.z - 2); dummy3.updateMatrix(); matza.setMatrixAt(mI, dummy3.matrix); }
    matza.instanceMatrix.needsUpdate = true; g.add(matza);
  } else if (name === 'yomHaatzmaut') {
    var flagGeo = new THREE.PlaneGeometry(0.22, 0.16);
    for (var fx = 0; fx < 6; fx++) {
      var pole = cyl(0.012, 0.012, 0.6, 0xdddddd, c.x + Math.cos(fx) * 4, 0.3, c.z + Math.sin(fx) * 4, 5); g.add(pole);
      var flag = new THREE.Mesh(flagGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      var stripe1 = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.03), new THREE.MeshBasicMaterial({ color: 0x1a5fc4, side: THREE.DoubleSide }));
      stripe1.position.y = 0.05; var stripe2 = stripe1.clone(); stripe2.position.y = -0.05;
      var star = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), new THREE.MeshBasicMaterial({ color: 0x1a5fc4 }));
      var fgrp = new THREE.Group(); fgrp.add(flag); fgrp.add(stripe1); fgrp.add(stripe2); fgrp.add(star);
      fgrp.position.set(pole.position.x + 0.11, 0.5, pole.position.z);
      fgrp.userData.wave = fx; g.add(fgrp); g.userData.flags = g.userData.flags || []; g.userData.flags.push(fgrp);
    }
  }
}
function hanukkahNightIndex() {
  var row = null; var y = new Date().getFullYear();
  var r1 = HOLIDAY_TABLE[y], r0 = HOLIDAY_TABLE[y - 1];
  var range = (r1 && r1.hanukkah && inRange(ymd(new Date()), r1.hanukkah)) ? r1.hanukkah : (r0 && r0.hanukkah ? r0.hanukkah : null);
  if (!range) return 0;
  var start = new Date(range[0] + 'T00:00:00');
  var diffDays = Math.floor((new Date() - start) / 86400000);
  return clamp(diffDays, 0, 7);
}
function tickHoliday(t, dt) {
  var h = currentHoliday();
  if (h !== LIFE.lastHoliday) {
    clearHoliday(); LIFE.lastHoliday = h;
    if (h) { buildHolidayDecor(h); akToast(holidayGreeting(h)); }
  } else if (h === 'hanukkah') {
    /* מספר הנרות משתנה מדי לילה — בונים מחדש רק אם האינדקס השתנה */
    var idx = hanukkahNightIndex();
    if (LIFE.holidayActive.hanukkahIdx !== idx) { LIFE.holidayActive.hanukkahIdx = idx; clearHoliday(); buildHolidayDecor('hanukkah'); LIFE.lastHoliday = 'hanukkah'; }
  }
  if (h === 'tuBishvat' && LIFE.holidayGroup && LIFE.holidayGroup.userData.petals && !LIFE.reducedMotion) LIFE.holidayGroup.userData.petals.rotation.y = t * 0.3;
  if (h === 'yomHaatzmaut' && LIFE.holidayGroup && LIFE.holidayGroup.userData.flags && !LIFE.reducedMotion) LIFE.holidayGroup.userData.flags.forEach(function (fg) { fg.rotation.y = Math.sin(t * 3 + fg.userData.wave) * 0.35; });
}
function holidayGreeting(h) {
  var map = { sukkot: '🍃 חג סוכות שמח לכל הכיתה!', hanukkah: '🕎 חנוכה שמח — עוד נר נדלק באי!', tuBishvat: '🌸 ט"ו בשבט שמח — האי פורח!', purim: '🎭 פורים שמח לכל האי!', pesach: '🍃 חג פסח כשר ושמח!', yomHaatzmaut: '🇮🇱 יום העצמאות שמח!' };
  return map[h] || '';
}

/* ===================================================================================
 * 11. גילוי וסוד — אירועים נדירים שמתרחשים לבד, לתגמל סקרנות
 * =================================================================================== */
function tickDiscovery(t, dt) {
  if (LIFE.reducedMotion) return;
  tickShip(t, dt); tickFallingStar(t, dt); tickBottle(t, dt); tickHiddenCorners(t);
}
function tickShip(t, dt) {
  var d = LIFE.discovery;
  if (!d.ship) {
    d.shipT -= dt; if (d.shipT > 0) return;
    d.shipT = 140 + Math.random() * 220;
    if (Math.random() > 0.5) return; /* לא כל פעם — נדיר */
    var sc = scene(); if (!sc) return;
    var boat = new THREE.Group();
    boat.add(box(1.2, 0.3, 0.4, 0x8a5a2b, 0, 0.15, 0));
    boat.add(cyl(0.02, 0.02, 0.8, 0x6b4423, -0.2, 0.6, 0, 5));
    var sail = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    sail.position.set(-0.2, 0.75, 0); boat.add(sail);
    var span = RING_R0 + REGION_IDS.length * RING_STEP + 20;
    boat.position.set(-span, -0.15, span * 0.6); boat.userData.vx = 0.9 + Math.random() * 0.4;
    sc.add(boat); d.ship = boat;
  } else {
    d.ship.position.x += d.ship.userData.vx * dt;
    d.ship.rotation.y = Math.sin(t * 0.4) * 0.05;
    var span = RING_R0 + REGION_IDS.length * RING_STEP + 25;
    if (d.ship.position.x > span) { scene().remove(d.ship); disposeObj(d.ship); d.ship = null; }
  }
}
function tickFallingStar(t, dt) {
  var d = LIFE.discovery;
  var ISL = LIFE.ISL; var nightish = ISL && ISL.ambient;
  if (!d.star) {
    d.starT -= dt; if (d.starT > 0) return;
    d.starT = 40 + Math.random() * 90;
    if (!nightish || Math.random() > 0.35) return;
    var sc = scene(); if (!sc) return;
    var geo = new THREE.SphereGeometry(0.06, 6, 5);
    var star = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
    var c = regionCenter(regionIndex(ISL.activeId));
    star.position.set(c.x - 30 + Math.random() * 20, 40, c.z - 20 - Math.random() * 20);
    star.userData.v = { x: 1.6, y: -1.1, z: 0.6 };
    sc.add(star); d.star = star; d.starLife = 2.2;
  } else {
    d.star.position.x += d.star.userData.v.x * dt * 4;
    d.star.position.y += d.star.userData.v.y * dt * 4;
    d.star.position.z += d.star.userData.v.z * dt * 4;
    d.starLife -= dt; d.star.material.opacity = clamp(d.starLife / 2.2, 0, 1);
    if (d.starLife <= 0) { scene().remove(d.star); disposeObj(d.star); d.star = null; }
  }
}
var BOTTLE_MESSAGES = ['הכיתה הכי מגניבה באי! 🌟', 'כל יום אתם בונים משהו יפה יותר 💛', 'האי גאה בכם!', 'תמשיכו כך — משהו גדול נבנה כאן ✨', 'מישהו/י מוכשר/ת עומד/ת מאחורי כל אבן פה'];
function tickBottle(t, dt) {
  var d = LIFE.discovery;
  if (!d.bottle) {
    d.bottleT -= dt; if (d.bottleT > 0) return;
    d.bottleT = 200 + Math.random() * 260;
    if (fullRegionIds().indexOf('beach') < 0) return; /* מגיע רק לחוף */
    var sc = scene(); if (!sc) return;
    var c = regionCenter(regionIndex('beach'));
    var b = new THREE.Group();
    b.add(cyl(0.03, 0.05, 0.14, 0x4ac98a, 0, 0.07, 0, 8));
    b.add(cyl(0.015, 0.02, 0.05, 0x4ac98a, 0, 0.16, 0, 8));
    b.position.set(c.x + GRID / 2 - 0.5, 0.05, c.z + GRID / 2 - 1);
    sc.add(b); d.bottle = b; d.bottleShown = false;
    LIFE.bottleTimer = 3;
  } else if (!d.bottleShown) {
    LIFE.bottleTimer -= dt;
    if (LIFE.bottleTimer <= 0) { akToast('🍾 ' + BOTTLE_MESSAGES[Math.floor(Math.random() * BOTTLE_MESSAGES.length)]); d.bottleShown = true; d.bottleRemove = 30; }
  } else {
    d.bottleRemove -= dt;
    if (d.bottleRemove <= 0) { scene().remove(d.bottle); disposeObj(d.bottle); d.bottle = null; }
  }
}
/* פינות נסתרות — 2 עיטורים קטנים קבועים לכל אזור, מוסתרים (scale~0) עד שהמצלמה מתקרבת */
function tickHiddenCorners(t) {
  var full = fullRegionIds();
  for (var i = 0; i < full.length; i++) {
    var rid = full[i];
    ensureHiddenCorner(rid);
  }
  for (var key in LIFE.hiddenCorners || {}) {
    var hc = LIFE.hiddenCorners[key];
    var cp = camPos(); var d = hc.group.position.distanceTo(cp);
    var reveal = clamp(1 - (d - 6) / 8, 0, 1);
    hc.group.scale.setScalar(0.15 + reveal * 0.85);
  }
}
function ensureHiddenCorner(regionId) {
  LIFE.hiddenCorners = LIFE.hiddenCorners || {};
  if (LIFE.hiddenCorners[regionId]) return;
  var sc = scene(); if (!sc) return;
  var idx = regionIndex(regionId); var c = regionCenter(idx);
  var g = new THREE.Group();
  if (regionId === 'beach') {
    g.add(box(0.3, 0.05, 0.14, 0x9c7a45, 0, 0.02, 0));
    g.add(sph(0.05, 0xff5a5a, 0.1, 0.06, 0, 6));
  } else {
    g.add(sph(0.14, 0x8a8a8a, 0, 0.14, 0, 6));
    for (var k = 0; k < 3; k++) g.add(sph(0.03, 0xff9ab0, -0.08 + k * 0.08, 0.2, 0.02, 5));
  }
  g.position.set(c.x + GRID / 2 - 0.6, 0, c.z - GRID / 2 + 0.6);
  g.scale.setScalar(0.15);
  sc.add(g); LIFE.hiddenCorners[regionId] = { group: g };
}

/* ===================================================================================
 * 12. האי מגיב לכיתה — מצב-רוח, התקהלות סביב בנייה חדשה, חגיגת פתיחת אזור
 * =================================================================================== */
function tickReactive(t, dt) {
  var isl = activeIslState(); if (!isl) return;
  var m = LIFE.dailyBaseline.map || {};
  var klass = activeClass();
  var pointsToday = 0;
  if (klass) klass.students.forEach(function (s) { var b = m[s.id]; if (b != null) pointsToday += Math.max(0, (s.points || 0) - b); });
  var targetMood = clamp(0.35 + pointsToday / 130, 0.35, 1);
  LIFE.mood = lerp(LIFE.mood, targetMood, 0.01);
  var sc = scene();
  if (sc && sc.fog && LIFE.mood > 0.55) {
    var vivid = new THREE.Color(0xffe27a);
    sc.fog.color.lerp(vivid, (LIFE.mood - 0.55) * 0.12);
  }
  if (LIFE.lastCounts.items < 0) LIFE.lastCounts.items = isl.items.length;
  if (LIFE.lastCounts.regions < 0) LIFE.lastCounts.regions = isl.regions.length;
  if (isl.items.length > LIFE.lastCounts.items) {
    var newest = isl.items[isl.items.length - 1];
    triggerGather(newest.r, false);
    LIFE.lastCounts.items = isl.items.length;
  }
  if (isl.regions.length > LIFE.lastCounts.regions) {
    triggerGather(isl.regions[isl.regions.length - 1], true);
    LIFE.lastCounts.regions = isl.regions.length;
    akConfetti(window.innerWidth / 2, window.innerHeight / 3, 70);
  }
}
function triggerGather(regionId, big) {
  var idx = regionIndex(regionId); if (idx < 0) return;
  var c = regionCenter(idx);
  var pool = LIFE.villagers.filter(function (v) { return v.homeRegion === regionId; });
  var n = big ? pool.length : Math.min(pool.length, 4 + Math.floor(Math.random() * 3));
  for (var i = 0; i < n; i++) {
    var v = pool[Math.floor(Math.random() * pool.length)];
    var ang = Math.random() * Math.PI * 2, rad = 0.6 + Math.random() * 1.6;
    v.state = 'gather'; v.stateT = 0; v.target.x = c.x + Math.cos(ang) * rad; v.target.z = c.z + Math.sin(ang) * rad; v.stateDur = 9 + Math.random() * 4;
  }
}
/* 'gather' משתמש באותה תנועת seek כמו walk/sit; נכנס למקצה ה-FSM הרגיל דרך stepVillagerBehavior
 * (הבדיקה שם כבר כוללת את שמות המצבים 'walk'/'sit'/'group'/'gohome' — נוסיף 'gather' לרשימה) */

/* ===================================================================================
 * 13. בדיקה תקופתית מרכזת — הכל שלא צריך לרוץ כל פריים (כל ~2 שנ', כמו checkAutoUnlocks)
 * =================================================================================== */
function periodicCheck(now) {
  tickPetGrowth();
  tickTreeGrowth();
}

/* ===================================================================================
 * 14. עדכון אנימציות חלקיקים משותף (burst מהצמיחה + לבבות)
 * =================================================================================== */
function tickParticles(dt) {
  var arr = LIFE.particles || [];
  for (var j = arr.length - 1; j >= 0; j--) {
    var p = arr[j]; p.t += dt;
    p.node.position.x += p.vx * dt; p.node.position.z += p.vz * dt; p.node.position.y += p.vy * dt;
    p.vy -= 5 * dt;
    p.node.material.opacity = clamp(1 - p.t / p.dur, 0, 1);
    if (p.t >= p.dur) { var sc = scene(); if (sc) sc.remove(p.node); p.node.material.dispose(); if (p.onDone) p.onDone(); arr.splice(j, 1); }
  }
  var anims = LIFE.anims || [];
  for (var k = anims.length - 1; k >= 0; k--) {
    var a = anims[k]; a.t += dt;
    if (a.kind === 'heart') { a.node.position.y = 2.9 + a.t * 0.5; a.node.material.opacity = clamp(1 - a.t / a.dur, 0, 1); }
    if (a.t >= a.dur) { if (a.parent) a.parent.remove(a.node); if (a.node.material.map) a.node.material.map.dispose(); a.node.material.dispose(); anims.splice(k, 1); }
  }
}

/* ===================================================================================
 * 15. userData.animate לכל אובייקטי החיים — נקרא מתוך tick() הראשי (לא ע"י המנוע,
 *     כי אנחנו לא ילדים של regionGroups שה-stepFrame כבר סורק)
 * =================================================================================== */
function tickAnimatedObjects(t, dt) {
  if (LIFE.petObj && LIFE.petObj.group.userData.animate) LIFE.petObj.group.userData.animate(t, dt);
  for (var rid in LIFE.trees) if (LIFE.trees[rid].group.userData.animate) LIFE.trees[rid].group.userData.animate(t, dt);
}

/* ===================================================================================
 * 16. API ציבורי — attach / tick / detach / setReducedMotion
 * =================================================================================== */
function doAttach(ISL) {
  LIFE.ISL = ISL;
  var sc = ISL.scene;
  if (!sc) return;
  LIFE.group = new THREE.Group(); LIFE.group.name = 'ak-island-life';
  sc.add(LIFE.group);
  LIFE.villagers = []; LIFE.villagerById = {};
  LIFE.lastCounts = { items: -1, regions: -1 };
  LIFE.attached = true;
  syncVillagerRoster();
}
window.IslandLife = {
  attach: function (ISL) {
    if (!ISL) return;
    if (LIFE.attached) doDetach();
    try { doAttach(ISL); } catch (e) { console.error('[IslandLife] attach נכשל', e); }
  },
  tick: function (t, dt) {
    if (!LIFE.attached || !LIFE.ISL || !LIFE.ISL.scene) return;
    dt = Math.min(0.05, dt || 0.016);
    LIFE.clockT = t;
    try {
      tickVillagers(t, dt);
      tickWeather(t, dt);
      tickSeason(t, dt);
      tickNight(t, dt);
      tickHoliday(t, dt);
      tickDiscovery(t, dt);
      tickReactive(t, dt);
      tickParticles(dt);
      tickAnimatedObjects(t, dt);
      tickGrowthOverlay(dt);
      LIFE.lastPeriodic = LIFE.lastPeriodic || 0;
      if ((LIFE.ISL.clock ? LIFE.ISL.clock.elapsed : t) - LIFE.lastPeriodic > 2) { LIFE.lastPeriodic = t; periodicCheck(t); }
    } catch (e) { console.error('[IslandLife] tick נכשל', e); }
  },
  detach: function () { try { doDetach(); } catch (e) { console.error('[IslandLife] detach נכשל', e); } },
  setReducedMotion: function (on) { LIFE.reducedMotion = !!on; }
};
function doDetach() {
  if (!LIFE.attached) return;
  var sc = scene();
  if (sc) {
    if (LIFE.group) { sc.remove(LIFE.group); disposeObj(LIFE.group); }
    if (LIFE.petObj) { sc.remove(LIFE.petObj.group); disposeObj(LIFE.petObj.group); if (LIFE.petObj.ruler) { sc.remove(LIFE.petObj.ruler); disposeObj(LIFE.petObj.ruler); } }
    for (var rid in LIFE.trees) { sc.remove(LIFE.trees[rid].group); disposeObj(LIFE.trees[rid].group); if (LIFE.trees[rid].ruler) { sc.remove(LIFE.trees[rid].ruler); disposeObj(LIFE.trees[rid].ruler); } }
    if (LIFE.weather.mesh.rain) { sc.remove(LIFE.weather.mesh.rain); disposeObj(LIFE.weather.mesh.rain); }
    if (LIFE.weather.mesh.rainbow) { sc.remove(LIFE.weather.mesh.rainbow); disposeObj(LIFE.weather.mesh.rainbow); }
    if (LIFE.seasonProps.leaves) { sc.remove(LIFE.seasonProps.leaves); disposeObj(LIFE.seasonProps.leaves); }
    if (LIFE.seasonProps.butterflies) { sc.remove(LIFE.seasonProps.butterflies); disposeObj(LIFE.seasonProps.butterflies); }
    if (LIFE.overlay && LIFE.overlay.parentNode) LIFE.overlay.parentNode.removeChild(LIFE.overlay);
    if (LIFE.nightProps) { ['stars', 'moon', 'campfire'].forEach(function (k) { if (LIFE.nightProps[k]) { sc.remove(LIFE.nightProps[k]); disposeObj(LIFE.nightProps[k]); } }); (LIFE.nightProps.lanterns || []).forEach(function (l) { sc.remove(l); disposeObj(l); }); }
    if (LIFE.holidayGroup) { sc.remove(LIFE.holidayGroup); disposeObj(LIFE.holidayGroup); }
    var d = LIFE.discovery;
    ['ship', 'star', 'bottle'].forEach(function (k) { if (d[k]) { sc.remove(d[k]); disposeObj(d[k]); } });
    for (var hk in LIFE.hiddenCorners || {}) { sc.remove(LIFE.hiddenCorners[hk].group); disposeObj(LIFE.hiddenCorners[hk].group); }
  }
  for (var key in LIFE.fullRigCache) { disposeObj(LIFE.fullRigCache[key].rig); if (LIFE.fullRigCache[key].pet) disposeObj(LIFE.fullRigCache[key].pet); }
  LIFE.fullRigCache = {}; LIFE.fullRigOrder = [];
  LIFE.villagers = []; LIFE.villagerById = {}; LIFE.petObj = null; LIFE.trees = {};
  LIFE.nightProps = null; LIFE.hiddenCorners = {}; LIFE.holidayGroup = null; LIFE.lastHoliday = '';
  LIFE.discovery = { ship: null, shipT: 25, merchant: null, merchantT: -1, star: null, starT: 12, bottle: null, bottleT: 35 };
  /* חובה לאפס את ה-mesh caches עצמם (לא רק להסיר מהסצנה) — אחרת ensureWeatherMeshes/
   * ensureSeasonMeshes יראו הפניה "אמיתית" (אבל מנוקזת/disposed) וידלגו על יצירה מחדש
   * ב-attach() הבא, והגשם/העלים/הפרפרים יישברו לצמיתות אחרי כל מחזור detach+attach */
  LIFE.weather.mesh = {}; LIFE.weather.drops = null;
  LIFE.seasonProps = {};
  LIFE.overlay = null; LIFE.overlayTimer = 0; LIFE.growthQueue = [];
  LIFE.group = null; LIFE.attached = false; LIFE.ISL = null;
}

})();
