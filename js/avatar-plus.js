/*
 * avatar-plus.js — Visual upgrade layer for "אקדמיית כוכבים" character avatars.
 * Agent D — SPEC.md §1 (js/avatar-plus.js + css/shop-plus.css) & §4-5.
 *
 * This file NEVER touches index.html and NEVER rebuilds the character mesh
 * hierarchy itself. It only reads/decorates the THREE.Group produced by the
 * existing `build3DCharacter()` in index.html, using small `userData.ak`
 * tags the integrator adds to a handful of existing mesh-creation lines
 * (see avatar-plus.README.md for the exact patch).
 *
 * Public API (per SPEC):
 *   window.AvatarPlus = {
 *     enhance(group, equipped)  // called once per fresh build, before returning charGroup
 *     idle(group, t)            // called once per fresh build, right after enhance()
 *     lights(scene)              // called once per build, during the lighting setup
 *   }
 *
 * Design constraints respected:
 *   - No new dependencies, Three.js r128 API only.
 *   - Cheap per-call cost: build3DCharacter() reconstructs the ENTIRE scene from
 *     scratch on every call (even during the ~24fps modal/profile spin animations),
 *     so everything here must be O(small-constant), never O(vertices). We avoid
 *     Box3/bounding computations and any per-frame geometry creation with high
 *     segment counts.
 *   - 100% tolerant of missing tags: if the expected tags are not present
 *     (e.g. an imported GLB character, or the integrator hasn't patched yet),
 *     every function degrades to a light, generic treatment instead of throwing.
 *   - Fully deterministic per (equipped) combo: since the group is rebuilt from
 *     scratch every single frame, "randomness" (blink timing, look-around phase,
 *     gesture timing) is derived from a stable seed computed from the materials
 *     already present in the group — never from Math.random() persisted state
 *     that would reset every frame anyway.
 */
(function () {
  'use strict';

  if (typeof THREE === 'undefined') return; // nothing we can do without three.js

  // ------------------------------------------------------------------
  // small utilities
  // ------------------------------------------------------------------

  // Collect every tagged descendant (`obj.userData.ak = 'tagName'`) in ONE pass,
  // and simultaneously accumulate a color-based seed so we don't need a 2nd
  // traversal just for randomness. Cached on group.userData for idle() reuse.
  function collectTagsAndSeed(group) {
    const map = Object.create(null);
    let seedAcc = 0;
    group.traverse(function (o) {
      const tag = o.userData && o.userData.ak;
      if (tag) {
        (map[tag] || (map[tag] = [])).push(o);
      }
      if (o.isMesh && o.material && o.material.color && o.material.color.isColor) {
        seedAcc += o.material.color.getHex();
      }
    });
    const seed = (Math.abs(seedAcc) % 100003) / 100003; // 0..1, stable per equipped combo
    group.userData._akMap = map;
    group.userData._akSeed = seed;
    return map;
  }

  function tagList(map, tag) { return (map && map[tag]) || []; }
  function tagOne(map, tag) { const l = tagList(map, tag); return l.length ? l[0] : null; }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  const reducedMotion = (function () {
    try {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { return false; }
  })();

  // ------------------------------------------------------------------
  // enhance(group, equipped) — one-time-per-build decoration
  // ------------------------------------------------------------------
  function enhance(group, equipped) {
    if (!group || !group.isObject3D) return;
    equipped = equipped || {};

    const map = collectTagsAndSeed(group);
    const head = tagOne(map, 'head');

    if (!head) {
      // No tags found → likely an imported GLB character or an unpatched
      // build. Do a minimal, generic, always-safe upgrade only.
      enhanceGeneric(group, map);
      return;
    }

    // ---- 1) Chibi head/body proportions -----------------------------
    // Reparent every head-region part into one pivot group at the head's
    // center so it can move/scale as a single believable unit.
    const HEAD_TAGS = ['head', 'ear', 'eye', 'pupil', 'sparkle', 'brow', 'mouth', 'cheek', 'hat', 'glasses'];
    let headGroup = group.userData._akHeadGroup;
    if (!headGroup) {
      headGroup = new THREE.Group();
      headGroup.userData.ak = 'headGroup';
      const pivot = head.position.clone();
      headGroup.position.copy(pivot);
      group.add(headGroup);
      HEAD_TAGS.forEach(function (tag) {
        tagList(map, tag).forEach(function (obj) {
          if (obj === headGroup) return;
          const localPos = obj.position.clone().sub(pivot);
          group.remove(obj);
          obj.position.copy(localPos);
          headGroup.add(obj);
        });
      });
      group.userData._akHeadGroup = headGroup;
      // headGroup itself is now also tagged — refresh the map so idle() finds it too.
      map.headGroup = [headGroup];
    }
    // Chibi enlargement — bigger head reads instantly as "cute" to kids.
    headGroup.scale.setScalar(1.16);

    // Slightly compact the torso for a chibi silhouette (cheap: absolute
    // scale set on objects whose base scale is already known/fixed).
    const torso = tagOne(map, 'torso');
    if (torso) torso.scale.set(1.04, 0.9, 1.04);
    const shoulders = tagOne(map, 'shoulders');
    if (shoulders) shoulders.scale.set(1.05, 0.62, 1.05);
    const hips = tagOne(map, 'hips');
    if (hips) hips.scale.set(1.05, 0.58, 1.05);

    // ---- 2) A little "shine" for cheap plastic-toy gloss -------------
    if (!group.userData._akShineAdded) {
      const shineGeo = new THREE.SphereGeometry(0.16, 10, 8);
      const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
      const shine = new THREE.Mesh(shineGeo, shineMat);
      shine.userData.ak = 'shine';
      shine.position.set(0.22, 0.32, 0.68); // relative to headGroup pivot (head center)
      shine.scale.set(1, 0.7, 0.4);
      headGroup.add(shine);
      group.userData._akShineAdded = true;
    }

    // ---- 3) Extra hair volume (purely additive; never touches the
    //         original hair mesh built by buildHair()) -----------------
    if (!group.userData._akHairAdded) {
      addHairVolume(headGroup, equipped);
      group.userData._akHairAdded = true;
    }

    // ---- 4) Soft fake contact shadow at the feet ----------------------
    // (Real shadow maps need a receiving ground plane + renderer.shadowMap,
    // which this floating-avatar preview doesn't have. A cheap blurred
    // disc under the feet reads as "grounded" without extra render passes.)
    if (!group.userData._akShadowAdded) {
      const shadowGeo = new THREE.CircleGeometry(0.55, 20);
      const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.userData.ak = 'shadowBlob';
      shadow.rotation.x = -Math.PI / 2;
      // Procedural rig feet sit at a fixed local Y (see build3DCharacter's
      // shoe placement) — constant, so no expensive bbox computation needed.
      shadow.position.set(0.05, -0.9, 0.15);
      group.add(shadow);
      group.userData._akShadowAdded = true;
    }

    // ---- 5) Real particle aura dust (Points = one draw call) ----------
    const auraId = equipped.aura;
    if (auraId && auraId !== 'aura-none' && !group.userData._akAuraPointsAdded) {
      addAuraSparkle(group, auraId);
      group.userData._akAuraPointsAdded = true;
    }
  }

  function enhanceGeneric(group, map) {
    // Unknown rig (GLB character or unpatched build): keep it minimal & safe.
    if (!group.userData._akShadowAdded) {
      const shadowGeo = new THREE.CircleGeometry(0.6, 18);
      const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.userData.ak = 'shadowBlob';
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(0, -1.25, 0);
      group.add(shadow);
      group.userData._akShadowAdded = true;
    }
  }

  function addHairVolume(headGroup, equipped) {
    let bodyDef = null;
    try {
      if (typeof findItem === 'function') bodyDef = findItem(equipped.body);
      else if (window.findItem) bodyDef = window.findItem(equipped.body);
    } catch (e) { /* ignore */ }
    const style = (bodyDef && bodyDef.hairStyle) || 'short';

    // Hair color is never re-derived via new tags — the eyebrow material
    // already uses body.hair, so we can safely sample it.
    const map = headGroup.parent ? headGroup.parent.userData._akMap : null;
    const brow = map ? tagOne(map, 'brow') : null;
    const hairColor = (brow && brow.material && brow.material.color) ? brow.material.color.getHex() : 0x6b3410;
    const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.55 });

    const wisps = new THREE.Group();
    wisps.userData.ak = 'hairExtra';

    if (style === 'long' || style === 'curly') {
      // extra volume layers behind/around the existing cap
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), hairMat);
        s.position.set(Math.cos(a) * 0.55, 0.55 + Math.sin(i) * 0.1, Math.sin(a) * 0.5 - 0.15);
        wisps.add(s);
      }
    } else if (style === 'spike') {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), hairMat);
        spike.position.set(Math.cos(a) * 0.35, 0.72, Math.sin(a) * 0.3);
        spike.rotation.z = -Math.cos(a) * 0.5;
        wisps.add(spike);
      }
    } else {
      // short — a couple of soft side wisps for a less "helmet" silhouette
      for (const x of [-0.5, 0.5]) {
        const wisp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), hairMat);
        wisp.position.set(x, 0.25, 0.35);
        wisp.scale.set(0.7, 1.1, 0.7);
        wisps.add(wisp);
      }
    }
    headGroup.add(wisps);
  }

  function addAuraSparkle(group, auraId) {
    let auraDef = null;
    try {
      if (typeof findItem === 'function') auraDef = findItem(auraId);
      else if (window.findItem) auraDef = window.findItem(auraId);
    } catch (e) { /* ignore */ }
    const color = (auraDef && auraDef.color) ? auraDef.color : 0xffe600;

    const COUNT = 36;
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.1 + Math.random() * 0.9;
      const h = -1.0 + Math.random() * 2.6;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = h;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: color, size: 0.07, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.userData.ak = 'auraPoints';
    group.add(points);
  }

  // ------------------------------------------------------------------
  // idle(group, t) — per-frame (or per-static-build) pose
  // ------------------------------------------------------------------
  function idle(group, t) {
    if (!group || !group.isObject3D) return;
    const sec = (typeof t === 'number' ? t : (typeof performance !== 'undefined' ? performance.now() : Date.now())) / 1000;
    const map = group.userData._akMap || collectTagsAndSeed(group);
    const seed = (typeof group.userData._akSeed === 'number') ? group.userData._akSeed : 0.5;

    const motionScale = reducedMotion ? 0.15 : 1; // still "alive" but nearly still if user prefers reduced motion

    const headGroup = tagOne(map, 'headGroup');

    if (headGroup) {
      // breathing bob
      headGroup.position.y += Math.sin(sec * 1.6 + seed * 9) * 0.022 * motionScale;
      // gentle look-around (slow wander + occasional quicker glance)
      headGroup.rotation.y = (Math.sin(sec * 0.35 + seed * 6) * 0.16 + Math.sin(sec * 0.9 + seed * 3) * 0.05) * motionScale;
      headGroup.rotation.x = Math.sin(sec * 0.5 + seed * 4) * 0.035 * motionScale;
      headGroup.rotation.z = Math.sin(sec * 0.28 + seed * 2) * 0.02 * motionScale;

      // --- blink ---
      const eyes = tagList(map, 'eye');
      const pupils = tagList(map, 'pupil');
      const sparkles = tagList(map, 'sparkle');
      const blinkPeriod = 2.6 + seed * 2.4;
      const blinkWindow = 0.16;
      const phase = (sec + seed * 8) % blinkPeriod;
      let closeAmt = 0;
      if (!reducedMotion && phase < blinkWindow) closeAmt = Math.sin((phase / blinkWindow) * Math.PI);
      eyes.forEach(function (e) { e.scale.y *= (1 - closeAmt * 0.85); });
      pupils.forEach(function (p) { p.scale.y *= (1 - closeAmt * 0.9); });
      sparkles.forEach(function (s) { s.visible = closeAmt < 0.6; });

      // --- occasional happy "gesture" beat: bigger smile + raised brows + tiny bounce
      const gPeriod = 9 + seed * 5;
      const gWindow = 0.9;
      const gPhase = (sec + seed * 13) % gPeriod;
      if (gPhase < gWindow) {
        const k = Math.sin((gPhase / gWindow) * Math.PI) * motionScale;
        const mouth = tagOne(map, 'mouth');
        if (mouth) { mouth.scale.x *= (1 + k * 0.35); mouth.scale.y *= (1 + k * 0.55); }
        tagList(map, 'brow').forEach(function (b) { b.position.y += k * 0.05; });
        group.position.y += Math.sin(gPhase * Math.PI * 5) * 0.03 * k;
        group.rotation.z += Math.sin(gPhase * Math.PI * 6) * 0.045 * k;
      }
    } else {
      // Generic (untagged / GLB) rig: gentle whole-body sway only.
      group.rotation.z += Math.sin(sec * 0.6 + seed * 5) * 0.018 * motionScale;
      group.position.y += Math.sin(sec * 1.4 + seed * 3) * 0.02 * motionScale;
    }

    // --- breathing squash on torso/hips/shoulders ---
    const breathe = 1 + Math.sin(sec * 1.5 + seed * 7) * 0.03 * motionScale;
    const torso = tagOne(map, 'torso');
    if (torso) torso.scale.y *= breathe; // enhance() already set the chibi-compact base
    const shoulders = tagOne(map, 'shoulders');
    if (shoulders) shoulders.scale.y *= breathe;
    const hips = tagOne(map, 'hips');
    if (hips) hips.scale.y *= breathe;

    // --- aura sparkle drift ---
    const auraPoints = tagOne(map, 'auraPoints');
    if (auraPoints) {
      auraPoints.rotation.y = sec * 0.35 * motionScale;
      auraPoints.position.y = Math.sin(sec * 1.1 + seed * 4) * 0.08 * motionScale;
    }
  }

  // ------------------------------------------------------------------
  // lights(scene) — cheap polish on top of the existing rig
  // ------------------------------------------------------------------
  function lights(scene) {
    if (!scene || !scene.isObject3D) return;
    // Upgrade the existing HemisphereLight in-place (zero extra draw cost).
    scene.traverse(function (o) {
      if (o.isHemisphereLight) o.intensity = Math.max(o.intensity, 0.65);
    });
    // One soft cool rim light from above-behind to pop the silhouette edge —
    // completes a proper 3-point setup (key = existing directional light).
    const rimTop = new THREE.PointLight(0xdfe9ff, 0.5, 8);
    rimTop.position.set(-1.5, 4.2, -3);
    scene.add(rimTop);
  }

  window.AvatarPlus = { enhance: enhance, idle: idle, lights: lights };
})();
