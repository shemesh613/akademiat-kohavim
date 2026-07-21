/* ============================================================================
 * island-ownership.js — מנגנון הבעלות של האי (מי בונה, מי משלם, מי מוגן)
 * ----------------------------------------------------------------------------
 * מימוש ההמלצה המכריעה מ-RESEARCH_OWNERSHIP.md:
 *   א. השטח המשותף — 100% אוטומטי: סדר עלילתי קבוע מראש + מיקום קבוע מראש
 *      לכל 80 המבנים. אף אדם לא בוחר — אין את מי להאשים.
 *   ב. החלקה האישית (3x3) — 100% בחירת הילד, במטבע אישי (personalCoins)
 *      שנצבר מאותן נקודות בדיוק (10 נק' = 1 אבן כיתתית וגם 1 מטבע אישי).
 *   ג. הגנות: בנייה סופית (אין מחיקה לאף אחד), אין השוואות בין תלמידים,
 *      מטבעות לא פוקעים, ניסוח חיובי בלעדי.
 *
 * הקובץ לא נוגע ב-island-engine.js — הוא עוטף את window.Island.place/remove
 * ב-init() ומוסיף שכבת CSS שמנטרלת את מסלולי הבנייה/מחיקה הידניים של ה-HUD
 * (שקוראים ל-placeAt/removeAt הפנימיים ועוקפים כל עטיפה).
 *
 * תלות: window.AK (SPEC פרק 2), window.Island (island-engine.js),
 *        window.IslandContent (קטלוג — אופציונלי, יש ברירות מחדל).
 * ES5-friendly, IIFE יחיד, ללא תלויות חדשות.
 * ============================================================================ */
(function () {
  'use strict';

  /* =========================================================================
   * 1. קבועים
   * ========================================================================= */
  var REGION_ORDER = ['beach', 'forest', 'farm', 'village', 'mountain', 'desert', 'volcano', 'sky'];

  var GRID = 14;                 /* רשת האזור המשותף 14x14 (0..13) — כמו במנוע */
  var PLOT = 3;                  /* חלקה אישית 3x3 (0..2) — כמו במנוע */
  var POINTS_PER_COIN = 10;      /* 10 נקודות = 1 מטבע אישי (וגם 1 אבן כיתתית, בנפרד) */
  var VISIBLE_CATALOG = 4;       /* כמה פריטים גלויים לילד בכל רגע (טווח 3-5 לפי המחקר) */
  var TEASER_AT = 0.7;           /* טיזר "מתקרבים לגילוי" מ-70% מהדרך */
  var AUTO_COOLDOWN_MS = 25000;  /* מרווח מינימלי בין שתי בניות אוטומטיות — רגעי גילוי מרווחים */
  var TICK_MS = 1500;            /* קצב סנכרון UI פנימי */

  /* סדר מילוי קבוע בחלקה האישית — מהמרכז החוצה, כדי שגם 1-2 פריטים ייראו "מלאים" */
  var PLOT_FILL = [[1, 1], [0, 1], [2, 1], [1, 0], [1, 2], [0, 0], [2, 0], [0, 2], [2, 2]];

  /* =========================================================================
   * 2. תוכנית הבנייה של השטח המשותף — סדר עלילתי + מיקום קבוע מראש בקוד
   *    לכל אחד מ-80 הפריטים. q = רבע-סיבוב (rot = q * PI/2).
   *    הסדר הוא נרטיבי (הטבע מתעורר → חיים מגיעים → מבנים → שיא), *לא* לפי
   *    מחיר עולה — בדיוק כמו ההמלצה במחקר (My City legacy).
   * ========================================================================= */
  var PLAN = {
    /* חוף הכוכבים: הים משאיר אוצרות → צמחייה → משחקי חוף → דיג → מגדלור → ספינה */
    beach: [
      { id: 'seashell',        x: 4,  z: 10, q: 0 },
      { id: 'starfish_beach',  x: 9,  z: 10, q: 1 },
      { id: 'flower_beach',    x: 2,  z: 7,  q: 0 },
      { id: 'palm_beach',      x: 3,  z: 4,  q: 2 },
      { id: 'beach_ball',      x: 10, z: 8,  q: 0 },
      { id: 'beach_chair',     x: 7,  z: 9,  q: 3 },
      { id: 'sandcastle',      x: 5,  z: 6,  q: 0 },
      { id: 'fishing_boat',    x: 11, z: 11, q: 1 },
      { id: 'lighthouse',      x: 12, z: 2,  q: 0 },
      { id: 'tall_ship',       x: 1,  z: 12, q: 2 }
    ],
    /* יער הלחישות: קרקעית היער → עצים צומחים → פירות → ינשוף → בית עץ → פלאי היער */
    forest: [
      { id: 'mushroom_f',       x: 4,  z: 9,  q: 0 },
      { id: 'fern',             x: 9,  z: 4,  q: 1 },
      { id: 'pine_tree',        x: 3,  z: 3,  q: 0 },
      { id: 'pinecone_pile',    x: 10, z: 9,  q: 2 },
      { id: 'berry_bush',       x: 2,  z: 6,  q: 0 },
      { id: 'owl_perch',        x: 11, z: 6,  q: 3 },
      { id: 'treehouse',        x: 6,  z: 4,  q: 0 },
      { id: 'log_bridge',       x: 7,  z: 10, q: 1 },
      { id: 'ancient_tree',     x: 7,  z: 6,  q: 0 },
      { id: 'forest_waterfall', x: 2,  z: 2,  q: 2 }
    ],
    /* חוות האלופים: זורעים → שומרים על היבול → חיות מגיעות → תשתית → כרם → טחנת הענק */
    farm: [
      { id: 'carrot_patch',   x: 3,  z: 8,  q: 0 },
      { id: 'haystack',       x: 9,  z: 9,  q: 1 },
      { id: 'scarecrow',      x: 6,  z: 8,  q: 0 },
      { id: 'chicken_coop',   x: 4,  z: 4,  q: 2 },
      { id: 'sheep_farm',     x: 10, z: 5,  q: 0 },
      { id: 'windmill_small', x: 2,  z: 3,  q: 1 },
      { id: 'barn',           x: 7,  z: 4,  q: 0 },
      { id: 'tractor',        x: 9,  z: 7,  q: 3 },
      { id: 'vineyard',       x: 3,  z: 11, q: 0 },
      { id: 'grand_windmill', x: 11, z: 2,  q: 2 }
    ],
    /* כפר הידע: כיכר נולדת → באר → ידע ותורה → מגדל שעון מכתיר → תשתית → תצפית */
    village: [
      { id: 'bench_village',    x: 5,  z: 8,  q: 0 },
      { id: 'streetlamp',       x: 8,  z: 8,  q: 1 },
      { id: 'flower_planter',   x: 6,  z: 10, q: 0 },
      { id: 'well_village',     x: 7,  z: 7,  q: 2 },
      { id: 'bookstall',        x: 4,  z: 6,  q: 0 },
      { id: 'library_torah',    x: 3,  z: 4,  q: 1 },
      { id: 'synagogue',        x: 7,  z: 3,  q: 0 },
      { id: 'clocktower_small', x: 9,  z: 5,  q: 3 },
      { id: 'water_tower',      x: 11, z: 9,  q: 0 },
      { id: 'lookout_tower',    x: 12, z: 3,  q: 1 }
    ],
    /* הר הקרח: השלג נערם → משחקי שלג → בקתה → רכבל ומגלשה → אגם → ארמון → הדרקון */
    mountain: [
      { id: 'snow_pile',     x: 3,  z: 7,  q: 0 },
      { id: 'snowman',       x: 5,  z: 9,  q: 1 },
      { id: 'icicle',        x: 9,  z: 8,  q: 0 },
      { id: 'pine_snow',     x: 10, z: 10, q: 2 },
      { id: 'ice_cabin',     x: 4,  z: 4,  q: 0 },
      { id: 'ski_lift',      x: 11, z: 5,  q: 1 },
      { id: 'ice_slide',     x: 7,  z: 8,  q: 0 },
      { id: 'frozen_lake',   x: 2,  z: 10, q: 2 },
      { id: 'ice_castle',    x: 7,  z: 4,  q: 0 },
      { id: 'frozen_dragon', x: 12, z: 11, q: 3 }
    ],
    /* מדבר הזהב: צומח מדברי → דיונות → נווה מדבר מתגלה → נוודים מגיעים → שיירה → הנווה הגדול */
    desert: [
      { id: 'cactus',             x: 4,  z: 8,  q: 0 },
      { id: 'rock_pile_d',        x: 2,  z: 5,  q: 1 },
      { id: 'desert_flower',      x: 8,  z: 9,  q: 0 },
      { id: 'golden_dune',        x: 10, z: 7,  q: 2 },
      { id: 'oasis_palm',         x: 7,  z: 9,  q: 0 },
      { id: 'camel_small',        x: 5,  z: 5,  q: 1 },
      { id: 'tent_bedouin',       x: 3,  z: 3,  q: 0 },
      { id: 'camel_caravan',      x: 9,  z: 3,  q: 2 },
      { id: 'desert_watchtower',  x: 12, z: 6,  q: 0 },
      { id: 'grand_oasis',        x: 6,  z: 11, q: 1 }
    ],
    /* הר האש: אבנים לוהטות → החיים חוזרים אחרי השריפה → גייזר → גשר → מגדל → דרקון → הפסגה */
    volcano: [
      { id: 'ember_rock',     x: 5,  z: 8,  q: 0 },
      { id: 'obsidian_shard', x: 8,  z: 9,  q: 1 },
      { id: 'lava_pool',      x: 3,  z: 6,  q: 0 },
      { id: 'ash_tree',       x: 10, z: 8,  q: 2 },
      { id: 'fire_flower',    x: 4,  z: 10, q: 0 },
      { id: 'geyser',         x: 9,  z: 5,  q: 1 },
      { id: 'lava_bridge',    x: 6,  z: 10, q: 0 },
      { id: 'fire_beacon',    x: 2,  z: 3,  q: 2 },
      { id: 'volcano_dragon', x: 11, z: 3,  q: 0 },
      { id: 'erupting_peak',  x: 7,  z: 5,  q: 3 }
    ],
    /* איי השמיים: עננים וכוכבים → קשת → פנסים ופעמונים → איים מרחפים → ארמון → המצפה הגדול */
    sky: [
      { id: 'cloud_puff',        x: 4,  z: 8,  q: 0 },
      { id: 'star_small',        x: 9,  z: 9,  q: 1 },
      { id: 'rainbow_arch',      x: 6,  z: 10, q: 0 },
      { id: 'floating_lantern',  x: 3,  z: 5,  q: 2 },
      { id: 'wind_chime',        x: 10, z: 6,  q: 0 },
      { id: 'floating_platform', x: 2,  z: 9,  q: 1 },
      { id: 'hot_air_balloon',   x: 8,  z: 4,  q: 0 },
      { id: 'sky_windmill',      x: 11, z: 10, q: 2 },
      { id: 'sky_castle',        x: 6,  z: 5,  q: 0 },
      { id: 'star_observatory',  x: 12, z: 4,  q: 3 }
    ]
  };

  /* =========================================================================
   * 3. עזרים — גישה בטוחה ל-AK / Island / state (הגנה מלאה על state ישן)
   * ========================================================================= */
  function AKref() { return window.AK || null; }
  function akSave() { var ak = AKref(); if (ak && typeof ak.save === 'function') { try { ak.save(); } catch (e) {} } }
  function akToast(msg) { var ak = AKref(); if (ak && typeof ak.toast === 'function') { try { ak.toast(msg); } catch (e) {} } }
  function akSound(t) { var ak = AKref(); if (ak && typeof ak.playSound === 'function') { try { ak.playSound(t); } catch (e) {} } }
  function akConfetti(x, y, n) { var ak = AKref(); if (ak && typeof ak.burstConfetti === 'function') { try { ak.burstConfetti(x, y, n); } catch (e) {} } }
  function akEsc(s) {
    var ak = AKref();
    if (ak && typeof ak.escapeHtml === 'function') { try { return ak.escapeHtml(s); } catch (e) {} }
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function activeClass() { var ak = AKref(); if (ak && typeof ak.getActiveClass === 'function') { try { return ak.getActiveClass(); } catch (e) {} } return null; }
  function findStudentSafe(id) { var ak = AKref(); if (ak && typeof ak.findStudent === 'function') { try { return ak.findStudent(id); } catch (e) {} } return null; }

  function isTeacher() {
    var ak = AKref();
    if (ak && typeof ak.isTeacher === 'boolean') return ak.isTeacher;
    try { return new URLSearchParams(window.location.search).get('t') != null; } catch (e) { return false; }
  }

  /* זהות התלמיד הפעיל במצב בית: studentSelectedId הוא let גלובלי ב-index.html
     (נגיש כ-binding לקסיקלי לסקריפטים שנטענים אחריו; typeof בטוח גם אם לא הוגדר). */
  var forcedStudentId = null; /* דריסה ידנית של המתאם, אם יידרש */
  function activeStudentId() {
    if (isTeacher()) return null;
    if (forcedStudentId) return forcedStudentId;
    try {
      if (typeof studentSelectedId !== 'undefined' && studentSelectedId) return studentSelectedId;
    } catch (e) {}
    return null;
  }

  function ensureIsl(klass) {
    if (!klass) return null;
    klass.island = klass.island || {};
    var isl = klass.island;
    if (typeof isl.coins !== 'number') isl.coins = 0;
    if (typeof isl.spent !== 'number') isl.spent = 0;
    if (!isl.regions || !isl.regions.length) isl.regions = ['beach'];
    if (!isl.items) isl.items = [];
    return isl;
  }

  /* המטבע האישי — לעולם לא פוקע, לעולם לא יורד מתחת ל-0, אין שדה "שלילי" */
  function ensureStudentIsland(st) {
    if (!st) return null;
    st.island = st.island || {};
    var si = st.island;
    if (typeof si.personalCoins !== 'number') si.personalCoins = 0;
    if (typeof si.pointsRemainder !== 'number') si.pointsRemainder = 0;
    if (typeof si.spentCoins !== 'number') si.spentCoins = 0;
    return si;
  }

  /* מידע על פריט לפי id — סריקה של כל קטלוגי האזורים (ids ייחודיים גלובלית) */
  var itemInfoCache = {};
  function findItemInfo(itemId) {
    if (itemInfoCache[itemId]) return itemInfoCache[itemId];
    var c = window.IslandContent;
    if (c && c.REGIONS) {
      for (var i = 0; i < c.REGIONS.length; i++) {
        var reg = c.REGIONS[i];
        if (!reg || !reg.items) continue;
        for (var j = 0; j < reg.items.length; j++) {
          var it = reg.items[j];
          if (it && it.id === itemId) {
            itemInfoCache[itemId] = { id: it.id, em: it.em || '🎁', n: it.n || itemId, cost: (typeof it.cost === 'number' ? it.cost : 10) };
            return itemInfoCache[itemId];
          }
        }
      }
    }
    /* לא נמצא (קטלוג עוד לא נטען?) — ברירת מחדל בלי לשמור בקאש */
    return { id: itemId, em: '🎁', n: itemId, cost: 10 };
  }

  /* מחיר במטבעות אישיים — נגזר ממחיר האבנים. הפריט הראשון בכל אזור עולה 1 מטבע
     (= 10 נקודות בלבד) כדי שכמעט כל תלמיד יגיע לפריט ראשון תוך שבוע-שבועיים. */
  function personalCostOf(stoneCost) { return Math.max(1, Math.ceil(stoneCost / 10)); }

  function hasSharedItem(isl, regionId, itemId) {
    for (var i = 0; i < isl.items.length; i++) {
      if (isl.items[i] && isl.items[i].r === regionId && isl.items[i].id === itemId) return true;
    }
    return false;
  }
  function tileOccupied(isl, regionKey, x, z) {
    for (var i = 0; i < isl.items.length; i++) {
      var it = isl.items[i];
      if (it && it.r === regionKey && it.x === x && it.z === z) return true;
    }
    return false;
  }
  function plotItemsOf(isl, sid) {
    var out = [];
    for (var i = 0; i < isl.items.length; i++) {
      if (isl.items[i] && isl.items[i].r === 'plot_' + sid) out.push(isl.items[i]);
    }
    return out;
  }

  /* המנוע מוכן? (initScene רץ לפחות פעם אחת — ה-HUD שלו קיים ב-DOM).
     לפני כן placeAt עלול ליפול באמצע (state יעודכן בלי רינדור) — אז לא בונים. */
  function engineReady() {
    return !!(ORIG.place && document.querySelector('.ak-isl-hud'));
  }

  /* =========================================================================
   * 4. הרשאות — הליבה
   *    מורה: הכל. תלמיד: אך ורק plot_<שלו>. מחיקה: אף אחד, לעולם.
   * ========================================================================= */
  function canBuild(regionKey, studentId) {
    if (isTeacher()) return true;
    if (!regionKey) return false;
    if (String(regionKey).indexOf('plot_') === 0) {
      var owner = String(regionKey).slice(5);
      var sid = studentId || activeStudentId();
      return !!sid && sid === owner;
    }
    return false; /* שטח משותף — רק המערכת האוטומטית בונה בו */
  }

  /* =========================================================================
   * 5. עטיפת Island.place / Island.remove — נקודת האכיפה
   * ========================================================================= */
  var ORIG = { place: null, remove: null };

  function wrappedPlace(regionId, itemId, x, z, rot, studentId) {
    try {
      var key = String(regionId || '');
      if (key.indexOf('plot_') === 0) return placeInPlot(key, itemId, x, z, rot, studentId);
      /* שטח משותף — ידני מותר רק למורה (המסלול הרגיל הוא הבנייה האוטומטית) */
      if (!isTeacher()) {
        akToast('האי המשותף גדל מעצמו — כל נקודה מקדמת אותו! ✨');
        akSound('error');
        return false;
      }
      return ORIG.place.call(window.Island, regionId, itemId, x, z, rot, studentId);
    } catch (e) { return false; }
  }

  /* ספי פתיחת האזורים — מקור אמת: SPEC.md פרק 3 (זהה לקבוע הפנימי במנוע).
     דרושים כאן רק כדי לוודא שהפקדה זמנית לא תגרום לפתיחת אזור מוקדמת. */
  var REGION_THRESHOLDS = { beach: 0, forest: 120, farm: 300, village: 520, mountain: 780, desert: 1050, volcano: 1350, sky: 1700 };
  function nextLockedGap(isl) {
    var total = (isl.coins || 0) + (isl.spent || 0);
    var gap = Infinity;
    for (var i = 0; i < REGION_ORDER.length; i++) {
      var rid = REGION_ORDER[i];
      if (isl.regions.indexOf(rid) < 0 && typeof REGION_THRESHOLDS[rid] === 'number') {
        gap = Math.min(gap, REGION_THRESHOLDS[rid] - total);
      }
    }
    return gap;
  }
  function recalcLevelLocal(isl) {
    var total = (isl.coins || 0) + (isl.spent || 0);
    isl.level = Math.max(1, Math.min(40, 1 + Math.floor(total / 45)));
  }

  /* בנייה בחלקה אישית: התשלום הוא במטבעות אישיים של בעל החלקה בלבד.
     placeAt של המנוע מחייב תמיד את קופת הכיתה — לכן: מצלמים snapshot של
     coins/spent, מפקידים זמנית רק את החוסר (אם יש), נותנים למנוע לבצע את
     ההצבה, ומשחזרים את ה-snapshot במדויק. התוצאה: הקופה הכיתתית, ספי
     האזורים ו-level לא זזים בכלל מבנייה אישית. */
  function placeInPlot(regionKey, itemId, x, z, rot, studentId) {
    var owner = regionKey.slice(5);
    if (!canBuild(regionKey, studentId)) {
      akToast('כאן בונה רק בעל/ת החלקה 🌱 — לך יש חלקה משלך!');
      akSound('error');
      return false;
    }
    var found = findStudentSafe(owner);
    if (!found || !found.student) { akToast('לא נמצאה חלקה כזו'); return false; }
    var klass = activeClass();
    var isl = ensureIsl(klass);
    if (!isl) return false;
    var info = findItemInfo(itemId);
    var stones = info.cost;
    var pcost = personalCostOf(stones);
    var si = ensureStudentIsland(found.student);
    if (si.personalCoins < pcost) {
      akToast('עוד ' + (pcost - si.personalCoins) + ' 🪙 מטבעות אישיים וזה שלך! כל תשובה טובה מקרבת אותך 💪');
      akSound('error');
      return false;
    }
    var coins0 = isl.coins, spent0 = isl.spent;
    /* המנוע יחייב את עלות הפריט לפי הקטלוג של האזור הפעיל, או 10 כברירת מחדל
       אם הפריט לא בקטלוג הפעיל — מפקידים מספיק לשני המקרים, אבל רק את החוסר. */
    var engineNeed = Math.max(stones, 10);
    var deposit = Math.max(0, engineNeed - coins0);
    if (deposit > 0) {
      var gap = nextLockedGap(isl);
      if (gap > 0 && deposit >= gap) {
        /* הפקדה כזו הייתה חוצה סף אזור נעול בטעות — דוחים בעדינות (מקרה קצה נדיר) */
        akToast('האי באמצע צמיחה גדולה ממש עכשיו — הפריט שלך שמור לך, נסו שוב בקרוב! 🌱');
        return false;
      }
      isl.coins += deposit;
    }
    var ok = false;
    try { ok = ORIG.place.call(window.Island, regionKey, itemId, x, z, rot, studentId || owner); } catch (e) { ok = false; }
    /* שחזור מדויק של קופת הכיתה — בנייה אישית לא נוגעת בה */
    isl.coins = coins0;
    if (ok) isl.spent = spent0;
    recalcLevelLocal(isl);
    if (ok) {
      si.personalCoins -= pcost;
      si.spentCoins = (si.spentCoins || 0) + pcost;
      akToast('🎉 נבנה בחלקה שלך: ' + info.n + '!');
      akSave();
    }
    return ok;
  }

  /* בנייה סופית — אף אחד לא מוחק, גם לא מורה (RESEARCH_OWNERSHIP: הגנות) */
  function wrappedRemove() {
    akToast('באי שלנו כל מה שנבנה נשאר לתמיד 🌱');
    akSound('error');
    return false;
  }

  /* =========================================================================
   * 6. בנייה אוטומטית של השטח המשותף
   *    "הבא בתור" נגזר דטרמיניסטית מה-state (בלי שדות חדשים ב-klass.island):
   *    לכל אזור פתוח סופרים כמה מפריטי התוכנית שלו כבר קיימים ברצף; בונים
   *    באזור הפתוח עם הכי מעט פריטים (שוויון → סדר האזורים הקבוע) — כך אזור
   *    שנפתח זה עתה מקבל מבנים מהר, ואף אזור לא "נתקע" ריק.
   * ========================================================================= */
  function planProgress(isl, regionId) {
    var plan = PLAN[regionId] || [];
    var cnt = 0;
    while (cnt < plan.length && hasSharedItem(isl, regionId, plan[cnt].id)) cnt++;
    return cnt;
  }

  function nextPlanned(isl) {
    var best = null;
    for (var i = 0; i < REGION_ORDER.length; i++) {
      var rid = REGION_ORDER[i];
      if (isl.regions.indexOf(rid) < 0) continue;
      var plan = PLAN[rid] || [];
      var cnt = planProgress(isl, rid);
      if (cnt >= plan.length) continue;
      if (!best || cnt < best.cnt) best = { rid: rid, cnt: cnt, entry: plan[cnt] };
    }
    return best;
  }

  /* אם המשבצת המתוכננת תפוסה (בנייה ידנית ישנה וכד') — חיפוש ספירלי לתא פנוי קרוב */
  function freeSharedCell(isl, regionId, px, pz) {
    if (!tileOccupied(isl, regionId, px, pz)) return { x: px, z: pz };
    for (var r = 1; r < GRID; r++) {
      for (var dx = -r; dx <= r; dx++) {
        for (var dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          var nx = px + dx, nz = pz + dz;
          if (nx < 0 || nz < 0 || nx >= GRID || nz >= GRID) continue;
          if (!tileOccupied(isl, regionId, nx, nz)) return { x: nx, z: nz };
        }
      }
    }
    return null;
  }

  var lastAutoBuildAt = 0;

  function checkAutoBuild(klass) {
    try {
      klass = klass || activeClass();
      if (!klass) return false;
      var isl = ensureIsl(klass);
      var nx = nextPlanned(isl);
      if (!nx) return false;
      var info = findItemInfo(nx.entry.id);
      if ((isl.coins || 0) < info.cost) return false;              /* הקופה עוד לא חצתה את הסף */
      if (Date.now() - lastAutoBuildAt < AUTO_COOLDOWN_MS) return false; /* מרווח דרמטי בין גילויים */
      if (!engineReady()) return false;                            /* בונים רק כשהמנוע חי */
      var cell = freeSharedCell(isl, nx.rid, nx.entry.x, nx.entry.z);
      if (!cell) return false;
      var ok = ORIG.place.call(window.Island, nx.rid, nx.entry.id, cell.x, cell.z, nx.entry.q * (Math.PI / 2), null);
      if (ok) {
        lastAutoBuildAt = Date.now();
        celebrateReveal(nx.rid, info);
      }
      return ok;
    } catch (e) { return false; }
  }

  function celebrateReveal(regionId, info) {
    akSound('rankup');
    akConfetti(window.innerWidth / 2, window.innerHeight / 3, 120);
    akToast('🎉 האי גדל! נבנה: ' + info.em + ' ' + info.n + '!');
    try { if (window.Island && typeof window.Island.focusRegion === 'function') window.Island.focusRegion(regionId); } catch (e) {}
  }

  /* =========================================================================
   * 7. טיזר — {pct, ready} לקראת הגילוי הבא (בלי לחשוף מה הוא!)
   * ========================================================================= */
  function teaser(klass) {
    try {
      klass = klass || activeClass();
      if (!klass) return { pct: 0, ready: false, done: false };
      var isl = ensureIsl(klass);
      var nx = nextPlanned(isl);
      if (!nx) return { pct: 1, ready: false, done: true };
      var cost = findItemInfo(nx.entry.id).cost;
      var pct = cost > 0 ? Math.min(1, (isl.coins || 0) / cost) : 1;
      return { pct: Math.round(pct * 100) / 100, ready: pct >= 1, done: false };
    } catch (e) { return { pct: 0, ready: false, done: false }; }
  }

  /* =========================================================================
   * 8. המטבע האישי — הזנה מ-addPoints (המתאם מחבר)
   *    אותן נקודות בדיוק: כל 10 נק' = +1 מטבע אישי (שארית נשמרת).
   *    נקודות שליליות לעולם לא גורעות — ניסוח חיובי בלעדי, אין ענישה בארנק.
   * ========================================================================= */
  function onPointsAdded(studentOrId, amt) {
    try {
      amt = Number(amt) || 0;
      if (amt <= 0) return 0;
      var st = studentOrId;
      if (typeof studentOrId === 'string') {
        var f = findStudentSafe(studentOrId);
        st = f ? f.student : null;
      }
      if (!st) return 0;
      var si = ensureStudentIsland(st);
      si.pointsRemainder += amt;
      var gained = Math.floor(si.pointsRemainder / POINTS_PER_COIN);
      if (gained > 0) {
        si.personalCoins += gained;
        si.pointsRemainder -= gained * POINTS_PER_COIN;
      }
      return gained; /* השמירה נעשית ע"י addPoints הקיים — לא שומרים כאן פעמיים */
    } catch (e) { return 0; }
  }

  /* =========================================================================
   * 9. הקטלוג האישי — 3-5 פריטים גלויים בלבד, מהזול ליקר, מכל האזורים הפתוחים
   * ========================================================================= */
  function personalCatalog(studentOrId) {
    try {
      var sid = null, st = null;
      if (typeof studentOrId === 'string') { sid = studentOrId; }
      else if (studentOrId && studentOrId.id) { sid = studentOrId.id; st = studentOrId; }
      if (!sid) sid = activeStudentId();
      if (!sid) return [];
      if (!st) { var f = findStudentSafe(sid); st = f ? f.student : null; }
      var klass = activeClass();
      var isl = ensureIsl(klass);
      if (!isl) return [];
      var builtIds = {};
      var mine = plotItemsOf(isl, sid);
      for (var m = 0; m < mine.length; m++) builtIds[mine[m].id] = true;
      var c = window.IslandContent;
      var pool = [], seen = {};
      if (c && c.REGIONS) {
        for (var i = 0; i < c.REGIONS.length; i++) {
          var reg = c.REGIONS[i];
          if (!reg || isl.regions.indexOf(reg.id) < 0 || !reg.items) continue;
          for (var j = 0; j < reg.items.length; j++) {
            var it = reg.items[j];
            if (!it || seen[it.id] || builtIds[it.id]) continue;
            seen[it.id] = true;
            pool.push({ id: it.id, em: it.em || '🎁', n: it.n || it.id, cost: (typeof it.cost === 'number' ? it.cost : 10), pcost: personalCostOf(typeof it.cost === 'number' ? it.cost : 10) });
          }
        }
      }
      pool.sort(function (a, b) { return a.pcost - b.pcost || a.cost - b.cost; });
      return pool.slice(0, VISIBLE_CATALOG);
    } catch (e) { return []; }
  }

  /* בנייה בחלקה שלי — המיקום נבחר אוטומטית (מהמרכז החוצה): גם כאן אין "איפה
     לשים" להתלבט עליו, והחלקה נראית מלאה כבר מהפריט הראשון. */
  function buildPersonal(studentOrId, itemId) {
    try {
      var sid = typeof studentOrId === 'string' ? studentOrId : (studentOrId && studentOrId.id);
      if (!sid) sid = activeStudentId();
      if (!sid) return false;
      var klass = activeClass();
      var isl = ensureIsl(klass);
      if (!isl) return false;
      var key = 'plot_' + sid;
      var cell = null;
      for (var i = 0; i < PLOT_FILL.length; i++) {
        if (!tileOccupied(isl, key, PLOT_FILL[i][0], PLOT_FILL[i][1])) { cell = PLOT_FILL[i]; break; }
      }
      if (!cell) { akToast('החלקה שלך מלאה ומדהימה! 🌟'); return false; }
      return window.Island.place(key, itemId, cell[0], cell[1], 0, sid);
    } catch (e) { return false; }
  }

  /* =========================================================================
   * 10. UI — שכבת הגנה + טיזר + פאנל אישי לתלמיד
   *     ה-CSS מסתיר את פלטת הבנייה הידנית ואת בורר החלקות של המנוע (שקוראים
   *     ל-placeAt/removeAt הפנימיים ועוקפים את העטיפה) — זה חלק מהאכיפה,
   *     לא קישוט. setManualUI(true) מחזיר אותם לצורכי פיתוח בלבד.
   * ========================================================================= */
  var CSS_ID = 'ak-own-style';
  var manualUI = false;

  function cssText() {
    var block = manualUI
      ? '.ak-isl-item.del{display:none !important;}' /* מחיקה חסומה תמיד, גם במצב פיתוח */
      : '.ak-isl-shop{display:none !important;}.ak-isl-plots{display:none !important;}.ak-isl-item.del{display:none !important;}';
    return block
      + '.ak-own-teaser{position:absolute;bottom:26px;left:50%;transform:translateX(-50%);background:rgba(255,250,238,0.95);border:3px solid #a9713f;border-radius:20px;padding:10px 28px;font-size:30px;font-weight:900;color:#3d2a17;direction:rtl;z-index:6;pointer-events:none;box-shadow:0 6px 18px rgba(60,40,20,.28);display:none;font-family:Heebo,Arial,sans-serif;}'
      + '.ak-own-teaser.on{display:block;}'
      + '.ak-own-teaser.up{bottom:150px;}'
      + '.ak-own-panel{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);max-width:96vw;background:rgba(255,250,238,0.96);border:3px solid #a9713f;border-radius:20px;padding:10px 16px;direction:rtl;z-index:7;pointer-events:auto;display:none;align-items:center;gap:12px;box-shadow:0 6px 18px rgba(60,40,20,.28);font-family:Heebo,Arial,sans-serif;overflow-x:auto;}'
      + '.ak-own-panel.on{display:flex;}'
      + '.ak-own-head{flex:0 0 auto;text-align:center;color:#3d2a17;font-weight:900;font-size:20px;line-height:1.25;}'
      + '.ak-own-head .coins{font-size:24px;color:#a06a12;white-space:nowrap;}'
      + '.ak-own-item{flex:0 0 auto;width:92px;text-align:center;color:#3d2a17;background:rgba(169,113,63,0.12);border:2px solid transparent;border-radius:14px;padding:6px;cursor:pointer;font-family:inherit;}'
      + '.ak-own-item .em{font-size:28px;display:block;line-height:1.1;}'
      + '.ak-own-item .nm{font-size:14px;font-weight:800;line-height:1.15;height:2.3em;overflow:hidden;}'
      + '.ak-own-item .cs{font-size:16px;color:#a06a12;font-weight:900;}'
      + '.ak-own-item.cant{opacity:.55;}'
      + '.ak-own-item:hover{border-color:#c8891f;}'
      + '.ak-own-full{font-size:18px;font-weight:900;color:#2c7a3f;}';
  }
  function injectCss() {
    var el = document.getElementById(CSS_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = CSS_ID;
      document.head.appendChild(el);
    }
    var txt = cssText();
    if (el.textContent !== txt) el.textContent = txt;
  }
  function setManualUI(on) { manualUI = !!on; injectCss(); }

  var teaserEl = null, panelEl = null, panelSig = '';

  function islandContainer() {
    var hud = document.querySelector('.ak-isl-hud');
    return hud ? hud.parentNode : null;
  }

  function syncTeaser(container) {
    if (!teaserEl || teaserEl.parentNode !== container) {
      if (teaserEl && teaserEl.parentNode) teaserEl.parentNode.removeChild(teaserEl);
      teaserEl = document.createElement('div');
      teaserEl.className = 'ak-own-teaser';
      container.appendChild(teaserEl);
    }
    var t = teaser(null);
    var on = !t.done && t.pct >= TEASER_AT;
    var isStudentPanel = panelEl && panelEl.className.indexOf(' on') >= 0;
    var cls = 'ak-own-teaser' + (on ? ' on' : '') + (isStudentPanel ? ' up' : '');
    if (teaserEl.className !== cls) teaserEl.className = cls;
    if (on) {
      var txt = t.ready
        ? '🌟 הגילוי הבא ממש כאן! עוד רגע...'
        : '✨ מתקרבים לגילוי הבא! ❓ ' + Math.round(t.pct * 100) + '%';
      if (teaserEl.textContent !== txt) teaserEl.textContent = txt;
    }
  }

  function syncPanel(container) {
    if (!panelEl || panelEl.parentNode !== container) {
      if (panelEl && panelEl.parentNode) panelEl.parentNode.removeChild(panelEl);
      panelEl = document.createElement('div');
      panelEl.className = 'ak-own-panel';
      container.appendChild(panelEl);
      panelSig = '';
    }
    var sid = activeStudentId();
    if (isTeacher() || !sid) { panelEl.className = 'ak-own-panel'; return; }
    var f = findStudentSafe(sid);
    var klass = activeClass();
    var isl = ensureIsl(klass);
    if (!f || !f.student || !isl) { panelEl.className = 'ak-own-panel'; return; }
    var si = ensureStudentIsland(f.student);
    var cat = personalCatalog(f.student);
    var mineCount = plotItemsOf(isl, sid).length;
    var sig = sid + '|' + si.personalCoins + '|' + mineCount + '|' + cat.map(function (c) { return c.id; }).join(',');
    panelEl.className = 'ak-own-panel on';
    if (sig === panelSig) return;
    panelSig = sig;

    var html = '<div class="ak-own-head">🌱 החלקה שלי<br>'
      + '<span class="coins">🪙 ' + si.personalCoins + '</span><br>'
      + '<span style="font-size:14px;">' + (mineCount === 0 ? 'האדמה מוכנה לצמוח!' : mineCount + ' פריטים צומחים') + '</span></div>';
    if (mineCount >= PLOT_FILL.length) {
      html += '<div class="ak-own-full">החלקה שלך מלאה ומדהימה! 🌟</div>';
    } else if (!cat.length) {
      html += '<div class="ak-own-full">הפריטים בדרך... ✨</div>';
    } else {
      for (var i = 0; i < cat.length; i++) {
        var c = cat[i];
        var cant = si.personalCoins < c.pcost;
        html += '<button type="button" class="ak-own-item' + (cant ? ' cant' : '') + '" data-item="' + akEsc(c.id) + '">'
          + '<span class="em">' + c.em + '</span>'
          + '<span class="nm">' + akEsc(c.n) + '</span>'
          + '<span class="cs">🪙 ' + c.pcost + '</span></button>';
      }
    }
    panelEl.innerHTML = html;
    var btns = panelEl.querySelectorAll('.ak-own-item');
    for (var b = 0; b < btns.length; b++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var ok = buildPersonal(sid, btn.getAttribute('data-item'));
          if (ok) { panelSig = ''; syncPanel(container); }
        });
      })(btns[b]);
    }
  }

  /* =========================================================================
   * 11. לולאה פנימית + init
   * ========================================================================= */
  var inited = false, tickTimer = null, tickCount = 0;

  function tick() {
    try {
      injectCss();
      var container = islandContainer();
      if (container) {
        syncPanel(container);
        syncTeaser(container);
      }
      tickCount++;
      if (tickCount % 3 === 0) checkAutoBuild(null); /* כל ~4.5 שניות */
    } catch (e) {}
  }

  function wrapIsland() {
    var isl = window.Island;
    if (!isl || typeof isl.place !== 'function' || isl.__akOwnWrapped) return !!(isl && isl.__akOwnWrapped);
    ORIG.place = isl.place;
    ORIG.remove = isl.remove;
    isl.place = wrappedPlace;
    isl.remove = wrappedRemove;
    isl.__akOwnWrapped = true;
    return true;
  }

  function init() {
    if (inited) return true;
    inited = true;
    injectCss();
    if (!wrapIsland()) {
      /* island-engine.js עוד לא נטען — ממתינים לו בסבלנות (עד 30 שניות) */
      var tries = 0;
      var poll = setInterval(function () {
        tries++;
        if (wrapIsland() || tries > 60) clearInterval(poll);
      }, 500);
    }
    if (!tickTimer) tickTimer = setInterval(tick, TICK_MS);
    return true;
  }

  /* =========================================================================
   * 12. ה-API הציבורי
   * ========================================================================= */
  window.IslandOwnership = {
    init: init,
    canBuild: canBuild,
    onPointsAdded: onPointsAdded,
    checkAutoBuild: checkAutoBuild,
    teaser: teaser,
    personalCatalog: personalCatalog,
    /* עזרים נוספים למתאם */
    buildPersonal: buildPersonal,
    getPersonalCoins: function (sid) {
      var f = findStudentSafe(sid);
      return f && f.student ? ensureStudentIsland(f.student).personalCoins : 0;
    },
    setActiveStudent: function (sid) { forcedStudentId = sid || null; },
    setManualUI: setManualUI
  };

})();
