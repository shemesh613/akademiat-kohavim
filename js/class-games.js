/* =====================================================================================
 *  אקדמיית כוכבים — משחק ההפסקה הכיתתי (class-games.js)
 *  ---------------------------------------------------------------------------------
 *  סוכן C. מציית ל-RESEARCH.md (20 ההחלטות התכנוניות) ול-SPEC.md פרק 2 + פרק 5.
 *  תלוי ב-window.AK (המתאם) בלבד. אינו נוגע ב-THREE.js / island-engine — Canvas 2D + DOM.
 *  אפס עומס מורה: הכל אוטומטי-אלגוריתמי, שיפוט בלי הזנת תוכן, בלי תלות במבוגר.
 *  ES5-friendly, IIFE יחיד, אין import/export, אין תלות חדשה.
 *  חשיפה יחידה החוצה: window.ClassGames = {open,close,timeBank,pickPlayer,onPointsAdded}.
 *
 *  ---------------------------------------------------------------------------------
 *  שדרוג עיצוב "מיץ" (juice) + שפת האי — 2026-07-21:
 *  1. "מיץ" גלובלי: מסך-מעבר קופץ בכל שינוי מסך (setScreen), רעידת-מסך (shakeEl),
 *     מספרים/טקסט צפים שקופצים (popText), הבזק-אור (flashStage), נצנצי DOM (sparkleBurst),
 *     זיקוקים (fireworks), ו-"hit-stop" (עצירה דרמטית קצרה) ברגעי שיא — hook חדש
 *     runner.outro(perf, done) שמאפשר לכל משחק לנגן פלישר קצר לפני מסך החגיגה.
 *  2. שפת עיצוב אחידה מ-RESEARCH_DESIGN.md: פלטת 5 הצבעים (זהב/אלמוג/שמיים/עלה/ענב),
 *     פאנלים בסגנון "שלט עץ" (קרם #fffaee + מסגרת חומה #a9713f 3px), גופן Heebo יחיד —
 *     במקום שאריות הניאון הישנות (זוהר טורקיז/צהוב על שקוף-כהה).
 *  3. שדרוג ויזואלי לכל משחק:
 *     - מרוץ המטאור: פרלקסה תלת-שכבתית (הרים רחוקים+קרובים), אבק ריצה, זנב-תנועה בקפיצה,
 *       אבק נחיתה, מטאור אחרון "שיא" שמתפוצץ בהבזק+רעידה+האטה דרמטית.
 *     - מירוץ הצבעים: כרטיסים מעוגלים עם עומק (בליטה), כניסה מדורגת, נצנצים+קומבו-פופ במגע.
 *     - ניחוש הקופה: תיבת אוצר מצוירת ב-Canvas (מראה תלת-מימדי), נפתחת דרמטית עם מטבעות
 *       מתפזרים ברגע החשיפה.
 *     - מסיבת הקונפטי: זיקוקים נוספים, שמות תלמידים מתחלפים ברצועת-קרדיטים חגיגית.
 *  4. משחק נוסף חדש: "מגדל הקוביות" (Block Tower Blitz) — קוביות נערמות בלחיצה אחת,
 *     מטאפורה ישירה לבניית האי; מצטרף לרוטציית 4 המשחקים היומיים.
 *  כל האילוצים הקשיחים (נוסחת זמן, ניסוח חיובי, איסור ייחוס שלילי לתלמיד, טיימר שמסתיים
 *  תמיד בחגיגה, prefers-reduced-motion, Canvas2D/DOM בלבד, ES5, API קיים) נשמרו במלואם.
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

/* prefers-reduced-motion — מכבד לחלוטין: מבטל רעידות-מסך/נצנצים/זיקוקים/פרלקסה עודפת,
 * המכניקה עצמה (טיימר/ניקוד/מעברי מסך) ממשיכה לפעול כרגיל, רק ה"מיץ" הוויזואלי מצטמצם. */
var REDUCED_MOTION = false;
try { REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (eRM) {}

/* פלטת 5 הצבעים המשותפת לכל המוצר (RESEARCH_DESIGN.md) + טונים ניטרליים ל"שלט עץ" */
var COLOR = {
  gold:  '#ffb800', coral: '#ff5d5d', sky: '#2ea8ff', leaf: '#34c759', grape: '#8b5cf6',
  cream: '#fffaee', wood:  '#a9713f', ink: '#1c2340', inkDim: '#5b6688'
};
var JUICE_COLORS = [COLOR.gold, COLOR.coral, COLOR.sky, COLOR.leaf, COLOR.grape];

/* עזרי מתמטיקה קטנים לאנימציות "מיץ" */
function lerp(a, b, t) { return a + (b - a) * t; }
function easeOutBack(t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
function rnd(lo, hi) { return lo + Math.random() * (hi - lo); }
function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

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
    '#' + ROOT_ID + '{position:fixed;inset:0;z-index:' + Z + ';background:#eaf6ff;direction:rtl;' +
      'font-family:Heebo,Arial,sans-serif;overflow:hidden;color:#1c2340;}' +
    '#' + ROOT_ID + ' *{box-sizing:border-box;}' +
    '.ak-cg-bg{position:absolute;inset:0;background:linear-gradient(180deg,#eaf6ff 0%,#d3ecff 60%,#c7e6ff 100%);}' +
    '.ak-cg-wrap{position:relative;z-index:1;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2vh 3vw;gap:1.6vh;}' +
    /* מסך-מעבר "מיץ" אחיד — כל setScreen() מוסיף את המחלקה הזו, כדי שכל החלפת מסך תיכנס בקפיצה קלה */
    '.ak-cg-screenin{animation:ak-cg-screenin .4s cubic-bezier(.22,1.4,.36,1);}' +
    '.ak-cg-h1{font-family:Heebo,Arial,sans-serif;font-size:8vh;line-height:1.15;font-weight:900;' +
      'color:#1c2340;text-shadow:0 3px 0 rgba(255,255,255,0.9);max-width:92vw;}' +
    '.ak-cg-h2{font-size:6.2vh;font-weight:900;color:#b06a00;max-width:90vw;}' +
    '.ak-cg-body{font-size:6vh;font-weight:800;color:#1c2340;max-width:90vw;}' +
    '.ak-cg-btn{margin-top:3vh;font-size:5vh;font-weight:900;color:#04121f;background:linear-gradient(135deg,#34c759,#2ea8ff);'+
      'border:3px solid #a9713f;border-radius:999px;padding:1.6vh 5vw;cursor:pointer;box-shadow:0 8px 24px rgba(20,30,60,.22);}' +
    '.ak-cg-btn:active{transform:scale(.94);}' +
    /* תגית שחקן/ית — "שלט עץ" קרם עם מסגרת חומה, במקום זוהר ניאון-טורקיז */
    '.ak-cg-badge{display:inline-block;padding:1.2vh 3vw;border-radius:999px;font-size:6.2vh;font-weight:900;' +
      'background:#fffaee;border:3px solid #a9713f;color:#1c2340;box-shadow:0 8px 20px rgba(20,30,60,.16);' +
      'animation:ak-cg-badgepop .5s cubic-bezier(.2,1.6,.4,1);}' +
    '.ak-cg-count{font-family:Heebo,Arial,sans-serif;font-size:22vh;font-weight:900;color:#ffb800;' +
      '-webkit-text-stroke:.35vh #1c2340;text-shadow:0 4px 0 rgba(0,0,0,.18);animation:ak-cg-countpop .55s cubic-bezier(.34,1.56,.64,1);}' +
    '.ak-cg-timerwrap{position:absolute;top:2vh;left:50%;transform:translateX(-50%);width:70vw;max-width:900px;z-index:3;}' +
    '.ak-cg-timerbar{position:relative;height:5.4vh;border-radius:999px;background:#fffaee;overflow:hidden;border:3px solid #a9713f;box-shadow:0 6px 14px rgba(20,30,60,.14);}' +
    '.ak-cg-timerfill{position:absolute;inset:0;width:100%;border-radius:999px;transition:width .12s linear,background .3s;}' +
    '.ak-cg-t-green{background:linear-gradient(90deg,#34c759,#2ea8ff);}' +
    '.ak-cg-t-amber{background:linear-gradient(90deg,#ffb800,#ff8c00);}' +
    '.ak-cg-t-red{background:linear-gradient(90deg,#ff5d5d,#ff2e2e);}' +
    '.ak-cg-timernum{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-family:Heebo,Arial,sans-serif;font-size:3.4vh;color:#1c2340;font-weight:900;}' +
    '.ak-cg-fillbar{width:60vw;max-width:800px;height:4.8vh;border-radius:999px;background:#fffaee;border:3px solid #a9713f;overflow:hidden;box-shadow:0 6px 14px rgba(20,30,60,.14);}' +
    '.ak-cg-fillinner{height:100%;width:0%;background:linear-gradient(90deg,#34c759,#ffb800);border-radius:999px;transition:width 2.2s ease-out;}' +
    /* בימת המשחק — פאנל "שלט עץ" קרם, זהה לשפת שאר המוצר (במקום גרדיאנט כחול-שחור) */
    '.ak-cg-stage{position:relative;width:min(94vw,1100px);height:56vh;border-radius:28px;background:#fffaee;' +
      'border:6px solid #a9713f;overflow:visible;margin-top:10vh;box-shadow:0 16px 40px rgba(20,30,60,.22);}' +
    '.ak-cg-canvas{width:100%;height:100%;display:block;border-radius:22px;}' +
    /* כיתוב תלוי — "שלט מעץ קטן" עם "חבל" תלייה קטן, לא יותר בועה שחורה-שקופה */
    '.ak-cg-caption{position:absolute;top:-8vh;left:50%;transform:translateX(-50%);font-size:5vh;font-weight:900;' +
      'color:#1c2340;background:#fffaee;border:3px solid #a9713f;padding:0.8vh 2.4vw;border-radius:16px;white-space:nowrap;' +
      'max-width:92vw;overflow:hidden;text-overflow:ellipsis;box-shadow:0 8px 18px rgba(20,30,60,.18);}' +
    '.ak-cg-close{position:absolute;top:1.6vh;left:1.6vh;width:5.5vh;height:5.5vh;border-radius:50%;background:#fffaee;' +
      'border:3px solid #a9713f;color:#1c2340;font-size:2.6vh;font-weight:900;cursor:pointer;z-index:9;}' +
    /* .ak-cg-role/.ak-cg-timernum/.ak-cg-key מתחת ל-6vh בכוונה: טקסט משני/תפעולי-מקומי (תפקיד שבועי,
     * מונה בתוך פס צר, מקלדת שמופעלת מקרוב ע"י תורן/ית אחד/ת) ולא המסר המרכזי שהקהל מהשורה האחורית
     * חייב לקרוא — עדיין הרבה מעל רף ה-22px המוחלט (SPEC 5.2). */
    '.ak-cg-role{font-size:3.4vh;font-weight:800;color:#1c2340;background:rgba(139,92,246,0.14);border:2px solid #8b5cf6;padding:0.8vh 2vw;border-radius:14px;max-width:88vw;}' +
    '.ak-cg-quadgrid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:1.6vh;width:100%;height:100%;padding:2vh;}' +
    '.ak-cg-quad{position:relative;border-radius:24px;display:flex;align-items:center;justify-content:center;font-size:6vh;font-weight:900;color:#fff;' +
      'border:4px solid rgba(255,255,255,.5);cursor:pointer;transition:transform .1s,filter .15s;user-select:none;' +
      'text-shadow:0 2px 6px rgba(0,0,0,0.35);box-shadow:0 8px 0 rgba(20,30,60,.22),0 14px 26px rgba(20,30,60,.22);' +
      'opacity:0;transform:scale(.5);animation:ak-cg-quadenter .45s cubic-bezier(.2,1.5,.4,1) forwards;}' +
    '.ak-cg-quad.warm{transform:scale(1.04);filter:brightness(1.25);}' +
    '.ak-cg-quad.live{transform:scale(1.08);filter:brightness(1.4);box-shadow:0 0 0 8px rgba(255,255,255,.9) inset,0 8px 0 rgba(20,30,60,.22);}' +
    '.ak-cg-quad:active{transform:scale(0.92) translateY(4px);box-shadow:0 2px 0 rgba(20,30,60,.22);}' +
    '.ak-cg-quad.hit{animation:ak-cg-pulse .35s ease-out;}' +
    '.ak-cg-target{position:absolute;top:2vh;left:50%;transform:translateX(-50%);font-size:7vh;font-weight:900;' +
      'padding:0.6vh 3vw;border-radius:16px;color:#fff;border:3px solid rgba(255,255,255,.55);text-shadow:0 2px 6px rgba(0,0,0,0.4);' +
      'animation:ak-cg-slam .32s cubic-bezier(.2,1.7,.4,1);}' +
    '.ak-cg-combo{position:absolute;top:2vh;right:2vw;font-size:4.4vh;font-weight:900;color:#fff;background:linear-gradient(135deg,#ffb800,#ff5d5d);' +
      'padding:0.6vh 2vw;border-radius:999px;border:3px solid #fff;box-shadow:0 8px 20px rgba(20,30,60,.3);animation:ak-cg-combopop .4s cubic-bezier(.2,1.7,.4,1);}' +
    '.ak-cg-keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:1.2vh;width:60vw;max-width:520px;margin:0 auto;}' +
    '.ak-cg-key{font-size:4.2vh;font-weight:900;padding:1.4vh 0;border-radius:16px;border:3px solid #a9713f;cursor:pointer;' +
      'background:#fffaee;color:#1c2340;box-shadow:0 5px 0 rgba(169,113,63,.5);}' +
    '.ak-cg-key:active{transform:translateY(4px);box-shadow:0 1px 0 rgba(169,113,63,.5);}' +
    '.ak-cg-key.ok{background:linear-gradient(135deg,#34c759,#2ea8ff);color:#04211a;}' +
    '.ak-cg-key.del{background:linear-gradient(135deg,#ff5d5d,#ff2e2e);color:#2a0505;}' +
    '.ak-cg-guessbox{font-family:Heebo,Arial,sans-serif;font-size:9vh;color:#1c2340;min-height:11vh;letter-spacing:.4vw;font-weight:900;}' +
    '.ak-cg-treasureui{position:absolute;left:0;right:0;bottom:1vh;display:flex;flex-direction:column;align-items:center;gap:1vh;}' +
    '.ak-cg-shake{animation:ak-cg-shake .4s;}' +
    '.ak-cg-shake-big{animation:ak-cg-shake-big .5s;}' +
    /* מספר/מילה שקופצת וצפה — "+3!"/"וואו!" — אחד מכלי ה"מיץ" המשותפים לכל המשחקים */
    '.ak-cg-popnum{position:absolute;transform:translate(-50%,-50%);font-size:5vh;font-weight:900;pointer-events:none;' +
      'text-shadow:0 2px 0 rgba(255,255,255,.6);animation:ak-cg-popnum .85s ease-out forwards;z-index:8;}' +
    '.ak-cg-flash{position:absolute;inset:0;border-radius:22px;opacity:.65;pointer-events:none;animation:ak-cg-flash .26s ease-out forwards;z-index:7;}' +
    '.ak-cg-sparkle{position:fixed;width:1.6vh;height:1.6vh;border-radius:50%;pointer-events:none;z-index:9600;' +
      'animation:ak-cg-sparkle .7s ease-out forwards;}' +
    '.ak-cg-namecycle{font-size:4.4vh;font-weight:900;color:#1c2340;background:#fffaee;border:3px solid #a9713f;' +
      'border-radius:16px;padding:0.6vh 3vw;margin-top:0.6vh;animation:ak-cg-namein .35s ease-out;}' +
    '@keyframes ak-cg-screenin{0%{opacity:0;transform:scale(.94);}100%{opacity:1;transform:scale(1);}}' +
    '@keyframes ak-cg-badgepop{0%{transform:scale(.3) rotate(-6deg);opacity:0;}70%{transform:scale(1.12) rotate(2deg);opacity:1;}100%{transform:scale(1) rotate(0);}}' +
    '@keyframes ak-cg-countpop{0%{transform:scale(.2);opacity:0;}55%{transform:scale(1.3,.75);}75%{transform:scale(.9,1.15);}100%{transform:scale(1);opacity:1;}}' +
    '@keyframes ak-cg-quadenter{0%{opacity:0;transform:scale(.5);}100%{opacity:1;transform:scale(1);}}' +
    '@keyframes ak-cg-slam{0%{transform:translateX(-50%) scale(1.6) rotate(-4deg);opacity:0;}60%{transform:translateX(-50%) scale(.92) rotate(2deg);opacity:1;}100%{transform:translateX(-50%) scale(1) rotate(0);}}' +
    '@keyframes ak-cg-combopop{0%{transform:scale(0) rotate(-10deg);opacity:0;}70%{transform:scale(1.2) rotate(4deg);}100%{transform:scale(1) rotate(0);opacity:1;}}' +
    '@keyframes ak-cg-pop{0%{transform:scale(.2);opacity:0;}70%{transform:scale(1.15);opacity:1;}100%{transform:scale(1);}}' +
    '@keyframes ak-cg-pulse{0%{transform:scale(1);}50%{transform:scale(1.08);}100%{transform:scale(1);}}' +
    '@keyframes ak-cg-popnum{0%{transform:translate(-50%,-50%) scale(.4);opacity:0;}25%{transform:translate(-50%,-50%) scale(1.2);opacity:1;}100%{transform:translate(-50%,-160%) scale(1);opacity:0;}}' +
    '@keyframes ak-cg-flash{0%{background:#fff;opacity:.75;}100%{background:#fff;opacity:0;}}' +
    '@keyframes ak-cg-sparkle{0%{transform:translate(0,0) scale(1);opacity:1;}100%{transform:translate(var(--dx,20px),var(--dy,-20px)) scale(0);opacity:0;}}' +
    '@keyframes ak-cg-namein{0%{opacity:0;transform:translateY(6px);}100%{opacity:1;transform:translateY(0);}}' +
    '@keyframes ak-cg-shake{0%,100%{transform:translateX(0);}20%{transform:translateX(-1.2vw);}40%{transform:translateX(1.2vw);}' +
      '60%{transform:translateX(-.8vw);}80%{transform:translateX(.8vw);}}' +
    '@keyframes ak-cg-shake-big{0%,100%{transform:translateX(0) translateY(0);}15%{transform:translateX(-2.4vw) translateY(.6vh);}' +
      '30%{transform:translateX(2.2vw) translateY(-.6vh);}45%{transform:translateX(-1.8vw) translateY(.4vh);}' +
      '60%{transform:translateX(1.4vw) translateY(-.3vh);}80%{transform:translateX(-.6vw);}}' +
    '@media (prefers-reduced-motion:reduce){#' + ROOT_ID + ' *{animation-duration:.001ms !important;animation-iteration-count:1 !important;transition-duration:.001ms !important;}}';
  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

/* ===================================================================================
 * 7.5 עזרי "מיץ" (Juice) משותפים — רעידת-מסך, טקסט צף, הבזק, נצנצים, זיקוקים, מעבר-מסך
 * =================================================================================== */
function setScreen(html) {
  var root = getRoot();
  root.innerHTML = html;
  if (!REDUCED_MOTION) {
    var wrap = root.querySelector('.ak-cg-wrap');
    if (wrap) wrap.classList.add('ak-cg-screenin');
  }
  return root;
}
function shakeEl(el, big) {
  if (!el || REDUCED_MOTION) return;
  var cls = big ? 'ak-cg-shake-big' : 'ak-cg-shake';
  el.classList.remove(cls);
  void el.offsetWidth; /* מכריח רסטארט של האנימציה */
  el.classList.add(cls);
}
function popText(container, text, x, y, color) {
  if (!container) return;
  var span = document.createElement('div');
  span.className = 'ak-cg-popnum';
  span.textContent = text;
  span.style.color = color || COLOR.gold;
  span.style.left = (x != null ? x : 50) + '%';
  span.style.top = (y != null ? y : 50) + '%';
  container.appendChild(span);
  trackTimer(setTimeout(function () { if (span.parentNode) span.parentNode.removeChild(span); }, 900));
}
function flashStage(stageEl, color) {
  if (!stageEl || REDUCED_MOTION) return;
  var f = document.createElement('div');
  f.className = 'ak-cg-flash';
  f.style.background = color || '#fff';
  stageEl.appendChild(f);
  trackTimer(setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 280));
}
/* נצנצי DOM קטנים — לרגעי מגע/הכרזה, בלי להעמיס Canvas נוסף */
function sparkleBurst(px, py, colors, n) {
  if (REDUCED_MOTION) return;
  colors = colors || JUICE_COLORS;
  n = n || 8;
  var root = document.getElementById(ROOT_ID);
  if (!root) return;
  for (var i = 0; i < n; i++) {
    var s = document.createElement('div');
    s.className = 'ak-cg-sparkle';
    var ang = Math.random() * 6.283, dist = 30 + Math.random() * 70;
    s.style.left = px + 'px'; s.style.top = py + 'px';
    s.style.background = colors[i % colors.length];
    s.style.setProperty('--dx', (Math.cos(ang) * dist) + 'px');
    s.style.setProperty('--dy', (Math.sin(ang) * dist) + 'px');
    root.appendChild(s);
    (function (node) { trackTimer(setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 750)); })(s);
  }
}
/* זיקוקים — כמה פרצי-נצנצים גדולים במיקומים אקראיים על המסך, לרגעי חגיגה */
function fireworks(n) {
  if (REDUCED_MOTION) return;
  n = n || 4;
  var w = window.innerWidth || 1200, h = window.innerHeight || 700;
  var i = 0;
  function one() {
    if (i >= n) return;
    sparkleBurst(rnd(w * 0.15, w * 0.85), rnd(h * 0.12, h * 0.55), JUICE_COLORS, 14);
    i++;
    trackTimer(setTimeout(one, 240));
  }
  one();
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

var GAME_IDS = ['meteor', 'treasure', 'colorrush', 'blocktower'];
var GAME_META = {
  meteor: { name: 'מרוץ המטאור', icon: '☄️', caption: 'כולם קוראים בקול: קפוץ!' },
  treasure: { name: 'ניחוש הקופה', icon: '💰', caption: 'כל הכיתה צועקת מספר בקול!' },
  colorrush: { name: 'מירוץ הצבעים', icon: '🌈', caption: 'הרימו יד לכיוון הצבע שנקרא!' },
  blocktower: { name: 'מגדל הקוביות', icon: '🧱', caption: 'קראו בקול: עכשיו — הנח!' },
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
  var replay = !!(opts && opts.replay);
  if (g.dailyDone && !replay) { renderAlreadyPlayed(klass, g); return; }
  /* סבב נוסף באותו יום — זמן מקוצר קבוע, כדי שהקופה היומית תישאר משמעותית */
  var duration = replay ? REPLAY_SECONDS : timeBank(klass);
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
var REPLAY_SECONDS = 20; /* סבב רשות נוסף — קצר בכוונה */

/* כבר שיחקנו היום: מציג מה הרווחנו, ומאפשר סבב נוסף קצר בלי לחלק זמן מחדש */
function renderAlreadyPlayed(klass, g) {
  var last = (g.plays && g.plays.length) ? g.plays[g.plays.length - 1] : null;
  var earned = last ? last.score : 0;
  setScreen(
    '<div class="ak-cg-bg"></div>' + closeButtonHtml() +
    '<div class="ak-cg-wrap">' +
      '<div class="ak-cg-h1">🎉 כבר שיחקנו היום!</div>' +
      '<div class="ak-cg-h2">הרווחנו ' + earned + ' אבני בניין לאי</div>' +
      '<div class="ak-cg-body">הקופה מתמלאת שוב מחר — כל נקודה היום נחסכת למשחק של מחר! ⏳</div>' +
      '<button class="ak-cg-btn" id="ak-cg-replay">▶️ עוד סבב קצר (' + REPLAY_SECONDS + ' שניות)</button>' +
    '</div>');
  SESSION.running = false;
  var btn = document.getElementById('ak-cg-replay');
  if (btn) btn.onclick = function () { close(); open({ replay: true }); };
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
  var meta = GAME_META[SESSION.game];
  var name = SESSION.student ? akEsc(SESSION.student.name) : 'הכיתה';
  var roles = weeklyRoles(SESSION.klass);
  var torenLine = roles && roles.toren ? ('🖱️ תורן/ית האי: ' + akEsc(roles.toren.name)) : '';
  setScreen(
    '<div class="ak-cg-bg"></div>' + closeButtonHtml() +
    '<div class="ak-cg-wrap">' +
      '<div class="ak-cg-h2">' + meta.icon + ' היום משחק/ת:</div>' +
      '<div class="ak-cg-badge" id="ak-cg-namebadge">' + name + '</div>' +
      '<div class="ak-cg-body">הרווחנו <span id="ak-cg-secnum">0</span> שניות משחק! 🎮</div>' +
      '<div class="ak-cg-fillbar"><div class="ak-cg-fillinner" id="ak-cg-fill"></div></div>' +
      (torenLine ? '<div class="ak-cg-role">' + torenLine + '</div>' : '') +
      '<div id="ak-cg-cd" style="min-height:22vh"></div>' +
    '</div>');
  var fillEl = document.getElementById('ak-cg-fill');
  var numEl = document.getElementById('ak-cg-secnum');
  requestAnimTick(fillEl, numEl);
  var badgeEl = document.getElementById('ak-cg-namebadge');
  if (badgeEl && !REDUCED_MOTION) {
    var br = badgeEl.getBoundingClientRect();
    trackTimer(setTimeout(function () { sparkleBurst(br.left + br.width / 2, br.top + br.height / 2, JUICE_COLORS, 12); }, 120));
  }
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
  var cd = document.getElementById('ak-cg-cd');
  var seq = [3, 2, 1];
  var i = 0;
  function tick() {
    if (i >= seq.length) { if (cd) cd.innerHTML = ''; done(); return; }
    if (cd) cd.innerHTML = '<div class="ak-cg-count">' + seq[i] + '</div>';
    akSound('coin');
    if (i === seq.length - 1) shakeEl(document.getElementById(ROOT_ID)); /* "1" האחרון — רעד קטן, השיא הכי קרוב */
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
  setScreen(playTemplateShell());
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
      perf = clamp(perf, 0, 1);
      /* "hit-stop": לפני מעבר לחגיגה, כל משחק יכול לנגן פלישר-שיא קצר (פיצוץ/פתיחת תיבה/הבזק) —
       * runner.outro אופציונלי; אם אין, ממשיכים ישר לחגיגה כמו קודם. */
      var proceed = function () {
        try { runner.cleanup(); } catch (e2) {}
        renderCelebrate(perf);
      };
      if (runner.outro && !REDUCED_MOTION) {
        try { runner.outro(perf, proceed); } catch (e3) { proceed(); }
      } else {
        proceed();
      }
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
  setScreen(
    '<div class="ak-cg-bg"></div>' + closeButtonHtml() +
    '<div class="ak-cg-wrap">' +
      '<div class="ak-cg-h1">🎉 ' + tier.label + '</div>' +
      extra +
      '<div class="ak-cg-h2">קיבלנו <span id="ak-cg-coinsnum">0</span> אבני בניין לאי!</div>' +
      multChip +
      '<div class="ak-cg-body">הכיתה בנתה עוד קצת ⭐</div>' +
      (cashierLine ? '<div class="ak-cg-role">' + cashierLine + '</div>' : '') +
    '</div>');
  akSound('rankup');
  countUpNumber(document.getElementById('ak-cg-coinsnum'), coins, 700);
  fireConfettiBursts(6);
  fireworks(3);
  trackTimer(setTimeout(close, 16000));
}
/* מספר שקופץ ועולה מ-0 עד היעד — "מיץ" משותף לכל מסכי הסיכום */
function countUpNumber(el, target, ms) {
  if (!el) return;
  if (REDUCED_MOTION) { el.textContent = target; return; }
  var start = Date.now();
  function step() {
    var p = clamp((Date.now() - start) / ms, 0, 1);
    el.textContent = Math.round(easeOutBack(p) * target);
    if (p < 1) trackRaf(raf(step)); else el.textContent = target;
  }
  trackRaf(raf(step));
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
  setScreen(
    '<div class="ak-cg-bg"></div>' + closeButtonHtml() +
    '<div class="ak-cg-wrap">' +
      '<div class="ak-cg-h1">🎉 מסיבת סיום השבוע!</div>' +
      '<div class="ak-cg-body">בואו נחגוג את מה שבנינו יחד ⭐</div>' +
      (cashierName ? ('<div class="ak-cg-role">📣 ' + cashierName + ' — מכריז/ה את השבוע!</div>') : '') +
    '</div>');
  akSound('coin');
  fireworks(2);
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
  setScreen(
    '<div class="ak-cg-bg"></div>' + closeButtonHtml() +
    '<div class="ak-cg-wrap">' +
      '<div class="ak-cg-h2">השבוע הרווחנו</div>' +
      '<div class="ak-cg-h1"><span id="ak-cg-weeknum">0</span> 🧱</div>' +
      '<div class="ak-cg-body">באי שלנו כבר ' + itemsCount + ' מבנים!</div>' +
      '<div id="ak-cg-names"></div>' +
    '</div>');
  var numEl = document.getElementById('ak-cg-weeknum');
  countUpNumber(numEl, delta, 1300);
  trackTimer(setTimeout(function () { akSound('combo'); }, REDUCED_MOTION ? 0 : 1300));
  /* "שמות מתחלפים" — רצועת-קרדיטים חגיגית שעוברת על כל הכיתה בשוויון מלא, בלי דירוג */
  cycleNames(document.getElementById('ak-cg-names'), klass.students, 5200);
  trackTimer(setTimeout(renderConfettiCelebrate, 8000));
}
/* רצועת שמות מתחלפים — כל תלמיד/ה מקבל/ת רגע שווה על המסך, ללא סדר-הישג, טהור-חגיגי */
function cycleNames(container, students, totalMs) {
  if (!container || !students || !students.length || REDUCED_MOTION) return;
  var perName = 300;
  var count = Math.max(6, Math.floor(totalMs / perName));
  var order = students.slice();
  /* ערבוב קל כדי שהרצף לא ירגיש "לפי סדר רשימה קבוע" משבוע לשבוע */
  for (var sw = order.length - 1; sw > 0; sw--) {
    var jx = Math.floor(Math.random() * (sw + 1));
    var tmp = order[sw]; order[sw] = order[jx]; order[jx] = tmp;
  }
  var i = 0;
  function step() {
    if (!container.parentNode || i >= count) { if (container.parentNode) container.innerHTML = ''; return; }
    var s = order[i % order.length];
    container.innerHTML = '<div class="ak-cg-namecycle">⭐ ' + akEsc(s.name) + ' ⭐</div>';
    i++;
    trackTimer(setTimeout(step, perName));
  }
  step();
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
  setScreen(
    '<div class="ak-cg-bg"></div>' + closeButtonHtml() +
    '<div class="ak-cg-wrap">' +
      '<div class="ak-cg-h1">🎊 איזה שבוע מדהים! 🎊</div>' +
      '<div class="ak-cg-h2">+' + bonus + ' אבני בניין מתנה!</div>' +
      '<div class="ak-cg-body">כל הכבוד לכל הכיתה! 👏</div>' +
    '</div>');
  akSound('rankup');
  fireConfettiBursts(10);
  fireworks(5);
  trackTimer(setTimeout(close, 14000));
}

/* ===================================================================================
 * 13. Runners — כל משחק חושף {start(ctx), finish()->0..1, cleanup()}
 * =================================================================================== */
var RUNNERS = {};

/* ---------- 13.1 מרוץ המטאור (Meteor Dash) ---------- */
RUNNERS.meteor = (function () {
  var canvas, cx, stageEl, W, H;
  var groundY, playerX, playerY, playerVY, onGround, wasOnGround;
  var obstacles, successCount, resolvedCount, totalObstacles;
  var startT, active, resizeFn, keyFn, clickFn;
  var particles, trail, freezeUntil, dustClock;
  var GRAV = 1800, JUMP_V = -720;

  function resize() {
    var r = stageEl.getBoundingClientRect();
    W = canvas.width = r.width; H = canvas.height = r.height;
    groundY = H * 0.78; playerX = W * 0.16;
    stars = null; /* ייבנו מחדש למידות החדשות */
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
  /* --- "מיץ": מנוע חלקיקים קל למשחק הזה — אבק ריצה/נחיתה + פיצוץ מטאור-שיא --- */
  function spawnParticles(x, y, count, opts) {
    opts = opts || {};
    for (var i = 0; i < count; i++) {
      var ang = rnd(opts.angMin != null ? opts.angMin : 0, opts.angMax != null ? opts.angMax : 6.283);
      var spd = rnd(opts.spdMin || 40, opts.spdMax || 160);
      particles.push({
        x: x, y: y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - (opts.upBias || 0),
        r: rnd(opts.rMin || 1.5, opts.rMax || 4),
        color: opts.color || '#e8c98a',
        life: 1, decay: opts.decay || rnd(1.1, 2.1),
        grav: opts.grav != null ? opts.grav : 260
      });
    }
  }
  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }
  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      cx.globalAlpha = clamp(p.life, 0, 1);
      cx.fillStyle = p.color;
      cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.283); cx.fill();
    }
    cx.globalAlpha = 1;
  }
  function start(ctx) {
    stageEl = ctx.stage;
    stageEl.insertAdjacentHTML('afterbegin', '<canvas class="ak-cg-canvas"></canvas>');
    canvas = stageEl.querySelector('canvas'); cx = canvas.getContext('2d');
    resize();
    resizeFn = function () { resize(); };
    trackListener(window, 'resize', resizeFn);
    playerY = groundY; playerVY = 0; onGround = true; wasOnGround = true;
    successCount = 0; resolvedCount = 0;
    particles = []; trail = []; freezeUntil = 0; dustClock = 0;
    var plan = spawnPlan(ctx.duration);
    obstacles = [];
    startT = Date.now(); active = true;
    var i;
    for (i = 0; i < plan.length; i++) {
      (function (delay, isFinal) {
        trackTimer(setTimeout(function () {
          if (!active) return;
          obstacles.push({ x: W + 40, resolved: false, final: isFinal });
        }, delay));
      })(plan[i], i === plan.length - 1);
    }
    keyFn = function (e) { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); } };
    clickFn = function () { jump(); };
    trackListener(document, 'keydown', keyFn);
    trackListener(canvas, 'pointerdown', clickFn);
    loop();
  }
  function loop() {
    if (!active) return;
    var now = Date.now();
    var frozen = now < freezeUntil; /* "hit-stop": שבריר-שנייה של האטה דרמטית ברגע השיא */
    var dt = frozen ? 0 : 1 / 60;
    if (dt > 0) {
      playerVY += GRAV * dt;
      playerY += playerVY * dt;
      wasOnGround = onGround;
      if (playerY >= groundY) {
        playerY = groundY; playerVY = 0; onGround = true;
        if (!wasOnGround) { /* אבק נחיתה — רק ברגע המגע הראשון */
          spawnParticles(playerX, groundY + 4, 8, { color: '#d8c39a', spdMin: 30, spdMax: 100, angMin: 3.5, angMax: 5.9, grav: 220, decay: 2.6, rMin: 1.5, rMax: 3.4 });
        }
      }
      dustClock += dt;
      if (onGround && dustClock > 0.09) { /* אבק ריצה שוטף */
        dustClock = 0;
        spawnParticles(playerX - 12, groundY + 6, 1, { color: '#d8c39a', spdMin: 8, spdMax: 26, angMin: 3.3, angMax: 4.3, grav: 50, decay: 2.8, rMin: 1, rMax: 2 });
      }
      if (!onGround) { trail.push({ x: playerX, y: playerY }); if (trail.length > 5) trail.shift(); }
      else { trail.length = 0; }
      var elapsed = (now - startT) / 1000;
      var speed = 220 + elapsed * 9;
      var i;
      for (i = 0; i < obstacles.length; i++) {
        var o = obstacles[i];
        o.x -= speed * dt;
        if (!o.resolved && o.x < playerX + 18 && o.x > playerX - 18) {
          o.resolved = true; resolvedCount++;
          var success = playerY < groundY - 26;
          if (success) {
            successCount++;
            spawnParticles(o.x, groundY - 18, o.final ? 26 : 11,
              { color: o.final ? '#ffb800' : '#7CFFB2', spdMin: 50, spdMax: o.final ? 260 : 140, decay: 1.3 });
            if (o.final) { /* מטאור השיא מתפוצץ: הבזק + רעידה + האטה דרמטית קצרה */
              freezeUntil = now + 220;
              shakeEl(stageEl, true);
              flashStage(stageEl, '#fff6d8');
            }
          }
        }
      }
    }
    updateParticles(frozen ? (1 / 60) * 0.2 : 1 / 60);
    draw();
    trackRaf(raf(loop));
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

    /* שכבה 1 — הרים רחוקים (הכי איטי, פרלקסה תלת-שכבתית) */
    var mtOff = (t * 5) % (W + 500);
    cx.fillStyle = 'rgba(16,28,55,0.55)';
    for (var mx = -500; mx < W + 500; mx += 250) {
      cx.beginPath();
      cx.moveTo(mx - mtOff, groundY + 6);
      cx.lineTo(mx - mtOff + 125, groundY - 92);
      cx.lineTo(mx - mtOff + 250, groundY + 6);
      cx.closePath(); cx.fill();
    }

    /* שכבה 2 — גבעות אמצע */
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

    /* שכבה 3 — עשב קדמי מהיר, ממש מעל הקרקע (הכי קרוב = הכי מהיר, פרלקסה) */
    var grassOff = (t * 60) % 46;
    cx.fillStyle = 'rgba(20,90,50,0.5)';
    for (var gx = -46; gx < W + 46; gx += 46) {
      cx.beginPath();
      cx.moveTo(gx - grassOff, groundY + 10);
      cx.lineTo(gx - grassOff + 8, groundY - 4);
      cx.lineTo(gx - grassOff + 16, groundY + 10);
      cx.fill();
    }

    /* אבק ריצה/נחיתה/פיצוץ */
    drawParticles();

    /* זנב-תנועה — הדים דוהים של השחקן בזמן קפיצה */
    for (var ti = 0; ti < trail.length; ti++) {
      var trp = trail[ti];
      cx.globalAlpha = 0.09 * (ti + 1) / trail.length;
      cx.fillStyle = '#00d9f5';
      cx.beginPath(); cx.arc(trp.x, trp.y - 30, 16, 0, 6.283); cx.fill();
    }
    cx.globalAlpha = 1;

    /* צל רך מתחת לדמות — נותן תחושת גובה בקפיצה */
    var air = Math.max(0, (groundY - playerY) / 150);
    cx.globalAlpha = 0.32 * (1 - air * 0.7);
    cx.fillStyle = '#000';
    cx.beginPath();
    cx.ellipse(playerX, groundY + 8, 22 - air * 8, 7 - air * 3, 0, 0, 6.283);
    cx.fill();
    cx.globalAlpha = 1;

    /* ===== שחקן/ית — דמות רצה עם רגליים, ידיים וזנב אור, squash&stretch מוגבר ===== */
    cx.save();
    cx.translate(playerX, playerY);
    var run = t * 13;
    var jumpStretch = onGround ? 1 : clamp(1.16 - air * 0.22, 0.86, 1.16); /* מתמתח בעלייה, נמעך בנחיתה */
    var squash = onGround ? 1 + Math.sin(run) * 0.04 : jumpStretch;

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

    /* ===== מכשולים — מטאורים בוערים עם זנב; מטאור השיא (final) מסומן בטבעת זהב פועמת ===== */
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

      /* טבעת-שיא — מתריעה שזה המכשול האחרון והכי דרמטי */
      if (o.final && !o.resolved) {
        cx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 12);
        cx.strokeStyle = '#ffb800'; cx.lineWidth = 3;
        cx.beginPath(); cx.arc(0, 0, 30 + Math.sin(t * 12) * 3, 0, 6.283); cx.stroke();
        cx.globalAlpha = 1;
      }

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
  /* פלישר-סיום: פרץ חלקיקים חגיגי סביב השחקן/ית לפני מעבר למסך החגיגה */
  function outro(perf, done) {
    var t0 = Date.now();
    spawnParticles(playerX, playerY - 24, 20, {
      color: perf >= 0.75 ? '#ffb800' : '#8b5cf6', spdMin: 60, spdMax: 220, upBias: 70, decay: 1.0
    });
    flashStage(stageEl, perf >= 0.75 ? '#fff6d8' : '#eef2ff');
    function tick2() {
      updateParticles(1 / 60);
      draw();
      if (Date.now() - t0 < 520) trackRaf(raf(tick2));
      else done();
    }
    tick2();
  }
  function cleanup() { active = false; }
  return { start: start, finish: finish, outro: outro, cleanup: cleanup };
})();

/* ---------- 13.2 ניחוש הקופה (Treasure Guess) ---------- */
/* תיבת אוצר מצוירת ב-Canvas (מראה תלת-מימדי בגרדיאנטים — לא Three.js), נפתחת דרמטית
 * עם מטבעות מתפזרים ברגע החשיפה; מקלדת הניחוש נשארת DOM נגיש כשכבת-על שקופה מעל. */
RUNNERS.treasure = (function () {
  var secret, guessStr, locked, lo, hi, stageEl, uiEl, keyFn, resizeFn, lastResult;
  var canvas, cx, W, H, active, chestAngle, particles;

  function roundRectP(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function spawnCoins(x, y, n) {
    for (var i = 0; i < n; i++) {
      var ang = rnd(-2.5, -0.6);
      var spd = rnd(140, 340);
      particles.push({
        x: x, y: y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        r: rnd(5, 9), rot: rnd(0, 6.283), vr: rnd(-7, 7), life: 1, decay: rnd(0.35, 0.55), grav: 480
      });
    }
  }
  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0 || p.y > H + 30) particles.splice(i, 1);
    }
  }
  function drawCoin(p) {
    cx.save();
    cx.translate(p.x, p.y); cx.rotate(p.rot);
    cx.globalAlpha = clamp(p.life, 0, 1);
    var grad = cx.createLinearGradient(-p.r, 0, p.r, 0);
    grad.addColorStop(0, '#a9711f'); grad.addColorStop(0.5, '#ffd76a'); grad.addColorStop(1, '#a9711f');
    cx.fillStyle = grad;
    cx.beginPath(); cx.ellipse(0, 0, p.r, p.r * 0.88, 0, 0, 6.283); cx.fill();
    cx.strokeStyle = '#7a531a'; cx.lineWidth = 1; cx.stroke();
    cx.restore(); cx.globalAlpha = 1;
  }
  /* התיבה עצמה — "מראה תלת-מימדי" ב-Canvas 2D: גרדיאנטים לבליטה/הצללה, לא WebGL */
  function drawChest() {
    cx.clearRect(0, 0, W, H);
    var cxp = W / 2, cyp = H * 0.4, bw = Math.min(180, W * 0.42), bh = bw * 0.5;
    var wob = Math.sin(Date.now() / (locked ? 90 : 260)) * (locked ? 2.6 : 1.1);
    cx.save();
    cx.translate(cxp, cyp);
    cx.rotate(wob * Math.PI / 180);
    /* גוף התיבה */
    var bodyGrad = cx.createLinearGradient(0, 0, 0, bh);
    bodyGrad.addColorStop(0, '#8a5a2c'); bodyGrad.addColorStop(1, '#5c3a1a');
    cx.fillStyle = bodyGrad;
    roundRectP(cx, -bw / 2, 0, bw, bh, 10); cx.fill();
    /* פס זהב אופקי + מנעול */
    cx.fillStyle = '#e8b23a';
    cx.fillRect(-bw / 2, bh * 0.34, bw, bh * 0.09);
    cx.fillRect(-bw * 0.045, 0, bw * 0.09, bh);
    cx.beginPath(); cx.arc(0, bh * 0.38, bh * 0.14, 0, 6.283); cx.fillStyle = '#f0c34a'; cx.fill();
    cx.strokeStyle = '#7a531a'; cx.lineWidth = 2; cx.stroke();
    /* מכסה — נפתח בסיבוב סביב הציר האחורי-עליון */
    cx.save();
    cx.translate(0, 0);
    cx.rotate(-chestAngle);
    var lidH = bh * 0.62;
    var lidGrad = cx.createLinearGradient(0, -lidH, 0, 0);
    lidGrad.addColorStop(0, '#a9713f'); lidGrad.addColorStop(1, '#8a5a2c');
    cx.fillStyle = lidGrad;
    cx.beginPath();
    cx.moveTo(-bw / 2, 0);
    cx.quadraticCurveTo(-bw / 2, -lidH, 0, -lidH * 1.05);
    cx.quadraticCurveTo(bw / 2, -lidH, bw / 2, 0);
    cx.closePath(); cx.fill();
    cx.strokeStyle = '#5c3a1a'; cx.lineWidth = 2; cx.stroke();
    /* ברק על המכסה — מדמה תאורה תלת-מימדית */
    cx.globalAlpha = 0.22; cx.fillStyle = '#fff';
    cx.beginPath(); cx.ellipse(-bw * 0.16, -lidH * 0.5, bw * 0.18, lidH * 0.12, -0.3, 0, 6.283); cx.fill();
    cx.globalAlpha = 1;
    cx.restore();
    cx.restore();
    /* מטבעות מתעופפים */
    for (var i = 0; i < particles.length; i++) drawCoin(particles[i]);
  }
  function resize() {
    var r = stageEl.getBoundingClientRect();
    W = canvas.width = r.width; H = canvas.height = r.height;
  }
  function chestLoop() {
    if (!active) return;
    updateParticles(1 / 60);
    drawChest();
    trackRaf(raf(chestLoop));
  }
  function renderUI() {
    var rangeTxt = 'בין ' + lo + ' ל-' + hi;
    uiEl.innerHTML =
      '<div class="ak-cg-h2" style="font-size:4.4vh">' + (locked ? '🔒 התשובה ננעלה!' : rangeTxt) + '</div>' +
      '<div class="ak-cg-guessbox">' + (guessStr || '?') + '</div>' +
      (locked ? '<div class="ak-cg-body" style="font-size:3.2vh">מחכים לחשיפה... ⏳</div>' : keypadHtml());
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
    var btns = uiEl.querySelectorAll('.ak-cg-key');
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
    renderUI();
  }
  function lockGuess() {
    locked = true;
    renderUI();
  }
  function narrowHint() {
    var span = Math.max(20, Math.round((hi - lo) * 0.42));
    lo = Math.max(0, secret - Math.floor(span / 2));
    hi = secret + Math.ceil(span / 2);
    if (!locked) renderUI();
  }
  function start(ctx) {
    secret = 40 + Math.floor(Math.random() * 160);
    lo = 0; hi = 250; guessStr = ''; locked = false; lastResult = null;
    stageEl = ctx.stage; particles = []; chestAngle = 0; active = true;
    stageEl.innerHTML = '<canvas class="ak-cg-canvas" id="ak-cg-chestcv"></canvas>' +
      '<div class="ak-cg-treasureui" id="ak-cg-tui"></div>' +
      '<div class="ak-cg-caption">' + GAME_META.treasure.caption + '</div>';
    canvas = stageEl.querySelector('#ak-cg-chestcv'); cx = canvas.getContext('2d');
    uiEl = stageEl.querySelector('#ak-cg-tui');
    resize();
    resizeFn = function () { resize(); };
    trackListener(window, 'resize', resizeFn);
    renderUI();
    chestLoop();
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
    active = false;
    var finalGuess = locked && guessStr ? parseInt(guessStr, 10) : Math.round((lo + hi) / 2);
    if (isNaN(finalGuess)) finalGuess = Math.round((lo + hi) / 2);
    var diff = Math.abs(secret - finalGuess);
    lastResult = { secret: secret, guess: finalGuess };
    RUNNERS.treasure.lastResult = lastResult;
    return clamp(1 - diff / 60, 0, 1);
  }
  /* פלישר-סיום: התיבה נפתחת דרמטית, מטבעות מתפזרים, רעידה+הבזק ברגע ה"פופ" */
  function outro(perf, done) {
    active = false; /* עוצר את לולאת ה-idle; ללולאה הזו יש קצב משלה */
    var t0 = Date.now(), popped = false;
    var chestX = W / 2, chestY = H * 0.4 - (Math.min(180, W * 0.42) * 0.5) * 0.62 * 0.5;
    function tick2() {
      var p = clamp((Date.now() - t0) / 480, 0, 1);
      chestAngle = easeOutBack(p) * 1.9;
      if (p > 0.5 && !popped) {
        popped = true;
        spawnCoins(chestX, chestY, 24);
        shakeEl(stageEl, true);
        flashStage(stageEl, '#fff2c9');
        akSound('rankup');
      }
      updateParticles(1 / 60);
      drawChest();
      if (Date.now() - t0 < 900) trackRaf(raf(tick2));
      else done();
    }
    tick2();
  }
  function cleanup() { active = false; }
  return { start: start, finish: finish, outro: outro, cleanup: cleanup, lastResult: null };
})();

/* ---------- 13.3 מירוץ הצבעים (Color Rush) ---------- */
/* כרטיסים מעוגלים עם עומק (במקום מלבנים שטוחים), כניסה מדורגת, נצנצים+קומבו-פופ במגע,
 * סיבוב-שיא אחרון עם מסגרת זהב ורעידת-מסך גדולה יותר. */
RUNNERS.colorrush = (function () {
  var COLORS = [
    { name: 'אדום', hex: COLOR.coral }, { name: 'צהוב', hex: COLOR.gold },
    { name: 'ירוק', hex: COLOR.leaf }, { name: 'כחול', hex: COLOR.sky }
  ];
  var stageEl, rounds, success, currentIdx, active, clickHandlers, teaserId, comboCount;
  function render() {
    var html = '<div class="ak-cg-quadgrid">';
    var i;
    for (i = 0; i < COLORS.length; i++) {
      html += '<div class="ak-cg-quad" data-i="' + i + '" style="background:' + COLORS[i].hex + ';animation-delay:' + (i * 0.07) + 's">' + COLORS[i].name + '</div>';
    }
    html += '</div><div class="ak-cg-caption">' + GAME_META.colorrush.caption + '</div>';
    stageEl.innerHTML = html;
    clickHandlers = [];
    var quads = stageEl.querySelectorAll('.ak-cg-quad');
    for (i = 0; i < quads.length; i++) {
      (function (q, idx) {
        var fn = function (e) { onPick(idx, q, e); };
        q.addEventListener('click', fn);
        clickHandlers.push([q, fn]);
      })(quads[i], i);
    }
  }
  function onPick(idx, q, e) {
    if (!active) return;
    q.classList.remove('hit'); void q.offsetWidth; q.classList.add('hit');
    var r = q.getBoundingClientRect();
    var px = (e && e.clientX != null) ? e.clientX : (r.left + r.width / 2);
    var py = (e && e.clientY != null) ? e.clientY : (r.top + r.height / 2);
    if (idx === currentIdx) {
      success++; comboCount++;
      sparkleBurst(px, py, [COLORS[idx].hex, COLOR.gold, '#fff'], 10);
      if (comboCount >= 3) showCombo(comboCount);
    } else {
      comboCount = 0; /* בלי שום הודעה שלילית — פשוט מפסיקים למנות רצף בשקט (ניסוח חיובי בלעדי) */
      sparkleBurst(px, py, [COLORS[idx].hex], 4);
    }
  }
  function showCombo(n) {
    if (!stageEl) return;
    var el = document.createElement('div');
    el.className = 'ak-cg-combo';
    el.textContent = 'רצף ' + n + '! 🔥';
    stageEl.appendChild(el);
    trackTimer(setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 700));
  }
  /* קצב: סיבוב אחד כל ~2.6 שניות ומאיץ. קודם היו 2-5 סיבובים לכל המשחק,
     כלומר עשר שניות של מסך סטטי בין הכרזה להכרזה — הכיתה פשוט חיכתה. */
  function roundsFor(duration) { return clampInt(Math.round(duration / 2.6), 6, 22); }
  /* בין סיבובים הריבועים "מתחממים" בתורות — המסך אף פעם לא קפוא */
  function startTeaser() {
    stopTeaser();
    var quads = stageEl.querySelectorAll('.ak-cg-quad');
    var k = 0;
    teaserId = setInterval(function () {
      for (var i = 0; i < quads.length; i++) quads[i].classList.toggle('warm', i === (k % quads.length));
      k++;
    }, 120);
  }
  function stopTeaser() {
    if (teaserId) { clearInterval(teaserId); teaserId = null; }
    var quads = stageEl ? stageEl.querySelectorAll('.ak-cg-quad') : [];
    for (var i = 0; i < quads.length; i++) quads[i].classList.remove('warm');
  }
  function nextRound(i, total, perRoundMs) {
    if (!active) return;
    if (i >= total) { startTeaser(); return; }
    startTeaser();
    var isFinal = (i === total - 1);
    /* רגע ציפייה קצר, ואז ההכרזה */
    var lead = Math.min(700, perRoundMs * 0.35);
    trackTimer(setTimeout(function () {
      if (!active) return;
      stopTeaser();
      currentIdx = Math.floor(Math.random() * COLORS.length);
      var target = document.createElement('div');
      target.className = 'ak-cg-target';
      target.style.background = COLORS[currentIdx].hex;
      if (isFinal) target.style.border = '5px solid #ffb800'; /* סיבוב-שיא מתויג בזהב */
      target.textContent = COLORS[currentIdx].name + '!';
      stageEl.appendChild(target);
      var quads = stageEl.querySelectorAll('.ak-cg-quad');
      if (quads[currentIdx]) quads[currentIdx].classList.add('live');
      shakeEl(stageEl, isFinal);
      /* חלון התגובה מתקצר ככל שמתקדמים — קושי עולה לקראת השיא */
      var windowMs = Math.max(620, (perRoundMs - lead) * (1 - i / (total * 1.6)));
      trackTimer(setTimeout(function () {
        if (target.parentNode) target.parentNode.removeChild(target);
        for (var q = 0; q < quads.length; q++) quads[q].classList.remove('live');
        nextRound(i + 1, total, perRoundMs);
      }, windowMs));
    }, lead));
  }
  function start(ctx) {
    stageEl = ctx.stage;
    success = 0; active = true; comboCount = 0;
    rounds = roundsFor(ctx.duration);
    var perRoundMs = (ctx.duration * 1000) / rounds;
    render();
    nextRound(0, rounds, perRoundMs);
  }
  function finish() {
    active = false;
    stopTeaser();
    return rounds > 0 ? clamp(success / rounds, 0, 1) : 0.5;
  }
  /* פלישר-סיום: הבזק + רעידה גדולה + כל הכרטיסים מבריקים רגע לפני מעבר לחגיגה */
  function outro(perf, done) {
    var big = perf >= 0.6;
    if (stageEl) {
      flashStage(stageEl, big ? '#fff2c9' : '#eef2ff');
      shakeEl(stageEl, big);
      var quads = stageEl.querySelectorAll('.ak-cg-quad');
      for (var i = 0; i < quads.length; i++) quads[i].style.filter = 'brightness(1.35)';
    }
    trackTimer(setTimeout(done, 480));
  }
  function cleanup() {
    active = false;
    stopTeaser();
    if (clickHandlers) {
      var i;
      for (i = 0; i < clickHandlers.length; i++) {
        try { clickHandlers[i][0].removeEventListener('click', clickHandlers[i][1]); } catch (e) {}
      }
    }
  }
  return { start: start, finish: finish, outro: outro, cleanup: cleanup };
})();

/* ---------- 13.4 מגדל הקוביות (Block Tower Blitz) — משחק רביעי, מטאפורה ישירה לבניית האי ---------- */
/* קובייה נופלת מתנדנדת שמאל-ימין; לחיצה/מקש בודד נועל אותה על הקומה שמתחתיה — ככל שהיישור
 * מדויק יותר, הקומה הבאה נשארת רחבה יותר (בדיוק כמו משחקי "Stack" קלאסיים). קלט יחיד לתורן/ית,
 * שיפוט אלגוריתמי-אובייקטיבי לגמרי (יחס חפיפה), הכיתה צועקת כיוון/עכשיו! בלי מכשיר אישי. */
RUNNERS.blocktower = (function () {
  var TOWER_COLORS = [COLOR.gold, COLOR.coral, COLOR.sky, COLOR.leaf, COLOR.grape];
  var canvas, cx, stageEl, W, H;
  var blocks, current, baseW, levelH;
  var totalBlocks, placedCount, perfSum, active, dropTimer, clickFn, keyFn, resizeFn;
  var particles;

  function resize() {
    var r = stageEl.getBoundingClientRect();
    W = canvas.width = r.width; H = canvas.height = r.height;
    baseW = W * 0.52; levelH = Math.max(26, H * 0.1);
  }
  function spawnBits(x, y, n, color, big) {
    for (var i = 0; i < n; i++) {
      var ang = rnd(0, 6.283);
      var spd = rnd(30, big ? 220 : 110);
      particles.push({
        x: x, y: y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - (big ? 80 : 20),
        r: rnd(2, big ? 6 : 4), color: color, life: 1, decay: rnd(1.2, 2), grav: 380
      });
    }
  }
  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= p.decay * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }
  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      cx.globalAlpha = clamp(p.life, 0, 1); cx.fillStyle = p.color;
      cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.283); cx.fill();
    }
    cx.globalAlpha = 1;
  }
  function roundRectP(c, x, y, w, h, r) {
    r = Math.max(2, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function levelWorldY(idx) { return H * 0.86 - (idx + 1) * levelH; } /* idx=0 = קומת הבסיס */
  function cameraOffset() { return Math.max(0, H * 0.16 - levelWorldY(blocks.length)); }
  function newFallingBlock() {
    var top = blocks[blocks.length - 1];
    current = { w: top.w, speed: 1.1 + placedCount * 0.13, color: TOWER_COLORS[placedCount % TOWER_COLORS.length], born: Date.now() };
  }
  function currentX() {
    if (!current) return 0;
    var range = (W - current.w) * 0.42;
    return W / 2 - current.w / 2 + Math.sin((Date.now() - current.born) / 1000 * current.speed * 2.4) * range;
  }
  function drop() {
    if (!current || !active) return;
    if (dropTimer) { clearTimeout(dropTimer); dropTimer = null; }
    var top = blocks[blocks.length - 1];
    var cxL = currentX(), cxR = cxL + current.w;
    var pL = top.x, pR = top.x + top.w;
    var oL = Math.max(cxL, pL), oR = Math.min(cxR, pR);
    var overlapW = Math.max(0, oR - oL);
    var ratio = current.w > 0 ? overlapW / current.w : 0;
    var minW = baseW * 0.22;
    var placedW = Math.max(minW, overlapW);
    var placedX = overlapW > 0 ? oL : (cxL + cxR) / 2 - placedW / 2;
    blocks.push({ x: placedX, w: placedW, color: current.color });
    perfSum += clamp(ratio, 0, 1);
    placedCount++;
    var lvlY = levelWorldY(blocks.length - 1) - cameraOffset() + levelH / 2;
    if (ratio > 0.9) { spawnBits(placedX + placedW / 2, lvlY, 16, current.color, true); shakeEl(stageEl, false); popText(stageEl, 'מדויק! ⭐', 50, 32, COLOR.gold); }
    else { spawnBits(placedX + placedW / 2, lvlY, 6, current.color, false); }
    current = null;
    if (placedCount < totalBlocks && active) trackTimer(setTimeout(newFallingBlock, 140));
  }
  function scheduleAutoDrop(ms) { dropTimer = trackTimer(setTimeout(function () { if (active) drop(); }, ms)); }
  function start(ctx) {
    stageEl = ctx.stage;
    stageEl.insertAdjacentHTML('afterbegin', '<canvas class="ak-cg-canvas"></canvas>');
    canvas = stageEl.querySelector('canvas'); cx = canvas.getContext('2d');
    resize();
    resizeFn = function () { resize(); };
    trackListener(window, 'resize', resizeFn);
    blocks = [{ x: (W - baseW) / 2, w: baseW, color: COLOR.wood }];
    particles = []; placedCount = 0; perfSum = 0; active = true;
    totalBlocks = clampInt(4 + (ctx.duration - 20) * (8 / 40), 4, 12);
    var perBlockMs = clamp((ctx.duration * 1000) / totalBlocks, 900, 2600);
    newFallingBlock();
    scheduleAutoDrop(perBlockMs);
    clickFn = function () { drop(); scheduleAutoDrop(perBlockMs); };
    keyFn = function (e) { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); clickFn(); } };
    trackListener(canvas, 'pointerdown', clickFn);
    trackListener(document, 'keydown', keyFn);
    loop();
  }
  function loop() {
    if (!active) return;
    updateParticles(1 / 60);
    draw();
    trackRaf(raf(loop));
  }
  function draw() {
    cx.clearRect(0, 0, W, H);
    var camY = cameraOffset();
    var i;
    for (i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      var y = levelWorldY(i) - camY;
      if (y < -levelH || y > H + levelH) continue;
      cx.fillStyle = b.color;
      roundRectP(cx, b.x, y, b.w, levelH - 4, 8); cx.fill();
      cx.strokeStyle = 'rgba(0,0,0,0.18)'; cx.lineWidth = 2; cx.stroke();
      cx.fillStyle = 'rgba(255,255,255,0.25)';
      cx.fillRect(b.x + 4, y + 3, Math.max(0, b.w - 8), 4);
    }
    if (current) {
      var cxx = currentX(), cyy = levelWorldY(blocks.length) - camY;
      cx.fillStyle = current.color;
      roundRectP(cx, cxx, cyy, current.w, levelH - 4, 8); cx.fill();
      cx.strokeStyle = 'rgba(0,0,0,0.22)'; cx.lineWidth = 2; cx.stroke();
      cx.fillStyle = 'rgba(255,255,255,0.3)';
      cx.fillRect(cxx + 4, cyy + 3, Math.max(0, current.w - 8), 4);
    }
    drawParticles();
  }
  function finish() {
    active = false;
    if (dropTimer) { clearTimeout(dropTimer); dropTimer = null; }
    return totalBlocks > 0 ? clamp(perfSum / totalBlocks, 0, 1) : 0.5;
  }
  /* פלישר-סיום: הבזק+רעידה קלה, וחלקיקי הקומה האחרונה ממשיכים לעוף עוד רגע */
  function outro(perf, done) {
    var big = perf >= 0.6;
    if (stageEl) { flashStage(stageEl, big ? '#fff2c9' : '#eef2ff'); shakeEl(stageEl, big); }
    var t0 = Date.now();
    active = true;
    function tick2() {
      updateParticles(1 / 60); draw();
      if (Date.now() - t0 < 480) trackRaf(raf(tick2)); else { active = false; done(); }
    }
    tick2();
  }
  function cleanup() { active = false; if (dropTimer) { clearTimeout(dropTimer); dropTimer = null; } }
  return { start: start, finish: finish, outro: outro, cleanup: cleanup };
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
