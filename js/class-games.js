/* =====================================================================================
 *  אקדמיית כוכבים — משחק ההפסקה הכיתתי (class-games.js)
 *  ---------------------------------------------------------------------------------
 *  סוכן C. מציית ל-RESEARCH.md (20 ההחלטות התכנוניות) ול-SPEC.md פרק 2 + פרק 5.
 *  תלוי ב-window.AK (המתאם) בלבד. אינו נוגע ב-THREE.js / island-engine — Canvas 2D + DOM.
 *  אפס עומס מורה: הכל אוטומטי-אלגוריתמי, שיפוט בלי הזנת תוכן, בלי תלות במבוגר.
 *  ES5-friendly, IIFE יחיד, אין import/export, אין תלות חדשה.
 *  חשיפה יחידה החוצה: window.ClassGames = {open,close,timeBank,pickPlayer,onPointsAdded}.
 * ===================================================================================== */
(function () {
'use strict';

/* ===================================================================================
 * 0. עזרי בטיחות מול window.AK — לעולם לא קורס גם אם AK חלקי/חסר
 * =================================================================================== */
function AKref() { return window.AK || null; }
function akSave() { var ak = AKref(); if (ak && typeof ak.save === 'function') { try { ak.save(); } catch (e) {} } }
function akToast(msg) { var ak = AKref(); if (ak && typeof ak.toast === 'function') { try { ak.toast(msg); } catch (e) {} } else { try { console.log('[ClassGames] ' + msg); } catch (e2) {} } }
function akSound(t) { var ak = AKref(); if (ak && typeof ak.playSound === 'function') { try { ak.playSound(t); } catch (e) {} } }
function akConfetti(x, y, n) { var ak = AKref(); if (ak && typeof ak.burstConfetti === 'function') { try { ak.burstConfetti(x, y, n); } catch (e) {} } }
function akEsc(s) {
  var ak = AKref();
  if (ak && typeof ak.escapeHtml === 'function') { try { return ak.escapeHtml(s); } catch (e) {} }
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function activeClass() {
  var ak = AKref();
  if (ak && typeof ak.getActiveClass === 'function') { try { return ak.getActiveClass(); } catch (e) {} }
  return null;
}

/* raf/caf עם נפילה רכה למקרה נדיר של דפדפן/מקרן ישן מאוד */
var raf = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };
var caf = window.cancelAnimationFrame || function (id) { clearTimeout(id); };

/* ===================================================================================
 * 1. עזרים כלליים
 * =================================================================================== */
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function todayStr(d) { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function clampInt(v, lo, hi) { return clamp(Math.round(v), lo, hi); }
function weekKey(d) {
  d = d || new Date();
  var onejan = new Date(d.getFullYear(), 0, 1);
  var dayOfYear = Math.floor((d - onejan) / 86400000) + 1;
  var week = Math.ceil((dayOfYear + onejan.getDay()) / 7);
  return d.getFullYear() + '-W' + week;
}
/* הגרלה משוקללת (lottery scheduling) — items[], weightFn(item)->מספר>=0. נפילה רכה לאחיד אם כל המשקלים 0. */
function weightedPick(items, weightFn) {
  if (!items || !items.length) return null;
  var weights = [], total = 0, i;
  for (i = 0; i < items.length; i++) {
    var w = Math.max(0, weightFn(items[i]) || 0);
    weights.push(w);
    total += w;
  }
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];
  var r = Math.random() * total;
  for (i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/* ===================================================================================
 * 2. state — klass.games (הגנה מלאה, שדות ה-SPEC + שדות פנימיים לבעלות המודול הזה בלבד)
 * =================================================================================== */
function ensureGamesState(klass) {
  klass.games = klass.games || {};
  var g = klass.games;
  /* שדות מה-SPEC — לא לשנות משמעות */
  if (typeof g.lastPlayed !== 'number') g.lastPlayed = 0;
  if (typeof g.totalScore !== 'number') g.totalScore = 0;
  if (!g.plays) g.plays = [];
  if (typeof g.dailyDone !== 'boolean') g.dailyDone = false;
  /* שדות פנימיים (בעלות class-games.js בלבד) */
  if (typeof g.dailyDate !== 'string') g.dailyDate = todayStr();
  if (typeof g.dailyPoints !== 'number') g.dailyPoints = 0;
  if (!g.dailyPointsByStudent) g.dailyPointsByStudent = {};
  if (!g.lastPlayedByStudent) g.lastPlayedByStudent = {};
  if (!g.playedSet) g.playedSet = [];
  if (typeof g.weekBonusDate !== 'string') g.weekBonusDate = '';
  if (typeof g.weekStartCoinsSnapshot !== 'number') g.weekStartCoinsSnapshot = 0;
  rolloverDay(g);
  return g;
}
function rolloverDay(g) {
  var t = todayStr();
  if (g.dailyDate !== t) {
    g.dailyDate = t;
    g.dailyPoints = 0;
    g.dailyPointsByStudent = {};
    g.dailyDone = false;
  }
}
function ensureIslandDefaults(klass) {
  /* class-games.js מפקיד בונוס ישיר ל-island.coins — מגן על הצורה גם אם island-engine עוד לא רץ */
  klass.island = klass.island || {};
  var isl = klass.island;
  if (typeof isl.coins !== 'number') isl.coins = 0;
  if (typeof isl.spent !== 'number') isl.spent = 0;
  if (!isl.regions || !isl.regions.length) isl.regions = ['beach'];
  if (!isl.items) isl.items = [];
  if (typeof isl.level !== 'number') isl.level = 1;
  if (!isl.history) isl.history = [];
  return isl;
}
function pushIslandHistory(klass, text) {
  var isl = ensureIslandDefaults(klass);
  isl.history.unshift({ type: 'game', text: text, t: Date.now() });
  if (isl.history.length > 50) isl.history.length = 50;
}

/* ===================================================================================
 * 3. נוסחת "זמן כמטבע" — החלטה 2-4 (RESEARCH פרק 10.4): 20 + min(40, floor(נק'/3)), תקרה 60
 * =================================================================================== */
function timeBank(klass) {
  klass = klass || activeClass();
  if (!klass) return 20;
  var g = ensureGamesState(klass);
  var pts = Math.max(0, g.dailyPoints || 0);
  return clampInt(20 + Math.min(40, Math.floor(pts / 3)), 20, 60);
}

/* ===================================================================================
 * 4. hook על addPoints — המתאם קורא לזה מתוך addPoints() הקיים (ראו README)
 *    תפקיד יחיד: מעדכן "נקודות היום" (לנוסחת הזמן + לבחירת שחקן). לא נוגע ב-student.points
 *    ולא ממיר בעצמו ל-island.coins (המרה 10:1 היא hook נפרד, כבר מוגדר ב-SPEC).
 * =================================================================================== */
function onPointsAdded(student, amount) {
  try {
    var klass = activeClass();
    if (!klass) return;
    var g = ensureGamesState(klass);
    var sid = student && typeof student === 'object' ? student.id : student;
    var amt = Number(amount) || 0;
    if (!sid || !amt) return;
    g.dailyPoints = Math.max(0, (g.dailyPoints || 0) + amt);
    g.dailyPointsByStudent[sid] = Math.max(0, (g.dailyPointsByStudent[sid] || 0) + amt);
    akSave();
  } catch (e) { /* לעולם לא מפיל את addPoints הקיים */ }
}

/* ===================================================================================
 * 5. בחירת שחקן/ית היום — 50/50 (החלטה 14): מחצית לפי נקודות היום (הגרלה משוקללת),
 *    מחצית הגרלה משוקללת הפוכה לפי "מתי שיחק/ה לאחרונה", עם משקל 0 קשיח למי שכבר
 *    שיחק/ה במחזור הנוכחי (מתאפס כשכולם שיחקו) — פרק 5.2 של המחקר.
 * =================================================================================== */
function pickPlayer(klass) {
  klass = klass || activeClass();
  if (!klass || !klass.students || !klass.students.length) return null;
  var g = ensureGamesState(klass);
  var students = klass.students;
  var byToday = Math.random() < 0.5;
  if (byToday) {
    return weightedPick(students, function (s) {
      return 1 + (g.dailyPointsByStudent[s.id] || 0); /* בסיס 1 -> הפול אף פעם לא "מת" */
    });
  }
  return weightedPick(students, function (s) {
    if (g.playedSet.indexOf(s.id) !== -1) return 0; /* כבר שיחק/ה במחזור הזה */
    var last = g.lastPlayedByStudent[s.id] || 0;
    return Math.max(1, Date.now() - last); /* לא שיחק/ה מעולם -> משקל ענק */
  });
}
/* נקרא רק בסיום סשן אמיתי (לא ב-pickPlayer עצמו, כדי ש-pickPlayer יישאר טהור/חסר-תופעות-לוואי) */
function markPlayed(klass, g, studentId) {
  if (!studentId) return;
  g.lastPlayedByStudent[studentId] = Date.now();
  if (g.playedSet.indexOf(studentId) === -1) g.playedSet.push(studentId);
  if (klass.students && g.playedSet.length >= klass.students.length) g.playedSet = []; /* איפוס מחזור */
}

/* ===================================================================================
 * 6. תפקידי אי ברוטציה קודית אוטומטית (החלטה 18, פרק 8.4) — לתצוגה בלבד, לא שוער
 * =================================================================================== */
function weeklyRoles(klass) {
  if (!klass || !klass.students || !klass.students.length) return null;
  var n = klass.students.length;
  var wk = Math.floor(Date.now() / (7 * 86400000));
  var idx = ((wk % n) + n) % n;
  return {
    toren: klass.students[idx],
    committee: [klass.students[(idx + 1) % n], klass.students[(idx + 2) % n]],
    cashier: klass.students[(idx + 3) % n]
  };
}

/* ===================================================================================
 * 7. UI משותף — DOM/CSS, ≤15 מילים למסך, גופן Bold ענק, ניגודיות מלאה (החלטה 15)
 * =================================================================================== */
var ROOT_ID = 'ak-classgames-root';
var STYLE_ID = 'ak-classgames-style';
var Z = 9500;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  var css =
    '#' + ROOT_ID + '{position:fixed;inset:0;z-index:' + Z + ';background:#050714;direction:rtl;' +
      'font-family:Heebo,Arial,sans-serif;overflow:hidden;color:#fff;}' +
    '#' + ROOT_ID + ' *{box-sizing:border-box;}' +
    '.ak-cg-bg{position:absolute;inset:0;background:radial-gradient(circle at 50% 20%,#1a1c3d 0%,#050714 70%);}' +
    '.ak-cg-wrap{position:relative;z-index:1;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2vh 3vw;gap:1.6vh;}' +
    '.ak-cg-h1{font-family:"Rubik Mono One",Heebo,sans-serif;font-size:8vh;line-height:1.15;font-weight:900;' +
      'background:linear-gradient(90deg,#ff2e93,#00f5ff,#ffe600);-webkit-background-clip:text;background-clip:text;color:transparent;' +
      'text-shadow:0 0 40px rgba(255,255,255,0.15);max-width:92vw;}' +
    '.ak-cg-h2{font-size:6.2vh;font-weight:900;color:#ffe600;max-width:90vw;}' +
    '.ak-cg-body{font-size:6vh;font-weight:800;color:#fff;max-width:90vw;}' +
    '.ak-cg-badge{display:inline-block;padding:1.2vh 3vw;border-radius:999px;font-size:6.2vh;font-weight:900;' +
      'background:linear-gradient(135deg,#00f5ff,#0088ff);color:#001018;box-shadow:0 0 30px rgba(0,245,255,0.5);}' +
    '.ak-cg-count{font-family:"Rubik Mono One",sans-serif;font-size:22vh;font-weight:900;color:#ffe600;' +
      'text-shadow:0 0 50px #ffe600;animation:ak-cg-pop .55s cubic-bezier(.34,1.56,.64,1);}' +
    '.ak-cg-timerwrap{position:absolute;top:2vh;left:50%;transform:translateX(-50%);width:70vw;max-width:900px;z-index:3;}' +
    '.ak-cg-timerbar{position:relative;height:5vh;border-radius:999px;background:rgba(255,255,255,0.12);overflow:hidden;border:3px solid rgba(255,255,255,0.25);}' +
    '.ak-cg-timerfill{position:absolute;inset:0;width:100%;border-radius:999px;transition:width .12s linear,background .3s;}' +
    '.ak-cg-t-green{background:linear-gradient(90deg,#00ff88,#00cc66);}' +
    '.ak-cg-t-amber{background:linear-gradient(90deg,#ffcf00,#ff8c00);}' +
    '.ak-cg-t-red{background:linear-gradient(90deg,#ff4d4d,#ff2e2e);}' +
    '.ak-cg-timernum{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-family:"Rubik Mono One",sans-serif;font-size:3.4vh;color:#050714;font-weight:900;}' +
    '.ak-cg-fillbar{width:60vw;max-width:800px;height:4.5vh;border-radius:999px;background:rgba(255,255,255,0.12);border:3px solid rgba(255,255,255,0.25);overflow:hidden;}' +
    '.ak-cg-fillinner{height:100%;width:0%;background:linear-gradient(90deg,#00ff88,#00e0ff);border-radius:999px;transition:width 2.2s ease-out;box-shadow:0 0 20px #00ff88;}' +
    '.ak-cg-stage{position:relative;width:min(94vw,1100px);height:56vh;border-radius:24px;background:linear-gradient(180deg,#0d1030,#050714);' +
      'border:4px solid rgba(255,255,255,0.14);overflow:visible;margin-top:10vh;}' +
    '.ak-cg-canvas{width:100%;height:100%;display:block;}' +
    '.ak-cg-caption{position:absolute;top:-7.6vh;left:50%;transform:translateX(-50%);font-size:5.4vh;font-weight:900;' +
      'color:#fff;background:rgba(0,0,0,0.5);padding:0.8vh 2.4vw;border-radius:999px;white-space:nowrap;max-width:92vw;overflow:hidden;text-overflow:ellipsis;}' +
    '.ak-cg-close{position:absolute;top:1.6vh;left:1.6vh;width:5.5vh;height:5.5vh;border-radius:50%;background:rgba(255,255,255,0.14);' +
      'color:#fff;font-size:2.6vh;font-weight:900;border:none;cursor:pointer;z-index:9;}' +
    /* .ak-cg-role/.ak-cg-timernum/.ak-cg-key מתחת ל-6vh בכוונה: טקסט משני/תפעולי-מקומי (תפקיד שבועי,
     * מונה בתוך פס צר, מקלדת שמופעלת מקרוב ע"י תורן/ית אחד/ת) ולא המסר המרכזי שהקהל מהשורה האחורית
     * חייב לקרוא — עדיין הרבה מעל רף ה-22px המוחלט (SPEC 5.2). */
    '.ak-cg-role{font-size:3.4vh;font-weight:800;color:#00f5ff;background:rgba(0,245,255,0.1);padding:0.8vh 2vw;border-radius:14px;max-width:88vw;}' +
    '.ak-cg-quadgrid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:1.4vh;width:100%;height:100%;padding:1.6vh;}' +
    '.ak-cg-quad{border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:6vh;font-weight:900;color:#fff;' +
      'cursor:pointer;transition:transform .1s;user-select:none;text-shadow:0 2px 6px rgba(0,0,0,0.4);}' +
    '.ak-cg-quad:active{transform:scale(0.94);}' +
    '.ak-cg-quad.hit{animation:ak-cg-pulse .35s ease-out;}' +
    '.ak-cg-target{position:absolute;top:2vh;left:50%;transform:translateX(-50%);font-size:7vh;font-weight:900;' +
      'padding:0.6vh 3vw;border-radius:16px;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,0.5);}' +
    '.ak-cg-keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:1.2vh;width:60vw;max-width:520px;margin:0 auto;}' +
    '.ak-cg-key{font-size:4.2vh;font-weight:900;padding:1.4vh 0;border-radius:14px;border:none;cursor:pointer;' +
      'background:rgba(255,255,255,0.14);color:#fff;}' +
    '.ak-cg-key:active{transform:scale(0.93);}' +
    '.ak-cg-key.ok{background:linear-gradient(135deg,#00ff88,#00cc66);color:#001018;}' +
    '.ak-cg-key.del{background:linear-gradient(135deg,#ff4d4d,#ff2e2e);}' +
    '.ak-cg-guessbox{font-family:"Rubik Mono One",sans-serif;font-size:9vh;color:#ffe600;min-height:11vh;letter-spacing:.4vw;}' +
    '.ak-cg-shake{animation:ak-cg-shake .4s;}' +
    '@keyframes ak-cg-pop{0%{transform:scale(.2);opacity:0;}70%{transform:scale(1.15);opacity:1;}100%{transform:scale(1);}}' +
    '@keyframes ak-cg-pulse{0%{transform:scale(1);}50%{transform:scale(1.08);}100%{transform:scale(1);}}' +
    '@keyframes ak-cg-shake{0%,100%{transform:translateX(0);}20%{transform:translateX(-1.2vw);}40%{transform:translateX(1.2vw);}' +
      '60%{transform:translateX(-.8vw);}80%{transform:translateX(.8vw);}}';
  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}
function getRoot() {
  var root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ROOT_ID;
    document.body.appendChild(root);
  }
  return root;
}
function closeButtonHtml() { return '<button class="ak-cg-close" onclick="window.ClassGames.close()" title="סגירה">✕</button>'; }

/* ===================================================================================
 * 8. מנוע הסשן — מצב יחיד גלובלי, עם ניקוי מלא בכל close()
 * =================================================================================== */
var SESSION = { running: false, klass: null, student: null, game: null, duration: 0,
  timers: [], rafIds: [], listeners: [] };

function trackTimer(id) { SESSION.timers.push(id); return id; }
function trackRaf(id) { SESSION.rafIds.push(id); return id; }
function trackListener(target, type, fn, opts) { target.addEventListener(type, fn, opts); SESSION.listeners.push([target, type, fn, opts]); }
function clearSession() {
  var i;
  for (i = 0; i < SESSION.timers.length; i++) clearTimeout(SESSION.timers[i]);
  for (i = 0; i < SESSION.rafIds.length; i++) caf(SESSION.rafIds[i]);
  for (i = 0; i < SESSION.listeners.length; i++) {
    try { SESSION.listeners[i][0].removeEventListener(SESSION.listeners[i][1], SESSION.listeners[i][2], SESSION.listeners[i][3]); } catch (e) {}
  }
  SESSION.timers = []; SESSION.rafIds = []; SESSION.listeners = [];
}

var GAME_IDS = ['meteor', 'treasure', 'colorrush'];
var GAME_META = {
  meteor: { name: 'מרוץ המטאור', icon: '☄️', caption: 'כולם קוראים בקול: קפוץ!' },
  treasure: { name: 'ניחוש הקופה', icon: '💰', caption: 'כל הכיתה צועקת מספר בקול!' },
  colorrush: { name: 'מירוץ הצבעים', icon: '🌈', caption: 'הרימו יד לכיוון הצבע שנקרא!' },
  confetti: { name: 'מסיבת הקונפטי', icon: '🎉', caption: 'כולם קמים ומוחאים כפיים!' }
};

function pickGameForToday(d) {
  d = d || new Date();
  var day = d.getDay(); /* 0=ראשון..6=שבת */
  if (day === 5 || day === 6) return 'confetti'; /* יום שישי/שבת = מסיבת הקונפטי (החלטה: לא תחרותי) */
  var dayIndex = Math.floor(d.getTime() / 86400000);
  var idx = ((dayIndex % GAME_IDS.length) + GAME_IDS.length) % GAME_IDS.length;
  return GAME_IDS[idx];
}

/* ---------- כניסה ראשית ---------- */
function open(opts) {
  if (SESSION.running) return; /* כבר רץ סשן — לא פותחים כפול */
  var klass = activeClass();
  if (!klass || !klass.students || !klass.students.length) { akToast('אין תלמידים בכיתה הפעילה'); return; }
  injectStyle();
  var g = ensureGamesState(klass);
  var gameId = (opts && opts.game) || pickGameForToday();
  var duration = timeBank(klass);
  SESSION.running = true;
  SESSION.klass = klass;
  SESSION.game = gameId;
  SESSION.duration = duration;
  SESSION.student = (gameId === 'confetti') ? null : pickPlayer(klass);
  SESSION.gState = g;
  getRoot();
  if (gameId === 'confetti') renderConfettiAnnounce();
  else renderAnnounce();
}
function close() {
  clearSession();
  var root = document.getElementById(ROOT_ID);
  if (root && root.parentNode) root.parentNode.removeChild(root);
  SESSION.running = false;
  SESSION.klass = null; SESSION.student = null; SESSION.game = null; SESSION.duration = 0; SESSION.gState = null;
}

/* ===================================================================================
 * 9. מסך הכרזה (skill games) — שם השחקן/ית, כמה שניות הרווחנו, בר עולה, 3-2-1
 * =================================================================================== */
function renderAnnounce() {
  var root = getRoot();
  var meta = GAME_META[SESSION.game];
  var name = SESSION.student ? akEsc(SESSION.student.name) : 'הכיתה';
  var roles = weeklyRoles(SESSION.klass);
  var torenLine = roles && roles.toren ? ('🖱️ תורן/ית האי: ' + akEsc(roles.toren.name)) : '';
  root.innerHTML =
    '<div class="ak-cg-bg"></div>' + closeButtonHtml() +
    '<div class="ak-cg-wrap">' +
      '<div class="ak-cg-h2">' + meta.icon + ' היום משחק/ת:</div>' +
      '<div class="ak-cg-badge">' + name + '</div>' +
      '<div class="ak-cg-body">הרווחנו <span id="ak-cg-secnum">0</span> שניות משחק! 🎮</div>' +
      '<div class="ak-cg-fillbar"><div class="ak-cg-fillinner" id="ak-cg-fill"></div></div>' +
      (torenLine ? '<div class="ak-cg-role">' + torenLine + '</div>' : '') +
      '<div id="ak-cg-cd" style="min-height:22vh"></div>' +
    '</div>';
  var fillEl = document.getElementById('ak-cg-fill');
  var numEl = document.getElementById('ak-cg-secnum');
  requestAnimTick(fillEl, numEl);
  trackTimer(setTimeout(function () { runCountdown(function () { renderPlay(); }); }, 2600));
}
function requestAnimTick(fillEl, numEl) {
  var target = SESSION.duration;
  trackTimer(setTimeout(function () {
    if (fillEl) fillEl.style.width = Math.round((target / 60) * 100) + '%';
  }, 30));
  var start = Date.now(), dur = 1400;
  function step() {
    var p = clamp((Date.now() - start) / dur, 0, 1);
    if (numEl) numEl.textContent = Math.round(p * target);
    if (p < 1) trackRaf(raf(step));
  }
  trackRaf(raf(step));
}
function runCountdown(done) {
  var root = getRoot();
  var cd = document.getElementById('ak-cg-cd');
  var seq = [3, 2, 1];
  var i = 0;
  function tick() {
    if (i >= seq.length) { if (cd) cd.innerHTML = ''; done(); return; }
    if (cd) cd.innerHTML = '<div class="ak-cg-count">' + seq[i] + '</div>';
    akSound('coin');
    i++;
    trackTimer(setTimeout(tick, 650));
  }
  tick();
}

/* ===================================================================================
 * 10. מסך המשחק — טיימר יחיד משותף (ירוק→ענבר→אדום), תמיד מסתיים בחגיגה
 * =================================================================================== */
function playTemplateShell() {
  var meta = GAME_META[SESSION.game];
  return '<div class="ak-cg-bg"></div>' + closeButtonHtml() +
    '<div class="ak-cg-timerwrap"><div class="ak-cg-timerbar"><div class="ak-cg-timerfill ak-cg-t-green" id="ak-cg-tfill" style="width:100%"></div>' +
      '<div class="ak-cg-timernum" id="ak-cg-tnum">' + SESSION.duration + '</div></div></div>' +
    '<div class="ak-cg-wrap" style="justify-content:flex-start;padding-top:9vh;">' +
      '<div class="ak-cg-h2">' + meta.icon + ' ' + meta.name + '</div>' +
      '<div class="ak-cg-stage" id="ak-cg-stage"><div class="ak-cg-caption">' + meta.caption + '</div></div>' +
    '</div>';
}
function renderPlay() {
  var root = getRoot();
  root.innerHTML = playTemplateShell();
  var stage = document.getElementById('ak-cg-stage');
  var barFill = document.getElementById('ak-cg-tfill');
  var barNum = document.getElementById('ak-cg-tnum');
  var runner = RUNNERS[SESSION.game];
  var duration = SESSION.duration;
  var startT = Date.now();
  runner.start({ stage: stage, duration: duration, student: SESSION.student, klass: SESSION.klass });
  var done = false;
  function tick() {
    if (done) return;
    var elapsed = (Date.now() - startT) / 1000;
    var remaining = Math.max(0, duration - elapsed);
    var frac = duration > 0 ? remaining / duration : 0;
    if (barFill) {
      barFill.style.width = (frac * 100) + '%';
      barFill.className = 'ak-cg-timerfill ' + (frac > 0.5 ? 'ak-cg-t-green' : (frac > 0.2 ? 'ak-cg-t-amber' : 'ak-cg-t-red'));
    }
    if (barNum) barNum.textContent = Math.ceil(remaining);
    if (remaining <= 0) {
      done = true;
      var perf = 0.5;
      try { perf = runner.finish(); } catch (e) { perf = 0.5; }
      try { runner.cleanup(); } catch (e2) {}
      renderCelebrate(clamp(perf, 0, 1));
      return;
    }
    trackRaf(raf(tick));
  }
  trackRaf(raf(tick));
}

/* ===================================================================================
 * 11. מסך חגיגה — מכפיל x1/x1.5/x2, קונפטי, המרה ל-island.coins, ניסוח חיובי בלעדי
 * =================================================================================== */
var BASE_BONUS = 4;
function tierFor(perf) {
  if (perf >= 0.75) return { mult: 2, stars: '⭐⭐⭐', label: 'מעולה!' };
  if (perf >= 0.4) return { mult: 1.5, stars: '⭐⭐', label: 'יופי!' };
  return { mult: 1, stars: '⭐', label: 'כל הכבוד!' };
}
function renderCelebrate(perf) {
  var klass = SESSION.klass, g = SESSION.gState;
  var meta = GAME_META[SESSION.game];
  var tier = tierFor(perf);
  var coins = Math.round(BASE_BONUS * tier.mult);
  ensureIslandDefaults(klass).coins += coins;
  pushIslandHistory(klass, '🎮 קיבלנו ' + coins + ' אבני בניין ממשחק ה' + meta.name + '!');
  g.totalScore = (g.totalScore || 0) + coins;
  g.plays.push({ gameId: SESSION.game, studentId: SESSION.student ? SESSION.student.id : null, score: coins, t: Date.now() });
  if (g.plays.length > 100) g.plays = g.plays.slice(-100);
  g.lastPlayed = Date.now();
  g.dailyDone = true;
  markPlayed(klass, g, SESSION.student ? SESSION.student.id : null);
  akSave();
  var roles = weeklyRoles(klass);
  var cashierLine = roles && roles.cashier ? ('📣 ' + akEsc(roles.cashier.name) + ' — הכריזו את התוצאה בקול!') : '';
  var extra = (SESSION.game === 'treasure' && RUNNERS.treasure.lastResult)
    ? ('<div class="ak-cg-body">הסוד היה ' + RUNNERS.treasure.lastResult.secret + ', ניחשתם ' + RUNNERS.treasure.lastResult.guess + '!</div>') : '';
  var multChip = tier.mult > 1 ? ('<div class="ak-cg-role">בונוס ' + tier.stars + ' × ' + tier.mult + '!</div>') : '';
  var root = getRoot();
  root.innerHTML =
    '<div class="ak-cg-bg"></div>' + closeButtonHtml() +
    '<div class="ak-cg-wrap">' +
      '<div class="ak-cg-h1">🎉 ' + tier.label + '</div>' +
      extra +
      '<div class="ak-cg-h2">קיבלנו ' + coins + ' אבני בניין לאי!</div>' +
      multChip +
      '<div class="ak-cg-body">הכיתה בנתה עוד קצת ⭐</div>' +
      (cashierLine ? '<div class="ak-cg-role">' + cashierLine + '</div>' : '') +
    '</div>';
  akSound('rankup');
  fireConfettiBursts(6);
  trackTimer(setTimeout(close, 16000));
}
function fireConfettiBursts(n) {
  var w = window.innerWidth || 1200, h = window.innerHeight || 700;
  var i = 0;
  function one() {
    if (i >= n) return;
    akConfetti(w * (0.2 + Math.random() * 0.6), h * (0.25 + Math.random() * 0.3), 45);
    i++;
    trackTimer(setTimeout(one, 260));
  }
  one();
}

/* ===================================================================================
 * 12. מסיבת הקונפטי (#10) — שישי, לא תחרותי, 20-40 שניות קבועות, ללא מנצח
 * =================================================================================== */
function renderConfettiAnnounce() {
  var klass = SESSION.klass;
  var roles = weeklyRoles(klass);
  var cashierName = roles && roles.cashier ? akEsc(roles.cashier.name) : '';
  var root = getRoot();
  root.innerHTML =
    '<div class="ak-cg-bg"></div>' + closeButtonHtml() +
    '<div class="ak-cg-wrap">' +
      '<div class="ak-cg-h1">🎉 מסיבת סיום השבוע!</div>' +
      '<div class="ak-cg-body">בואו נחגוג את מה שבנינו יחד ⭐</div>' +
      (cashierName ? ('<div class="ak-cg-role">📣 ' + cashierName + ' — מכריז/ה את השבוע!</div>') : '') +
    '</div>';
  akSound('coin');
  trackTimer(setTimeout(renderConfettiRecap, 5000));
}
function renderConfettiRecap() {
  var klass = SESSION.klass, g = SESSION.gState;
  var isl = ensureIslandDefaults(klass);
  var wk = weekKey();
  var delta;
  if (g.weekBonusDate !== wk) {
    delta = Math.max(0, isl.coins - (g.weekStartCoinsSnapshot || 0));
    g.weekStartCoinsSnapshot = isl.coins;
    g.weekBonusDate = wk;
  } else {
    delta = Math.max(0, isl.coins - (g.weekStartCoinsSnapshot || 0));
  }
  var itemsCount = isl.items ? isl.items.length : 0;
  var root = getRoot();
  root.innerHTML =
    '<div class="ak-cg-bg"></div>' + closeButtonHtml() +
    '<div class="ak-cg-wrap">' +
      '<div class="ak-cg-h2">השבוע הרווחנו</div>' +
      '<div class="ak-cg-h1"><span id="ak-cg-weeknum">0</span> 🧱</div>' +
      '<div class="ak-cg-body">באי שלנו כבר ' + itemsCount + ' מבנים!</div>' +
    '</div>';
  var numEl = document.getElementById('ak-cg-weeknum');
  var start = Date.now(), dur = 1300;
  function step() {
    var p = clamp((Date.now() - start) / dur, 0, 1);
    if (numEl) numEl.textContent = Math.round(p * delta);
    if (p < 1) trackRaf(raf(step)); else akSound('combo');
  }
  trackRaf(raf(step));
  trackTimer(setTimeout(renderConfettiCelebrate, 8000));
}
function renderConfettiCelebrate() {
  var klass = SESSION.klass, g = SESSION.gState;
  var bonus = 5;
  ensureIslandDefaults(klass).coins += bonus;
  pushIslandHistory(klass, '🎉 מתנת מסיבת סיום השבוע: ' + bonus + ' אבני בניין!');
  g.totalScore = (g.totalScore || 0) + bonus;
  g.plays.push({ gameId: 'confetti', studentId: null, score: bonus, t: Date.now() });
  if (g.plays.length > 100) g.plays = g.plays.slice(-100);
  g.lastPlayed = Date.now();
  g.dailyDone = true;
  akSave();
  var root = getRoot();
  root.innerHTML =
    '<div class="ak-cg-bg"></div>' + closeButtonHtml() +
    '<div class="ak-cg-wrap">' +
      '<div class="ak-cg-h1">🎊 איזה שבוע מדהים! 🎊</div>' +
      '<div class="ak-cg-h2">+' + bonus + ' אבני בניין מתנה!</div>' +
      '<div class="ak-cg-body">כל הכבוד לכל הכיתה! 👏</div>' +
    '</div>';
  akSound('rankup');
  fireConfettiBursts(10);
  trackTimer(setTimeout(close, 14000));
}

/* ===================================================================================
 * 13. Runners — כל משחק חושף {start(ctx), finish()->0..1, cleanup()}
 * =================================================================================== */
var RUNNERS = {};

/* ---------- 13.1 מרוץ המטאור (Meteor Dash) ---------- */
RUNNERS.meteor = (function () {
  var canvas, cx, stageEl, W, H;
  var groundY, playerX, playerY, playerVY, onGround;
  var obstacles, successCount, resolvedCount, totalObstacles;
  var startT, active, rafId, resizeFn, keyFn, clickFn;
  var GRAV = 1800, JUMP_V = -720;

  function resize() {
    var r = stageEl.getBoundingClientRect();
    W = canvas.width = r.width; H = canvas.height = r.height;
    groundY = H * 0.78; playerX = W * 0.16;
  }
  function jump() { if (onGround) { playerVY = JUMP_V; onGround = false; } }
  function spawnPlan(duration) {
    totalObstacles = clampInt(3 + (duration - 20) * (9 / 40), 3, 12);
    var plan = [], i;
    for (i = 0; i < totalObstacles; i++) {
      var frac = (i + 1) / (totalObstacles + 0.4); /* דחוס מעט לקראת הסוף -> שיא */
      frac = Math.pow(frac, 0.82);
      plan.push(duration * frac * 1000);
    }
    return plan;
  }
  function start(ctx) {
    stageEl = ctx.stage;
    stageEl.insertAdjacentHTML('afterbegin', '<canvas class="ak-cg-canvas"></canvas>');
    canvas = stageEl.querySelector('canvas'); cx = canvas.getContext('2d');
    resize();
    resizeFn = function () { resize(); };
    trackListener(window, 'resize', resizeFn);
    playerY = groundY; playerVY = 0; onGround = true;
    successCount = 0; resolvedCount = 0;
    var plan = spawnPlan(ctx.duration);
    obstacles = [];
    startT = Date.now(); active = true;
    var i;
    for (i = 0; i < plan.length; i++) {
      (function (delay) {
        trackTimer(setTimeout(function () {
          if (!active) return;
          obstacles.push({ x: W + 40, resolved: false, double: false });
        }, delay));
      })(plan[i]);
    }
    keyFn = function (e) { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); } };
    clickFn = function () { jump(); };
    trackListener(document, 'keydown', keyFn);
    trackListener(canvas, 'pointerdown', clickFn);
    loop();
  }
  function loop() {
    if (!active) return;
    var dt = 1 / 60;
    playerVY += GRAV * dt;
    playerY += playerVY * dt;
    if (playerY >= groundY) { playerY = groundY; playerVY = 0; onGround = true; }
    var elapsed = (Date.now() - startT) / 1000;
    var speed = 220 + elapsed * 9;
    var i;
    for (i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      o.x -= speed * dt;
      if (!o.resolved && o.x < playerX + 18 && o.x > playerX - 18) {
        o.resolved = true; resolvedCount++;
        if (playerY < groundY - 26) successCount++;
      }
    }
    draw();
    rafId = trackRaf(raf(loop));
  }
  /* כוכבי רקע — נוצרים פעם אחת, נעים בפרלקסה איטית */
  var stars = null;
  function ensureStars() {
    if (stars && stars.w === W) return;
    stars = { w: W, list: [] };
    var n = Math.round(W / 22);
    for (var i = 0; i < n; i++) {
      stars.list.push({
        x: Math.random() * W,
        y: Math.random() * (groundY * 0.82),
        r: 0.8 + Math.random() * 1.9,
        tw: Math.random() * 6.28,
        sp: 0.15 + Math.random() * 0.5
      });
    }
  }
  function draw() {
    var t = Date.now() / 1000;
    ensureStars();
    cx.clearRect(0, 0, W, H);

    /* שמי לילה בגרדיאנט */
    var g = cx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#101a4d'); g.addColorStop(0.55, '#1b2a63'); g.addColorStop(1, '#24365f');
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);

    /* כוכבים מנצנצים */
    for (var si = 0; si < stars.list.length; si++) {
      var st = stars.list[si];
      st.x -= st.sp * 0.6; if (st.x < -4) st.x = W + 4;
      var a = 0.35 + 0.45 * Math.sin(t * 2 + st.tw);
      cx.globalAlpha = a;
      cx.fillStyle = '#ffffff';
      cx.beginPath(); cx.arc(st.x, st.y, st.r, 0, 6.283); cx.fill();
    }
    cx.globalAlpha = 1;

    /* גבעות רקע (פרלקסה) */
    var hillOff = (t * 14) % (W + 400);
    cx.fillStyle = 'rgba(30,60,90,0.55)';
    for (var hx = -400; hx < W + 400; hx += 400) {
      cx.beginPath();
      cx.ellipse(hx - hillOff + 200, groundY + 10, 230, 90, 0, Math.PI, 0);
      cx.fill();
    }

    /* קרקע — דשא עם פס עליון בהיר */
    var gg = cx.createLinearGradient(0, groundY, 0, H);
    gg.addColorStop(0, '#4fbf5e'); gg.addColorStop(1, '#1f6b34');
    cx.fillStyle = gg; cx.fillRect(0, groundY + 4, W, H - groundY);
    cx.fillStyle = '#7ee08a'; cx.fillRect(0, groundY + 4, W, 6);

    /* צל רך מתחת לדמות — נותן תחושת גובה בקפיצה */
    var air = Math.max(0, (groundY - playerY) / 150);
    cx.globalAlpha = 0.32 * (1 - air * 0.7);
    cx.fillStyle = '#000';
    cx.beginPath();
    cx.ellipse(playerX, groundY + 8, 22 - air * 8, 7 - air * 3, 0, 0, 6.283);
    cx.fill();
    cx.globalAlpha = 1;

    /* ===== שחקן/ית — דמות רצה עם רגליים, ידיים וזנב אור ===== */
    cx.save();
    cx.translate(playerX, playerY);
    var run = t * 13;
    var squash = onGround ? 1 + Math.sin(run) * 0.04 : 1.1;

    /* רגליים מתחלפות (קפואות באוויר) */
    var legA = onGround ? Math.sin(run) * 13 : -9;
    var legB = onGround ? Math.sin(run + 3.14) * 13 : 11;
    cx.strokeStyle = '#0b5f9e'; cx.lineWidth = 7; cx.lineCap = 'round';
    cx.beginPath(); cx.moveTo(-4, -6); cx.lineTo(-4 + legA, 2); cx.stroke();
    cx.beginPath(); cx.moveTo(5, -6); cx.lineTo(5 + legB, 2); cx.stroke();

    /* גוף */
    cx.fillStyle = '#00d9f5';
    roundRect(cx, -15, -36 * squash, 30, 32 * squash, 10);
    cx.fill();
    /* חולצה — פס בהיר */
    cx.fillStyle = 'rgba(255,255,255,0.35)';
    roundRect(cx, -15, -20, 30, 6, 3); cx.fill();

    /* ידיים */
    cx.strokeStyle = '#00d9f5'; cx.lineWidth = 6;
    var armA = onGround ? Math.sin(run + 3.14) * 11 : -14;
    cx.beginPath(); cx.moveTo(-13, -28); cx.lineTo(-13 - 8, -28 + armA); cx.stroke();
    cx.beginPath(); cx.moveTo(13, -28); cx.lineTo(13 + 8, -28 - armA); cx.stroke();

    /* ראש */
    cx.beginPath(); cx.arc(0, -46 * squash, 15, 0, 6.283);
    cx.fillStyle = '#ffd98a'; cx.fill();
    /* שיער */
    cx.beginPath(); cx.arc(0, -50 * squash, 15, 3.34, 6.08); cx.fillStyle = '#5a3312'; cx.fill();
    /* עיניים + חיוך */
    cx.fillStyle = '#1a1a2e';
    cx.beginPath(); cx.arc(5, -48 * squash, 2.6, 0, 6.283); cx.fill();
    cx.beginPath(); cx.arc(-4, -48 * squash, 2.6, 0, 6.283); cx.fill();
    cx.strokeStyle = '#1a1a2e'; cx.lineWidth = 2;
    cx.beginPath(); cx.arc(0.5, -44 * squash, 5, 0.25, 2.9); cx.stroke();
    cx.restore();

    /* ===== מכשולים — מטאורים בוערים עם זנב ===== */
    var i;
    for (i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      var oy = groundY - 18;
      cx.save();
      cx.translate(o.x, oy);

      /* זנב אש */
      var tail = cx.createLinearGradient(0, 0, 62, -20);
      tail.addColorStop(0, 'rgba(255,170,40,0.85)');
      tail.addColorStop(1, 'rgba(255,60,60,0)');
      cx.fillStyle = tail;
      cx.beginPath(); cx.moveTo(6, -8); cx.lineTo(64, -26); cx.lineTo(60, 6); cx.closePath(); cx.fill();

      /* הילה */
      cx.globalAlpha = 0.5 + 0.25 * Math.sin(t * 9 + i);
      cx.fillStyle = o.resolved ? '#7CFFB2' : '#ff9d3c';
      cx.beginPath(); cx.arc(0, 0, 24, 0, 6.283); cx.fill();
      cx.globalAlpha = 1;

      /* גוף הסלע */
      cx.rotate((Date.now() / 420) % 6.283);
      cx.fillStyle = o.resolved ? '#2fbf6e' : '#c9432e';
      cx.beginPath();
      for (var k = 0; k < 7; k++) {
        var ang = k * 6.283 / 7;
        var rr = 15 + ((k % 2) ? -3.5 : 3.5);
        if (k === 0) cx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
        else cx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
      }
      cx.closePath(); cx.fill();
      /* מכתשים */
      cx.fillStyle = 'rgba(0,0,0,0.22)';
      cx.beginPath(); cx.arc(-4, -3, 4, 0, 6.283); cx.fill();
      cx.beginPath(); cx.arc(5, 4, 2.6, 0, 6.283); cx.fill();
      cx.restore();
    }
  }
  /* מלבן מעוגל — אין roundRect בכל דפדפן שהכיתה עשויה להריץ */
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function finish() {
    active = false;
    if (resolvedCount <= 0) return 0.6; /* אין עונש על תזמון גרוע של הטיימר */
    return clamp(successCount / Math.max(1, totalObstacles), 0, 1);
  }
  function cleanup() { active = false; }
  return { start: start, finish: finish, cleanup: cleanup };
})();

/* ---------- 13.2 ניחוש הקופה (Treasure Guess) ---------- */
RUNNERS.treasure = (function () {
  var secret, guessStr, locked, lo, hi, stageEl, keyFn, lastResult;
  function render() {
    var rangeTxt = 'בין ' + lo + ' ל-' + hi;
    stageEl.innerHTML =
      '<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.4vh;padding:2vh;">' +
        '<div class="ak-cg-h2" style="font-size:4.4vh">💰 ' + (locked ? 'התשובה ננעלה!' : rangeTxt) + '</div>' +
        '<div class="ak-cg-guessbox">' + (guessStr || '?') + '</div>' +
        (locked ? '<div class="ak-cg-body" style="font-size:3.2vh">מחכים לחשיפה... ⏳</div>' : keypadHtml()) +
      '</div>' +
      '<div class="ak-cg-caption">' + GAME_META.treasure.caption + '</div>';
    if (!locked) bindKeypad();
  }
  function keypadHtml() {
    var digits = ['1','2','3','4','5','6','7','8','9','⌫','0','✔'];
    var html = '<div class="ak-cg-keypad">';
    var i;
    for (i = 0; i < digits.length; i++) {
      var d = digits[i];
      var cls = d === '✔' ? 'ak-cg-key ok' : (d === '⌫' ? 'ak-cg-key del' : 'ak-cg-key');
      html += '<button type="button" class="' + cls + '" data-k="' + d + '">' + d + '</button>';
    }
    return html + '</div>';
  }
  function bindKeypad() {
    var btns = stageEl.querySelectorAll('.ak-cg-key');
    var i;
    for (i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () { pressKey(btn.getAttribute('data-k')); });
      })(btns[i]);
    }
  }
  function pressKey(k) {
    if (locked) return;
    if (k === '⌫') guessStr = (guessStr || '').slice(0, -1);
    else if (k === '✔') { if (guessStr && guessStr.length) lockGuess(); }
    else if ((guessStr || '').length < 3) guessStr = (guessStr || '') + k;
    render();
  }
  function lockGuess() {
    locked = true;
    render();
  }
  function narrowHint() {
    var span = Math.max(20, Math.round((hi - lo) * 0.42));
    lo = Math.max(0, secret - Math.floor(span / 2));
    hi = secret + Math.ceil(span / 2);
    if (!locked) render();
  }
  function start(ctx) {
    secret = 40 + Math.floor(Math.random() * 160);
    lo = 0; hi = 250; guessStr = ''; locked = false; lastResult = null;
    stageEl = ctx.stage;
    render();
    keyFn = function (e) {
      if (locked) return;
      if (/^[0-9]$/.test(e.key)) pressKey(e.key);
      else if (e.key === 'Backspace') pressKey('⌫');
      else if (e.key === 'Enter') pressKey('✔');
    };
    trackListener(document, 'keydown', keyFn);
    var hints = ctx.duration <= 30 ? 0 : (ctx.duration <= 45 ? 1 : 2);
    var i;
    for (i = 0; i < hints; i++) {
      (function (delay) { trackTimer(setTimeout(narrowHint, delay)); })(ctx.duration * 1000 * (0.35 + i * 0.28));
    }
  }
  function finish() {
    var finalGuess = locked && guessStr ? parseInt(guessStr, 10) : Math.round((lo + hi) / 2);
    if (isNaN(finalGuess)) finalGuess = Math.round((lo + hi) / 2);
    var diff = Math.abs(secret - finalGuess);
    lastResult = { secret: secret, guess: finalGuess };
    RUNNERS.treasure.lastResult = lastResult;
    return clamp(1 - diff / 60, 0, 1);
  }
  function cleanup() {}
  return { start: start, finish: finish, cleanup: cleanup, lastResult: null };
})();

/* ---------- 13.3 מירוץ הצבעים (Color Rush) ---------- */
RUNNERS.colorrush = (function () {
  var COLORS = [
    { name: 'אדום', hex: '#ff2e4d' }, { name: 'צהוב', hex: '#ffce00' },
    { name: 'ירוק', hex: '#2ee6a8' }, { name: 'כחול', hex: '#2e8bff' }
  ];
  var stageEl, rounds, success, currentIdx, active, clickHandlers;
  function render() {
    var html = '<div class="ak-cg-quadgrid">';
    var i;
    for (i = 0; i < COLORS.length; i++) {
      html += '<div class="ak-cg-quad" data-i="' + i + '" style="background:' + COLORS[i].hex + '">' + COLORS[i].name + '</div>';
    }
    html += '</div><div class="ak-cg-caption">' + GAME_META.colorrush.caption + '</div>';
    stageEl.innerHTML = html;
    clickHandlers = [];
    var quads = stageEl.querySelectorAll('.ak-cg-quad');
    for (i = 0; i < quads.length; i++) {
      (function (q, idx) {
        var fn = function () { onPick(idx, q); };
        q.addEventListener('click', fn);
        clickHandlers.push([q, fn]);
      })(quads[i], i);
    }
  }
  function onPick(idx, q) {
    if (!active) return;
    q.classList.add('hit');
    if (idx === currentIdx) success++;
  }
  function nextRound(i, total, perRoundMs) {
    if (!active) return;
    if (i >= total) return; /* נגמרו הסיבובים לפני שנגמר הזמן — מחכים לחגיגה של הטיימר החיצוני */
    currentIdx = Math.floor(Math.random() * COLORS.length);
    var target = document.createElement('div');
    target.className = 'ak-cg-target';
    target.style.background = COLORS[currentIdx].hex;
    target.textContent = COLORS[currentIdx].name + '!';
    stageEl.appendChild(target);
    stageEl.classList.add('ak-cg-shake');
    trackTimer(setTimeout(function () { stageEl.classList.remove('ak-cg-shake'); }, 400));
    var windowMs = Math.max(500, 1600 - i * 180);
    trackTimer(setTimeout(function () {
      if (target.parentNode) target.parentNode.removeChild(target);
      trackTimer(setTimeout(function () { nextRound(i + 1, total, perRoundMs); }, Math.max(80, perRoundMs - windowMs)));
    }, Math.min(windowMs, perRoundMs)));
  }
  function start(ctx) {
    stageEl = ctx.stage;
    success = 0; active = true;
    rounds = clampInt(2 + (ctx.duration - 20) * (3 / 40), 2, 5);
    var perRoundMs = (ctx.duration * 1000) / rounds;
    render();
    nextRound(0, rounds, perRoundMs);
  }
  function finish() {
    active = false;
    return rounds > 0 ? clamp(success / rounds, 0, 1) : 0.5;
  }
  function cleanup() {
    active = false;
    if (clickHandlers) {
      var i;
      for (i = 0; i < clickHandlers.length; i++) {
        try { clickHandlers[i][0].removeEventListener('click', clickHandlers[i][1]); } catch (e) {}
      }
    }
  }
  return { start: start, finish: finish, cleanup: cleanup };
})();

/* ===================================================================================
 * 14. הפעלה עצמית (self-driving, החלטה 17) — אופציונלי, פועל רק במצב מקרן (?projector=1)
 *     ולא נדרס אם משחק כבר רץ היום. המורה לא נוגע בזה בכלל.
 * =================================================================================== */
var AUTO_TIME_DEFAULT = '12:15';
function isProjectorMode() {
  try { return /[?&]projector=1(&|#|$)/.test(location.search); } catch (e) { return false; }
}
function checkAutoDrive() {
  try {
    if (!isProjectorMode()) return;
    if (SESSION.running) return;
    var klass = activeClass();
    if (!klass) return;
    var g = ensureGamesState(klass);
    if (g.dailyDone) return;
    var target = (window.ClassGames && window.ClassGames.config && window.ClassGames.config.autoTime) || AUTO_TIME_DEFAULT;
    var parts = String(target).split(':');
    var th = parseInt(parts[0], 10), tm = parseInt(parts[1], 10);
    var now = new Date();
    if (now.getHours() === th && now.getMinutes() === tm) open();
  } catch (e) {}
}
setInterval(checkAutoDrive, 20000);

/* ===================================================================================
 * 15. חשיפה גלובלית
 * =================================================================================== */
window.ClassGames = {
  open: open,
  close: close,
  timeBank: timeBank,
  pickPlayer: pickPlayer,
  onPointsAdded: onPointsAdded,
  config: { autoTime: AUTO_TIME_DEFAULT }
};

})();
