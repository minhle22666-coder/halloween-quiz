// ============================================================
//  HubStage — 3D "hub" scene for the non-Halloween themes (and the theme picker)
//  • a diorama model slowly rotating in a themed sky
//  • the diorama's thick base is hidden so it blends into the world:
//      summer → base cut off + an endless ocean at water level
//      default → grass fades into a soft endless lawn
//      lunar  → floating island among clouds
//  • same API as the Halloween Stage, so host.js can drive either one
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { THEMES, getTheme, getPalette, skyOf } from './themes.js';
import { HubDeco } from './hubdeco.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = {
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  linear: (t) => t,
};
const gltfCache = new Map();
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);   // the new hubs are meshopt-compressed
function loadGltf(url) {
  if (!gltfCache.has(url)) gltfCache.set(url, loader.loadAsync(url));
  return gltfCache.get(url);
}

export class HubStage {
  constructor(container, opts = {}) {
    this.container = container;
    this.lite = !!opts.lite;
    this.snapshot = !!opts.snapshot;      // transparent background (preview images)
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.lite, alpha: this.snapshot, preserveDrawingBuffer: this.snapshot, powerPreference: this.lite ? 'default' : 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lite ? 1.6 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.localClippingEnabled = true;
    if (this.snapshot) this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = 'stage-canvas';

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
    this.t = 0;
    this.clock = new THREE.Clock();
    this.tweens = [];
    this.seq = 0;
    this.mode = 'lobby';
    this.orbit = 0.6;            // camera angle around the hub
    this.orbitSpeed = 0.06;
    this.zoom = 1;
    this.camLift = 0;
    this.shake = 0;
    this.hubs = {};              // themeId -> { group, cfg, items }
    this.current = null;

    this.overlay = document.createElement('div');
    this.overlay.className = 'stage-overlay';
    container.appendChild(this.overlay);
    this.bubbles = [];

    this._buildSky();
    this._buildLights();
    this._buildMascot();

    this.frameY = 0;            // move the picture down (+) / up (−), as a fraction of the height
    this.frameX = 0;            // … and right (+) / left (−), as a fraction of the width
    this._resize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.portrait = w / h < 0.9;
      this.camK = this.portrait ? Math.max(1.25, 0.92 / (w / h)) : 1;   // phones: step back so the whole hub fits the width
      this.camera.fov = this.portrait ? 58 : 40;
      this._w = w; this._h = h;
      this._applyFrame();
    };
    new ResizeObserver(this._resize).observe(container);
    this._resize();
  }

  // ---------------------------------------------------------- setup
  _buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#5b2bb5') }, bottom: { value: new THREE.Color('#2a0f6b') }, glow: { value: new THREE.Color('#ffffff') }, glowK: { value: 0.12 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bottom; uniform vec3 glow; uniform float glowK;
        void main(){
          float h = vP.y;
          vec3 c = mix(bottom, top, smoothstep(-0.05, 0.75, h));
          c += glow * glowK * (1.0 - smoothstep(0.0, 0.35, abs(h - 0.04)));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.skyMat);
    this.sky.visible = !this.snapshot;
    this.scene.add(this.sky);
    this.fog = new THREE.Fog(0x2a0f6b, 40, 180);
    if (!this.snapshot) this.scene.fog = this.fog;
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x6a5a8a, 1.25);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.position.set(18, 30, 14);
    this.fill = new THREE.DirectionalLight(0xbfd4ff, 0.6);
    this.fill.position.set(-20, 10, -16);
    // warm glow of the lanterns on night hubs
    this.warm = new THREE.PointLight(0xffa85a, 0, 30, 1.6);
    this.scene.add(this.hemi, this.sun, this.fill, this.warm);
    this.light0 = { hemi: 1.25, sun: 2.2, warm: 0 };
  }

  _buildMascot() {
    // the current leader's avatar floats above the hub during the game
    const tex = new THREE.Texture();
    this.mascot = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false })); // always in front: never hidden by a roof or an umbrella
    this.mascot.visible = false;
    this.mascot.renderOrder = 5;
    this.mascotState = { hop: 0, spin: 0, shake: 0, sad: 0, size: 2.3 };
    this.scene.add(this.mascot);
  }
  /** the big greeting written in the sky ("Happy New Year 2027"…) — '' hides it */
  setGreeting(text, theme) {
    this.signText = String(text || '').trim();
    this.signTheme = theme || this.signTheme;
    if (!this.sign) {
      this.sign = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, fog: false }));
      this.sign.renderOrder = 8; this.sign.visible = false; this.signK = 0; this.signAspect = 0.25;
      this.scene.add(this.sign);
    }
    if (!this.signText) return;
    const t = getTheme(this.signTheme), txt = this.signText, my = (this._signSeq = (this._signSeq || 0) + 1);
    const draw = () => {
      if (my !== this._signSeq) return;
      const c = document.createElement('canvas'), g = c.getContext('2d');
      const font = (px) => `${t.fonts.titleWeight || 700} ${px}px ${t.fonts.title}`;
      let px = 150; g.font = font(px);
      const wMax = 1900;
      while (g.measureText(txt).width > wMax && px > 50) { px -= 6; g.font = font(px); }
      const w = Math.min(2048, Math.ceil(g.measureText(txt).width + 120)), h = Math.ceil(px * 1.6);
      c.width = w; c.height = h;
      g.font = font(px); g.textAlign = 'center'; g.textBaseline = 'middle';
      const y = h * 0.52;
      g.lineJoin = 'round';
      g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = px * 0.18; g.shadowOffsetY = px * 0.06;
      g.lineWidth = px * 0.16; g.strokeStyle = t.id === 'lunar' ? '#8c0a1f' : t.id === 'christmas' ? '#0c4a2f' : '#1d0f38';
      g.strokeText(txt, w / 2, y);
      g.shadowColor = 'transparent';
      const gr = g.createLinearGradient(0, y - px / 2, 0, y + px / 2);
      gr.addColorStop(0, '#fff6c8'); gr.addColorStop(0.55, '#ffd34d'); gr.addColorStop(1, '#f59e0b');
      g.fillStyle = t.id === 'christmas' ? '#ffffff' : gr;
      g.fillText(txt, w / 2, y);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      if (this.sign.material.map) this.sign.material.map.dispose();
      this.sign.material.map = tex; this.sign.material.needsUpdate = true;
      this.signAspect = h / w;
    };
    draw();
    // draw again once the theme font has arrived
    if (document.fonts && document.fonts.load) document.fonts.load(`${t.fonts.titleWeight || 700} 80px ${t.fonts.title.split(',')[0]}`, txt).then(draw, () => {});
  }

  setMascotSprite(url) {
    if (!url) { this.mascotUrl = null; this.mascot.visible = false; return; }
    if (this.mascotUrl === url) return;
    this.mascotUrl = url;
    new THREE.TextureLoader().load(url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      const m = this.mascot.material;
      if (m.map) m.map.dispose();
      m.map = t; m.needsUpdate = true;
    });
  }

  /** load + build the hub of a theme (cached) */
  async loadHub(themeId) {
    if (this.hubs[themeId]) return this.hubs[themeId];
    if (this._loading && this._loading[themeId]) return this._loading[themeId];
    this._loading = this._loading || {};
    return (this._loading[themeId] = this._buildHub(themeId));
  }
  async _buildHub(themeId) {
    const t = getTheme(themeId);
    const cfg = t.hub;
    const g = await loadGltf(cfg.file);
    const model = g.scene.clone(true);
    model.traverse((o) => { if (o.isLight || o.isCamera) o.visible = false; });
    // fit: footprint → cfg.size metres, ground surface (baseTop) at y = 0
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(V()), c = box.getCenter(V());
    const fit = cfg.fit || {};
    const s = cfg.size / (fit.size || Math.max(size.x, size.z));
    model.scale.setScalar(s);
    model.position.set(-(fit.cx ?? c.x) * s, -(fit.cy ?? cfg.baseTop) * s, -(fit.cz ?? c.z) * s);
    // parts replaced by the world around the hub (e.g. the diorama's own water block → endless ocean)
    model.traverse((o) => {
      if (!o.isMesh) return;
      const name = o.material && o.material.name;
      if (cfg.hide && cfg.hide.includes(name)) o.visible = false;
      if (cfg.glow && cfg.glow[name] != null) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(0xffffff); o.material.emissiveIntensity = cfg.glow[name]; }
    });
    const group = new THREE.Group();
    const spin = new THREE.Group(); // the hub reacts (hop / spin / shake) through this
    spin.add(model);
    group.add(spin);
    const items = { model, spin };
    // cut the thick base off (it sinks into the ocean / ground)
    if (cfg.clip != null) {
      const plane = new THREE.Plane(V(0, 1, 0), -(cfg.clip - cfg.baseTop) * s);
      items.clipPlane = plane;
      items.clipY = (cfg.clip - cfg.baseTop) * s;
      model.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        o.material = mats.map((m) => { const mm = m.clone(); mm.clippingPlanes = [plane]; mm.clipShadows = true; return mm; });
        if (o.material.length === 1) o.material = o.material[0];
      });
    }
    if (themeId === 'halloween') {
      model.traverse((o) => { if (o.isMesh && /pupmpkin_0|lamp_body/.test(o.name)) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(0xff6a00); o.material.emissiveIntensity = 0.35; } });
    }
    // world around it
    items.ground = this._makeGround(cfg, s);
    if (items.ground) group.add(items.ground);
    items.extras = this._makeExtras(themeId, cfg, items);
    if (items.extras) group.add(items.extras);
    group.visible = false;
    this.scene.add(group);
    model.updateMatrixWorld(true);
    const top = new THREE.Box3().setFromObject(model).max.y;
    const H = { group, cfg, items, theme: t, radius: cfg.size / 2, top };
    // living decorations (petals, snow, moon, lanterns, the deer, Santa…)
    H.deco = new HubDeco(this, H, loadGltf);
    await H.deco.build();
    this.hubs[themeId] = H;
    return H;
  }

  _makeGround(cfg) {
    const fade = this.snapshot ? 1.75 : 9; // how far the ground reaches (× hub radius)
    const R = (cfg.size / 2) * fade;
    if (cfg.ground === 'ocean') {
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(cfg.groundColor), roughness: 0.62, metalness: 0, map: waterTexture(), transparent: this.snapshot, alphaMap: this.snapshot ? radialAlpha(0.72) : null });
      mat.map.repeat.set(R / 3, R / 3);
      const m = new THREE.Mesh(new THREE.CircleGeometry(R, 64), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = -0.03;
      m.userData.water = true;
      return m;
    }
    if (cfg.ground === 'grass' || cfg.ground === 'night' || cfg.ground === 'snow' || cfg.ground === 'stone') {
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(cfg.groundColor), roughness: 1, transparent: true, alphaMap: radialAlpha(), depthWrite: false });
      const m = new THREE.Mesh(new THREE.CircleGeometry((cfg.size / 2) * (cfg.groundSpread || 1.3), 64), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = cfg.ground === 'night' ? 0.02 : -0.05;
      if (cfg.ground === 'snow') { mat.roughness = 0.85; mat.emissive = new THREE.Color(0x9fb4d8); mat.emissiveIntensity = 0.18; }
      m.renderOrder = -1;
      return m;
    }
    return null;
  }

  _makeExtras(themeId, cfg, items) {
    if (this.snapshot) return null;
    const g = new THREE.Group();
    const R = cfg.size / 2;
    if (cfg.ground === 'clouds') {
      // soft clouds below the floating island
      const cloud = new THREE.SpriteMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, opacity: cfg.night ? 0.55 : 0.9, color: cfg.night ? 0x8d88c0 : 0xffffff });
      for (let i = 0; i < 14; i++) {
        const s = new THREE.Sprite(cloud);
        const a = (i / 14) * Math.PI * 2, r = R * (1.1 + Math.random() * 1.4);
        s.position.set(Math.cos(a) * r, -R * 0.55 + Math.random() * R * 0.3, Math.sin(a) * r);
        const k = R * (0.9 + Math.random() * 0.8); s.scale.set(k * 1.8, k, 1);
        g.add(s);
      }
    }
    if (cfg.lanterns) {
      // red lanterns drifting up in the distance
      const lanternMat = new THREE.SpriteMaterial({ map: lanternTexture(), transparent: true, depthWrite: false, fog: false });
      items.lanterns = [];
      for (let i = 0; i < 26; i++) {
        const s = new THREE.Sprite(lanternMat);
        const a = Math.random() * Math.PI * 2, r = R * (2.4 + Math.random() * 3);
        s.position.set(Math.cos(a) * r, -R + Math.random() * R * 3, Math.sin(a) * r);
        const k = 0.9 + Math.random() * 0.8; s.scale.set(k, k * 1.25, 1);
        s.userData = { v: 0.4 + Math.random() * 0.5, ph: Math.random() * 6, top: R * 2.2, bottom: -R * 1.2 };
        g.add(s); items.lanterns.push(s);
      }
    }
    if (themeId === 'summer') {
      const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,250,220,1)', 'rgba(255,220,120,0)'), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      sun.position.set(-R * 6, R * 3.2, -R * 9); sun.scale.set(R * 3.2, R * 3.2, 1);
      g.add(sun);
      const cloud = new THREE.SpriteMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, fog: false, opacity: 0.85 });
      items.clouds = [];
      for (let i = 0; i < 8; i++) {
        const s = new THREE.Sprite(cloud);
        const a = (i / 8) * Math.PI * 2 + Math.random(), r = R * (6 + Math.random() * 3);
        s.position.set(Math.cos(a) * r, R * (1.6 + Math.random() * 1.5), Math.sin(a) * r);
        const k = R * (1.4 + Math.random()); s.scale.set(k * 2, k, 1);
        g.add(s); items.clouds.push(s);
      }
    } else if (themeId === 'default') {
      // floating sparkles
      const n = 160, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = R * (1.2 + Math.random() * 3); pos.set([Math.cos(a) * r, Math.random() * R * 1.6, Math.sin(a) * r], i * 3); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      items.sparkles = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), size: 0.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
      g.add(items.sparkles);
    }
    return g;
  }

  /** sky / fog / light colours from a palette */
  setPalette(themeId, paletteId) {
    const t = getTheme(themeId);
    const p = getPalette(t, paletteId);
    const sky = skyOf(t, p);
    const top = new THREE.Color(sky[0]), bottom = new THREE.Color(sky[1]);
    this.skyMat.uniforms.top.value.copy(top);
    this.skyMat.uniforms.bottom.value.copy(bottom);
    this.skyMat.uniforms.glow.value.set(p.accent2);
    this.skyMat.uniforms.glowK.value = 0.06;
    // fog = colour of the sky near the horizon
    this.fog.color.copy(bottom).lerp(top, 0.25);
    const R = t.hub.size / 2;
    this.fogNear = R * (t.hub.ground === 'ocean' ? 2.5 : 3);
    this.fogFar = R * (t.hub.ground === 'ocean' ? 9 : 12);
    this.fog.near = this.fogNear; this.fog.far = this.fogFar;
    const night = !!t.hub.night;
    this.hemi.color.set(night ? 0xb9c4ff : themeId === 'lunar' ? 0xfff0e0 : themeId === 'christmas' ? 0xf2f6ff : 0xffffff);
    this.hemi.groundColor.copy(bottom).lerp(new THREE.Color(night ? 0x2a2440 : 0x777777), 0.5);
    this.sun.color.set(night ? 0xc8d2ff : themeId === 'summer' ? 0xfff2d6 : themeId === 'lunar' ? 0xffe2c0 : 0xffffff);
    this.light0 = { hemi: night ? 1.0 : 1.25, sun: night ? 1.25 : 2.2, warm: night ? 26 : 0 };
    this.hemi.intensity = this.light0.hemi; this.sun.intensity = this.light0.sun;
    this.warm.intensity = this.light0.warm;
    this.warm.position.set(0, R * 0.55, 0);
    this.warm.distance = R * 3.2;
    this.palette = p;
  }

  async load(themeId, paletteId, onProgress = () => {}) {
    onProgress(0.1);
    await this.loadHub(themeId);
    onProgress(1);
    this.show(themeId, paletteId);
    this.renderer.setAnimationLoop(() => this._frame());
  }

  /** show a hub right away (no animation) */
  show(themeId, paletteId) {
    for (const [id, h] of Object.entries(this.hubs)) h.group.visible = id === themeId;
    this.current = this.hubs[themeId];
    this.themeId = themeId;
    this.current.group.position.set(0, 0, 0);
    this.setPalette(themeId, paletteId);
  }

  /** theme picker: slide the old hub out and the new one in (dir = +1 next, -1 previous) */
  async switchTo(themeId, paletteId, dir = 1) {
    const my = ++this.seq;
    const next = await this.loadHub(themeId);
    if (my !== this.seq) return;
    const prev = this.current;
    if (prev === next) { this.setPalette(themeId, paletteId); return; }
    const right = V(Math.cos(this.orbit), 0, -Math.sin(this.orbit)); // camera's right-hand side
    const D = 40;
    next.group.visible = true;
    next.group.position.copy(right).multiplyScalar(D * dir);
    this.current = next; this.themeId = themeId;
    const p0 = prev ? prev.group.position.clone() : null;
    this.setPalette(themeId, paletteId);
    await this.tween(0.7, (k) => {
      next.group.position.copy(right).multiplyScalar(D * dir * (1 - k));
      if (prev) prev.group.position.copy(p0).addScaledVector(right, -D * dir * k);
    }, 'inOut');
    if (prev && this.current !== prev) prev.group.visible = false;
  }

  /** shift the picture vertically so the hub sits in the free part of the screen (e.g. below a card) */
  setFrame(y, dur = 0.6, x = 0) {
    this.frameTo = y;
    this.frameXTo = x;
    this.frameDur = dur;
    if (!dur) { this.frameY = y; this.frameX = x; this._applyFrame(); }
  }
  /** where the mascot stands on screen (0 = top … 1 = bottom) once the camera rests in game mode, before framing */
  mascotScreenY() {
    const H = this.current;
    if (!H) return 0.5;
    const cfg = H.cfg, z = 0.86, K = this.camK || 1;
    const cam = this.camera.clone();
    cam.clearViewOffset();
    cam.position.set(0, cfg.camHeight * z * K, cfg.camDist * z * K);
    cam.lookAt(0, cfg.lookY, 0);
    cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const p = V(0, cfg.mascotY ?? cfg.lookY + 1, H.radius * 0.5).project(cam);
    return 0.5 - p.y * 0.5;
  }
  _applyFrame() {
    const w = this._w, h = this._h;
    if (!w || !h) return;
    if (Math.abs(this.frameY) > 1e-4 || Math.abs(this.frameX) > 1e-4) this.camera.setViewOffset(w, h, -this.frameX * w, -this.frameY * h, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  /** phones, right after joining / at the intro: the camera spirals down from the sky into the hub (~2.8 s) */
  async playEnter() {
    this.resetActors();
    const my = this.seq;
    const z1 = this.zoom, o1 = this.orbit + 0.5, o0 = o1 - 3.1;
    this.zoom = 3; this.camLift = 18; this.orbit = o0;
    await this.tween(2.8, (k) => { this.orbit = o0 + (o1 - o0) * k; this.zoom = 3 + (z1 - 3) * k; this.camLift = 18 * (1 - k) * (1 - k); }, 'out');
    if (my !== this.seq) return;
    await this._hop(0.6, 0.8);
  }

  // ---------------------------------------------------------- loop
  _frame() {
    if (this.paused) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this._update(dt);
    this.renderer.render(this.scene, this.camera);
    this._updateBubbles();
  }
  advance(sec, step = 1 / 30) { for (let t = 0; t < sec; t += step) this._update(step); this.renderer.render(this.scene, this.camera); this._updateBubbles(); }
  renderOnce() { this._update(0); this.renderer.render(this.scene, this.camera); }

  _update(dt) {
    this.t += dt;
    // glide to the framing asked by setFrame (not a tween: resetActors must not cancel it)
    if (this.frameTo != null && (Math.abs(this.frameY - this.frameTo) > 1e-4 || Math.abs(this.frameX - (this.frameXTo || 0)) > 1e-4)) {
      const k = 1 - Math.exp(-dt * 5 / Math.max(0.05, this.frameDur || 0.6));
      this.frameY += (this.frameTo - this.frameY) * k;
      this.frameX += ((this.frameXTo || 0) - this.frameX) * k;
      if (Math.abs(this.frameY - this.frameTo) < 0.002) this.frameY = this.frameTo;
      if (Math.abs(this.frameX - (this.frameXTo || 0)) < 0.002) this.frameX = this.frameXTo || 0;
      this._applyFrame();
    }
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      if (tw.dead) { this.tweens.splice(i, 1); tw.res(false); continue; }
      tw.t += dt;
      const p = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.ease(p), p);
      if (p >= 1) { this.tweens.splice(i, 1); tw.res(true); }
    }
    const H = this.current;
    if (!H) return;
    const R = H.radius, cfg = H.cfg;
    // world life
    if (H.items.ground && H.items.ground.userData.water) { const m = H.items.ground.material.map; m.offset.x = this.t * 0.012; m.offset.y = this.t * 0.007; }
    const I = H.items;
    if (I.lanterns) for (const l of I.lanterns) { l.position.y += l.userData.v * dt; l.position.x += Math.sin(this.t * 0.5 + l.userData.ph) * 0.004; if (l.position.y > l.userData.top) l.position.y = l.userData.bottom; }
    if (I.clouds) for (const c of I.clouds) { c.position.x += dt * 0.25; }
    if (I.sparkles) { I.sparkles.rotation.y += dt * 0.03; I.sparkles.material.opacity = 0.55 + Math.sin(this.t * 1.7) * 0.25; }
    if (H.deco) H.deco.update(dt);
    if (this.warm.intensity > 0) this.warm.intensity = this.light0.warm * (0.92 + Math.sin(this.t * 3.1) * 0.05 + Math.sin(this.t * 7.3) * 0.03);
    // the greeting in the sky: in the waiting room and during the intro
    if (this.sign) {
      const on = !!this.signText && !!H.cfg && H.theme.greeting != null && (this.mode === 'lobby' || this.introOn);
      this.signK += ((on ? 1 : 0) - this.signK) * Math.min(1, dt * 4);
      this.sign.visible = this.signK > 0.01;
      if (this.sign.visible) {
        this.sign.material.opacity = this.signK;
        const w = R * (this.signAt === 'front' && this.mode === 'lobby' ? 1.75 : 2.3) * (this.camK > 1 ? 1.05 : 1);
        this.sign.scale.set(w, w * this.signAspect, 1);
        if (this.signAt === 'front' && this.mode === 'lobby') {
          // standing in front of the hub, facing the camera
          const d = V(this.camera.position.x - H.group.position.x, 0, this.camera.position.z - H.group.position.z).normalize();
          this.sign.position.set(H.group.position.x + d.x * R * 1.05, R * 0.25 + Math.sin(this.t * 0.9) * 0.1, H.group.position.z + d.z * R * 1.05);
        } else this.sign.position.set(H.group.position.x, cfg.lookY + (cfg.signY ?? cfg.camDist * 0.27) + Math.sin(this.t * 0.9) * 0.15, H.group.position.z);
      }
    }
    if (cfg.floating) H.items.spin.position.y = Math.sin(this.t * 0.8) * R * 0.03;
    if (H.items.clipPlane) H.items.clipPlane.constant = -(H.items.clipY + H.items.spin.position.y); // the cut follows the hub when it hops
    // camera orbit
    this.orbit += dt * this.orbitSpeed;
    const dist = cfg.camDist * this.zoom * (this.camK || 1);
    const hgt = cfg.camHeight * this.zoom * (this.camK || 1) + this.camLift;
    // the fog follows the camera distance (the hub never disappears in the mist when the camera is far away)
    const fk = Math.max(1, this.zoom * (this.camK || 1) * (1 + this.camLift / Math.max(1, cfg.camHeight * 3)));
    if (this.fogFar) { this.fog.near = this.fogNear * fk; this.fog.far = this.fogFar * fk; }
    const look = V(0, cfg.lookY, 0).add(H.group.position);
    this.camera.position.set(Math.sin(this.orbit) * dist, hgt, Math.cos(this.orbit) * dist).add(H.group.position);
    if (this.shake > 0.001) { this.camera.position.x += (Math.random() - 0.5) * this.shake; this.camera.position.y += (Math.random() - 0.5) * this.shake; this.shake *= Math.pow(0.03, dt); }
    this.camera.lookAt(look);
    // the leader's avatar above the hub
    const M = this.mascot, ms = this.mascotState;
    if (M.visible) {
      const base = cfg.mascotY ?? cfg.lookY + 1;
      const fwd = R * 0.5; // towards the camera, in front of the buildings
      M.position.set(Math.sin(this.orbit) * fwd, base + Math.sin(this.t * 2.2) * 0.15 + ms.hop + (H.items.spin.position.y || 0), Math.cos(this.orbit) * fwd);
      M.position.x += Math.sin(this.t * 40) * ms.shake * 0.15;
      const sz = ms.size * (1 - ms.sad * 0.08);
      M.scale.set(sz, sz, 1);
      M.material.rotation = ms.spin + Math.sin(this.t * 1.6) * 0.06 + ms.sad * 0.25;
      M.material.color.setRGB(1 - ms.sad * 0.35, 1 - ms.sad * 0.35, 1 - ms.sad * 0.2);
      ms.shake = Math.max(0, ms.shake - dt * 0.8);
    }
  }

  tween(dur, fn, e = 'inOut') { return new Promise((res) => this.tweens.push({ t: 0, dur, fn, ease: typeof e === 'string' ? ease[e] : e, res })); }
  wait(sec) { return this.tween(sec, () => {}); }
  killTweens() { this.tweens.forEach((t) => { t.dead = true; }); }

  // bubbles (same look as the Halloween stage)
  say(text, getPos, dur = 2, cls = '') {
    const el = document.createElement('div');
    el.className = 'bubble ' + cls; el.textContent = text;
    this.overlay.appendChild(el);
    this.bubbles.push({ el, getPos, until: this.t + dur });
    this._updateBubbles();
  }
  _updateBubbles() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      if (this.t > b.until) { b.el.remove(); this.bubbles.splice(i, 1); continue; }
      const p = b.getPos().project(this.camera);
      b.el.style.transform = `translate(${(p.x * 0.5 + 0.5) * w}px, ${(-p.y * 0.5 + 0.5) * h}px) translate(-50%,-100%)`;
    }
  }
  clearBubbles() { this.bubbles.forEach((b) => b.el.remove()); this.bubbles = []; }
  mascotSay(text, dur = 1.6, cls = '') { if (this.mascot.visible) this.say(text, () => this.mascot.position.clone().add(V(0, this.mascotState.size * 0.55, 0)), dur, cls); }

  // ---------------------------------------------------------- game API (same as the Halloween Stage)
  setMode(mode) {
    this.mode = mode;
    const lobby = mode === 'lobby';
    this.mascot.visible = !lobby && mode !== 'final' && !!this.mascotUrl;   // the podium shows the winners
    this.orbitSpeed = lobby || mode === 'final' ? 0.06 : 0.03;
    this.zoom = lobby || mode === 'final' ? 1 : 0.86;
  }
  resetHall() { this.resetActors(); }
  resetActors() {
    this.seq++;
    this.killTweens();
    this.clearBubbles();
    const H = this.current;
    if (H) { H.items.spin.position.set(0, 0, 0); H.items.spin.rotation.set(0, 0, 0); H.items.spin.scale.set(1, 1, 1); }
    Object.assign(this.mascotState, { hop: 0, spin: 0, shake: 0, sad: 0 });
    this.hemi.intensity = this.light0.hemi; this.sun.intensity = this.light0.sun;
    this.camLift = 0;
  }

  /** ~5 s: swoop from the sky down to the hub */
  async playIntro(cb = {}) {
    this.resetActors();
    const my = ++this.seq;
    this.setMode('game');
    this.introOn = true;
    const z0 = this.zoom, a0 = this.orbit;
    this.mascot.visible = false;
    const deco = this.current && this.current.deco;
    const santa = deco && deco.santa ? deco.fly('intro') : null;   // Christmas: Santa's sleigh circles the tree
    await this.tween(3.2, (k) => { this.zoom = 2.6 - (2.6 - z0) * k; this.camLift = (1 - k) * 18; this.orbit = a0 + k * 1.1; }, 'inOut');
    if (my !== this.seq) { this.introOn = false; return; }
    cb.onHall && cb.onHall();
    cb.onBurst && cb.onBurst();
    await this._hop(0.9);
    if (santa) await Promise.race([santa, this.wait(4)]);
    this.introOn = false;
    if (my !== this.seq) return;
    this.mascot.visible = !!this.mascotUrl;
    await this.wait(0.8);
  }
  skipIntro() { this.resetActors(); this.introOn = false; this.setMode('game'); this.zoom = 0.86; this.camLift = 0; }

  /** ~2.4 s: swing around the hub to a new viewpoint for the next question */
  async walkTo(i, sfx = {}) {
    this.resetActors();
    const my = this.seq;
    this.setMode('game');
    sfx.whoosh && sfx.whoosh();
    const a0 = this.orbit, a1 = a0 + 1.25;
    await this.tween(2.0, (k, raw) => { this.orbit = a0 + (a1 - a0) * k; this.camLift = Math.sin(raw * Math.PI) * 3; }, 'inOut');
    if (my !== this.seq) return;
    this.mascotState.hop = 0;
    await this._hop(0.5);
  }
  skipWalk() { this.resetActors(); this.setMode('game'); }

  async _hop(dur = 0.7, height = 0.6) {
    const S = this.current.items.spin, R = this.current.radius;
    await this.tween(dur, (k, raw) => {
      const j = Math.sin(raw * Math.PI);
      S.position.y = j * R * 0.06 * height;
      S.scale.set(1 + Math.sin(raw * Math.PI * 2) * 0.03, 1 - Math.sin(raw * Math.PI * 2) * 0.03, 1 + Math.sin(raw * Math.PI * 2) * 0.03);
      this.mascotState.hop = j * 1.4 * height;
    }, 'linear');
    S.position.y = 0; S.scale.set(1, 1, 1); this.mascotState.hop = 0;
  }

  /** majority RIGHT: the hub jumps and spins, the leader celebrates */
  async gagBlocked() {
    this.resetActors();
    const my = this.seq;
    const S = this.current.items.spin;
    this.mascotSay(['Woohoo! 🎉', 'Nailed it! ✨', 'Yes!! 🙌'][Math.floor(Math.random() * 3)], 2, 'good');
    if (this.current.deco) this.current.deco.react(true);
    await Promise.all([
      this.tween(1.4, (k) => { S.rotation.y = k * Math.PI * 2; this.mascotState.spin = k * Math.PI * 2; }, 'inOut'),
      (async () => { await this._hop(0.6, 1.2); if (my === this.seq) await this._hop(0.5, 0.7); })(),
    ]);
    if (my !== this.seq) return;
    S.rotation.y = 0; this.mascotState.spin = 0;
  }

  /** majority WRONG: the hub shudders, the lights dim, the leader looks sad */
  async gagRetaliate() {
    this.resetActors();
    const my = this.seq;
    const S = this.current.items.spin;
    this.shake = 0.6;
    this.mascotState.shake = 1;
    this.mascotSay(['Oh no… 😵', 'Nooo! 😫', 'Oops… 😬'][Math.floor(Math.random() * 3)], 2, 'shout');
    if (this.current.deco) this.current.deco.react(false);
    const L = this.light0;
    await this.tween(1.1, (k, raw) => {
      S.rotation.z = Math.sin(raw * 40) * 0.025 * (1 - raw);
      this.hemi.intensity = L.hemi * (1 - Math.sin(raw * Math.PI) * 0.56);
      this.sun.intensity = L.sun * (1 - Math.sin(raw * Math.PI) * 0.64);
      this.mascotState.sad = Math.min(1, raw * 2);
    }, 'linear');
    if (my !== this.seq) return;
    S.rotation.z = 0;
    await this.tween(1.2, (k) => { this.mascotState.sad = 1 - k; });
  }
  celebrateLoop() { this.resetActors(); }
}

// ============================================================ textures
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function radialAlpha(inner = 0.55) {
  const t = canvasTex(256, 256, (g) => {
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, '#fff'); gr.addColorStop(inner, '#fff'); gr.addColorStop(1, '#000');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  });
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
function glowTexture(inner, outer) {
  return canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
}
function waterTexture() {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(160, 205, 255, 0.85)'; g.lineWidth = 2.2; g.lineJoin = 'round';
    for (let i = 0; i < 26; i++) { // stylised foam lines like the diorama's water
      const x = Math.random() * 256, y = Math.random() * 256, n = 3 + Math.floor(Math.random() * 3);
      g.beginPath(); g.moveTo(x, y);
      for (let k = 1; k <= n; k++) g.lineTo(x + Math.cos(k * 2.1 + i) * (10 + Math.random() * 18), y + Math.sin(k * 1.7 + i) * (6 + Math.random() * 12));
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function cloudTexture() {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = '#fff';
    for (const [x, y, r] of [[70, 80, 40], [120, 62, 52], [175, 78, 40], [100, 92, 34], [150, 92, 34], [210, 92, 26], [45, 96, 24]]) {
      const gr = g.createRadialGradient(x, y, r * 0.2, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  });
}
function lanternTexture() {
  return canvasTex(64, 80, (g) => {
    const gl = g.createRadialGradient(32, 42, 4, 32, 42, 34);
    gl.addColorStop(0, 'rgba(255,200,90,0.9)'); gl.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gl; g.fillRect(0, 0, 64, 80);
    g.fillStyle = '#e8262c'; g.beginPath(); g.ellipse(32, 42, 15, 19, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffd34d'; g.fillRect(24, 21, 16, 4); g.fillRect(24, 59, 16, 4);
    g.strokeStyle = 'rgba(255,210,80,0.8)'; g.lineWidth = 1.5;
    for (const dx of [-8, 0, 8]) { g.beginPath(); g.moveTo(32 + dx * 0.6, 25); g.quadraticCurveTo(32 + dx * 1.6, 42, 32 + dx * 0.6, 59); g.stroke(); }
    g.fillStyle = '#ffd34d'; g.fillRect(31, 63, 2, 10);
  });
}

export { THEMES };
