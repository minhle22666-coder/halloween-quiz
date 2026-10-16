// ============================================================
//  HubDeco — the living decorations around a hub (built from flags in themes.js → hub)
//    petals        falling cherry-blossom / sakura petals
//    snow          snowfall                       gifts    bouncing presents around the tree
//    twinkle       fairy lights on the tree       santa    Santa's sleigh flying around the hub
//    stars, moon   night sky + a big glowing full moon
//    skyLanterns   paper lanterns floating up into the night sky (Mid-Autumn)
//    paperLanterns a ring of hanging paper lanterns (Japanese restaurant)
//    props         extra models, e.g. the animated giant deer
//  stage.js calls: await deco.build() · deco.update(dt) · deco.react(good) · deco.fly(kind)
// ============================================================
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const dotTexture = () => canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
const glowTexture = (inner, outer) => canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
function petalTexture() {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 40, 2, 32, 32, 30);
    gr.addColorStop(0, '#fff3f7'); gr.addColorStop(0.6, '#ffc2d6'); gr.addColorStop(1, '#ff8fb5');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(32, 60); g.bezierCurveTo(4, 44, 6, 10, 26, 6); g.lineTo(32, 14); g.lineTo(38, 6); g.bezierCurveTo(58, 10, 60, 44, 32, 60); g.fill();
  });
}
function moonTexture() {
  return canvasTex(256, 256, (g) => {
    const gr = g.createRadialGradient(110, 100, 10, 128, 128, 120);
    gr.addColorStop(0, '#fffbe8'); gr.addColorStop(0.7, '#ffe9a8'); gr.addColorStop(1, '#f5c86a');
    g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 118, 0, TAU); g.fill();
    g.fillStyle = 'rgba(214,170,90,.28)';
    for (const [x, y, r] of [[90, 90, 22], [160, 120, 30], [120, 175, 18], [175, 70, 12], [70, 150, 14], [140, 200, 10]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  });
}
function giftTexture(color, ribbon) {
  return canvasTex(64, 64, (g) => {
    g.fillStyle = color; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,.14)'; for (let i = -64; i < 64; i += 14) { g.save(); g.translate(i, 0); g.rotate(0.6); g.fillRect(0, -20, 5, 140); g.restore(); }
    g.fillStyle = ribbon; g.fillRect(27, 0, 10, 64); g.fillRect(0, 27, 64, 10);
  });
}

export class HubDeco {
  constructor(stage, H, loadGltf) {
    this.stage = stage;
    this.H = H;
    this.cfg = H.cfg;
    this.R = H.radius;
    this.load = loadGltf;
    this.lite = stage.lite;
    this.group = new THREE.Group();
    H.group.add(this.group);
    this.reactT = -99; this.reactGood = true;
    this.mixers = [];
    this.updaters = [];
  }

  async build() {
    const c = this.cfg, live = !this.stage.snapshot;   // preview pictures: the models only
    if (c.stars && live) this._stars();
    if (c.moon && live) this._moon();
    if (c.petals && live) this._petals();
    if (c.snow && live) this._snow();
    if (c.gifts) this._gifts();
    if (c.twinkle && live) this._twinkle();
    const jobs = [];
    if (c.props) for (const p of c.props) jobs.push(this._prop(p).catch((e) => console.warn('[hub] prop', p.file, e)));
    if (c.skyLanterns && live) jobs.push(this._skyLanterns().catch((e) => console.warn('[hub] lanterns', e)));
    if (c.paperLanterns) jobs.push(this._festoon().catch((e) => console.warn('[hub] lanterns', e)));
    if (c.santa && live) jobs.push(this._santa().catch((e) => console.warn('[hub] santa', e)));
    await Promise.all(jobs);
  }

  /** a right (good = true) or wrong answer just happened */
  react(good) {
    this.reactT = this.stage.t;
    this.reactGood = good;
    if (good && this.santa) this.fly('pass');
  }
  /** seconds since the last reaction, as 1 → 0 */
  _rk(len = 2.5) { const k = 1 - (this.stage.t - this.reactT) / len; return k > 0 ? k : 0; }

  update(dt) {
    for (const m of this.mixers) m.update(dt);
    for (const f of this.updaters) f(dt, this.stage.t);
  }

  // ---------------------------------------------------------- sky
  _stars() {
    const n = this.lite ? 260 : 520, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, y = 0.08 + Math.random() * 0.9, r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * r * 640, y * 640, Math.sin(a) * r * 640], i * 3);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ map: dotTexture(), size: 3.2, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false, color: 0xfff6e0 });
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = -2;
    this.group.add(pts);
    this.updaters.push((dt, t) => { mat.opacity = 0.75 + Math.sin(t * 2.3) * 0.18; pts.rotation.y += dt * 0.004; });
  }

  _moon() {
    const g = new THREE.Group();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,236,170,.75)', 'rgba(255,200,120,0)'), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), transparent: true, depthWrite: false, fog: false }));
    glow.renderOrder = -1; disc.renderOrder = -1;
    g.add(glow, disc);
    g.renderOrder = -1;
    this.group.add(g);
    this.moon = g;
    const st = this.stage;
    const dir = V(), cam = st.camera;
    this.updaters.push(() => {
      // pinned to the upper right of the view, far behind the hub (like a painted sky)
      const vf = THREE.MathUtils.degToRad(cam.fov) / 2, hf = Math.atan(Math.tan(vf) * cam.aspect);
      dir.set(Math.tan(hf * 0.55), Math.tan(vf * 0.55), -1).normalize().applyQuaternion(cam.quaternion);
      g.position.copy(cam.position).addScaledVector(dir, 420);
      this.group.worldToLocal(g.position);
      const k = Math.tan(vf) / Math.tan(THREE.MathUtils.degToRad(20));   // same size on screen on phones
      const dim = this.reactGood ? 0 : this._rk(3.2);
      const bright = this.reactGood ? this._rk(2.2) : 0;
      disc.material.opacity = 1 - dim * 0.7;
      disc.scale.setScalar(64 * k);
      glow.material.opacity = (0.85 + Math.sin(st.t * 1.3) * 0.08) * (1 - dim * 0.85) + bright * 0.4;
      glow.scale.setScalar(180 * k * (1 + bright * 0.25));
    });
  }

  // ---------------------------------------------------------- falling things
  _petals() {
    const n = this.lite ? 50 : 120, R = this.R;
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.26, 0.26), new THREE.MeshBasicMaterial({ map: petalTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.05 }), n);
    const P = [];
    for (let i = 0; i < n; i++) P.push({ a: Math.random() * TAU, r: Math.sqrt(Math.random()) * R * 1.5, y: Math.random() * R * 1.4, v: rnd(0.35, 0.75), ph: Math.random() * TAU, s: rnd(0.7, 1.3) });
    const o = new THREE.Object3D();
    this.group.add(mesh);
    this.updaters.push((dt, t) => {
      const boost = 1 + this._rk(2) * (this.reactGood ? 2 : 0);
      for (let i = 0; i < n; i++) {
        const p = P[i];
        p.y -= p.v * dt * boost;
        if (p.y < -R * 0.15) { p.y = R * 1.4; p.a = Math.random() * TAU; }
        o.position.set(Math.cos(p.a) * p.r + Math.sin(t * 0.7 + p.ph) * 0.6, p.y, Math.sin(p.a) * p.r + Math.cos(t * 0.5 + p.ph) * 0.4);
        o.rotation.set(t * 1.3 + p.ph, t * 0.9 + p.ph * 2, t * 0.6);
        o.scale.setScalar(p.s);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  _snow() {
    const n = this.lite ? 380 : 900, R = this.R, top = R * 1.9;
    const pos = new Float32Array(n * 3), P = [];
    for (let i = 0; i < n; i++) P.push({ a: Math.random() * TAU, r: Math.sqrt(Math.random()) * R * 2.4, y: Math.random() * top, v: rnd(0.5, 1.1), ph: Math.random() * TAU });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ map: dotTexture(), size: 0.2, transparent: true, depthWrite: false, color: 0xffffff });
    this.group.add(new THREE.Points(geo, mat));
    this.updaters.push((dt, t) => {
      const storm = this.reactGood ? 1 : 1 + this._rk(3) * 2.5;   // a flurry on wrong answers
      for (let i = 0; i < n; i++) {
        const p = P[i];
        p.y -= p.v * dt * storm;
        if (p.y < 0) { p.y = top; p.a = Math.random() * TAU; }
        pos[i * 3] = Math.cos(p.a) * p.r + Math.sin(t * 0.6 + p.ph) * 0.5 * storm;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = Math.sin(p.a) * p.r + Math.cos(t * 0.4 + p.ph) * 0.4;
      }
      geo.attributes.position.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------- Christmas
  _treeAt() {
    // the tree stands at the model's own origin
    const m = this.H.items.model;
    return { x: m.position.x, z: m.position.z, h: this.H.top || this.R * 1.4 };
  }

  _gifts() {
    const R = this.R, gifts = [];
    const looks = [['#e63946', '#ffd166'], ['#2a9d8f', '#ffffff'], ['#ffb703', '#e63946'], ['#3a86ff', '#ffd166'], ['#8338ec', '#ffffff'], ['#ffffff', '#e63946'], ['#06d6a0', '#e63946']];
    const n = this.lite ? 5 : 7;
    for (let i = 0; i < n; i++) {
      const [col, rib] = looks[i % looks.length];
      const s = rnd(0.55, 1.0);
      const box = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ map: giftTexture(col, rib), roughness: 0.6 });
      const cube = new THREE.Mesh(new THREE.BoxGeometry(s, s * rnd(0.7, 1.1), s), mat);
      const hgt = cube.geometry.parameters.height;
      cube.position.y = hgt / 2;
      const bowMat = new THREE.MeshStandardMaterial({ color: rib, roughness: 0.4 });
      const bow1 = new THREE.Mesh(new THREE.TorusGeometry(s * 0.16, s * 0.05, 6, 12), bowMat);
      bow1.position.set(-s * 0.12, hgt + s * 0.1, 0); bow1.rotation.set(0, Math.PI / 2, 0.6);
      const bow2 = bow1.clone(); bow2.position.x = s * 0.12; bow2.rotation.z = -0.6;
      box.add(cube, bow1, bow2);
      const a = (i / n) * TAU + rnd(-0.2, 0.2), r = R * rnd(0.62, 0.86);
      box.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      box.rotation.y = rnd(0, TAU);
      box.userData = { ph: Math.random() * TAU, next: rnd(1, 5), hop: 0, y0: 0 };
      this.group.add(box);
      gifts.push(box);
    }
    this.updaters.push((dt, t) => {
      const k = this.reactGood ? this._rk(2.2) : 0;
      gifts.forEach((b, i) => {
        const u = b.userData;
        // a little hop now and then, a big bounce when the room gets it right
        u.next -= dt;
        if (u.next < 0) { u.hop = 1; u.next = rnd(3, 7); }
        u.hop = Math.max(0, u.hop - dt * 1.8);
        const small = Math.sin((1 - u.hop) * Math.PI) * (u.hop > 0 ? 0.35 : 0);
        const big = k > 0 ? Math.abs(Math.sin((t - this.reactT) * 6 + i)) * 1.4 * k : 0;
        b.position.y = small + big;
        b.rotation.z = Math.sin(t * 2 + u.ph) * 0.03 + (k > 0 ? Math.sin(t * 9 + i) * 0.25 * k : 0);
      });
    });
  }

  _twinkle() {
    const tree = this._treeAt(), n = this.lite ? 26 : 46;
    const cols = ['#fff3b0', '#ffd166', '#ff6b6b', '#7bdff2', '#b8f2a6', '#ffffff'];
    const tex = dotTexture(), lights = [];
    const baseR = this.R * 0.36;
    for (let i = 0; i < n; i++) {
      const y = rnd(0.12, 0.82), a = Math.random() * TAU, r = baseR * (1 - y) * 1.02 + 0.08;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: cols[i % cols.length], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      s.position.set(tree.x + Math.cos(a) * r, y * tree.h * 0.93, tree.z + Math.sin(a) * r);
      s.scale.setScalar(0.5);
      s.userData.ph = Math.random() * TAU;
      this.group.add(s); lights.push(s);
    }
    this.updaters.push((dt, t) => {
      const off = this.reactGood ? 0 : this._rk(2.6);
      for (const s of lights) s.material.opacity = (0.55 + Math.sin(t * 3 + s.userData.ph) * 0.45) * (1 - off * 0.9);
    });
  }

  async _prop(p) {
    const g = await this.load(p.file);
    const inner = p.skinned === false ? g.scene.clone(true) : skClone(g.scene);
    const box = new THREE.Box3().setFromObject(inner), size = box.getSize(V()), c = box.getCenter(V());
    const wrap = new THREE.Group();
    inner.position.set(-c.x, -box.min.y, -c.z);
    wrap.add(inner);
    wrap.scale.setScalar((p.height || 2) / size.y);
    wrap.position.set((p.at[0] || 0) * this.R, p.y || 0, (p.at[1] || 0) * this.R);
    wrap.rotation.y = p.face || 0;
    this.group.add(wrap);
    if (g.animations.length) {
      const mixer = new THREE.AnimationMixer(inner);
      const clips = (p.anims || g.animations.map((a) => a.name)).map((n) => g.animations.find((a) => a.name === n)).filter(Boolean);
      let cur = mixer.clipAction(clips[0]); cur.play();
      let left = rnd(6, 9), k = 0;
      this.mixers.push(mixer);
      this.updaters.push((dt) => {
        left -= dt;
        if (left > 0 || clips.length < 2) return;
        k = (k + 1) % clips.length;
        const next = mixer.clipAction(clips[k]);
        next.reset().play();
        cur.crossFadeTo(next, 0.7, false);
        cur = next;
        left = Math.max(clips[k].duration * (clips[k].duration < 3 ? 3 : 1.3), 5);
      });
    }
  }

  // ---------------------------------------------------------- paper lanterns
  async _lanternModel() {
    const g = await this.load('assets/models/lantern.glb');
    return g.scene;
  }
  _lanternClone(src, tint) {
    const l = src.clone(true);
    l.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      if (tint) o.material.color.set(tint);
      o.material.emissive = new THREE.Color(tint ? '#ff7a3a' : '#ffd9a0');
      o.material.emissiveIntensity = 1.25;
    });
    return l;
  }

  /** Mid-Autumn: lanterns floating up into the night sky, each with a warm halo */
  async _skyLanterns() {
    const src = await this._lanternModel();
    const R = this.R, n = this.lite ? 9 : 16, L = [];
    const halo = new THREE.SpriteMaterial({ map: glowTexture('rgba(255,170,80,.75)', 'rgba(255,120,40,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const tints = ['#ff5a3c', '#ffb347', '#ff4f6d', null, '#ffd166'];
    for (let i = 0; i < n; i++) {
      const l = this._lanternClone(src, tints[i % tints.length]);
      const s = rnd(0.45, 0.8);
      l.scale.setScalar(s);
      const h = new THREE.Sprite(halo); h.scale.setScalar(s * 4.2);
      const wrap = new THREE.Group(); wrap.add(l, h);
      const a = (i / n) * TAU + rnd(-0.25, 0.25), r = R * rnd(1.5, 2.6);
      wrap.userData = { a, r, y: rnd(-R * 0.6, R * 2.2), v: rnd(0.25, 0.5), ph: Math.random() * TAU };
      this.group.add(wrap); L.push(wrap);
    }
    // plenty of far-away tiny lanterns (sprites) so the whole sky glows
    const farMat = new THREE.SpriteMaterial({ map: glowTexture('rgba(255,200,110,1)', 'rgba(255,120,40,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const far = [];
    for (let i = 0; i < (this.lite ? 24 : 50); i++) {
      const sp = new THREE.Sprite(farMat);
      const a = Math.random() * TAU, r = R * rnd(3, 7);
      sp.position.set(Math.cos(a) * r, rnd(-R, R * 3), Math.sin(a) * r);
      sp.scale.setScalar(rnd(0.6, 1.3));
      sp.userData = { v: rnd(0.2, 0.45), top: R * 3.2, bottom: -R * 1.2 };
      this.group.add(sp); far.push(sp);
    }
    this.updaters.push((dt, t) => {
      const good = this.reactGood ? this._rk(2.6) : 0, bad = this.reactGood ? 0 : this._rk(3);
      const speed = 1 + good * 3;
      for (const w of L) {
        const u = w.userData;
        u.y += u.v * dt * speed;
        if (u.y > R * 2.6) u.y = -R * 0.8;
        w.position.set(Math.cos(u.a + Math.sin(t * 0.1 + u.ph) * 0.05) * u.r, u.y, Math.sin(u.a) * u.r);
        w.rotation.set(Math.sin(t * 0.8 + u.ph) * 0.08, t * 0.2 + u.ph, Math.cos(t * 0.7 + u.ph) * 0.08);
        w.children[1].material.opacity = 0.9 - bad * 0.7 + good * 0.1;
      }
      for (const sp of far) { sp.position.y += sp.userData.v * dt * speed; if (sp.position.y > sp.userData.top) sp.position.y = sp.userData.bottom; }
      farMat.opacity = 1 - bad * 0.7;
    });
  }

  /** Japanese restaurant: a festoon of paper lanterns around the shop */
  async _festoon() {
    const src = await this._lanternModel();
    const R = this.R, n = this.lite ? 8 : 12, y = R * 0.95, r = R * 1.02, L = [];
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const l = this._lanternClone(src, i % 3 === 1 ? '#ff5a4a' : null);
      l.scale.setScalar(0.55);
      const hang = new THREE.Group();
      l.position.y = -0.62;
      hang.add(l);
      hang.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      hang.userData.ph = Math.random() * TAU;
      this.group.add(hang); L.push(hang);
    }
    // the string, sagging between the lanterns
    for (let i = 0; i <= n * 8; i++) {
      const k = i / (n * 8), a = k * TAU, seg = (k * n) % 1;
      pts.push(V(Math.cos(a) * r, y + 0.04 - Math.sin(seg * Math.PI) * 0.45, Math.sin(a) * r));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x3a2a1a }));
    this.group.add(line);
    this.updaters.push((dt, t) => {
      const shake = this.reactGood ? this._rk(2) * 0.25 : this._rk(2.6) * 0.6;
      for (const h of L) { h.rotation.z = Math.sin(t * 1.4 + h.userData.ph) * 0.06 + Math.sin(t * 11 + h.userData.ph) * shake; h.rotation.x = Math.cos(t * 1.1 + h.userData.ph) * 0.05; }
    });
  }

  // ---------------------------------------------------------- Santa's sleigh
  async _santa() {
    const g = await this.load('assets/models/santa.glb');
    const inner = g.scene.clone(true);
    const box = new THREE.Box3().setFromObject(inner), size = box.getSize(V()), c = box.getCenter(V());
    inner.position.set(-c.x, -box.min.y, -c.z);
    const turn = new THREE.Group(); turn.add(inner);
    turn.rotation.y = Math.PI / 2;           // the sleigh's nose points along −x in the model → turn it to +z
    const s = new THREE.Group(); s.add(turn);
    s.scale.setScalar((this.R * 0.42) / Math.max(size.x, size.z));
    s.visible = false;
    this.group.add(s);
    this.santa = s;
    // sparkle trail
    const trailMat = new THREE.SpriteMaterial({ map: glowTexture('rgba(255,240,180,1)', 'rgba(255,200,80,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const trail = [];
    for (let i = 0; i < 30; i++) { const sp = new THREE.Sprite(trailMat.clone()); sp.visible = false; this.group.add(sp); trail.push({ sp, life: 0 }); }
    let spawn = 0, ti = 0;
    this.flight = null;
    this.nextLobbyFlight = 6;
    const st = this.stage, R = this.R;
    this.updaters.push((dt, t) => {
      // in the waiting room Santa passes by every now and then
      if (!this.flight && st.mode === 'lobby') { this.nextLobbyFlight -= dt; if (this.nextLobbyFlight < 0) { this.fly('lobby'); this.nextLobbyFlight = 22; } }
      const f = this.flight;
      if (f) {
        f.t += dt;
        const k = Math.min(1, f.t / f.dur);
        const p = f.path(k), q = f.path(Math.min(1, k + 0.01));
        s.position.copy(p);
        s.lookAt(this.group.localToWorld(q.clone()));
        s.rotateZ(f.bank);
        s.visible = true;
        spawn -= dt;
        if (spawn < 0) { spawn = 0.05; const tr = trail[ti++ % trail.length]; tr.life = 1.2; tr.sp.visible = true; tr.sp.position.copy(p).add(V(rnd(-0.2, 0.2), rnd(0, 0.4), rnd(-0.2, 0.2))); tr.sp.scale.setScalar(rnd(0.4, 0.9)); }
        if (k >= 1) { this.flight = null; s.visible = false; if (f.done) f.done(); }
      }
      for (const tr of trail) { if (tr.life <= 0) continue; tr.life -= dt; tr.sp.material.opacity = Math.max(0, tr.life / 1.2); tr.sp.position.y -= dt * 0.4; if (tr.life <= 0) tr.sp.visible = false; }
    });
    // flight paths (k = 0 → 1)
    this.paths = {
      // intro: swoop in from high up, two loops around the tree, then off into the sky
      intro: { dur: 6.5, bank: 0.32, path: (k) => { const a = -1.2 + k * TAU * 2.1, r = R * (1.9 - 0.5 * Math.sin(k * Math.PI)), y = R * (2.4 - 1.6 * Math.sin(Math.min(1, k * 1.2) * Math.PI * 0.5)) + (k > 0.8 ? (k - 0.8) * R * 9 : 0); return V(Math.cos(a) * r, y, Math.sin(a) * r); } },
      lobby: { dur: 13, bank: 0.22, path: (k) => { const a = 0.6 + k * TAU, r = R * 1.9; return V(Math.cos(a) * r, R * 1.2 + Math.sin(k * TAU * 2) * 0.5, Math.sin(a) * r); } },
      pass: { dur: 3.2, bank: 0.35, path: (k) => { const a = 2.4 + k * TAU * 0.9, r = R * 1.7; return V(Math.cos(a) * r, R * (1.1 + k * 1.2), Math.sin(a) * r); } },
    };
  }
  /** start a Santa flight; resolves when it is over */
  fly(kind) {
    if (!this.santa || !this.paths) return Promise.resolve();
    return new Promise((res) => { this.flight = { ...this.paths[kind], t: 0, done: res }; });
  }
}
