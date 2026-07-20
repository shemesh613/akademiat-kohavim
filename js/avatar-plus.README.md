# avatar-plus — פאץ' אינטגרציה ל-index.html

הקבצים `js/avatar-plus.js` ו-`css/shop-plus.css` **לא נוגעים ב-index.html**.
כדי לחבר אותם צריך המתאם להוסיף/לשנות **בדיוק** את השורות הבאות. כל שינוי הוא
תוספת קטנה (1-2 שורות) — שום פונקציה קיימת לא נכתבת מחדש. אם לא מבצעים את
הפאץ' בכלל — שני הקבצים פשוט לא עושים כלום (בטוח, בלי שגיאות).

סדר מומלץ לביצוע: 1 → 2 → 3 → 4 → 5 → 6.

---

## 1. טעינת הקבצים ב-`<head>`

מצא (שורות ~9-10):

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
```

הוסף מיד אחריהן:

```html
<script src="js/avatar-plus.js"></script>
```

ומיד לפני `</head>` (בסוף ה-head, אחרי ה-`<style>` הפנימי — כדי שה-override ינצח
במפרט זהה) הוסף:

```html
<link rel="stylesheet" href="css/shop-plus.css">
```

---

## 2. `build3DCharacter` — חתימת הפונקציה + hook לתאורה

מצא:

```js
function build3DCharacter(scene, equipped) {
```

החלף ב:

```js
function build3DCharacter(scene, equipped, avT) {
```

מצא (בתוך אותה פונקציה, אחרי הגדרת האורות הקיימת):

```js
  const top = new THREE.PointLight(0xffe600, 0.4);
  top.position.set(0, 6, 1);
  scene.add(top);

  const charGroup = new THREE.Group();
  scene.add(charGroup);
```

החלף ב:

```js
  const top = new THREE.PointLight(0xffe600, 0.4);
  top.position.set(0, 6, 1);
  scene.add(top);

  if (window.AvatarPlus && typeof window.AvatarPlus.lights === 'function') {
    try { window.AvatarPlus.lights(scene); } catch (e) { console.warn('AvatarPlus.lights failed', e); }
  }

  const charGroup = new THREE.Group();
  scene.add(charGroup);
```

---

## 3. שני נקודות ה-`return charGroup;` — hook ל-enhance + idle

### 3א. נתיב GLB (דמות מיובאת)

מצא:

```js
      // aura
      const aura = findItem(equipped.aura);
      if (aura && aura.id !== 'aura-none') buildAura(scene, charGroup, aura);
      return charGroup;
    }
    // fallback to procedural if model not yet loaded
  }
```

החלף ב:

```js
      // aura
      const aura = findItem(equipped.aura);
      if (aura && aura.id !== 'aura-none') buildAura(scene, charGroup, aura);
      if (window.AvatarPlus) {
        try {
          if (typeof window.AvatarPlus.enhance === 'function') window.AvatarPlus.enhance(charGroup, equipped);
          if (typeof window.AvatarPlus.idle === 'function') window.AvatarPlus.idle(charGroup, (typeof avT === 'number') ? avT : performance.now());
        } catch (e) { console.warn('AvatarPlus hook failed', e); }
      }
      return charGroup;
    }
    // fallback to procedural if model not yet loaded
  }
```

### 3ב. נתיב פרוצדורלי (הדמות הרגילה — כאן קורה רוב הקסם)

מצא (בסוף הפונקציה):

```js
  // === AURA ===
  const aura = findItem(equipped.aura);
  if (aura && aura.id !== 'aura-none') {
    buildAura(scene, charGroup, aura);
  }

  return charGroup;
}
```

החלף ב:

```js
  // === AURA ===
  const aura = findItem(equipped.aura);
  if (aura && aura.id !== 'aura-none') {
    buildAura(scene, charGroup, aura);
  }

  if (window.AvatarPlus) {
    try {
      if (typeof window.AvatarPlus.enhance === 'function') window.AvatarPlus.enhance(charGroup, equipped);
      if (typeof window.AvatarPlus.idle === 'function') window.AvatarPlus.idle(charGroup, (typeof avT === 'number') ? avT : performance.now());
    } catch (e) { console.warn('AvatarPlus hook failed', e); }
  }

  return charGroup;
}
```

---

## 4. תיוגי `userData.ak` — כדי ש-`enhance()`/`idle()` ידעו לזהות חלקי גוף

**חשוב:** כל השינויים הבאים הם רק **בתוך הנתיב הפרוצדורלי** של `build3DCharacter`
(לא בנתיב ה-GLB). כל תיוג הוא שורה בודדת שמתווספת אחרי `charGroup.add(...)`
הקיים. בלי התיוגים האלה `avatar-plus.js` עדיין לא קורס — הוא פשוט עובר
ל"מצב גנרי" (רק צל רך, בלי שינוי פרופורציות/פנים חיות).

### 4.1 ראש + אוזניים

מצא:

```js
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.85, 32, 32), skinMat);
  head.position.y = 2.0;
  head.scale.set(1, 1.05, 0.96);
  charGroup.add(head);

  const earGeo = new THREE.SphereGeometry(0.16, 16, 16);
  for (const x of [-0.83, 0.83]) {
    const ear = new THREE.Mesh(earGeo, skinMat);
    ear.position.set(x, 2.0, 0);
    ear.scale.set(0.6, 1.2, 1);
    charGroup.add(ear);
  }
```

החלף ב:

```js
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.85, 32, 32), skinMat);
  head.position.y = 2.0;
  head.scale.set(1, 1.05, 0.96);
  charGroup.add(head);
  head.userData.ak = 'head';

  const earGeo = new THREE.SphereGeometry(0.16, 16, 16);
  for (const x of [-0.83, 0.83]) {
    const ear = new THREE.Mesh(earGeo, skinMat);
    ear.position.set(x, 2.0, 0);
    ear.scale.set(0.6, 1.2, 1);
    charGroup.add(ear);
    ear.userData.ak = 'ear';
  }
```

### 4.2 עיניים + אישונים + נצנוצים

מצא:

```js
  for (const x of [-0.3, 0.3]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 32), eyeWhiteMat);
    eye.position.set(x, 2.05, 0.7);
    eye.scale.set(1, 1.15, 0.7);
    charGroup.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 24), pupilMat);
    pupil.position.set(x, 2.05, 0.84);
    charGroup.add(pupil);
    const sparkle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), sparkleMat);
    sparkle.position.set(x + 0.04, 2.11, 0.93);
    charGroup.add(sparkle);
    // small secondary highlight
    const sparkle2 = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), sparkleMat);
    sparkle2.position.set(x - 0.03, 2.0, 0.93);
    charGroup.add(sparkle2);
  }
```

החלף ב:

```js
  for (const x of [-0.3, 0.3]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 32), eyeWhiteMat);
    eye.position.set(x, 2.05, 0.7);
    eye.scale.set(1, 1.15, 0.7);
    charGroup.add(eye);
    eye.userData.ak = 'eye';
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 24), pupilMat);
    pupil.position.set(x, 2.05, 0.84);
    charGroup.add(pupil);
    pupil.userData.ak = 'pupil';
    const sparkle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), sparkleMat);
    sparkle.position.set(x + 0.04, 2.11, 0.93);
    charGroup.add(sparkle);
    sparkle.userData.ak = 'sparkle';
    // small secondary highlight
    const sparkle2 = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), sparkleMat);
    sparkle2.position.set(x - 0.03, 2.0, 0.93);
    charGroup.add(sparkle2);
    sparkle2.userData.ak = 'sparkle';
  }
```

### 4.3 גבות

מצא:

```js
  for (const x of [-0.3, 0.3]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.05), browMat);
    brow.position.set(x, 2.3, 0.78);
    brow.rotation.z = -Math.sign(x) * 0.15;
    charGroup.add(brow);
  }
```

החלף ב:

```js
  for (const x of [-0.3, 0.3]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.05), browMat);
    brow.position.set(x, 2.3, 0.78);
    brow.rotation.z = -Math.sign(x) * 0.15;
    charGroup.add(brow);
    brow.userData.ak = 'brow';
  }
```

### 4.4 פה

מצא:

```js
  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.04, 8, 16, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x882233 })
  );
  mouth.position.set(0, 1.65, 0.78);
  mouth.rotation.z = Math.PI;
  charGroup.add(mouth);
```

החלף ב:

```js
  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.04, 8, 16, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x882233 })
  );
  mouth.position.set(0, 1.65, 0.78);
  mouth.rotation.z = Math.PI;
  charGroup.add(mouth);
  mouth.userData.ak = 'mouth';
```

### 4.5 לחיים

מצא:

```js
  for (const x of [-0.5, 0.5]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), cheekMat);
    cheek.position.set(x, 1.78, 0.65);
    charGroup.add(cheek);
  }
```

החלף ב:

```js
  for (const x of [-0.5, 0.5]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), cheekMat);
    cheek.position.set(x, 1.78, 0.65);
    charGroup.add(cheek);
    cheek.userData.ak = 'cheek';
  }
```

### 4.6 גו / כתפיים / אגן

מצא:

```js
  const torso = capsule(0.55, 0.5, 1.0, shirtMat, 32);
  torso.position.y = 0.75;
  charGroup.add(torso);
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 32), shirtMat);
  shoulders.position.y = 1.25;
  shoulders.scale.set(1, 0.6, 1);
  charGroup.add(shoulders);
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 32), shirtMat);
  hips.position.y = 0.25;
  hips.scale.set(1, 0.55, 1);
  charGroup.add(hips);
```

החלף ב:

```js
  const torso = capsule(0.55, 0.5, 1.0, shirtMat, 32);
  torso.position.y = 0.75;
  charGroup.add(torso);
  torso.userData.ak = 'torso';
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 32), shirtMat);
  shoulders.position.y = 1.25;
  shoulders.scale.set(1, 0.6, 1);
  charGroup.add(shoulders);
  shoulders.userData.ak = 'shoulders';
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 32), shirtMat);
  hips.position.y = 0.25;
  hips.scale.set(1, 0.55, 1);
  charGroup.add(hips);
  hips.userData.ak = 'hips';
```

### 4.7 כובע (רק בנתיב הפרוצדורלי — הבלוק עם `hatRoot.position.y = 2.85;`)

מצא:

```js
  if (hat && hat.id !== 'hat-none') {
    const hatRoot = new THREE.Group();
    hatRoot.position.y = 2.85;
    addHat(hatRoot, hat.id);
    charGroup.add(hatRoot);
  }
```

החלף ב:

```js
  if (hat && hat.id !== 'hat-none') {
    const hatRoot = new THREE.Group();
    hatRoot.position.y = 2.85;
    addHat(hatRoot, hat.id);
    charGroup.add(hatRoot);
    hatRoot.userData.ak = 'hat';
  }
```

⚠️ יש בלוק כמעט זהה בנתיב ה-GLB (עם `hatRoot.position.y = character.headY || 2.7;`
והזחה כפולה) — **אל תיגע בו**, הוא לא צריך תיוג.

### 4.8 משקפיים (רק בנתיב הפרוצדורלי — הבלוק עם `glRoot.position.set(0, 2.05, 0.85)`)

מצא:

```js
  if (glasses && glasses.id !== 'gl-none') {
    const glRoot = new THREE.Group();
    glRoot.position.set(0, 2.05, 0.85);
    addGlasses(glRoot, glasses.id);
    charGroup.add(glRoot);
  }
```

החלף ב:

```js
  if (glasses && glasses.id !== 'gl-none') {
    const glRoot = new THREE.Group();
    glRoot.position.set(0, 2.05, 0.85);
    addGlasses(glRoot, glasses.id);
    charGroup.add(glRoot);
    glRoot.userData.ak = 'glasses';
  }
```

⚠️ שוב, יש בלוק כמעט זהה בנתיב ה-GLB (`character.eyeY || 2.45`) — **אל תיגע בו**.

---

## 5. `renderToCanvas` — העברת ציר-זמן ל-idle animation

מצא:

```js
function renderToCanvas(canvas, equipped, rotation = 0) {
```

החלף ב:

```js
function renderToCanvas(canvas, equipped, rotation = 0, avT) {
```

מצא (בתוך אותה פונקציה):

```js
  const charGroup = build3DCharacter(scene, equipped);
```

החלף ב:

```js
  const charGroup = build3DCharacter(scene, equipped, avT);
```

---

## 6. שתי לולאות האנימציה — להעביר `t` אמיתי במקום default

### 6א. מודל המורה (`openStudent`)

מצא:

```js
  let rot = 0;
  let lastFrame = 0;
  function animate(t) {
    if (t - lastFrame > 41) { // ~24fps
      rot += 0.025;
      renderToCanvas(canvas, s.equipped, rot);
      lastFrame = t;
    }
    modalAnimId = requestAnimationFrame(animate);
  }
  modalAnimId = requestAnimationFrame(animate);
```

החלף רק את שורת ה-`renderToCanvas`:

```js
      renderToCanvas(canvas, s.equipped, rot, t);
```

### 6ב. מסך התלמיד (`renderStudentProfile`)

מצא:

```js
  let rotation = 0;
  const canvas = document.getElementById('studentBigAvatar');
  function animate() {
    rotation += 0.012;
    renderToCanvas(canvas, previewEq, rotation);
    studentAnimId = requestAnimationFrame(animate);
  }
  animate();
```

החלף ב:

```js
  let rotation = 0;
  const canvas = document.getElementById('studentBigAvatar');
  function animate(t) {
    rotation += 0.012;
    renderToCanvas(canvas, previewEq, rotation, t);
    studentAnimId = requestAnimationFrame(animate);
  }
  animate();
```

---

## מה זה נותן בפועל

- **פרופורציות צ'יבי** — כל ה"ראש" (כולל אוזניים, עיניים, גבות, פה, לחיים, כובע
  ומשקפיים) מקובץ ל-pivot אחד וגדל פי ~1.16, בעוד הגו מתכווץ מעט — יחס ראש-גוף
  יפה יותר לילדים, בלי לגעת בגיאומטריה המקורית.
- **פנים חיות** — מצמוץ אקראי-אך-דטרמיניסטי (seed לפי צבעי החומרים, כך שכל
  תלמיד "מצמץ" בטיימינג קצת שונה), הבעת גבות, "מחווה" שמחה מדי פעם (חיוך גדול
  יותר + קפיצה קטנה).
- **Idle אמיתי** — נשימה (torso/shoulders/hips), הסתכלות סביב (headGroup
  rotation), לא פוזה קפואה.
- **שיער נוסף** — שכבות תלתלים/קוצים נוספות מעל השיער הקיים, לפי `hairStyle`
  ו-צבע השיער (נלקח מחומר הגבות, לא צריך תיוג נוסף).
- **הילה עם חלקיקים אמיתיים** — `THREE.Points` (draw call יחיד) נוסף מעל
  ה-auras הקיימים, לפי צבע ה-aura המצויד.
- **תאורה** — HemisphereLight קיים משודרג במקום + rim light קר נוסף אחד בלבד
  (3-point look בלי לפוצץ את תקציב הביצועים).
- **צל רך** — עיגול שקוף מתחת לרגליים (בלי shadow map — אין ground plane
  בתצוגת האווטאר, אז זו תחליף זול וטוב).
- **חנות** — `css/shop-plus.css` נטען אחרי ה-`<style>` הפנימי ומשדרג כרטיסי
  פריט, מסגרות נדירות מונפשות, תגי מחיר/סטטוס גדולים (≥22px), מצב "נעול"
  ברור, סרגלי אוסף עם shimmer, ואנימציית "קנייה" (pop) — הכול על אותם
  class-ים/id-ים קיימים, בלי צורך במרקאפ חדש.

## ביצועים

`build3DCharacter` כבר בונה מחדש את כל הסצנה בכל קריאה (גם בלולאות הסיבוב
ב-24fps) — זו התנהגות קיימת, לא משהו שהתווסף כאן. `enhance()`/`idle()` נשארים
זולים בכוונה: אין חישובי bounding-box, אין יצירת גיאומטריות high-poly, אין
טרוורס כפול (התגיות והseed נאספים במעבר אחד ונשמרים על `group.userData`
לשימוש חוזר של `idle()` באותה בנייה). ברשימת הכיתה (24 תלמידים, `rotation=0`)
ה-cache הקיים (`avatarCache`) ממשיך לעבוד בדיוק כמו קודם — ה-hook רץ פעם אחת
בלבד לכל שילוב ציוד ייחודי, לא בכל פריים.
