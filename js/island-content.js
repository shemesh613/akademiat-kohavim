/* =====================================================================================
 * island-content.js — סוכן B: קטלוג התוכן של "אקדמיית כוכבים"
 * =====================================================================================
 * קובץ עצמאי, ES5-friendly, IIFE יחיד. תלוי רק ב-THREE (r128 גלובלי). לא נוגע בשום
 * DOM/קובץ אחר. מספק את window.IslandContent = { REGIONS, BUILDERS } לפי החוזה
 * המחייב שמוגדר ב-js/island-engine.README.md.
 *
 * ---------------------------------------------------------------------------------------
 * תוכן עניינים — 8 אזורים × 10 מבנים (80 סה"כ)
 * ---------------------------------------------------------------------------------------
 * 1. beach    חוף הכוכבים    — קונכייה, כוכב ים, כדור חוף, פרח חוף, דקל, כיסא נוח,
 *                               טירת חול, סירת דיג, 🌟מגדלור, 🌟ספינת מפרשים עתיקה
 * 2. forest   יער הלחישות    — פטרייה, שרך, שיח פירות יער, ערמת אצטרובלים, עץ אורן,
 *                               מקום ינשוף, בית עץ, גשר עצים, 🌟העץ העתיק, 🌟מפל היער
 * 3. farm     חוות האלופים   — ערוגת גזר, ערמת שחת, לול תרנגולות, כבשה, דחליל,
 *                               טחנת רוח קטנה, אסם, טרקטור, 🌟כרם ענבים, 🌟טחנת הענק
 * 4. village  כפר הידע       — ספסל כיכר, פנס רחוב, עציץ כיכר, באר הכפר, דוכן ספרים,
 *                               מגדל שעון קטן, ספריית התורה, בית הכנסת,
 *                               🌟מגדל המים, 🌟מגדל התצפית הגדול
 * 5. mountain הר הקרח        — איש שלג, נטיף קרח, ערמת שלג, אשוח מושלג, בקתת קרח,
 *                               רכבל, מגלשת קרח, אגם קפוא, 🌟ארמון הקרח,
 *                               🌟הדרקון הקפוא הישן
 * 6. desert   מדבר הזהב      — קקטוס, פרח מדבר, ערמת סלעים, דיונת זהב, גמל קטן,
 *                               דקל נאה, אוהל נוודים, שיירת גמלים,
 *                               🌟מגדל השמירה, 🌟הנווה הגדול
 * 7. volcano  הר האש         — אבן לוהטת, רסיס אובסידיאן, בריכת לבה קטנה, עץ שרוף,
 *                               פרח אש, גייזר, גשר לבה, מגדל אש,
 *                               🌟דרקון הר האש, 🌟פסגת הר האש הגועש
 * 8. sky      איי השמיים     — ענן קטן, כוכב נופל, קשת בענן, פנס מרחף, פעמון רוח,
 *                               אי מרחף קטן, כדור פורח, טחנת רוח מעופפת,
 *                               🌟ארמון השמיים, 🌟מצפה הכוכבים הגדול
 *
 * (🌟 = מבנה "וואו" יקר, 250–400 אבנים, שקיבל תשומת לב ויזואלית מיוחדת)
 *
 * כל builder: 8–25 meshes, לפחות 3 צבעים, פרט מונפש אחד לפחות דרך userData.animate.
 * סגנון voxel/low-poly — גיאומטריות בסיסיות (Box/Cone/Cylinder/Sphere/Octahedron/
 * Dodecahedron/Icosahedron/Torus) בפירוט נמוך, ללא טקסטורות, צבעים רוויים.
 * רגישות תרבותית: בלי שם ה', בלי פסלים/אלילים, בלי דימויי חרדים, בלי דמויות נשיות
 * לא-צנועות (אין דמויות אדם עם בגדים כלל במבנים — רק מבנים/צומח/חיות/חפצים),
 * מוטיבים דתי-לאומיים חיוביים (בית כנסת, ספריית תורה, מגדל מים, כרם).
 * ===================================================================================== */
(function () {
  'use strict';

  /* =====================================================================
   * 1. עזרי גיאומטריה — פרימיטיבים ES5, כל אחד יוצר Mesh חדש כל קריאה
   * ===================================================================== */
  var _matCache = {};
  function mat(c) {
    var k = 'm' + c;
    if (!_matCache[k]) _matCache[k] = new THREE.MeshLambertMaterial({ color: c });
    return _matCache[k];
  }
  /* חומר ייחודי (לא-משותף) — לשימוש רק כשמאנימציה משנה תכונת-חומר עצמה (emissive וכו') */
  function matU(c) { return new THREE.MeshLambertMaterial({ color: c }); }

  function place(m, x, y, z) { m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true; return m; }
  function bx(w, h, d, c, x, y, z) { return place(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)), x, y, z); }
  function cn(r, h, c, x, y, z, seg) { return place(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg || 6), mat(c)), x, y, z); }
  function cy(rt, rb, h, c, x, y, z, seg) { return place(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 8), mat(c)), x, y, z); }
  function sp(r, c, x, y, z, seg) { return place(new THREE.Mesh(new THREE.SphereGeometry(r, seg || 7, (seg || 7) - 2 > 3 ? (seg || 7) - 2 : 4), mat(c)), x, y, z); }
  function oc(r, c, x, y, z) { return place(new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), mat(c)), x, y, z); }
  function dd(r, c, x, y, z) { return place(new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat(c)), x, y, z); }
  function ic(r, c, x, y, z) { return place(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat(c)), x, y, z); }
  function tr(r, tube, c, x, y, z, seg) { return place(new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, seg || 10), mat(c)), x, y, z); }
  function tet(r, c, x, y, z) { return place(new THREE.Mesh(new THREE.TetrahedronGeometry(r, 0), mat(c)), x, y, z); }

  function G() { return new THREE.Group(); }
  /* מוסיף כמה meshes ל-group אחד בקריאה אחת */
  function addAll(g) { for (var i = 1; i < arguments.length; i++) g.add(arguments[i]); return g; }

  var TAU = Math.PI * 2;
  /* פסאודו-רנדום דטרמיניסטי קליל (לגיוון פרטים קטנים בין הופעה להופעה, לא קריטי) */
  function rr(seed) { var x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); }

  /* =====================================================================
   * 2. עזרי אנימציה — כל אחד מחזיר function(t,dt) שמתאים ל-userData.animate
   * ===================================================================== */
  function aSpin(mesh, speed) { return function (t) { mesh.rotation.y = t * speed; }; }
  function aSpinX(mesh, speed) { return function (t) { mesh.rotation.x = t * speed; }; }
  function aSpinZ(mesh, speed) { return function (t) { mesh.rotation.z = t * speed; }; }
  function aBob(mesh, base, amp, speed, phase) { return function (t) { mesh.position.y = base + Math.sin(t * speed + (phase || 0)) * amp; }; }
  function aSway(mesh, amp, speed, phase) { return function (t) { mesh.rotation.z = Math.sin(t * speed + (phase || 0)) * amp; }; }
  function aPulse(mesh, base, amp, speed) { return function (t) { var s = base + Math.sin(t * speed) * amp; mesh.scale.set(s, s, s); }; }
  function aFlicker(material, base, amp, speed) { return function (t) { material.emissive = material.emissive || new THREE.Color(0); var v = base + Math.sin(t * speed) * amp + Math.sin(t * speed * 2.7) * amp * 0.4; material.emissiveIntensity = 1; material.emissive.setScalar(Math.max(0, v)); }; }
  function aOrbit(mesh, radius, height, speed, phase) { return function (t) { var a = t * speed + (phase || 0); mesh.position.set(Math.cos(a) * radius, height, Math.sin(a) * radius); }; }
  /* מרכיב כמה אנימציות משנה לאחת (מוריד ל-userData.animate יחיד) */
  function combine() { var fns = arguments; return function (t, dt) { for (var i = 0; i < fns.length; i++) fns[i](t, dt); }; }

  /* =====================================================================
   * 3. עזרי-על — רכיבים חוזרים (עץ/דגל/להבה) המשמשים כמה builders
   * ===================================================================== */
  function simpleTree(trunkC, leafC1, leafC2, scale) {
    scale = scale || 1;
    var g = G();
    g.add(bx(0.16 * scale, 0.55 * scale, 0.16 * scale, trunkC, 0, 0.27 * scale, 0));
    g.add(cn(0.42 * scale, 0.62 * scale, leafC1, 0, 0.72 * scale, 0));
    g.add(cn(0.32 * scale, 0.5 * scale, leafC2, 0, 1.08 * scale, 0));
    return g;
  }
  function flagPole(poleC, flagC, h) {
    h = h || 1.1;
    var g = G();
    g.add(bx(0.06, h, 0.06, poleC, 0, h / 2, 0));
    var f = bx(0.42, 0.26, 0.03, flagC, 0.24, h * 0.82, 0);
    g.add(f);
    g.userData.flagMesh = f;
    return g;
  }

  /* =====================================================================
   * 4. REGIONS — 8 אזורים, פלטת צבעים ייחודית + קטלוג ~10 פריטים כל אחד
   * ===================================================================== */
  var REGIONS = [
    {
      id: 'beach', name: 'חוף הכוכבים',
      theme: { sky: 0x8fd8ff, fog: 0xbfe8ff, ground: 0xe6cf94, accent: 0xf5e7ae },
      items: [
        { id: 'seashell', em: '🐚', n: 'קונכייה', cost: 8 },
        { id: 'starfish_beach', em: '🌟', n: 'כוכב ים', cost: 12 },
        { id: 'beach_ball', em: '🏐', n: 'כדור חוף', cost: 18 },
        { id: 'flower_beach', em: '🌺', n: 'פרח חוף', cost: 20 },
        { id: 'palm_beach', em: '🌴', n: 'דקל', cost: 35 },
        { id: 'beach_chair', em: '🏖️', n: 'כיסא נוח', cost: 55 },
        { id: 'sandcastle', em: '🏰', n: 'טירת חול', cost: 85 },
        { id: 'fishing_boat', em: '⛵', n: 'סירת דיג', cost: 130 },
        { id: 'lighthouse', em: '🗼', n: 'מגדלור', cost: 280 },
        { id: 'tall_ship', em: '🚢', n: 'ספינת מפרשים עתיקה', cost: 390 }
      ]
    },
    {
      id: 'forest', name: 'יער הלחישות',
      theme: { sky: 0xbfe8c8, fog: 0xcfead2, ground: 0x3f8b3f, accent: 0x2f6a30 },
      items: [
        { id: 'mushroom_f', em: '🍄', n: 'פטרייה', cost: 8 },
        { id: 'fern', em: '🌿', n: 'שרך', cost: 12 },
        { id: 'berry_bush', em: '🫐', n: 'שיח פירות יער', cost: 16 },
        { id: 'pinecone_pile', em: '🌰', n: 'ערמת אצטרובלים', cost: 20 },
        { id: 'pine_tree', em: '🌲', n: 'עץ אורן', cost: 32 },
        { id: 'owl_perch', em: '🦉', n: 'מקום ינשוף', cost: 55 },
        { id: 'treehouse', em: '🏡', n: 'בית עץ', cost: 90 },
        { id: 'log_bridge', em: '🌉', n: 'גשר עצים', cost: 135 },
        { id: 'ancient_tree', em: '🌳', n: 'העץ העתיק', cost: 290 },
        { id: 'forest_waterfall', em: '💦', n: 'מפל היער', cost: 385 }
      ]
    },
    {
      id: 'farm', name: 'חוות האלופים',
      theme: { sky: 0xffe9b0, fog: 0xffe9c0, ground: 0x6fae4a, accent: 0xd8b25a },
      items: [
        { id: 'carrot_patch', em: '🥕', n: 'ערוגת גזר', cost: 8 },
        { id: 'haystack', em: '🌾', n: 'ערמת שחת', cost: 12 },
        { id: 'chicken_coop', em: '🐔', n: 'לול תרנגולות', cost: 18 },
        { id: 'sheep_farm', em: '🐑', n: 'כבשה', cost: 24 },
        { id: 'scarecrow', em: '🧑‍🌾', n: 'דחליל', cost: 38 },
        { id: 'windmill_small', em: '🌀', n: 'טחנת רוח קטנה', cost: 60 },
        { id: 'barn', em: '🚜', n: 'אסם', cost: 95 },
        { id: 'tractor', em: '🛺', n: 'טרקטור', cost: 140 },
        { id: 'vineyard', em: '🍇', n: 'כרם ענבים', cost: 285 },
        { id: 'grand_windmill', em: '🌾', n: 'טחנת הענק', cost: 395 }
      ]
    },
    {
      id: 'village', name: 'כפר הידע',
      theme: { sky: 0xd9c9ff, fog: 0xe3d6ff, ground: 0x7fae5a, accent: 0xc79a5b },
      items: [
        { id: 'bench_village', em: '🪑', n: 'ספסל כיכר', cost: 10 },
        { id: 'streetlamp', em: '🏮', n: 'פנס רחוב', cost: 14 },
        { id: 'flower_planter', em: '🌷', n: 'עציץ כיכר', cost: 18 },
        { id: 'well_village', em: '⛲', n: 'באר הכפר', cost: 26 },
        { id: 'bookstall', em: '📚', n: 'דוכן ספרים', cost: 42 },
        { id: 'clocktower_small', em: '🕰️', n: 'מגדל שעון קטן', cost: 68 },
        { id: 'library_torah', em: '📖', n: 'ספריית התורה', cost: 105 },
        { id: 'synagogue', em: '🕍', n: 'בית הכנסת', cost: 165 },
        { id: 'water_tower', em: '💧', n: 'מגדל המים', cost: 300 },
        { id: 'lookout_tower', em: '🗼', n: 'מגדל התצפית הגדול', cost: 375 }
      ]
    },
    {
      id: 'mountain', name: 'הר הקרח',
      theme: { sky: 0xdfeeff, fog: 0xeaf4ff, ground: 0xe8eef2, accent: 0x9fc2d8 },
      items: [
        { id: 'snowman', em: '⛄', n: 'איש שלג', cost: 10 },
        { id: 'icicle', em: '🧊', n: 'נטיף קרח', cost: 14 },
        { id: 'snow_pile', em: '❄️', n: 'ערמת שלג', cost: 18 },
        { id: 'pine_snow', em: '🌲', n: 'אשוח מושלג', cost: 28 },
        { id: 'ice_cabin', em: '🏔️', n: 'בקתת קרח', cost: 52 },
        { id: 'ski_lift', em: '🚡', n: 'רכבל', cost: 82 },
        { id: 'ice_slide', em: '🛷', n: 'מגלשת קרח', cost: 118 },
        { id: 'frozen_lake', em: '⛸️', n: 'אגם קפוא', cost: 155 },
        { id: 'ice_castle', em: '🏰', n: 'ארמון הקרח', cost: 310 },
        { id: 'frozen_dragon', em: '🐉', n: 'הדרקון הקפוא הישן', cost: 400 }
      ]
    },
    {
      id: 'desert', name: 'מדבר הזהב',
      theme: { sky: 0xffe0a0, fog: 0xffe9bd, ground: 0xe0c07a, accent: 0xc79447 },
      items: [
        { id: 'cactus', em: '🌵', n: 'קקטוס', cost: 8 },
        { id: 'desert_flower', em: '🌼', n: 'פרח מדבר', cost: 12 },
        { id: 'rock_pile_d', em: '🪨', n: 'ערמת סלעים', cost: 16 },
        { id: 'golden_dune', em: '🏜️', n: 'דיונת זהב', cost: 22 },
        { id: 'camel_small', em: '🐫', n: 'גמל קטן', cost: 34 },
        { id: 'oasis_palm', em: '🌴', n: 'דקל נאה', cost: 50 },
        { id: 'tent_bedouin', em: '⛺', n: 'אוהל נוודים', cost: 78 },
        { id: 'camel_caravan', em: '🐪', n: 'שיירת גמלים', cost: 122 },
        { id: 'desert_watchtower', em: '🏯', n: 'מגדל השמירה', cost: 290 },
        { id: 'grand_oasis', em: '🌊', n: 'הנווה הגדול', cost: 385 }
      ]
    },
    {
      id: 'volcano', name: 'הר האש',
      theme: { sky: 0xffb37a, fog: 0xff9a6a, ground: 0x4a4038, accent: 0xd8451f },
      items: [
        { id: 'ember_rock', em: '🔥', n: 'אבן לוהטת', cost: 10 },
        { id: 'obsidian_shard', em: '⚫', n: 'רסיס אובסידיאן', cost: 14 },
        { id: 'lava_pool', em: '🌋', n: 'בריכת לבה קטנה', cost: 20 },
        { id: 'ash_tree', em: '🪵', n: 'עץ שרוף', cost: 30 },
        { id: 'fire_flower', em: '🌺', n: 'פרח אש', cost: 45 },
        { id: 'geyser', em: '💦', n: 'גייזר', cost: 70 },
        { id: 'lava_bridge', em: '🌉', n: 'גשר לבה', cost: 105 },
        { id: 'fire_beacon', em: '🔥', n: 'מגדל אש', cost: 145 },
        { id: 'volcano_dragon', em: '🐉', n: 'דרקון הר האש', cost: 330 },
        { id: 'erupting_peak', em: '🌋', n: 'פסגת הר האש הגועש', cost: 400 }
      ]
    },
    {
      id: 'sky', name: 'איי השמיים',
      theme: { sky: 0xfff6e0, fog: 0xfff2f8, ground: 0xc9b8ff, accent: 0xffffff },
      items: [
        { id: 'cloud_puff', em: '☁️', n: 'ענן קטן', cost: 12 },
        { id: 'star_small', em: '⭐', n: 'כוכב נופל', cost: 16 },
        { id: 'rainbow_arch', em: '🌈', n: 'קשת בענן', cost: 24 },
        { id: 'floating_lantern', em: '🏮', n: 'פנס מרחף', cost: 34 },
        { id: 'wind_chime', em: '🎐', n: 'פעמון רוח', cost: 50 },
        { id: 'floating_platform', em: '🏝️', n: 'אי מרחף קטן', cost: 78 },
        { id: 'hot_air_balloon', em: '🎈', n: 'כדור פורח', cost: 118 },
        { id: 'sky_windmill', em: '🌀', n: 'טחנת רוח מעופפת', cost: 155 },
        { id: 'sky_castle', em: '🏰', n: 'ארמון השמיים', cost: 340 },
        { id: 'star_observatory', em: '🔭', n: 'מצפה הכוכבים הגדול', cost: 400 }
      ]
    }
  ];

  /* =====================================================================
   * 5. BUILDERS — 80 פונקציות, כל אחת מחזירה THREE.Group חדש
   * ===================================================================== */
  var BUILDERS = {};

  /* --------------------------- 1. BEACH --------------------------- */
  BUILDERS.seashell = function () {
    var g = G();
    var shell = sp(0.22, 0xffe4c4, 0, 0.14, 0, 6); shell.scale.set(1, 0.62, 1); g.add(shell);
    g.add(dd(0.1, 0xff9ec2, 0, 0.3, 0));
    g.add(oc(0.05, 0xffffff, 0.12, 0.32, 0.05));
    g.add(bx(0.3, 0.03, 0.22, 0xf5e7ae, 0, 0.02, 0));
    g.userData.animate = aBob(shell, 0.14, 0.03, 1.6);
    return g;
  };
  BUILDERS.starfish_beach = function () {
    var g = G();
    var core = oc(0.16, 0xff7a59, 0, 0.08, 0);
    g.add(core);
    for (var i = 0; i < 5; i++) {
      var a = i * TAU / 5;
      var arm = bx(0.3, 0.07, 0.09, 0xff8f6b, Math.cos(a) * 0.2, 0.06, Math.sin(a) * 0.2);
      arm.rotation.y = -a;
      g.add(arm);
    }
    g.add(sp(0.03, 0xffffff, 0, 0.16, 0.1, 4));
    g.userData.animate = combine(aSpin(core, 0.6), aBob(g.children[0], 0.08, 0.02, 2));
    return g;
  };
  BUILDERS.beach_ball = function () {
    var g = G();
    var ball = sp(0.28, 0xffffff, 0, 0.3, 0, 8);
    g.add(ball);
    g.add(bx(0.57, 0.57, 0.05, 0xff4a4a, 0, 0.3, 0));
    g.add(bx(0.05, 0.57, 0.57, 0x2a8fd4, 0, 0.3, 0));
    g.add(oc(0.06, 0xffd54a, 0, 0.58, 0));
    g.userData.animate = combine(aSpinZ(ball, 1.1), aBob(ball, 0.3, 0.08, 1.8));
    return g;
  };
  BUILDERS.flower_beach = function () {
    var g = G();
    g.add(bx(0.06, 0.32, 0.06, 0x3f9b45, 0, 0.16, 0));
    var cols = [0xff6a9e, 0xffd54a, 0xff8a5c];
    var petals = G();
    for (var i = 0; i < 5; i++) {
      var a = i * TAU / 5;
      petals.add(oc(0.1, cols[i % 3], Math.cos(a) * 0.13, 0.38, Math.sin(a) * 0.13));
    }
    petals.add(sp(0.07, 0xffe45a, 0, 0.38, 0, 5));
    petals.position.y = 0;
    g.add(petals);
    g.userData.animate = aSway(petals, 0.12, 1.4);
    return g;
  };
  BUILDERS.palm_beach = function () {
    var g = G();
    var trunk = cy(0.08, 0.14, 1.1, 0x9c6b3a, 0, 0.55, 0);
    trunk.rotation.z = 0.06;
    g.add(trunk);
    var leaves = G();
    for (var i = 0; i < 6; i++) {
      var l = bx(0.75, 0.06, 0.24, 0x3fa04c, 0.34, 0, 0);
      l.rotation.y = i * TAU / 6;
      l.rotation.z = -0.3;
      leaves.add(l);
    }
    leaves.position.y = 1.15;
    g.add(leaves);
    for (var k = 0; k < 3; k++) g.add(sp(0.08, 0x8a6a3a, 0.1 + k * 0.07, 1.02, 0.05, 5));
    g.userData.animate = aSway(leaves, 0.08, 1.2);
    return g;
  };
  BUILDERS.beach_chair = function () {
    var g = G();
    g.add(bx(0.5, 0.05, 0.42, 0x2a8fd4, 0, 0.3, 0));
    var back = bx(0.5, 0.55, 0.05, 0xf5e7ae, 0, 0.55, -0.19);
    back.rotation.x = -0.35;
    g.add(back);
    [-0.22, 0.22].forEach(function (x) { g.add(bx(0.05, 0.3, 0.05, 0x9c6b3a, x, 0.15, 0.18)); g.add(bx(0.05, 0.55, 0.05, 0x9c6b3a, x, 0.28, -0.19)); });
    g.add(bx(0.16, 0.4, 0.16, 0xffffff, 0.35, 0.58, 0.15));
    var umbrella = cn(0.55, 0.28, 0xff6a4a, 0.35, 1.0, 0.15, 8);
    g.add(umbrella);
    g.userData.animate = aSway(umbrella, 0.04, 1.0);
    return g;
  };
  BUILDERS.sandcastle = function () {
    var g = G();
    g.add(cy(0.55, 0.65, 0.5, 0xe6cf94, 0, 0.25, 0));
    g.add(cy(0.32, 0.4, 0.4, 0xd8b96a, 0, 0.7, 0));
    for (var i = 0; i < 4; i++) {
      var a = i * TAU / 4;
      g.add(cy(0.1, 0.13, 0.6, 0xe6cf94, Math.cos(a) * 0.45, 0.55, Math.sin(a) * 0.45));
      g.add(cn(0.14, 0.2, 0xd8b96a, Math.cos(a) * 0.45, 0.9, Math.sin(a) * 0.45, 4));
    }
    var flag = flagPole(0x8a6a3a, 0xff6a4a, 0.5);
    flag.position.set(0, 0.9, 0);
    g.add(flag);
    g.userData.animate = aSway(flag.userData.flagMesh, 0.4, 3);
    return g;
  };
  BUILDERS.fishing_boat = function () {
    var g = G();
    var hull = bx(1.0, 0.24, 0.44, 0x8a5a2b, 0, 0.12, 0);
    g.add(hull);
    g.add(bx(0.08, 0.9, 0.08, 0x6b4423, 0, 0.68, 0));
    var sail = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.66, 3), mat(0xf5f2e8));
    sail.position.set(0.14, 0.75, 0);
    sail.rotation.z = -Math.PI / 2;
    place(sail, 0.14, 0.75, 0);
    sail.rotation.z = -Math.PI / 2;
    g.add(sail);
    g.add(bx(0.06, 0.4, 0.5, 0xd8451f, -0.4, 0.36, 0));
    g.add(sp(0.06, 0xffd54a, 0, 1.1, 0, 5));
    var net = tr(0.16, 0.02, 0xe6cf94, -0.15, 0.28, 0.24);
    net.rotation.x = Math.PI / 2;
    g.add(net);
    g.userData.animate = combine(aBob(g, 0, 0.06, 1.4), aSway(g, 0.03, 1.1));
    return g;
  };
  BUILDERS.lighthouse = function () {
    var g = G();
    g.add(cy(0.6, 0.75, 0.5, 0xb4bac4, 0, 0.25, 0));
    var tower = cy(0.34, 0.48, 2.2, 0xffffff, 0, 1.6, 0);
    g.add(tower);
    for (var i = 0; i < 3; i++) g.add(bx(0.7, 0.14, 0.7, 0xd8451f, 0, 1.2 + i * 0.7, 0));
    var lampHouse = cy(0.3, 0.3, 0.36, 0xffe45a, 0, 2.9, 0, 8);
    g.add(lampHouse);
    var beacon = sp(0.14, 0xfff6b0, 0, 2.9, 0, 6);
    g.add(beacon);
    g.add(cn(0.36, 0.32, 0xd8451f, 0, 3.15, 0, 8));
    for (var k = 0; k < 4; k++) { var a = k * TAU / 4; g.add(bx(0.1, 0.6, 0.1, 0xe6cf94, Math.cos(a) * 0.5, 0.3, Math.sin(a) * 0.5)); }
    g.add(bx(0.5, 0.06, 0.5, 0xffffff, 0, 2.62, 0));
    g.userData.animate = combine(aSpin(lampHouse, 0.8), aPulse(beacon, 1, 0.35, 3));
    return g;
  };
  BUILDERS.tall_ship = function () {
    var g = G();
    var hull = bx(2.0, 0.42, 0.62, 0x6b4423, 0, 0.24, 0);
    g.add(hull);
    g.add(bx(2.1, 0.1, 0.7, 0x8a5a2b, 0, 0.46, 0));
    var mast1 = bx(0.09, 1.7, 0.09, 0x5a3a1e, -0.5, 1.3, 0); g.add(mast1);
    var mast2 = bx(0.1, 2.0, 0.1, 0x5a3a1e, 0.3, 1.45, 0); g.add(mast2);
    var sail1 = bx(0.75, 0.7, 0.03, 0xf5f2e8, -0.5, 1.7, 0.02); g.add(sail1);
    var sail2 = bx(0.9, 0.85, 0.03, 0xf5f2e8, 0.3, 2.0, 0.02); g.add(sail2);
    var sail3 = bx(0.6, 0.55, 0.03, 0xf5f2e8, 0.3, 2.7, 0.02); g.add(sail3);
    g.add(bx(0.9, 0.06, 0.03, 0xd8451f, -0.5, 2.02, 0.02));
    var flag = flagPole(0x5a3a1e, 0xffd54a, 0.4); flag.position.set(0.3, 2.9, 0); g.add(flag);
    for (var i = 0; i < 5; i++) g.add(sp(0.05, 0x3a2a1a, -0.85 + i * 0.4, 0.14, 0.33, 5));
    var bow = cn(0.25, 0.5, 0x6b4423, -1.05, 0.3, 0, 4); bow.rotation.z = Math.PI / 2; bow.rotation.y = Math.PI / 4; g.add(bow);
    g.userData.animate = combine(aBob(g, 0, 0.07, 1.1), aSway(g, 0.025, 0.9), aSway(flag.userData.flagMesh, 0.35, 3.2));
    return g;
  };

  /* --------------------------- 2. FOREST --------------------------- */
  BUILDERS.mushroom_f = function () {
    var g = G();
    g.add(cy(0.07, 0.09, 0.24, 0xf2ede2, 0, 0.12, 0));
    var cap = sp(0.2, 0xd84838, 0, 0.28, 0, 7); cap.scale.set(1, 0.6, 1); g.add(cap);
    for (var i = 0; i < 4; i++) { var a = i * TAU / 4 + 0.4; g.add(sp(0.03, 0xffffff, Math.cos(a) * 0.12, 0.32, Math.sin(a) * 0.12, 4)); }
    g.userData.animate = aPulse(cap, 1, 0.06, 2.2);
    return g;
  };
  BUILDERS.fern = function () {
    var g = G();
    var cluster = G();
    for (var i = 0; i < 5; i++) {
      var a = i * TAU / 5;
      var leaf = bx(0.34, 0.04, 0.1, 0x2f6a30, Math.cos(a) * 0.14, 0.16 + i * 0.02, Math.sin(a) * 0.14);
      leaf.rotation.y = a; leaf.rotation.z = 0.2;
      cluster.add(leaf);
    }
    cluster.add(bx(0.06, 0.08, 0.06, 0x54ad54, 0, 0.05, 0));
    g.add(cluster);
    g.userData.animate = aSway(cluster, 0.1, 1.6);
    return g;
  };
  BUILDERS.berry_bush = function () {
    var g = G();
    g.add(sp(0.32, 0x3f8b3f, 0, 0.28, 0, 7));
    var berries = G();
    for (var i = 0; i < 6; i++) { var a = i * TAU / 6; berries.add(sp(0.045, 0x3a5fd4, Math.cos(a) * 0.28, 0.28 + (i % 2) * 0.1, Math.sin(a) * 0.28, 5)); }
    g.add(berries);
    g.userData.animate = aPulse(berries, 1, 0.08, 2.4);
    return g;
  };
  BUILDERS.pinecone_pile = function () {
    var g = G();
    for (var i = 0; i < 5; i++) {
      var cone = cn(0.09, 0.2, 0x7c4a24, (rr(i) - 0.5) * 0.4, 0.1, (rr(i + 9) - 0.5) * 0.4, 6);
      cone.rotation.z = rr(i + 3) * 0.6 - 0.3;
      g.add(cone);
    }
    g.add(bx(0.6, 0.05, 0.6, 0x2f6a30, 0, 0.02, 0));
    g.userData.animate = aSpin(g.children[0], 0.5);
    return g;
  };
  BUILDERS.pine_tree = function () {
    var g = G();
    g.add(bx(0.16, 0.4, 0.16, 0x6b4423, 0, 0.2, 0));
    var t1 = cn(0.5, 0.6, 0x2f6a30, 0, 0.7, 0, 8);
    var t2 = cn(0.4, 0.55, 0x3f8b3f, 0, 1.1, 0, 8);
    var t3 = cn(0.28, 0.5, 0x54ad54, 0, 1.5, 0, 8);
    g.add(t1); g.add(t2); g.add(t3);
    g.add(oc(0.06, 0xffd54a, 0, 1.85, 0));
    g.userData.animate = aSway(g, 0.02, 1.0);
    return g;
  };
  BUILDERS.owl_perch = function () {
    var g = G();
    g.add(bx(0.12, 1.0, 0.12, 0x6b4423, 0, 0.5, 0));
    g.add(bx(0.4, 0.06, 0.4, 0x8a5a2b, 0, 1.02, 0));
    var body = sp(0.2, 0x8a6a4a, 0, 1.28, 0, 7); g.add(body);
    g.add(sp(0.13, 0xdfc89a, 0, 1.42, 0.08, 6));
    g.add(oc(0.035, 0xffd54a, -0.06, 1.44, 0.17));
    g.add(oc(0.035, 0xffd54a, 0.06, 1.44, 0.17));
    g.add(cn(0.03, 0.06, 0xd8842a, 0, 1.4, 0.2, 4));
    var wing1 = bx(0.05, 0.24, 0.14, 0x6b5030, -0.2, 1.26, 0); wing1.rotation.z = 0.2; g.add(wing1);
    var wing2 = bx(0.05, 0.24, 0.14, 0x6b5030, 0.2, 1.26, 0); wing2.rotation.z = -0.2; g.add(wing2);
    g.userData.animate = combine(aSway(body, 0.06, 2.4), aSpin(g, 0.15));
    return g;
  };
  BUILDERS.treehouse = function () {
    var g = G();
    g.add(bx(0.3, 1.6, 0.3, 0x6b4423, -0.4, 0.8, -0.2));
    g.add(bx(0.24, 1.4, 0.24, 0x7c4a24, 0.35, 0.7, 0.2));
    var cabin = bx(0.85, 0.55, 0.75, 0xc79a5b, 0, 1.5, 0); g.add(cabin);
    var roof = cn(0.65, 0.5, 0xb23225, 0, 2.0, 0, 4); roof.rotation.y = Math.PI / 4; g.add(roof);
    g.add(bx(0.16, 0.22, 0.03, 0x4a3018, 0, 1.4, 0.38));
    g.add(bx(0.14, 0.14, 0.03, 0x9fd4ff, 0.25, 1.55, 0.38));
    var ladder = G();
    for (var i = 0; i < 4; i++) ladder.add(bx(0.24, 0.03, 0.03, 0x8a5a2b, 0, 0.2 + i * 0.22, 0.4));
    [-0.1, 0.1].forEach(function (x) { ladder.add(bx(0.03, 0.9, 0.03, 0x8a5a2b, x, 0.5, 0.4)); });
    g.add(ladder);
    var lantern = sp(0.06, 0xffe45a, 0.42, 1.3, 0.38, 5); g.add(lantern);
    g.userData.animate = aPulse(lantern, 1, 0.15, 2.6);
    return g;
  };
  BUILDERS.log_bridge = function () {
    var g = G();
    for (var i = 0; i < 5; i++) {
      var log = cy(0.08, 0.08, 0.9, 0x8a5a2b, -0.8 + i * 0.4, 0.16, 0);
      log.rotation.x = Math.PI / 2;
      g.add(log);
    }
    [-0.42, 0.42].forEach(function (z) {
      for (var j = 0; j < 3; j++) g.add(bx(0.06, 0.3, 0.06, 0x6b4423, -0.8 + j * 0.8, 0.32, z));
      g.add(bx(2.0, 0.05, 0.06, 0x6b4423, 0, 0.46, z));
    });
    var rope = tr(0.05, 0.015, 0x3a2a1a, -0.8, 0.46, 0.42);
    g.add(rope);
    g.userData.animate = aSway(g, 0.015, 1.3);
    return g;
  };
  BUILDERS.ancient_tree = function () {
    var g = G();
    var trunk = cy(0.55, 0.85, 2.2, 0x5a3a1e, 0, 1.1, 0, 8); g.add(trunk);
    g.add(cy(0.9, 1.1, 0.5, 0x6b4423, 0, 0.25, 0, 8));
    var canopy1 = sp(1.3, 0x2f6a30, 0, 2.5, 0, 8); g.add(canopy1);
    var canopy2 = sp(1.0, 0x3f8b3f, 0.5, 2.9, 0.3, 7); g.add(canopy2);
    var canopy3 = sp(0.85, 0x54ad54, -0.5, 2.7, -0.3, 7); g.add(canopy3);
    var fireflies = G();
    for (var i = 0; i < 6; i++) {
      var f = sp(0.04, 0xffe45a, (rr(i) - 0.5) * 2, 2.0 + rr(i + 5), (rr(i + 11) - 0.5) * 2, 4);
      fireflies.add(f);
    }
    g.add(fireflies);
    for (var k = 0; k < 3; k++) { var root = cy(0.12, 0.22, 0.6, 0x6b4423, (k - 1) * 0.5, 0.1, 0.5); root.rotation.x = 0.5; g.add(root); }
    g.userData.animate = combine(aSway(canopy1, 0.02, 0.8), aSway(canopy2, 0.03, 0.9), aOrbit(fireflies.children[0], 0.9, 2.3, 0.7), aPulse(fireflies, 1, 0.15, 3));
    return g;
  };
  BUILDERS.forest_waterfall = function () {
    var g = G();
    g.add(bx(1.6, 1.8, 1.0, 0x8a8f9a, 0, 0.9, -0.4));
    g.add(bx(1.7, 0.3, 1.1, 0x7c828e, 0, 1.85, -0.4));
    var fall = bx(0.5, 1.6, 0.06, 0x6fd0ff, 0, 0.9, 0.2);
    fall.material = matU(0x6fd0ff);
    fall.material.transparent = true; fall.material.opacity = 0.85;
    g.add(fall);
    var pool = cy(0.6, 0.6, 0.15, 0x2a8fd4, 0, 0.08, 0.5, 10); g.add(pool);
    var mist = sp(0.35, 0xffffff, 0, 0.2, 0.5, 6); mist.material = matU(0xffffff); mist.material.transparent = true; mist.material.opacity = 0.4; g.add(mist);
    g.add(sp(0.3, 0x3f8b3f, -0.7, 1.6, -0.2, 6));
    g.add(sp(0.28, 0x54ad54, 0.7, 1.5, -0.2, 6));
    var rock1 = dd(0.15, 0x6a6f78, 0.2, 0.15, 0.55); g.add(rock1);
    var rock2 = dd(0.12, 0x7c828e, -0.25, 0.12, 0.6); g.add(rock2);
    g.userData.animate = combine(function (t) { fall.material.opacity = 0.7 + Math.sin(t * 8) * 0.15; }, aPulse(mist, 1, 0.1, 4));
    return g;
  };

  /* --------------------------- 3. FARM --------------------------- */
  BUILDERS.carrot_patch = function () {
    var g = G();
    for (var i = 0; i < 4; i++) {
      var a = i * TAU / 4;
      var top = cn(0.06, 0.16, 0x3fa04c, Math.cos(a) * 0.16, 0.32, Math.sin(a) * 0.16, 5);
      g.add(top);
      g.add(cn(0.08, 0.2, 0xff8a3c, Math.cos(a) * 0.16, 0.1, Math.sin(a) * 0.16, 6));
    }
    g.add(bx(0.7, 0.05, 0.7, 0x6b4423, 0, 0.0, 0));
    g.userData.animate = aSway(g.children[0], 0.15, 2.0);
    return g;
  };
  BUILDERS.haystack = function () {
    var g = G();
    g.add(sp(0.4, 0xe6c85a, 0, 0.32, 0, 7));
    g.add(sp(0.28, 0xf0d878, 0, 0.62, 0, 6));
    for (var i = 0; i < 5; i++) { var straw = bx(0.03, 0.3, 0.03, 0xd8b25a, (rr(i) - 0.5) * 0.5, 0.75, (rr(i + 4) - 0.5) * 0.5); straw.rotation.z = rr(i + 8) - 0.5; g.add(straw); }
    g.userData.animate = aSway(g.children[2], 0.2, 3);
    return g;
  };
  BUILDERS.chicken_coop = function () {
    var g = G();
    g.add(bx(0.6, 0.4, 0.5, 0xe8dcc0, 0, 0.2, 0));
    var roof = cn(0.5, 0.3, 0xb23225, 0, 0.55, 0, 4); roof.rotation.y = Math.PI / 4; g.add(roof);
    g.add(bx(0.2, 0.24, 0.03, 0x6b3a1c, 0, 0.12, 0.26));
    var hen = sp(0.13, 0xf2ede2, 0.35, 0.15, 0.1, 6); g.add(hen);
    g.add(cn(0.05, 0.06, 0xd84838, 0.35, 0.25, 0.18, 4));
    g.add(oc(0.05, 0xd84838, 0.35, 0.24, 0.02));
    for (var i = 0; i < 3; i++) g.add(sp(0.06, 0xffffff, -0.2 + i * 0.18, 0.06, 0.3, 5));
    g.userData.animate = aBob(hen, 0.15, 0.03, 4);
    return g;
  };
  BUILDERS.sheep_farm = function () {
    var g = G();
    g.add(bx(0.55, 0.34, 0.36, 0xf2ede2, 0, 0.4, 0));
    g.add(bx(0.2, 0.2, 0.2, 0x2e2a26, 0.33, 0.48, 0));
    [-0.18, 0.18].forEach(function (x) { [-0.12, 0.12].forEach(function (z) { g.add(bx(0.08, 0.22, 0.08, 0x2e2a26, x, 0.12, z)); }); });
    g.add(sp(0.1, 0xf2ede2, 0.3, 0.6, 0.08, 5));
    g.add(sp(0.1, 0xf2ede2, 0.3, 0.6, -0.08, 5));
    g.userData.animate = aSway(g, 0.06, 3.2);
    return g;
  };
  BUILDERS.scarecrow = function () {
    var g = G();
    g.add(bx(0.1, 1.1, 0.1, 0x8a5a2b, 0, 0.55, 0));
    var arms = bx(0.7, 0.09, 0.09, 0x8a5a2b, 0, 0.85, 0); g.add(arms);
    g.add(bx(0.35, 0.5, 0.3, 0xc79a5b, 0, 0.6, 0));
    g.add(sp(0.18, 0xdfc89a, 0, 1.05, 0, 6));
    g.add(cn(0.22, 0.14, 0xe6c85a, 0, 1.2, 0, 6));
    g.add(bx(0.25, 0.35, 0.28, 0x6a4a2a, -0.2, 0.25, 0));
    g.add(bx(0.25, 0.35, 0.28, 0x6a4a2a, 0.2, 0.25, 0));
    for (var i = 0; i < 3; i++) { var straw = bx(0.03, 0.2, 0.03, 0xe6c85a, -0.35 + i * 0.35, 0.86, 0); straw.rotation.z = 0.3; g.add(straw); }
    g.userData.animate = aSway(arms, 0.1, 2.0);
    return g;
  };
  BUILDERS.windmill_small = function () {
    var g = G();
    g.add(cn(0.32, 1.0, 0xe8dcc0, 0, 0.5, 0, 8));
    g.add(cy(0.14, 0.14, 0.2, 0xb23225, 0, 1.05, 0, 8));
    var blades = G();
    for (var i = 0; i < 4; i++) { var bl = bx(0.08, 0.55, 0.03, 0x8a5a2b, 0, 0.28, 0); bl.rotation.z = i * Math.PI / 2; blades.add(bl); }
    blades.position.set(0, 1.05, 0.16);
    g.add(blades);
    g.userData.animate = aSpinZ(blades, 2.2);
    return g;
  };
  BUILDERS.barn = function () {
    var g = G();
    g.add(bx(1.0, 0.8, 0.7, 0xb23225, 0, 0.4, 0));
    var roof = cn(0.75, 0.5, 0xd8451f, 0, 1.05, 0, 4); roof.rotation.y = Math.PI / 4; g.add(roof);
    g.add(bx(0.4, 0.5, 0.03, 0xe8dcc0, 0, 0.28, 0.36));
    g.add(bx(0.15, 0.15, 0.03, 0xffe45a, 0, 0.65, 0.36));
    g.add(bx(0.2, 0.2, 0.03, 0xffffff, -0.35, 0.5, 0.36));
    g.add(bx(0.2, 0.2, 0.03, 0xffffff, 0.35, 0.5, 0.36));
    var vane = flagPole(0x6b3a1c, 0xd8451f, 0.3); vane.position.set(0, 1.3, 0); g.add(vane);
    g.userData.animate = aSpin(vane, 0.6);
    return g;
  };
  BUILDERS.tractor = function () {
    var g = G();
    g.add(bx(0.55, 0.34, 0.5, 0xb23225, 0, 0.35, 0));
    g.add(bx(0.36, 0.36, 0.42, 0xd8451f, 0.35, 0.44, 0));
    g.add(bx(0.2, 0.16, 0.36, 0x9fd4ff, 0.35, 0.62, 0));
    var wf = cy(0.14, 0.14, 0.12, 0x2b241f, -0.28, 0.16, 0.28, 10); wf.rotation.z = Math.PI / 2; g.add(wf);
    var wf2 = cy(0.14, 0.14, 0.12, 0x2b241f, -0.28, 0.16, -0.28, 10); wf2.rotation.z = Math.PI / 2; g.add(wf2);
    var wb = cy(0.26, 0.26, 0.14, 0x2b241f, 0.15, 0.28, 0.32, 10); wb.rotation.z = Math.PI / 2; g.add(wb);
    var wb2 = cy(0.26, 0.26, 0.14, 0x2b241f, 0.15, 0.28, -0.32, 10); wb2.rotation.z = Math.PI / 2; g.add(wb2);
    g.add(cy(0.03, 0.03, 0.5, 0x6b6f78, -0.1, 0.75, 0));
    g.userData.animate = combine(aSpin(wb, -3), aSpin(wb2, -3), aSpin(wf, -3), aSpin(wf2, -3));
    return g;
  };
  BUILDERS.vineyard = function () {
    var g = G();
    for (var r = 0; r < 3; r++) {
      var post1 = bx(0.05, 0.5, 0.05, 0x6b4423, -0.9, 0.25, -0.5 + r * 0.5);
      var post2 = bx(0.05, 0.5, 0.05, 0x6b4423, 0.9, 0.25, -0.5 + r * 0.5);
      g.add(post1); g.add(post2);
      g.add(bx(1.9, 0.03, 0.03, 0x6b4423, 0, 0.5, -0.5 + r * 0.5));
      for (var i = 0; i < 5; i++) {
        g.add(sp(0.12, 0x3f8b3f, -0.8 + i * 0.4, 0.35, -0.5 + r * 0.5, 5));
      }
    }
    var grapes = G();
    for (var k = 0; k < 8; k++) { var a = k * TAU / 8; grapes.add(sp(0.045, 0x7a3fa0, Math.cos(a) * 0.09, 0.2 + Math.sin(a) * 0.09, 0, 5)); }
    grapes.position.set(0, 0.15, 0);
    g.add(grapes);
    g.add(bx(2.0, 0.06, 1.7, 0x8a5a2b, 0, 0.0, 0));
    g.userData.animate = combine(aSway(g.children[2], 0.05, 1.5), aPulse(grapes, 1, 0.06, 2.4));
    return g;
  };
  BUILDERS.grand_windmill = function () {
    var g = G();
    g.add(cy(0.75, 1.3, 2.6, 0xe8dcc0, 0, 1.3, 0, 10));
    g.add(cy(0.5, 0.75, 0.5, 0xd8b25a, 0, 2.85, 0, 10));
    var cap = cn(0.55, 0.6, 0xb23225, 0, 3.4, 0, 8); g.add(cap);
    var blades = G();
    for (var i = 0; i < 4; i++) {
      var arm = bx(0.14, 1.5, 0.04, 0x6b4423, 0, 0.75, 0);
      arm.rotation.z = i * Math.PI / 2;
      blades.add(arm);
      var slat = bx(0.1, 1.2, 0.02, 0xd8cfc0, 0, 1.15, 0.06);
      slat.rotation.z = i * Math.PI / 2;
      blades.add(slat);
    }
    blades.position.set(0, 2.7, 0.5);
    g.add(blades);
    for (var d = 0; d < 3; d++) g.add(bx(0.3, 0.4, 0.3, 0x8a5a2b, -0.6 + d * 0.6, 0.2, 0.75));
    var wheatBase = G();
    for (var w = 0; w < 10; w++) { var a2 = w * TAU / 10; wheatBase.add(cn(0.05, 0.4, 0xe6c85a, Math.cos(a2) * 1.1, 0.2, Math.sin(a2) * 1.1, 5)); }
    g.add(wheatBase);
    g.userData.animate = combine(aSpinZ(blades, 1.4), aSway(wheatBase, 0.08, 1.8));
    return g;
  };

  /* --------------------------- 4. VILLAGE --------------------------- */
  BUILDERS.bench_village = function () {
    var g = G();
    g.add(bx(0.7, 0.05, 0.28, 0x8a5a2b, 0, 0.3, 0));
    g.add(bx(0.7, 0.35, 0.05, 0x8a5a2b, 0, 0.5, -0.12));
    [-0.3, 0.3].forEach(function (x) { g.add(bx(0.06, 0.3, 0.06, 0x6b6f78, x, 0.15, 0.1)); g.add(bx(0.06, 0.3, 0.06, 0x6b6f78, x, 0.15, -0.1)); });
    g.add(bx(0.75, 0.06, 0.06, 0x7c828e, 0, 0.02, 0.12));
    var flower = oc(0.06, 0xff6a9e, 0, 0.36, 0.16);
    g.add(flower);
    g.userData.animate = aSway(flower, 0.3, 2);
    return g;
  };
  BUILDERS.streetlamp = function () {
    var g = G();
    g.add(cy(0.06, 0.08, 1.2, 0x2b2f38, 0, 0.6, 0, 8));
    g.add(sp(0.14, 0xffe45a, 0, 1.28, 0, 8));
    g.add(cn(0.2, 0.16, 0x2b2f38, 0, 1.42, 0, 8));
    for (var i = 0; i < 4; i++) g.add(bx(0.03, 0.14, 0.03, 0x2b2f38, 0, 1.2, 0));
    g.userData.animate = aPulse(g.children[1], 1, 0.12, 2.8);
    return g;
  };
  BUILDERS.flower_planter = function () {
    var g = G();
    g.add(cy(0.28, 0.22, 0.3, 0xc79a5b, 0, 0.15, 0, 8));
    var cols = [0xff6a9e, 0xffd54a, 0xc98bff, 0xff8a5c];
    var petals = G();
    for (var i = 0; i < 6; i++) { var a = i * TAU / 6; petals.add(oc(0.08, cols[i % 4], Math.cos(a) * 0.16, 0.4 + rr(i) * 0.1, Math.sin(a) * 0.16)); }
    g.add(petals);
    g.userData.animate = aSway(petals, 0.1, 1.7);
    return g;
  };
  BUILDERS.well_village = function () {
    var g = G();
    g.add(cy(0.4, 0.4, 0.4, 0x9aa0ac, 0, 0.2, 0, 10));
    g.add(cy(0.32, 0.32, 0.06, 0x2a8fd4, 0, 0.42, 0, 10));
    [-0.3, 0.3].forEach(function (x) { g.add(bx(0.07, 0.7, 0.07, 0x6b3a1c, x, 0.75, 0)); });
    g.add(bx(0.75, 0.1, 0.3, 0xb23225, 0, 1.15, 0));
    var bucket = cy(0.08, 0.1, 0.14, 0x8a8f9a, 0, 0.65, 0, 8);
    g.add(bucket);
    var rope = bx(0.01, 0.5, 0.01, 0x6b3a1c, 0, 0.9, 0); g.add(rope);
    g.userData.animate = aBob(bucket, 0.65, 0.08, 2.2);
    return g;
  };
  BUILDERS.bookstall = function () {
    var g = G();
    g.add(bx(0.8, 0.05, 0.4, 0x8a5a2b, 0, 0.55, 0));
    [-0.35, 0.35].forEach(function (x) { g.add(bx(0.06, 1.1, 0.06, 0x6b3a1c, x, 0.55, 0)); });
    var roof = bx(0.95, 0.06, 0.5, 0xd8451f, 0, 1.15, 0); roof.rotation.z = 0.08; g.add(roof);
    var cols = [0xd84838, 0x2a8fd4, 0x3fa04c, 0xffd54a];
    for (var i = 0; i < 5; i++) g.add(bx(0.1, 0.16, 0.2, cols[i % 4], -0.32 + i * 0.16, 0.62, 0));
    var openBook = bx(0.2, 0.02, 0.14, 0xf5f2e8, 0, 0.6, 0.12); openBook.rotation.x = -0.2; g.add(openBook);
    g.userData.animate = aSway(roof, 0.02, 1.1);
    return g;
  };
  BUILDERS.clocktower_small = function () {
    var g = G();
    g.add(bx(0.5, 1.6, 0.5, 0xb4bac4, 0, 0.8, 0));
    g.add(cy(0.36, 0.36, 0.4, 0x9aa0ac, 0, 1.8, 0, 8));
    var roof = cn(0.4, 0.5, 0xb23225, 0, 2.25, 0, 4); roof.rotation.y = Math.PI / 4; g.add(roof);
    var face = cy(0.24, 0.24, 0.04, 0xffffff, 0, 1.4, 0.26, 12); face.rotation.x = Math.PI / 2; g.add(face);
    var hand = bx(0.03, 0.16, 0.02, 0x2b2f38, 0, 1.4, 0.29); g.add(hand);
    g.add(oc(0.05, 0xffd54a, 0, 2.5, 0));
    g.userData.animate = aSpinZ(hand, 0.5);
    return g;
  };
  BUILDERS.library_torah = function () {
    var g = G();
    g.add(bx(1.0, 1.1, 0.8, 0xe8dcc0, 0, 0.55, 0));
    var roof = cn(0.85, 0.5, 0xc79a5b, 0, 1.35, 0, 4); roof.rotation.y = Math.PI / 4; g.add(roof);
    g.add(bx(0.4, 0.6, 0.05, 0x6b3a1c, 0, 0.3, 0.41));
    var doorGold = bx(0.42, 0.62, 0.02, 0xd8b25a, 0, 0.31, 0.43); g.add(doorGold);
    [-0.32, 0.32].forEach(function (x) { g.add(bx(0.2, 0.3, 0.03, 0x9fd4ff, x, 0.65, 0.41)); });
    var pillars = G();
    for (var i = 0; i < 4; i++) pillars.add(cy(0.06, 0.06, 1.0, 0xffffff, -0.42 + i * 0.28, 0.5, 0.42, 8));
    g.add(pillars);
    var scroll = cy(0.06, 0.06, 0.4, 0xd8b25a, 0, 1.5, 0, 8); scroll.rotation.z = Math.PI / 2; g.add(scroll);
    g.userData.animate = aPulse(scroll, 1, 0.05, 2);
    return g;
  };
  BUILDERS.synagogue = function () {
    var g = G();
    g.add(bx(1.2, 1.0, 1.0, 0xe8dcc0, 0, 0.5, 0));
    var domeBase = cy(0.62, 0.62, 0.2, 0xc79a5b, 0, 1.1, 0, 10); g.add(domeBase);
    var dome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 6, 0, TAU, 0, Math.PI / 2), mat(0xd8b25a));
    place(dome, 0, 1.2, 0);
    g.add(dome);
    var star = G();
    for (var i = 0; i < 2; i++) {
      var tri = new THREE.Mesh(new THREE.TetrahedronGeometry(0.11, 0), mat(0xffd54a));
      tri.rotation.y = i * Math.PI / 6;
      tri.rotation.x = Math.PI / 2;
      tri.scale.set(1, 0.25, 1);
      star.add(tri);
    }
    star.position.set(0, 1.85, 0);
    g.add(star);
    g.add(bx(0.42, 0.65, 0.05, 0x6b3a1c, 0, 0.32, 0.51));
    [-0.35, 0.35].forEach(function (x) { g.add(cy(0.09, 0.09, 1.0, 0xffffff, x, 0.5, 0.5, 8)); });
    [-0.36, 0.36].forEach(function (x) { g.add(bx(0.24, 0.5, 0.03, 0x9fd4ff, x, 0.65, 0.51)); });
    g.userData.animate = aPulse(star, 1, 0.08, 1.6);
    return g;
  };
  BUILDERS.water_tower = function () {
    var g = G();
    for (var i = 0; i < 4; i++) { var a = i * TAU / 4; var leg = bx(0.09, 1.8, 0.09, 0x8a8f9a, Math.cos(a) * 0.4, 0.9, Math.sin(a) * 0.4); leg.rotation.x = Math.sin(a) * 0.08; leg.rotation.z = Math.cos(a) * 0.08; g.add(leg); }
    for (var k = 0; k < 3; k++) g.add(bx(1.0, 0.05, 1.0, 0x6b6f78, 0, 0.6 + k * 0.5, 0));
    var tank = cy(0.65, 0.65, 1.0, 0x9fc2d8, 0, 2.3, 0, 12); g.add(tank);
    g.add(cy(0.68, 0.68, 0.1, 0x7c828e, 0, 1.8, 0, 12));
    var domeTop = new THREE.Mesh(new THREE.SphereGeometry(0.66, 12, 6, 0, TAU, 0, Math.PI / 2), mat(0xbcd8e8));
    place(domeTop, 0, 2.8, 0);
    g.add(domeTop);
    var flag = flagPole(0x6b6f78, 0x3a8fd4, 0.4); flag.position.set(0, 3.15, 0); g.add(flag);
    var drip = sp(0.04, 0x6fd0ff, 0, 1.6, 0.65, 5); g.add(drip);
    g.userData.animate = combine(aSpin(flag.userData.flagMesh, 0.4), aBob(drip, 1.6, 0.25, 1.6));
    return g;
  };
  BUILDERS.lookout_tower = function () {
    var g = G();
    g.add(cy(0.55, 0.9, 3.0, 0xb4bac4, 0, 1.5, 0, 10));
    g.add(cy(0.62, 0.62, 0.2, 0x9aa0ac, 0, 3.0, 0, 10));
    var cabin = bx(0.9, 0.7, 0.9, 0xc79a5b, 0, 3.45, 0); g.add(cabin);
    [-0.3, 0.3].forEach(function (x) { g.add(bx(0.2, 0.3, 0.03, 0x9fd4ff, x, 3.5, 0.46)); });
    var roof = cn(0.65, 0.55, 0xb23225, 0, 4.1, 0, 4); roof.rotation.y = Math.PI / 4; g.add(roof);
    var flagT = flagPole(0x6b3a1c, 0xffd54a, 0.5); flagT.position.set(0, 4.4, 0); g.add(flagT);
    for (var i = 0; i < 3; i++) g.add(bx(1.3, 0.06, 0.06, 0x7c828e, 0, 0.8 + i * 0.9, 0));
    var beam = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 8), matU(0xfff2b0));
    beam.material.transparent = true; beam.material.opacity = 0.25;
    beam.rotation.z = Math.PI / 2;
    place(beam, 0.9, 3.5, 0);
    g.add(beam);
    g.userData.animate = combine(aSpin(beam, 1.2), aSway(flagT.userData.flagMesh, 0.3, 3));
    return g;
  };

  /* --------------------------- 5. MOUNTAIN --------------------------- */
  BUILDERS.snowman = function () {
    var g = G();
    g.add(sp(0.28, 0xffffff, 0, 0.28, 0, 7));
    g.add(sp(0.2, 0xf5f8ff, 0, 0.62, 0, 7));
    var head = sp(0.14, 0xffffff, 0, 0.9, 0, 6); g.add(head);
    g.add(cn(0.05, 0.2, 0xff8a3c, 0, 0.9, 0.12, 5));
    [-0.05, 0.05].forEach(function (x) { g.add(sp(0.02, 0x2b2f38, x, 0.94, 0.13, 4)); });
    g.add(cy(0.16, 0.16, 0.08, 0x2b2f38, 0, 1.1, 0, 10));
    g.add(cy(0.13, 0.13, 0.16, 0x2b2f38, 0, 1.2, 0, 10));
    [-0.28, 0.28].forEach(function (x) { var arm = bx(0.05, 0.35, 0.05, 0x6b4423, x, 0.6, 0); arm.rotation.z = x > 0 ? -0.5 : 0.5; g.add(arm); });
    g.add(bx(0.5, 0.06, 0.06, 0xd8451f, 0, 0.68, 0));
    g.userData.animate = aBob(head, 0.9, 0.03, 2);
    return g;
  };
  BUILDERS.icicle = function () {
    var g = G();
    for (var i = 0; i < 4; i++) {
      var c = cn(0.06 - i * 0.005, 0.3 + rr(i) * 0.2, 0x9fc2d8, -0.2 + i * 0.14, 0.15, 0, 6);
      c.rotation.x = Math.PI;
      g.add(c);
    }
    g.add(bx(0.6, 0.05, 0.2, 0xe8eef2, 0, 0.32, 0));
    g.userData.animate = aPulse(g, 1, 0.02, 3);
    return g;
  };
  BUILDERS.snow_pile = function () {
    var g = G();
    g.add(sp(0.35, 0xffffff, 0, 0.2, 0, 7));
    g.add(sp(0.22, 0xf5f8ff, 0.2, 0.35, 0.1, 6));
    for (var i = 0; i < 3; i++) g.add(oc(0.05, 0x9fc2d8, (rr(i) - 0.5) * 0.5, 0.4, (rr(i + 3) - 0.5) * 0.5));
    g.userData.animate = aPulse(g.children[2], 1, 0.2, 2.5);
    return g;
  };
  BUILDERS.pine_snow = function () {
    var g = G();
    g.add(bx(0.16, 0.4, 0.16, 0x6b4423, 0, 0.2, 0));
    g.add(cn(0.5, 0.6, 0x2f6a30, 0, 0.7, 0, 8));
    g.add(cn(0.4, 0.55, 0x3f8b3f, 0, 1.1, 0, 8));
    var snowCap = cn(0.3, 0.5, 0xffffff, 0, 1.5, 0, 8); g.add(snowCap);
    for (var i = 0; i < 3; i++) g.add(sp(0.06, 0xffffff, (rr(i) - 0.5) * 0.4, 0.9 - i * 0.15, (rr(i + 6) - 0.5) * 0.4, 5));
    g.userData.animate = aSway(g, 0.015, 0.9);
    return g;
  };
  BUILDERS.ice_cabin = function () {
    var g = G();
    g.add(cy(0.5, 0.6, 0.6, 0xe8eef2, 0, 0.3, 0, 10));
    var dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6, 0, TAU, 0, Math.PI / 2), mat(0xdfeeff));
    place(dome, 0, 0.6, 0);
    g.add(dome);
    g.add(cy(0.18, 0.18, 0.4, 0x9fc2d8, 0, 0.2, 0.42, 8));
    var glow = sp(0.1, 0xffe45a, 0, 0.3, 0.55, 5); glow.material = matU(0xffe45a); g.add(glow);
    for (var i = 0; i < 3; i++) g.add(oc(0.06, 0xffffff, (rr(i) - 0.5) * 1.0, 0.05, (rr(i + 4) - 0.5) * 1.0));
    g.userData.animate = aPulse(glow, 1, 0.2, 2.4);
    return g;
  };
  BUILDERS.ski_lift = function () {
    var g = G();
    [-0.6, 0.6].forEach(function (x) { g.add(bx(0.1, 2.0, 0.1, 0x6b6f78, x, 1.0, 0)); });
    g.add(bx(1.4, 0.06, 0.06, 0x6b6f78, 0, 2.0, 0));
    var cable = tr(0.02, 0.01, 0x2b2f38, 0, 2.0, 0);
    cable.scale.set(30, 1, 1);
    g.add(cable);
    var chair = bx(0.3, 0.05, 0.3, 0xd8451f, 0, 1.3, 0); g.add(chair);
    var cableAttach = bx(0.02, 0.7, 0.02, 0x2b2f38, 0, 1.65, 0); g.add(cableAttach);
    for (var i = 0; i < 2; i++) g.add(sp(0.14, 0xf5e7ae, -0.06 + i * 0.12, 1.4, 0, 5));
    g.userData.animate = combine(aBob(chair, 1.3, 0.06, 1.6), aBob(cableAttach, 1.65, 0.06, 1.6));
    return g;
  };
  BUILDERS.ice_slide = function () {
    var g = G();
    g.add(bx(1.0, 1.6, 0.8, 0xe8eef2, -0.3, 0.8, 0));
    var ramp = bx(1.8, 0.12, 0.7, 0xdfeeff, 0.6, 0.9, 0);
    ramp.rotation.z = -0.4;
    g.add(ramp);
    [-0.32, 0.32].forEach(function (z) { var rail = bx(1.8, 0.02, 0.04, 0x9fc2d8, 0.6, 1.0, z); rail.rotation.z = -0.4; g.add(rail); });
    var sledder = oc(0.12, 0xff6a4a, 1.3, 0.5, 0);
    g.add(sledder);
    var flag = flagPole(0x8a8f9a, 0xff6a4a, 0.4); flag.position.set(-0.3, 1.6, 0); g.add(flag);
    g.userData.animate = combine(function (t) { var p = (t * 0.7) % 1.6; sledder.position.set(1.5 - p, 1.45 - p * 0.55, 0); }, aSway(flag.userData.flagMesh, 0.3, 3));
    return g;
  };
  BUILDERS.frozen_lake = function () {
    var g = G();
    g.add(cy(0.9, 0.9, 0.08, 0xbcd8e8, 0, 0.04, 0, 12));
    var shine = tr(0.5, 0.03, 0xffffff, 0, 0.09, 0);
    shine.rotation.x = Math.PI / 2;
    g.add(shine);
    for (var i = 0; i < 3; i++) g.add(sp(0.15, 0xffffff, (rr(i) - 0.5) * 1.2, 0.14, (rr(i + 3) - 0.5) * 1.2, 6));
    var skater = oc(0.1, 0xd8451f, 0, 0.15, 0.7);
    g.add(skater);
    g.userData.animate = combine(aSpin(shine, 0.6), function (t) { var a = t * 0.9; skater.position.set(Math.cos(a) * 0.6, 0.14, Math.sin(a) * 0.6); });
    return g;
  };
  BUILDERS.ice_castle = function () {
    var g = G();
    g.add(bx(1.3, 1.4, 1.1, 0xdfeeff, 0, 0.7, 0));
    var towers = [];
    [[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.5], [0.6, 0.5]].forEach(function (p) {
      var t = cy(0.22, 0.22, 1.8, 0xe8eef2, p[0], 0.9, p[1], 8);
      g.add(t);
      var spire = cn(0.24, 0.5, 0x9fc2d8, p[0], 2.05, p[1], 8);
      g.add(spire);
      towers.push(spire);
    });
    var mainSpire = cn(0.4, 0.7, 0x6fa8cc, 0, 1.8, 0, 8); g.add(mainSpire);
    g.add(bx(0.4, 0.6, 0.05, 0x2a6fb0, 0, 0.35, 0.56));
    [-0.35, 0.35].forEach(function (x) { g.add(bx(0.16, 0.2, 0.03, 0x9fd4ff, x, 0.9, 0.56)); });
    var gem = oc(0.1, 0xbfe8ff, 0, 2.3, 0);
    gem.material = matU(0xbfe8ff);
    g.add(gem);
    g.userData.animate = combine(aPulse(gem, 1, 0.15, 2.2), aSpin(gem, 1.0));
    return g;
  };
  BUILDERS.frozen_dragon = function () {
    var g = G();
    var body = bx(1.3, 0.5, 0.5, 0x9fc2d8, 0, 0.5, 0); g.add(body);
    var neck = cy(0.16, 0.24, 0.6, 0x9fc2d8, 0.75, 0.75, 0, 8); neck.rotation.z = -0.5; g.add(neck);
    var head = bx(0.35, 0.3, 0.3, 0xbcd8e8, 1.15, 1.05, 0); g.add(head);
    g.add(cn(0.1, 0.25, 0xdfeeff, 1.3, 1.15, 0, 4));
    [-0.06, 0.06].forEach(function (z) { g.add(oc(0.04, 0xff6a4a, 1.28, 1.1, z)); });
    var tail = cy(0.05, 0.2, 1.0, 0x9fc2d8, -0.9, 0.4, 0, 6); tail.rotation.z = 1.3; g.add(tail);
    var wing1 = bx(0.1, 0.7, 0.5, 0xe8eef2, -0.1, 0.9, 0.35); wing1.rotation.x = 0.4; wing1.rotation.z = 0.3; g.add(wing1);
    var wing2 = bx(0.1, 0.7, 0.5, 0xe8eef2, -0.1, 0.9, -0.35); wing2.rotation.x = -0.4; wing2.rotation.z = 0.3; g.add(wing2);
    for (var i = 0; i < 4; i++) g.add(cy(0.15, 0.15, 0.5, 0x9fc2d8, -0.6 + i * 0.5, 0.2, 0.2 * (i % 2 ? 1 : -1), 8));
    var ice = oc(0.15, 0xffffff, 0, 1.4, 0); ice.material = matU(0xffffff); ice.material.transparent = true; ice.material.opacity = 0.6; g.add(ice);
    g.userData.animate = combine(aSway(wing1, 0.15, 1.6), aSway(wing2, -0.15, 1.6), aPulse(ice, 1, 0.1, 1.8));
    return g;
  };

  /* --------------------------- 6. DESERT --------------------------- */
  BUILDERS.cactus = function () {
    var g = G();
    g.add(cy(0.16, 0.2, 0.7, 0x4a9a5c, 0, 0.35, 0, 8));
    var arm1 = cy(0.1, 0.12, 0.4, 0x4a9a5c, 0.18, 0.55, 0, 8); arm1.rotation.z = -0.6; g.add(arm1);
    var arm2 = cy(0.1, 0.12, 0.35, 0x5aab6c, -0.16, 0.4, 0, 8); arm2.rotation.z = 0.7; g.add(arm2);
    var flower = oc(0.08, 0xff6a9e, 0, 0.72, 0); g.add(flower);
    for (var i = 0; i < 4; i++) g.add(bx(0.02, 0.05, 0.02, 0xe8dcc0, (rr(i) - 0.5) * 0.25, 0.3 + i * 0.1, 0.16));
    g.userData.animate = aPulse(flower, 1, 0.1, 2.2);
    return g;
  };
  BUILDERS.desert_flower = function () {
    var g = G();
    g.add(bx(0.05, 0.26, 0.05, 0x4a9a5c, 0, 0.13, 0));
    var petals = G();
    for (var i = 0; i < 6; i++) { var a = i * TAU / 6; petals.add(oc(0.08, 0xff9a4a, Math.cos(a) * 0.12, 0.28, Math.sin(a) * 0.12)); }
    petals.add(sp(0.06, 0xffd54a, 0, 0.28, 0, 5));
    g.add(petals);
    g.userData.animate = aSway(petals, 0.15, 1.5);
    return g;
  };
  BUILDERS.rock_pile_d = function () {
    var g = G();
    g.add(dd(0.22, 0xc79447, 0, 0.15, 0));
    g.add(dd(0.16, 0xd8a85a, 0.2, 0.1, 0.1));
    g.add(dd(0.12, 0xb8863a, -0.18, 0.08, -0.05));
    g.userData.animate = aSpin(g.children[0], 0.4);
    return g;
  };
  BUILDERS.golden_dune = function () {
    var g = G();
    var d1 = sp(0.5, 0xe0c07a, 0, 0.15, 0, 8); d1.scale.set(1, 0.35, 1); g.add(d1);
    var d2 = sp(0.35, 0xecd08a, 0.3, 0.1, 0.2, 7); d2.scale.set(1, 0.3, 1); g.add(d2);
    g.add(cn(0.03, 0.06, 0x4a9a5c, -0.2, 0.24, 0.1, 5));
    g.userData.animate = aSway(g.children[2], 0.2, 2);
    return g;
  };
  BUILDERS.camel_small = function () {
    var g = G();
    g.add(bx(0.5, 0.32, 0.24, 0xd2a05a, 0, 0.4, 0));
    g.add(oc(0.12, 0xd2a05a, 0, 0.58, 0));
    var neck = cy(0.08, 0.1, 0.4, 0xd2a05a, 0.28, 0.6, 0, 6); neck.rotation.z = -0.4; g.add(neck);
    g.add(bx(0.14, 0.16, 0.14, 0xdfb878, 0.46, 0.8, 0));
    [-0.14, 0.14].forEach(function (z) { g.add(bx(0.06, 0.4, 0.06, 0xc79050, -0.16, 0.2, z)); g.add(bx(0.06, 0.4, 0.06, 0xc79050, 0.16, 0.2, z)); });
    var blanket = bx(0.3, 0.05, 0.26, 0xd8451f, 0, 0.6, 0); g.add(blanket);
    g.userData.animate = aBob(g.children[3], 0.8, 0.03, 3);
    return g;
  };
  BUILDERS.oasis_palm = function () {
    var g = G();
    var trunk = cy(0.09, 0.15, 1.2, 0xb08050, 0, 0.6, 0, 8); trunk.rotation.z = 0.1; g.add(trunk);
    var leaves = G();
    for (var i = 0; i < 6; i++) { var l = bx(0.7, 0.06, 0.22, 0x4a9a5c, 0.32, 0, 0); l.rotation.y = i * TAU / 6; l.rotation.z = -0.32; leaves.add(l); }
    leaves.position.y = 1.25;
    g.add(leaves);
    var dates = G();
    for (var k = 0; k < 4; k++) dates.add(sp(0.05, 0xb8451f, 0.1 + k * 0.06, 1.05, 0.05, 5));
    g.add(dates);
    g.userData.animate = aSway(leaves, 0.08, 1.3);
    return g;
  };
  BUILDERS.tent_bedouin = function () {
    var g = G();
    var roof = bx(1.1, 0.05, 1.0, 0x8a5a3a, 0, 0.75, 0); roof.rotation.x = 0.15; g.add(roof);
    [-0.4, 0.4].forEach(function (x) { g.add(bx(0.06, 0.7, 0.06, 0x5a3a1e, x, 0.4, -0.4)); g.add(bx(0.06, 0.9, 0.06, 0x5a3a1e, x, 0.5, 0.35)); });
    g.add(bx(1.15, 0.35, 0.05, 0xc79a5b, 0, 0.28, -0.48));
    g.add(bx(0.4, 0.35, 0.05, 0xc79a5b, -0.35, 0.28, 0.48));
    var rugColors = [0xd8451f, 0xe6c85a, 0x2a8fd4];
    for (var i = 0; i < 3; i++) g.add(bx(0.2, 0.02, 0.4, rugColors[i], -0.1 + i * 0.2, 0.02, 0.1));
    var lantern = sp(0.07, 0xffe45a, 0.2, 0.6, 0.5, 5); g.add(lantern);
    g.userData.animate = aPulse(lantern, 1, 0.18, 2.6);
    return g;
  };
  BUILDERS.camel_caravan = function () {
    var g = G();
    for (var i = 0; i < 2; i++) {
      var off = i * 0.65;
      g.add(bx(0.45, 0.28, 0.22, 0xd2a05a, off, 0.36, 0));
      g.add(oc(0.1, 0xd2a05a, off, 0.52, 0));
      var neck = cy(0.07, 0.09, 0.34, 0xd2a05a, off + 0.24, 0.54, 0, 6); neck.rotation.z = -0.4; g.add(neck);
      g.add(bx(0.12, 0.1, 0.16, 0xd8451f, off, 0.53, 0));
    }
    var chest = bx(0.16, 0.14, 0.16, 0xc79447, 0.65, 0.66, 0); g.add(chest);
    var flag = flagPole(0x6b4423, 0xd8451f, 0.35); flag.position.set(-0.3, 0.66, 0); g.add(flag);
    g.userData.animate = combine(aBob(g.children[0], 0.36, 0.02, 2.5), aSway(flag.userData.flagMesh, 0.3, 3));
    return g;
  };
  BUILDERS.desert_watchtower = function () {
    var g = G();
    g.add(cy(0.5, 0.75, 2.4, 0xd8b25a, 0, 1.2, 0, 10));
    g.add(cy(0.6, 0.6, 0.2, 0xc79447, 0, 2.4, 0, 10));
    var cabin = bx(0.85, 0.6, 0.85, 0xe0c07a, 0, 2.8, 0); g.add(cabin);
    [-0.3, 0.3].forEach(function (x) { g.add(bx(0.16, 0.24, 0.03, 0x6b4423, x, 2.85, 0.44)); });
    var roofCone = cn(0.65, 0.55, 0xb8863a, 0, 3.4, 0, 4); roofCone.rotation.y = Math.PI / 4; g.add(roofCone);
    var flag = flagPole(0x6b4423, 0xd8451f, 0.5); flag.position.set(0, 3.7, 0); g.add(flag);
    for (var i = 0; i < 3; i++) g.add(bx(0.55, 0.05, 0.55, 0xc79447, 0, 0.05 + i * 0.15, 0));
    g.userData.animate = aSway(flag.userData.flagMesh, 0.35, 2.8);
    return g;
  };
  BUILDERS.grand_oasis = function () {
    var g = G();
    g.add(cy(1.1, 1.1, 0.1, 0x2a8fd4, 0, 0.05, 0, 14));
    var shine = tr(0.6, 0.03, 0xbfe8ff, 0, 0.11, 0); shine.rotation.x = Math.PI / 2; g.add(shine);
    var palmData = [[-0.9, 0.3], [0.9, 0.3], [-0.7, -0.7], [0.6, -0.8]];
    palmData.forEach(function (p, idx) {
      var trunk = cy(0.09, 0.14, 1.1, 0xb08050, p[0], 0.55, p[1], 7);
      g.add(trunk);
      var leaves = G();
      for (var i = 0; i < 5; i++) { var l = bx(0.6, 0.05, 0.2, 0x4a9a5c, 0.28, 0, 0); l.rotation.y = i * TAU / 5; l.rotation.z = -0.3; leaves.add(l); }
      leaves.position.set(p[0], 1.1, p[1]);
      g.add(leaves);
      leaves.userData.idx = idx;
    });
    g.add(bx(0.9, 0.3, 0.8, 0xc79a5b, 0.1, 0.15, 0.9));
    for (var i = 0; i < 3; i++) g.add(dd(0.15, 0xd8b25a, -0.3 + i * 0.3, 0.15, 1.0));
    g.userData.animate = function (t) {
      shine.rotation.z = t * 0.4;
      for (var i = 0; i < g.children.length; i++) { var c = g.children[i]; if (c.userData && c.userData.idx !== undefined) c.rotation.z = Math.sin(t * 1.4 + c.userData.idx) * 0.06; }
    };
    return g;
  };

  /* --------------------------- 7. VOLCANO --------------------------- */
  BUILDERS.ember_rock = function () {
    var g = G();
    var rock = dd(0.22, 0x4a4038, 0, 0.15, 0); g.add(rock);
    var glow = oc(0.09, 0xff8a3c, 0, 0.22, 0.14);
    glow.material = matU(0xff8a3c);
    g.add(glow);
    g.userData.animate = aFlicker(glow.material, 0.4, 0.3, 4);
    return g;
  };
  BUILDERS.obsidian_shard = function () {
    var g = G();
    for (var i = 0; i < 3; i++) {
      var shard = tet(0.16 + i * 0.03, 0x1a1612, (rr(i) - 0.5) * 0.3, 0.1 + i * 0.05, (rr(i + 3) - 0.5) * 0.3);
      shard.rotation.z = rr(i + 6) * 0.6;
      g.add(shard);
    }
    var shine = oc(0.04, 0xd8451f, 0, 0.28, 0.1);
    g.add(shine);
    g.userData.animate = aPulse(shine, 1, 0.3, 3);
    return g;
  };
  BUILDERS.lava_pool = function () {
    var g = G();
    g.add(cy(0.5, 0.5, 0.12, 0x2b241f, 0, 0.06, 0, 10));
    var lava = cy(0.4, 0.4, 0.06, 0xff4a2a, 0, 0.12, 0, 10);
    lava.material = matU(0xff4a2a);
    g.add(lava);
    var bubble = oc(0.06, 0xffb37a, 0.1, 0.18, 0.1);
    g.add(bubble);
    g.userData.animate = combine(aFlicker(lava.material, 0.6, 0.4, 5), aBob(bubble, 0.18, 0.08, 3));
    return g;
  };
  BUILDERS.ash_tree = function () {
    var g = G();
    g.add(cy(0.14, 0.2, 0.9, 0x2b241f, 0, 0.45, 0, 7));
    var branches = G();
    for (var i = 0; i < 3; i++) { var b = cy(0.04, 0.06, 0.4, 0x2b241f, 0, 0.2, 0, 5); b.rotation.z = (i - 1) * 0.7; b.position.y = 0.8 + i * 0.1; branches.add(b); }
    g.add(branches);
    var ember = oc(0.05, 0xff8a3c, 0, 1.0, 0);
    ember.material = matU(0xff8a3c);
    g.add(ember);
    for (var k = 0; k < 3; k++) g.add(oc(0.03, 0xffb37a, (rr(k) - 0.5) * 0.4, 1.1 + rr(k), (rr(k + 4) - 0.5) * 0.4));
    g.userData.animate = combine(aFlicker(ember.material, 0.5, 0.3, 3.5), aBob(g.children[2], 1.15, 0.15, 2));
    return g;
  };
  BUILDERS.fire_flower = function () {
    var g = G();
    g.add(bx(0.06, 0.3, 0.06, 0x2b241f, 0, 0.15, 0));
    var petals = G();
    for (var i = 0; i < 5; i++) { var a = i * TAU / 5; petals.add(oc(0.09, 0xff5a2a, Math.cos(a) * 0.13, 0.35, Math.sin(a) * 0.13)); }
    var core = sp(0.07, 0xffd54a, 0, 0.35, 0, 5);
    core.material = matU(0xffd54a);
    petals.add(core);
    g.add(petals);
    g.userData.animate = combine(aSway(petals, 0.1, 1.8), aFlicker(core.material, 0.5, 0.4, 4.5));
    return g;
  };
  BUILDERS.geyser = function () {
    var g = G();
    g.add(cy(0.35, 0.45, 0.3, 0x8a5a4a, 0, 0.15, 0, 10));
    g.add(cy(0.22, 0.25, 0.15, 0x6a3a2a, 0, 0.35, 0, 10));
    var spout = cy(0.06, 0.1, 0.6, 0xffd8b0, 0, 0.6, 0, 8);
    spout.material = matU(0xffd8b0);
    spout.material.transparent = true;
    g.add(spout);
    var mist = sp(0.25, 0xffffff, 0, 0.85, 0, 6);
    mist.material = matU(0xffffff); mist.material.transparent = true;
    g.add(mist);
    g.userData.animate = function (t) {
      var burst = 0.5 + Math.abs(Math.sin(t * 1.4)) * 0.5;
      spout.scale.y = burst;
      spout.material.opacity = 0.5 + burst * 0.4;
      mist.position.y = 0.6 + burst * 0.4;
      mist.material.opacity = 0.3 + burst * 0.3;
    };
    return g;
  };
  BUILDERS.lava_bridge = function () {
    var g = G();
    for (var i = 0; i < 4; i++) g.add(bx(0.4, 0.14, 0.6, 0x2b241f, -0.6 + i * 0.4, 0.35, 0));
    [-0.32, 0.32].forEach(function (z) { g.add(bx(2.0, 0.06, 0.08, 0x4a4038, 0, 0.44, z)); });
    var lava = bx(2.0, 0.04, 0.15, 0xff4a2a, 0, -0.02, 0);
    lava.material = matU(0xff4a2a);
    g.add(lava);
    for (var k = 0; k < 3; k++) { var bubble = oc(0.05, 0xffb37a, -0.6 + k * 0.6, 0.02, 0); g.add(bubble); }
    g.userData.animate = aFlicker(lava.material, 0.5, 0.35, 4);
    return g;
  };
  BUILDERS.fire_beacon = function () {
    var g = G();
    g.add(cy(0.3, 0.45, 1.6, 0x2b241f, 0, 0.8, 0, 10));
    g.add(cy(0.36, 0.36, 0.15, 0x4a4038, 0, 1.65, 0, 10));
    var bowl = cy(0.28, 0.2, 0.2, 0x4a4038, 0, 1.8, 0, 10); g.add(bowl);
    var flame = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 6), matU(0xff5a2a));
    place(flame, 0, 2.05, 0);
    g.add(flame);
    var flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 5), matU(0xffd54a));
    place(flame2, 0, 2.15, 0);
    g.add(flame2);
    g.userData.animate = combine(function (t) { flame.scale.y = 1 + Math.sin(t * 9) * 0.2; flame.rotation.y = t * 2; }, function (t) { flame2.scale.y = 1 + Math.sin(t * 11 + 1) * 0.25; }, aFlicker(flame.material, 0.6, 0.3, 6));
    return g;
  };
  BUILDERS.volcano_dragon = function () {
    var g = G();
    var body = bx(1.3, 0.55, 0.55, 0x8a2a1a, 0, 0.5, 0); g.add(body);
    var neck = cy(0.18, 0.26, 0.6, 0x8a2a1a, 0.75, 0.75, 0, 8); neck.rotation.z = -0.5; g.add(neck);
    var head = bx(0.36, 0.32, 0.32, 0xa8341f, 1.15, 1.05, 0); g.add(head);
    g.add(cn(0.1, 0.25, 0x2b241f, 1.3, 1.15, 0, 4));
    var eyeGlow1 = oc(0.045, 0xffd54a, 1.28, 1.1, 0.07); eyeGlow1.material = matU(0xffd54a); g.add(eyeGlow1);
    var eyeGlow2 = oc(0.045, 0xffd54a, 1.28, 1.1, -0.07); eyeGlow2.material = matU(0xffd54a); g.add(eyeGlow2);
    var tail = cy(0.06, 0.22, 1.0, 0x8a2a1a, -0.9, 0.4, 0, 6); tail.rotation.z = 1.3; g.add(tail);
    var wing1 = bx(0.1, 0.7, 0.5, 0x4a1a10, -0.1, 0.9, 0.35); wing1.rotation.x = 0.4; wing1.rotation.z = 0.3; g.add(wing1);
    var wing2 = bx(0.1, 0.7, 0.5, 0x4a1a10, -0.1, 0.9, -0.35); wing2.rotation.x = -0.4; wing2.rotation.z = 0.3; g.add(wing2);
    for (var i = 0; i < 4; i++) g.add(cn(0.08, 0.16, 0xffb37a, -0.6 + i * 0.5, 0.75, 0, 4));
    var flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 5), matU(0xff8a3c));
    flame.rotation.z = Math.PI / 2;
    place(flame, 1.55, 1.05, 0);
    g.add(flame);
    g.userData.animate = combine(aSway(wing1, 0.15, 1.7), aSway(wing2, -0.15, 1.7), aFlicker(eyeGlow1.material, 0.5, 0.3, 5), aFlicker(eyeGlow2.material, 0.5, 0.3, 5), function (t) { flame.scale.x = 1 + Math.sin(t * 10) * 0.4; });
    return g;
  };
  BUILDERS.erupting_peak = function () {
    var g = G();
    g.add(cy(1.3, 0.4, 2.2, 0x4a4038, 0, 1.1, 0, 12));
    g.add(cy(0.4, 0.6, 0.4, 0x2b241f, 0, 2.2, 0, 10));
    var lavaGlow = cy(0.3, 0.3, 0.1, 0xff4a2a, 0, 2.42, 0, 10);
    lavaGlow.material = matU(0xff4a2a);
    g.add(lavaGlow);
    var plume = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 8), matU(0x6a5a52));
    plume.material.transparent = true;
    place(plume, 0, 3.2, 0);
    g.add(plume);
    var lavaJet = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, 6), matU(0xff6a2a));
    place(lavaJet, 0, 2.8, 0);
    g.add(lavaJet);
    for (var i = 0; i < 4; i++) { var chunk = dd(0.08, 0xff8a3c, (rr(i) - 0.5) * 0.6, 3.0 + rr(i) * 0.5, (rr(i + 4) - 0.5) * 0.6); g.add(chunk); }
    for (var s = 0; s < 4; s++) { var a = s * TAU / 4; g.add(bx(0.2, 0.5, 1.6, 0x3a332e, Math.cos(a) * 0.8, 0.6, Math.sin(a) * 0.8)); }
    g.userData.animate = combine(aFlicker(lavaGlow.material, 0.6, 0.4, 5), function (t) { plume.scale.set(1 + Math.sin(t * 0.8) * 0.15, 1 + Math.sin(t * 0.6) * 0.2, 1 + Math.sin(t * 0.8) * 0.15); plume.material.opacity = 0.35 + Math.sin(t * 1.2) * 0.1; lavaJet.scale.y = 0.8 + Math.abs(Math.sin(t * 3)) * 0.6; });
    return g;
  };

  /* --------------------------- 8. SKY --------------------------- */
  BUILDERS.cloud_puff = function () {
    var g = G();
    g.add(sp(0.24, 0xffffff, 0, 0, 0, 7));
    g.add(sp(0.17, 0xffffff, 0.22, 0.05, 0.05, 6));
    g.add(sp(0.17, 0xffffff, -0.2, 0.03, -0.05, 6));
    g.add(sp(0.13, 0xf5f2ff, 0, 0.16, 0, 5));
    g.userData.animate = aBob(g, 0, 0.08, 1.1);
    return g;
  };
  BUILDERS.star_small = function () {
    var g = G();
    var star = oc(0.16, 0xffd54a, 0, 0.3, 0);
    star.material = matU(0xffd54a);
    g.add(star);
    for (var i = 0; i < 2; i++) {
      var sparkle = bx(0.34, 0.025, 0.025, 0xffe8a0, 0, 0.3, 0);
      sparkle.rotation.y = i * Math.PI / 2;
      g.add(sparkle);
    }
    g.userData.animate = combine(aSpin(star, 1.2), aFlicker(star.material, 0.5, 0.3, 3));
    return g;
  };
  BUILDERS.rainbow_arch = function () {
    var g = G();
    var cols = [0xff4a4a, 0xff9a3c, 0xffe45a, 0x4aa85c, 0x3a8fd4, 0x8a5ad8];
    var arcs = [];
    for (var i = 0; i < 6; i++) {
      var arc = new THREE.Mesh(new THREE.TorusGeometry(0.5 + i * 0.07, 0.035, 6, 12, Math.PI), mat(cols[i]));
      arc.rotation.z = Math.PI;
      place(arc, 0, 0, 0);
      g.add(arc);
      arcs.push(arc);
    }
    g.userData.animate = function (t) { for (var i = 0; i < arcs.length; i++) arcs[i].position.y = Math.sin(t * 1.2 + i * 0.2) * 0.05; };
    return g;
  };
  BUILDERS.floating_lantern = function () {
    var g = G();
    var body = cy(0.16, 0.2, 0.28, 0xffd8a0, 0, 0.4, 0, 8);
    body.material = matU(0xffd8a0);
    g.add(body);
    g.add(cy(0.05, 0.16, 0.06, 0xc79447, 0, 0.28, 0, 8));
    g.add(cy(0.16, 0.05, 0.06, 0xc79447, 0, 0.52, 0, 8));
    var glow = sp(0.1, 0xffe45a, 0, 0.4, 0, 5); glow.material = matU(0xffe45a); g.add(glow);
    g.userData.animate = combine(aBob(g, 0.4, 0.1, 1.0), aFlicker(body.material, 0.5, 0.3, 3), aPulse(glow, 1, 0.15, 2.5));
    return g;
  };
  BUILDERS.wind_chime = function () {
    var g = G();
    g.add(bx(0.4, 0.04, 0.04, 0x8a5a2b, 0, 0.5, 0));
    var tubes = G();
    var cols = [0xffd54a, 0xff8a5c, 0x3a8fd4, 0xc98bff, 0x4aa85c];
    for (var i = 0; i < 5; i++) tubes.add(cy(0.025, 0.025, 0.3, cols[i], -0.16 + i * 0.08, 0.32, 0, 6));
    g.add(tubes);
    g.userData.animate = aSway(tubes, 0.12, 2.4);
    return g;
  };
  BUILDERS.floating_platform = function () {
    var g = G();
    g.add(cy(0.5, 0.6, 0.2, 0xc9b8ff, 0, 0.1, 0, 10));
    g.add(cy(0.42, 0.42, 0.15, 0x7fae5a, 0, 0.24, 0, 10));
    g.add(sp(0.14, 0x3f8b3f, -0.15, 0.4, 0.1, 6));
    g.add(cn(0.1, 0.2, 0x54ad54, 0.15, 0.42, -0.1, 5));
    var cloudBits = G();
    for (var i = 0; i < 3; i++) { var a = i * TAU / 3; cloudBits.add(sp(0.13, 0xffffff, Math.cos(a) * 0.5, -0.05, Math.sin(a) * 0.5, 5)); }
    g.add(cloudBits);
    g.userData.animate = combine(aBob(g, 0, 0.1, 0.9), aSpin(cloudBits, 0.3));
    return g;
  };
  BUILDERS.hot_air_balloon = function () {
    var g = G();
    var balloon = sp(0.5, 0xff6a4a, 0, 1.3, 0, 8);
    g.add(balloon);
    var stripe1 = sp(0.51, 0xffd54a, 0, 1.3, 0, 8); stripe1.scale.set(0.3, 1, 1); g.add(stripe1);
    var stripe2 = sp(0.51, 0xffffff, 0, 1.3, 0, 8); stripe2.scale.set(0.15, 1, 0.3); g.add(stripe2);
    g.add(bx(0.32, 0.28, 0.32, 0xc79a5b, 0, 0.55, 0));
    for (var i = 0; i < 4; i++) { var a = i * TAU / 4; g.add(bx(0.015, 0.5, 0.015, 0x6b3a1c, Math.cos(a) * 0.14, 0.85, Math.sin(a) * 0.14)); }
    var flame = sp(0.06, 0xffd54a, 0, 0.72, 0, 5); flame.material = matU(0xffd54a); g.add(flame);
    g.userData.animate = combine(aBob(g, 0, 0.15, 0.7), aFlicker(flame.material, 0.5, 0.3, 5));
    return g;
  };
  BUILDERS.sky_windmill = function () {
    var g = G();
    g.add(cy(0.4, 0.6, 1.3, 0xffffff, 0, 0.65, 0, 10));
    g.add(cy(0.3, 0.3, 0.3, 0xc9b8ff, 0, 1.45, 0, 10));
    var blades = G();
    for (var i = 0; i < 4; i++) { var bl = bx(0.06, 0.5, 0.03, 0xffd54a, 0, 0.26, 0); bl.rotation.z = i * Math.PI / 2; blades.add(bl); }
    blades.position.set(0, 1.45, 0.16);
    g.add(blades);
    var cloudBase = G();
    for (var i2 = 0; i2 < 3; i2++) cloudBase.add(sp(0.25, 0xffffff, (i2 - 1) * 0.35, 0.05, 0, 6));
    g.add(cloudBase);
    g.userData.animate = combine(aSpinZ(blades, 2.0), aBob(g, 0, 0.08, 0.8));
    return g;
  };
  BUILDERS.sky_castle = function () {
    var g = G();
    g.add(bx(1.2, 1.3, 1.0, 0xffffff, 0, 0.65, 0));
    [[-0.55, -0.45], [0.55, -0.45], [-0.55, 0.45], [0.55, 0.45]].forEach(function (p) {
      g.add(cy(0.2, 0.2, 1.6, 0xf5f2ff, p[0], 0.8, p[1], 8));
      g.add(cn(0.24, 0.4, 0xc9b8ff, p[0], 1.8, p[1], 8));
    });
    g.add(cn(0.4, 0.6, 0x9a8fd8, 0, 1.6, 0, 8));
    g.add(bx(0.4, 0.5, 0.05, 0xc9b8ff, 0, 0.35, 0.51));
    var gem = oc(0.1, 0xffd54a, 0, 2.1, 0); gem.material = matU(0xffd54a); g.add(gem);
    var cloudBase = G();
    for (var i = 0; i < 4; i++) { var a = i * TAU / 4; cloudBase.add(sp(0.3, 0xffffff, Math.cos(a) * 0.7, -0.1, Math.sin(a) * 0.7, 6)); }
    g.add(cloudBase);
    g.userData.animate = combine(aPulse(gem, 1, 0.15, 2), aSpin(gem, 0.8), aBob(g, 0, 0.06, 0.7));
    return g;
  };
  BUILDERS.star_observatory = function () {
    var g = G();
    g.add(cy(0.6, 0.8, 1.6, 0xe8eef2, 0, 0.8, 0, 12));
    g.add(cy(0.66, 0.66, 0.15, 0xc9b8ff, 0, 1.6, 0, 12));
    var domeBase = cy(0.6, 0.6, 0.3, 0xffffff, 0, 1.75, 0, 12); g.add(domeBase);
    var dome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 6, 0, TAU, 0, Math.PI / 2), mat(0xdfe8ff));
    place(dome, 0, 1.9, 0);
    g.add(dome);
    var slit = bx(0.2, 0.6, 0.05, 0x2b2f38, 0, 2.0, 0.55); g.add(slit);
    var telescope = cy(0.08, 0.12, 0.7, 0x6b6f78, 0, 2.3, 0.2, 8); telescope.rotation.x = -0.6; g.add(telescope);
    var stars = G();
    for (var i = 0; i < 6; i++) { var a = i * TAU / 6; stars.add(oc(0.05, 0xffd54a, Math.cos(a) * 1.1, 2.4 + Math.sin(a * 2) * 0.3, Math.sin(a) * 1.1)); }
    g.add(stars);
    for (var k = 0; k < 4; k++) g.add(bx(0.12, 0.4, 0.12, 0xc9b8ff, -0.4 + k * 0.27, 0.1, 0.75));
    g.userData.animate = combine(aSpin(domeBase, 0.5), aOrbit(stars.children[0], 1.1, 2.4, 0.6), aPulse(stars, 1, 0.1, 2.5));
    return g;
  };

  /* =====================================================================
   * 6. חשיפה גלובלית
   * ===================================================================== */
  window.IslandContent = { REGIONS: REGIONS, BUILDERS: BUILDERS };
})();
