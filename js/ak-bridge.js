/* ============================================================
   ak-bridge.js — שכבת החיבור המשותפת (window.AK)
   ------------------------------------------------------------
   כל המודולים החדשים (island-engine, island-content, class-games,
   avatar-plus) תלויים ב-window.AK כפי שמוגדר ב-SPEC.md פרק 2.
   הקובץ הזה הוא הגשר היחיד בין index.html למודולים — כך ש-index.html
   כמעט לא משתנה, וכל מודול לא צריך לדעת דבר על המבנה הפנימי.

   סדר טעינה חובה ב-index.html (בסוף ה-body, אחרי הסקריפט הראשי):
     <script src="js/ak-bridge.js"></script>
     <script src="js/island-content.js"></script>
     <script src="js/island-engine.js"></script>
     <script src="js/class-games.js"></script>
     <script src="js/avatar-plus.js"></script>
   ============================================================ */
(function () {
  'use strict';

  function g(name) { return typeof window[name] === 'function' ? window[name] : null; }
  function noop() {}

  /* ---------- toast: לא קיים ב-index.html, ממומש כאן ---------- */
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'akToast';
      toastEl.style.cssText =
        'position:fixed;left:50%;bottom:8%;transform:translateX(-50%) translateY(20px);' +
        'background:linear-gradient(135deg,#161a35,#242a55);color:#fff;border:2px solid #00f5ff;' +
        'padding:16px 28px;border-radius:16px;font-size:26px;font-weight:900;direction:rtl;' +
        'box-shadow:0 12px 48px rgba(0,245,255,.35);z-index:100000;pointer-events:none;' +
        'opacity:0;transition:opacity .25s,transform .25s;max-width:80vw;text-align:center';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    toastEl.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateX(-50%) translateY(20px)';
    }, 2600);
  }

  /* ---------- ברירות מחדל בטוחות ל-state חדש ---------- */
  function defaultIsland() {
    return { coins: 0, spent: 0, regions: ['beach'], items: [], level: 1, history: [], u: 'p' };
  }
  function defaultGames() {
    return { lastPlayed: 0, totalScore: 0, plays: [], dailyDone: false };
  }
  /* ---------- כלכלה לפי כיתה: מכפיל מחירים/ספים (klass.econ.scale) ----------
     כיתה שצוברת הרבה נקודות (למשל 3400 בשבוע) "שוברת" מחירים שתוכננו ל-500
     בשבוע. במקום לשנות את המחירים לכולם — לכל כיתה יש מכפיל משלה.
     scale=1 (ברירת מחדל) = הכלכלה המקורית. scale=10 = הכל פי 10. */
  function ensureEcon(k) {
    if (!k) return { scale: 1 };
    var e = k.econ;
    if (!e || typeof e.scale !== 'number' || !(e.scale > 0)) { e = { scale: 1 }; k.econ = e; }
    return e;
  }
  function econScale(k) {
    if (!k) { var f = g('getActiveClass'); k = f ? f() : null; }
    return ensureEcon(k).scale;
  }
  /* מחיר/סף מותאם לכיתה — נקודה אחת של אמת לכל המודולים */
  function econPrice(n, k) {
    var v = Math.round((Number(n) || 0) * econScale(k));
    return v;
  }

  function ensureKlass(k) {
    if (!k) return k;
    ensureEcon(k);
    if (!k.island) k.island = defaultIsland();
    else {
      var i = k.island;
      if (typeof i.coins !== 'number') i.coins = 0;
      if (typeof i.spent !== 'number') i.spent = 0;
      if (!Array.isArray(i.regions) || !i.regions.length) i.regions = ['beach'];
      if (!Array.isArray(i.items)) i.items = [];
      if (!Array.isArray(i.history)) i.history = [];
      if (typeof i.level !== 'number') i.level = 1;
      /* מעבר ל"נקודה אחת = יחידת בנייה אחת": עד כאן coins/spent נשמרו ב"אבנים"
         (אבן = 10 נקודות). ממירים פעם אחת בלבד ומסמנים, כדי שכיתה קיימת לא
         תאבד את מה שצברה ולא תוכפל שוב בטעינה הבאה. */
      if (i.u !== 'p') {
        i.coins = Math.max(0, Math.round((i.coins || 0) * 10));
        i.spent = Math.max(0, Math.round((i.spent || 0) * 10));
        i._rem = 0;
        i.u = 'p';
      }
    }
    if (!k.games) k.games = defaultGames();
    else {
      var m = k.games;
      if (typeof m.lastPlayed !== 'number') m.lastPlayed = 0;
      if (typeof m.totalScore !== 'number') m.totalScore = 0;
      if (!Array.isArray(m.plays)) m.plays = [];
    }
    return k;
  }
  function ensureAll() {
    var st = window.state;
    if (!st || !Array.isArray(st.classes)) return;
    for (var i = 0; i < st.classes.length; i++) ensureKlass(st.classes[i]);
  }

  window.AK = {
    /* ה-state החי — getter כדי שלא ניתפס לעותק ישן */
    get state() { return window.state; },

    save: function () { var f = g('save'); if (f) f(); },

    getActiveClass: function () {
      var f = g('getActiveClass');
      return f ? ensureKlass(f()) : null;
    },

    /* מנרמל את הפער: index.html מחזיר {student, cls} — ה-SPEC מבטיח klass */
    findStudent: function (id) {
      var f = g('findStudent');
      if (!f) return null;
      var r = f(id);
      if (!r) return null;
      var k = ensureKlass(r.cls || r.klass);
      return { student: r.student, klass: k, cls: k };
    },

    isTeacher: (typeof window.APP_MODE !== 'undefined') ? window.APP_MODE === 'teacher' : false,

    playSound: function (type) { var f = g('playSound'); if (f) try { f(type); } catch (e) {} },

    burstConfetti: function (x, y, count) {
      var f = g('burstConfetti');
      if (f) try { f(x, y, count || 40); } catch (e) {}
    },

    toast: toast,

    escapeHtml: function (s) {
      var f = g('escapeHtml');
      if (f) return f(s);
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },

    /* עזר פנימי — מודולים יכולים לקרוא לזה על כיתה שהם מקבלים מבחוץ */
    ensureKlass: ensureKlass,
    ensureAll: ensureAll,

    /* כלכלה לפי כיתה */
    scale: econScale,
    price: econPrice,
    setScale: function (n, k) {
      if (!k) { var f = g('getActiveClass'); k = f ? f() : null; }
      if (!k) return 1;
      var v = Number(n);
      if (!(v > 0)) v = 1;
      ensureEcon(k).scale = v;
      var sv = g('save'); if (sv) sv();
      return v;
    },

    /* היום הנוכחי כמפתח יציב (למונה נקודות יומי) */
    today: function () {
      var d = new Date();
      return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    }
  };

  /* APP_MODE הוא const בתוך סקריפט אחר — לא תמיד נגיש דרך window.
     גיבוי: קריאה ישירה מה-URL, אותו כלל בדיוק כמו ב-index.html. */
  if (!window.APP_MODE) {
    try {
      window.AK.isTeacher =
        new URLSearchParams(window.location.search).get('t') === 'shay2026nikud';
    } catch (e) { window.AK.isTeacher = false; }
  }

  /* ---------- הגנה קריטית: סנכרון הענן מחליף את state אחרי הטעינה ----------
     cloudLoad/startCloudPoll דורסים את window.state בנתונים מהשרת, שאולי נשמרו
     לפני שהאי בכלל היה קיים. לכן לא מספיק לאתחל פעם אחת בטעינה — עוטפים את
     getActiveClass הגלובלית כך שכל קורא (כולל הקוד הקיים) תמיד מקבל כיתה
     עם שדות island/games תקינים. */
  (function wrapGlobals() {
    var orig = window.getActiveClass;
    if (typeof orig === 'function' && !orig.__akWrapped) {
      var wrapped = function () { return ensureKlass(orig.apply(this, arguments)); };
      wrapped.__akWrapped = true;
      window.getActiveClass = wrapped;
    }
  })();

  /* רשת ביטחון נוספת: כל 2 שניות מוודאים שכל הכיתות תקינות — זול מאוד
     (לולאה על מערך קצר) ומכסה כל מסלול דריסה עתידי של state. */
  setInterval(ensureAll, 2000);

  ensureAll();
})();
