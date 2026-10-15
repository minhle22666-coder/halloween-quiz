// ============================================================
//  3D stage (three.js) — HOST big screen + a lighter version for PHONES
//  new Stage(el)              → big screen: house, gate, hallway
//  new Stage(el, {lite:true}) → phone: same scenes (intro included), lighter hallway + rendering
//  lobby  : orbit around the haunted house (outdoor diorama)
//  intro  : swoop + thunder → castle gate opens → enter the haunted hallway
//  hall   : the quiz happens here; the mascot floats deeper into the corridor
//           one station per question, spooky events, ghost gags on reveal
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { MASCOT } from './config.js';

const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};
const lerp = (a, b, t) => a + (b - a) * t;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const HALL_ORIGIN = V(300, 0, 0); // the hallway lives far away from the house
const SEG_LEN = 10;                // one hallway tile = 10 m
const EVENTS = ['flicker', 'painting', 'door', 'clock', 'blackout'];

export class Stage {
  constructor(container, opts = {}) {
    this.container = container;
    this.lite = !!opts.lite;
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.lite, powerPreference: this.lite ? 'default' : 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lite ? 1.6 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = 'stage-canvas';

    this.scene = new THREE.Scene();
    this.fogOut = new THREE.Fog(0x1b1033, 28, 140);
    this.fogHall = new THREE.Fog(0x050208, 5, 19);
    this.scene.fog = this.fogOut;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 600);
    this.camPos = V(0, 20, 60);
    this.camLook = V(0, 3, 0);
    this.shake = 0;
    this.flashLevel = 0;
    this.tweens = [];
    this.mixers = [];
    this.mode = 'lobby';
    this.seq = 0;
    this.clock = new THREE.Clock();
    this.t = 0;

    this.overlay = document.createElement('div');
    this.overlay.className = 'stage-overlay';
    this.overlay.innerHTML = '<div class="flash"></div><svg class="bolt" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline/><polyline class="core"/></svg>';
    container.appendChild(this.overlay);
    this.flashEl = this.overlay.querySelector('.flash');
    this.boltEl = this.overlay.querySelector('.bolt');
    this.bubbles = [];

    this._resize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      // tall phone screens: wider field of view so the ghost + mascot both fit
      this.portrait = w / h < 0.9;
      this.camera.fov = this.portrait ? 74 : 50;
      this.camera.updateProjectionMatrix();
    };
    new ResizeObserver(this._resize).observe(container);
    this._resize();
  }

  // ---------------------------------------------------------- loading
  async load(onProgress = () => {}, stationCount = 5) {
    const gltf = new GLTFLoader();
    const files = ['assets/models/halloween.glb', 'assets/models/door.glb', 'assets/models/ghost.glb',
      this.lite ? 'assets/models/hallway-lite.glb' : 'assets/models/hallway.glb'];
    let done = 0;
    const step = (x) => { done++; onProgress(done / files.length); return x; };
    const loaded = await Promise.all(files.map((f) => gltf.loadAsync(f).then(step)));
    for (const g of loaded) {
      const junk = [];
      g.scene.traverse((o) => { if (o.isLight || o.isCamera) junk.push(o); });
      junk.forEach((o) => o.parent && o.parent.remove(o));
    }
    const [house, door, ghost, hall] = loaded;
    this._buildSky();
    this._buildLights();
    this._buildHouse(house);
    this._buildGate(door);
    this._buildHall(hall, stationCount);
    this._buildMascot();
    this._buildGhost(ghost);
    this._buildFx();
    if (this.lite) {
      // phones start inside, at the hallway entrance (they have no lobby scene)
      this.setMode('hall');
      this.resetHall();
      this.camPos.copy(HALL_ORIGIN.clone().add(this.entrance).add(V(0.4, 0.5, 3.4)));
      this.camLook.copy(HALL_ORIGIN.clone().add(this.entrance).add(V(0, 0, -4)));
    } else {
      this.setMode('lobby');
    }
    this.renderer.setAnimationLoop(() => this._frame());
  }

  _buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { flash: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; uniform float flash;
        void main(){
          float h = vP.y;
          vec3 c = mix(vec3(0.17,0.07,0.30), vec3(0.04,0.02,0.10), smoothstep(0.05, 0.7, h));
          c = mix(vec3(0.55,0.20,0.32), c, smoothstep(-0.08, 0.22, h));
          c += flash * vec3(0.55,0.6,0.9);
          gl_FragColor = vec4(c,1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
    this.scene.add(this.sky);
    const n = 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.9 + 0.1), r = 380;
      pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xfff6dd, size: 1.4, fog: false, transparent: true, opacity: 0.85 }));
    this.scene.add(this.stars);
    const tl = new THREE.TextureLoader();
    const moonTex = tl.load('assets/img/moon.webp'); moonTex.colorSpace = THREE.SRGBColorSpace;
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false }));
    this.moon.scale.set(46, 44, 1);
    this.moon.position.set(-90, 120, -260);
    this.scene.add(this.moon);
    this.moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,236,170,0.55)', 'rgba(255,200,120,0)'), fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.moonGlow.scale.set(150, 150, 1);
    this.moonGlow.position.copy(this.moon.position).add(V(0, 0, 5));
    this.scene.add(this.moonGlow);
    const batTex = tl.load('assets/img/bats.webp'); batTex.colorSpace = THREE.SRGBColorSpace;
    this.bats = [0, 0.5].map((phase) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: batTex, fog: false, depthWrite: false, transparent: true }));
      s.scale.set(14, 20, 1); s.userData.phase = phase; this.scene.add(s); return s;
    });
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0x8f80e0, 0x2a1440, 0.55);
    this.moonLight = new THREE.DirectionalLight(0xb9c2ff, 0.85);
    this.moonLight.position.set(-30, 50, 30);
    this.warm = new THREE.PointLight(0xff9a3c, 6, 18, 1.4);
    this.scene.add(this.hemi, this.moonLight, this.warm);
    this.baseHemi = 0.55;
  }

  _buildHouse(gltf) {
    const root = gltf.scene;
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(V()), c = box.getCenter(V());
    const s = 26 / size.x;
    root.scale.setScalar(s);
    root.position.set(-c.x * s, -box.min.y * s, -c.z * s);
    root.traverse((o) => {
      if (o.isMesh && /pupmpkin_0|lamp_body/.test(o.name)) { o.material.emissive = new THREE.Color(0xff6a00); o.material.emissiveIntensity = 0.35; }
    });
    this.scene.add(root);
    this.house = root;
    root.updateMatrixWorld(true);
    let doorMesh = null;
    root.traverse((o) => { if (o.isMesh && /^door_/.test(o.name) && !doorMesh) doorMesh = o; });
    this.houseDoor = new THREE.Box3().setFromObject(doorMesh || root).getCenter(V());
    this.houseCenter = new THREE.Box3().setFromObject(root).getCenter(V());
    this.warm.position.copy(this.houseDoor).add(V(0, 1.5, 2.5));
  }

  _buildGate(doorGltf) {
    const g = new THREE.Group();
    g.position.set(0, 0, 220);
    const door = skeletonClone(doorGltf.scene);
    const box = new THREE.Box3().setFromObject(door);
    const s = 6 / (box.max.y - box.min.y);
    door.scale.setScalar(s);
    door.position.y = -box.min.y * s;
    door.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material = o.material.clone();
      if (/Cube004|Cube003/.test(o.name)) { m.map = null; m.color.set(0x3b3150); } else m.color.multiplyScalar(0.55);
    });
    g.add(door);
    const stone = new THREE.MeshStandardMaterial({ color: 0x3b3150, roughness: 0.95 });
    const dw = (box.max.x - box.min.x) * s, dh = 6, half = dw / 2 - 0.05;
    const wallL = new THREE.Mesh(new THREE.BoxGeometry(14, 16, 1.8), stone); wallL.position.set(-half - 7, 8, 0);
    const wallR = wallL.clone(); wallR.position.x = half + 7;
    const top = new THREE.Mesh(new THREE.BoxGeometry(dw + 0.2, 16 - dh, 1.8), stone); top.position.set(0, dh + (16 - dh) / 2, 0);
    g.add(wallL, wallR, top);
    for (let i = -4; i <= 4; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 1.8), stone);
      m.position.set(i * 4, 16.8, 0); g.add(m);
    }
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(5, 7), new THREE.MeshBasicMaterial({ color: 0xffe7a8, fog: false }));
    glow.position.set(0, 3, -2.2); g.add(glow);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 40), new THREE.MeshStandardMaterial({ color: 0x20152e, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; g.add(floor);
    this.torches = [-3.1, 3.1].map((x) => {
      const l = new THREE.PointLight(0xff7a2a, 18, 12, 1.5);
      l.position.set(x, 4.2, 1.2); g.add(l);
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,220,120,1)', 'rgba(255,90,0,0)'), blending: THREE.AdditiveBlending, depthWrite: false }));
      f.scale.set(0.9, 1.3, 1); f.position.copy(l.position); g.add(f);
      return { l, f };
    });
    this.scene.add(g);
    this.gate = g;
    const mixer = new THREE.AnimationMixer(door);
    this.mixers.push(mixer);
    const actions = doorGltf.animations.map((c) => { const a = mixer.clipAction(c); a.play(); a.paused = true; return a; });
    this.gateDoor = { set: (k) => { actions.forEach((a) => { a.time = Math.max(0, Math.min(a.getClip().duration - 1e-4, k * a.getClip().duration)); }); mixer.update(0); } };
    this.gateDoor.set(0);
  }

  // ---------------------------------------------------------- the hallway
  _buildHall(gltf, stationCount) {
    const H = new THREE.Group();
    H.position.copy(HALL_ORIGIN);
    this.scene.add(H);
    this.hall = H;
    const tiles = Math.max(3, Math.ceil((stationCount * 5 + 8) / SEG_LEN));
    this.props = { doors: [], paintings: [], vases: [], clocks: [], lamps: [] };
    const pristine = gltf.scene; // never modified: every tile is a fresh clone
    this.tiles = [];
    const black = new THREE.MeshBasicMaterial({ color: 0x020104, side: THREE.BackSide });

    for (let k = 0; k < tiles; k++) {
      for (const side of ['A', 'B']) {
        const seg = pristine.clone(true);
        const holder = new THREE.Group();
        holder.position.z = -k * SEG_LEN;
        if (side === 'B') holder.rotation.y = Math.PI; // mirrored wall on the other side
        holder.add(seg);
        H.add(holder);
        this.tiles.push({ holder, z: -k * SEG_LEN });
        const hide = (name) => { const o = seg.getObjectByName(name); if (o) o.visible = false; };
        if (side === 'B') { hide('floor'); hide('carpet'); if (k > 0) { hide('arch'); hide('wall2'); } }
        if (side === 'A' && k % 3 === 1) hide('Clock');
        if (side === 'B' && k % 3 === 2) { hide('table'); hide('Vase'); }
        H.updateMatrixWorld(true);
        const dir = side === 'A' ? -1 : 1; // which wall (x sign) this tile's props are on
        const toH = (v) => H.worldToLocal(v.clone());
        const boxOf = (name) => { const o = seg.getObjectByName(name); return o && o.visible ? new THREE.Box3().setFromObject(o) : null; };
        // door: hinge pivot so we can swing it
        const dBox = boxOf('door');
        if (dBox) {
          const leaf = seg.getObjectByName('door'), handle = seg.getObjectByName('door_hand');
          const hingeW = V((dBox.min.x + dBox.max.x) / 2, dBox.min.y, side === 'A' ? dBox.min.z : dBox.max.z);
          const pivot = new THREE.Group();
          pivot.position.copy(holder.worldToLocal(hingeW.clone()));
          holder.add(pivot); pivot.updateMatrixWorld(true);
          pivot.attach(leaf); if (handle) pivot.attach(handle);
          // pitch-black room behind the door
          const room = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.7, 1.5), black);
          room.position.set(-2.32, 1.3, 0); holder.add(room);
          const c = toH(dBox.getCenter(V()));
          this.props.doors.push({ pivot, z: c.z, x: c.x, dir, side });
        }
        const pBox = boxOf('Paint');
        if (pBox) {
          const paint = seg.getObjectByName('Paint');
          const top = V((pBox.min.x + pBox.max.x) / 2, pBox.max.y, (pBox.min.z + pBox.max.z) / 2);
          const pivot = new THREE.Group();
          pivot.position.copy(holder.worldToLocal(top.clone()));
          holder.add(pivot); pivot.updateMatrixWorld(true);
          pivot.attach(paint);
          const eyes = makePortraitEyes();
          eyes.position.set(0.03, -0.33, -0.085); // face of the lady (pivot-local, x = off the canvas)
          pivot.add(eyes);
          const c = toH(pBox.getCenter(V()));
          this.props.paintings.push({ pivot, eyes, z: c.z, x: c.x, y: c.y, dir });
        }
        const vBox = boxOf('Vase');
        if (vBox) {
          const vase = seg.getObjectByName('Vase');
          const bottom = V((vBox.min.x + vBox.max.x) / 2, vBox.min.y, (vBox.min.z + vBox.max.z) / 2);
          const pivot = new THREE.Group();
          pivot.position.copy(holder.worldToLocal(bottom.clone()));
          holder.add(pivot); pivot.updateMatrixWorld(true);
          pivot.attach(vase);
          this.props.vases.push({ pivot, z: toH(bottom).z, dir });
        }
        const cBox = boxOf('Clock');
        if (cBox) {
          const clock = seg.getObjectByName('Clock');
          this.props.clocks.push({ obj: clock, base: clock.position.clone(), z: toH(cBox.getCenter(V())).z, dir });
        }
        for (const ln of ['lamp_top', 'lamp_top1']) {
          const b = boxOf(ln);
          if (!b) continue;
          const p = toH(b.getCenter(V()));
          p.x += dir * -0.08; p.y -= 0.12;
          const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,200,120,0.95)', 'rgba(255,120,30,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
          glow.position.copy(p); glow.scale.set(0.38, 0.38, 1);
          H.add(glow);
          this.props.lamps.push({ p, glow, phase: Math.random() * 10 });
        }
      }
    }
    // ceiling + dark end of the corridor
    const dark = new THREE.MeshStandardMaterial({ color: 0x120a1a, roughness: 1 });
    const len = tiles * SEG_LEN + 2;
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, len), dark);
    ceil.position.set(0, 3.52, 5 - len / 2 + 1);
    const end = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.6, 0.1), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    end.position.set(0, 1.75, 5 - tiles * SEG_LEN - 0.6);
    H.add(ceil, end);
    // stone facade around the entrance arch
    const stone = new THREE.MeshStandardMaterial({ color: 0x2c2238, roughness: 1 });
    for (const [w, h, x, y] of [[6, 9, -4.7, 4.5], [6, 9, 4.7, 4.5], [3.4, 5, 0, 6]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), stone);
      b.position.set(x, y, 5.25); H.add(b);
    }
    // red eyes at the far end (blackout event)
    this.endEyes = makeGlowEyes(0xff2020);
    this.endEyes.position.set(0, 1.6, end.position.z + 2.5);
    this.endEyes.visible = false;
    H.add(this.endEyes);

    // 4 real lamp lights, moved to the lamps around the current station
    this.lampLights = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(0xffb066, 3.5, 7, 1.5); H.add(l); return l; });
    this.lampLevel = 1;       // 0..1 global (blackout)
    this.flicker = 0;         // seconds of heavy flicker left

    // stations: where the mascot stops for each question
    this.stations = [];
    for (let i = 0; i < stationCount; i++) {
      const z = 1.2 - i * 5;
      this.stations.push({ i, z, event: EVENTS[i % EVENTS.length] });
    }
    this.entrance = V(0, 1.25, 7.5);
  }

  _buildMascot() {
    // Placeholder mascot: a floating 2D sprite (swap for a 3D model later — see MASCOT in config.js)
    this._mascotUrl = MASCOT.sprite;
    const tex = new THREE.TextureLoader().load(MASCOT.sprite);
    tex.colorSpace = THREE.SRGBColorSpace;
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(MASCOT.size, MASCOT.size, 1);
    body.add(sprite);
    const candle = new THREE.PointLight(0xffb36b, 1.6, 4.5, 1.5);
    candle.position.set(0.35, 0.1, 0.4);
    root.add(candle);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    this.hall.add(root, shadow);
    this.mascot = {
      root, body, sprite, shadow, candle,
      pos: this.entrance.clone(), // hallway-local
      shiver: 0, spin: 0, tilt: 0, squash: 0, hop: 0, red: 0, fallen: 0, busy: false,
    };
  }

  /** swap the floating 2D mascot image (null = default) */
  setMascotSprite(url) {
    url = url || MASCOT.sprite;
    if (this._mascotUrl === url) return;
    this._mascotUrl = url;
    new THREE.TextureLoader().load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = this.mascot.sprite.material;
      if (m.map && m.map !== tex) m.map.dispose();
      m.map = tex; m.needsUpdate = true;
    });
  }

  _buildGhost(gltf) {
    const ghost = gltf.scene;
    const gb = new THREE.Box3().setFromObject(ghost);
    const gs = 1.05 / (gb.max.y - gb.min.y);
    ghost.scale.setScalar(gs);
    ghost.position.y = -gb.min.y * gs - 0.5; // pivot ≈ middle of the ghost
    const inner = new THREE.Group();
    inner.add(ghost);
    const sizer = new THREE.Group(); // smaller ghost on tall phone screens
    sizer.add(inner);
    const root = new THREE.Group();
    root.add(sizer);
    root.visible = false;
    this.hall.add(root);
    const mats = [];
    ghost.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      if (o.material.transparent || o.material.opacity < 1) {
        o.material.color.set(0xe4ddff); o.material.opacity = Math.max(o.material.opacity, 0.62);
        o.material.emissive = new THREE.Color(0x6a58e0); o.material.emissiveIntensity = 0.7; o.material.depthWrite = false;
      }
      o.material.transparent = true;
      mats.push({ m: o.material, base: o.material.opacity });
    });
    const mixer = new THREE.AnimationMixer(ghost);
    if (gltf.animations[0]) mixer.clipAction(gltf.animations[0]).play();
    this.mixers.push(mixer);
    const glow = new THREE.PointLight(0x9d8bff, 0, 3.5, 1.5);
    root.add(glow);
    this.ghost = { root, inner, sizer, mats, glow };
  }

  _buildFx() {
    // magic rune shield
    const shield = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: runeTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    shield.visible = false;
    this.hall.add(shield);
    // swirling vortex
    const vortex = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ map: vortexTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    vortex.visible = false;
    this.hall.add(vortex);
    // dizzy stars
    const dizzy = new THREE.Group();
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), starMat);
      s.userData.a = (i / 4) * Math.PI * 2; dizzy.add(s);
    }
    dizzy.visible = false;
    this.hall.add(dizzy);
    // sparkles
    const n = 90;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const sparkles = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd76a, size: 0.06, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    sparkles.userData.v = new Float32Array(n * 3);
    sparkles.frustumCulled = false;
    this.hall.add(sparkles);
    this.fx = { shield, vortex, dizzy, sparkles };
  }

  // ---------------------------------------------------------- frame loop
  _frame() {
    if (this.paused) return;
    this._update(Math.min(this.clock.getDelta(), 0.05));
    this.renderer.render(this.scene, this.camera);
    this._updateBubbles();
  }
  advance(sec, step = 1 / 30) { // dev helper for screenshots
    for (let t = 0; t < sec; t += step) this._update(step);
    this.renderer.render(this.scene, this.camera);
    this._updateBubbles();
  }

  _update(dt) {
    this.t += dt;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      if (tw.dead) { this.tweens.splice(i, 1); tw.res(false); continue; }
      tw.t += dt;
      const p = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.ease(p), p);
      if (p >= 1) { this.tweens.splice(i, 1); tw.res(true); }
    }
    for (const m of this.mixers) m.update(dt);

    if (this.flashLevel > 0) this.flashLevel = Math.max(0, this.flashLevel - dt * 3.2);
    const inHall = this.mode === 'hall' || this.mode === 'intro-hall';
    this.hemi.intensity = (inHall ? 0.32 * Math.max(0.15, this.lampLevel) : this.baseHemi) + this.flashLevel * (inHall ? 2.5 : 7);
    if (this.sky) this.sky.material.uniforms.flash.value = this.flashLevel * 0.6;

    if (!inHall) {
      for (const b of this.bats) {
        const p = ((this.t * 0.02 + b.userData.phase) % 1);
        b.position.set(lerp(-220, 60, p), 70 + Math.sin(p * 9) * 8, -230);
        b.material.opacity = Math.sin(p * Math.PI) * 0.9;
      }
      for (const tch of this.torches) {
        const f = 0.85 + Math.sin(this.t * 13 + tch.l.position.x) * 0.1 + Math.random() * 0.08;
        tch.l.intensity = 18 * f; tch.f.scale.set(0.9 * f, 1.3 * f, 1);
      }
    } else if (inHall) {
      this._updateHall(dt);
    }

    // camera
    if ((this.mode === 'lobby' || this.mode === 'final') && this.houseCenter) {
      const a = this.t * 0.05, c = this.houseCenter;
      this.camPos.set(c.x + Math.sin(a) * 34, c.y + 9 + Math.sin(this.t * 0.2) * 1.5, c.z + Math.cos(a) * 34);
      this.camLook.copy(c).add(V(0, 1, 0));
    } else if (inHall && !this.camLocked) {
      const m = this.mascot.pos;
      const o = this.camOverride;
      const tp = o ? o.pos.clone().add(HALL_ORIGIN)
        : (this.portrait ? V(m.x * 0.4 + 0.1, 1.72, m.z + 3.1) : V(m.x * 0.5 + 0.2, 1.75, m.z + 2.7)).add(HALL_ORIGIN);
      const tl = o ? o.look.clone().add(HALL_ORIGIN)
        : (this.portrait ? V(m.x - 0.05, 1.2, m.z - 2.2) : V(m.x - 0.12, 1.25, m.z - 2.2)).add(HALL_ORIGIN).add(this.lookBias || V());
      const k = 1 - Math.pow(0.02, dt);
      this.camPos.lerp(tp, k); this.camLook.lerp(tl, k);
    }
    this.camera.position.copy(this.camPos);
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.pow(0.02, dt);
    }
    this.camera.lookAt(this.camLook);
  }

  _updateHall(dt) {
    // only draw the hallway tiles near the camera (big win on phones)
    const cz = this.camPos.z - HALL_ORIGIN.z;
    for (const t of this.tiles) t.holder.visible = t.z - SEG_LEN / 2 < cz + 4 && t.z + SEG_LEN / 2 > cz - 24;
    // lamps
    if (this.flicker > 0) this.flicker = Math.max(0, this.flicker - dt);
    const heavy = this.flicker > 0;
    const level = this.lampLevel;
    const f = heavy ? (Math.random() < 0.45 ? 0.04 : 1.2) : 0.92 + Math.sin(this.t * 17) * 0.05 + Math.random() * 0.05;
    for (const l of this.lampLights) l.intensity = 3.5 * f * level;
    for (const lp of this.props.lamps) {
      const ff = heavy ? f : 0.9 + Math.sin(this.t * 11 + lp.phase) * 0.08;
      lp.glow.material.opacity = Math.min(0.8, ff * level * 0.8);
    }
    // mascot
    const M = this.mascot;
    // calm float; a short smooth tremble only right after a scare (decays by itself)
    M.shiver = Math.max(0, M.shiver - dt * 0.9);
    const bob = M.fallen ? 0 : (M.walking ? Math.abs(Math.sin(this.t * 6)) * 0.06 : Math.sin(this.t * 2.4) * 0.06);
    M.root.position.copy(M.pos).add(V(0, bob + M.hop, 0));
    M.body.position.set(Math.sin(this.t * 36) * M.shiver * 0.018, 0, 0);
    M.sprite.material.rotation = M.tilt + M.spin + (M.fallen ? 0 : Math.sin(this.t * (M.walking ? 6 : 1.7)) * (M.walking ? 0.07 : 0.05)) + Math.sin(this.t * 29) * M.shiver * 0.04;
    const sq = M.squash;
    M.sprite.scale.set(MASCOT.size * (1 + sq), MASCOT.size * (1 - sq), 1);
    M.sprite.material.color.setRGB(1, 1 - M.red * 0.6, 1 - M.red * 0.6);
    M.shadow.position.set(M.pos.x, 0.03, M.pos.z);
    const hgt = Math.max(0.2, M.root.position.y);
    M.shadow.scale.setScalar(1.2 - Math.min(0.6, hgt * 0.3));
    M.shadow.material.opacity = 0.9 - Math.min(0.5, hgt * 0.25);
    M.candle.intensity = 1.6 * (0.85 + Math.sin(this.t * 20) * 0.08 + Math.random() * 0.07);
    // portraits' eyes follow the mascot
    const mw = M.root.getWorldPosition(V());
    for (const p of this.props.paintings) {
      const e = p.eyes;
      if (!e.visible) continue;
      const ew = e.getWorldPosition(V());
      const d = mw.clone().sub(ew).normalize();
      // convert to pivot-local to move pupils sideways (z) and up/down (y)
      const local = d.clone().applyQuaternion(e.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
      for (const pu of e.userData.pupils) { pu.position.z = pu.userData.z0 + THREE.MathUtils.clamp(local.z, -1, 1) * 0.012; pu.position.y = THREE.MathUtils.clamp(local.y, -1, 1) * 0.008; }
    }
    this.endEyes.children.forEach((c) => { c.scale.y = (Math.sin(this.t * 1.3) > 0.97) ? 0.1 : 1; });
    // dizzy stars
    if (this.fx.dizzy.visible) this.fx.dizzy.children.forEach((s) => { const a = s.userData.a + this.t * 6; s.position.set(Math.cos(a) * 0.28, Math.sin(this.t * 20) * 0.02, Math.sin(a) * 0.28); });
    // ghost glow + size
    this.ghost.glow.intensity = this.ghost.root.visible ? 1.8 : 0;
    this.ghost.sizer.scale.setScalar(this._gk());
  }

  // ---------------------------------------------------------- helpers
  tween(dur, fn, e = ease.inOut) {
    return new Promise((res) => this.tweens.push({ t: 0, dur, fn, ease: typeof e === 'string' ? ease[e] : e, res }));
  }
  wait(sec) { return this.tween(sec, () => {}); }
  killTweens() { this.tweens.forEach((t) => { t.dead = true; }); }

  flash(power = 1) {
    this.flashLevel = Math.max(this.flashLevel, power);
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = String(0.85 * power);
    requestAnimationFrame(() => { this.flashEl.style.transition = 'opacity .5s ease-out'; this.flashEl.style.opacity = '0'; });
    const pts = []; let x = 20 + Math.random() * 60, y = -2;
    pts.push([x, y]);
    while (y < 70 + Math.random() * 25) { x += (Math.random() - 0.5) * 12; y += 4 + Math.random() * 8; pts.push([x, y]); }
    const str = pts.map((p) => p.join(',')).join(' ');
    this.boltEl.querySelectorAll('polyline').forEach((pl) => pl.setAttribute('points', str));
    this.boltEl.style.opacity = '1';
    setTimeout(() => { this.boltEl.style.opacity = '0'; }, 90);
    setTimeout(() => { this.boltEl.style.opacity = '1'; }, 150);
    setTimeout(() => { this.boltEl.style.opacity = '0'; }, 260);
  }

  say(text, getPos, dur = 2, cls = '') {
    const el = document.createElement('div');
    el.className = 'bubble ' + cls;
    el.textContent = text;
    this.overlay.appendChild(el);
    const b = { el, getPos, until: this.t + dur };
    this.bubbles.push(b);
    this._updateBubbles();
    return b;
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
  wpos(obj, off = V(0, 0, 0)) { return () => obj.localToWorld(off.clone()); }
  mascotSay(text, dur = 1.6, cls = '') { return this.say(text, this.wpos(this.mascot.root, V(0, 0.55, 0)), dur, cls); }

  // ---------------------------------------------------------- modes
  setMode(mode) {
    this.mode = mode;
    this.camLocked = false;
    const inHall = mode === 'hall' || mode === 'intro-hall';
    this.hall.visible = inHall;
    this.gate.visible = mode === 'intro-gate';
    this.house.visible = !inHall && mode !== 'intro-gate';
    this.sky.visible = this.stars.visible = this.moon.visible = this.moonGlow.visible = !inHall;
    this.moonLight.visible = this.warm.visible = !inHall;
    this.scene.fog = inHall ? this.fogHall : this.fogOut;
    this.hemi.color.set(inHall ? 0x7a6fb0 : 0x8f80e0);
  }

  /** put the mascot back at the hallway entrance (new game / restart) */
  resetHall() {
    this.resetActors();
    this.mascot.pos.copy(this.entrance);
    this.lookBias = null;
    this._placeLamps(this.entrance.z - 3);
    this.props.paintings.forEach((p) => { p.pivot.rotation.set(0, 0, 0); });
    this.props.vases.forEach((v) => { v.pivot.rotation.set(0, 0, 0); v.pivot.visible = true; });
    this.props.doors.forEach((d) => { d.pivot.rotation.set(0, 0, 0); });
    this.lampLevel = 1;
  }

  _placeLamps(z) {
    const near = [...this.props.lamps].sort((a, b) => Math.abs(a.p.z - z) - Math.abs(b.p.z - z)).slice(0, 4);
    near.forEach((lp, i) => this.lampLights[i].position.copy(lp.p));
  }

  // ---------------------------------------------------------- intro
  async playIntro(cb = {}) {
    let my = ++this.seq;
    this.setMode('intro');
    const c = this.houseCenter, d = this.houseDoor;
    const p0 = V(c.x - 30, c.y + 30, c.z + 70), l0 = V(-40, 40, -100);
    const p1 = V(d.x + 2, d.y + 3, d.z + 16), l1 = d.clone().add(V(0, 1, 0));
    this.camPos.copy(p0); this.camLook.copy(l0);
    await this.tween(3.0, (k) => { this.camPos.lerpVectors(p0, p1, k); this.camLook.lerpVectors(l0, l1, k); });
    if (my !== this.seq) return;
    this.flash(1); this.shake = 0.9; cb.onThunder && cb.onThunder(1);
    await this.wait(0.35);
    this.flash(0.7); cb.onLaugh && cb.onLaugh();
    const p2 = V(d.x, d.y + 1.2, d.z + 7);
    await this.tween(1.5, (k) => { this.camPos.lerpVectors(p1, p2, k); });
    this.flash(1); this.shake = 1.2; cb.onThunder && cb.onThunder(1.2);
    await this.wait(0.25);
    if (my !== this.seq) return;
    // castle gate
    this.setMode('intro-gate');
    const G = this.gate.position;
    const g0 = V(G.x, G.y + 4.5, G.z + 22), g1 = V(G.x, G.y + 3.2, G.z + 9), g2 = V(G.x, G.y + 3, G.z - 1.5);
    this.camPos.copy(g0); this.camLook.set(G.x, G.y + 3, G.z);
    this.gateDoor.set(0);
    await this.tween(2.0, (k) => this.camPos.lerpVectors(g0, g1, k), 'out');
    cb.onDoor && cb.onDoor();
    this.flash(0.5); this.shake = 0.3;
    await this.tween(1.6, (k) => this.gateDoor.set(k), 'inOut');
    this.flashEl.style.transition = 'opacity .5s ease-in';
    this.flashEl.classList.add('warm');
    this.flashEl.style.opacity = '1';
    await this.tween(0.6, (k) => this.camPos.lerpVectors(g1, g2, k), 'in');
    if (my !== this.seq) return;
    // into the haunted hallway: the mascot floats in nervously
    this.setMode('intro-hall');
    this.resetHall();                  // (bumps this.seq)
    my = ++this.seq;
    cb.onHall && cb.onHall();          // inside the house now (in-game music starts here)
    const M = this.mascot;
    M.pos.set(0.2, 1.3, this.entrance.z + 3.5);
    this.camLocked = true;
    const e = HALL_ORIGIN.clone().add(this.entrance);
    const c0 = e.clone().add(V(0.9, 0.6, 5.5)), c1 = e.clone().add(V(0.55, 0.5, 2.8));
    this.camPos.copy(c0); this.camLook.copy(e.clone().add(V(0, 0, -4)));
    this.flashEl.style.transition = 'opacity .7s ease-out';
    this.flashEl.style.opacity = '0';
    setTimeout(() => this.flashEl.classList.remove('warm'), 800);
    const m0 = M.pos.clone();
    await this.tween(2.2, (k) => { M.pos.lerpVectors(m0, this.entrance, k); this.camPos.lerpVectors(c0, c1, k); }, 'inOut');
    if (my !== this.seq) return;
    this.startle();
    this.mascotSay('G-gulp… 😰', 1.6);
    this.flicker = 0.5; cb.onFlicker && cb.onFlicker();
    await this.wait(1.2);
    this.setMode('hall');
  }

  skipIntro() {
    this.seq++; this.killTweens();
    this.setMode('hall'); this.resetHall();
    this.flashEl.style.opacity = '0'; this.flashEl.classList.remove('warm');
    this.camPos.copy(HALL_ORIGIN.clone().add(this.entrance).add(V(0.55, 0.5, 2.8)));
  }

  // ---------------------------------------------------------- actors
  resetActors() {
    this.seq++;
    this.killTweens();
    this.clearBubbles();
    const M = this.mascot;
    Object.assign(M, { shiver: 0, spin: 0, tilt: 0, squash: 0, hop: 0, red: 0, fallen: 0, walking: false });
    M.pos.y = 1.3;
    this.ghost.root.visible = false;
    this.ghost.root.scale.setScalar(1);
    this.ghost.inner.rotation.set(0, 0, 0); this.ghost.inner.scale.set(1, 1, 1);
    this.setGhostOpacity(1);
    this.fx.shield.visible = false; this.fx.vortex.visible = false; this.fx.dizzy.visible = false;
    this.fx.sparkles.material.opacity = 0;
    this.endEyes.visible = false;
    this.lampLevel = 1;
    this.lookBias = null;
    this.camOverride = null;
    this.camLocked = false;
  }
  setGhostOpacity(a) { this.ghost.mats.forEach(({ m, base }) => { m.opacity = base * a; }); }

  _nearest(list, z, ahead = 3, behind = 1.6) {
    let best = null, bd = 1e9;
    for (const p of list) {
      const dz = z - p.z; // >0 = prop is ahead (corridor runs towards -z)
      if (dz > ahead || dz < -behind) continue;
      if (Math.abs(dz) < bd) { bd = Math.abs(dz); best = p; }
    }
    return best;
  }

  /** float the mascot to the station of question i and play its spooky event (~4 s) */
  async walkTo(i, sfx = {}) {
    this.setMode('hall');
    this.resetActors();
    const my = this.seq;
    const st = this.stations[Math.min(i, this.stations.length - 1)];
    const M = this.mascot;
    const from = M.pos.clone(), to = V(Math.sin(i * 1.7) * 0.25, 1.3, st.z);
    this._placeLamps(st.z - 1);
    sfx.whoosh && sfx.whoosh();
    M.walking = true;
    await this.tween(2.3, (k, raw) => { M.pos.lerpVectors(from, to, k); M.tilt = Math.sin(raw * Math.PI) * -0.08; }, 'inOut');
    M.walking = false;
    if (my !== this.seq) return;
    M.tilt = 0;
    await this._event(st, my, sfx);
    if (my !== this.seq) return;
    this.lookBias = null;
  }

  /** jump straight to station i (skip button / host refresh) */
  skipWalk(i) {
    this.setMode('hall');
    this.resetActors();
    const st = this.stations[Math.max(0, Math.min(i, this.stations.length - 1))];
    this.mascot.pos.set(0, 1.3, st.z);
    this._placeLamps(st.z - 1);
  }

  async _event(st, my, sfx) {
    const M = this.mascot;
    const ev = st.event;
    if (ev === 'painting') {
      const p = this._nearest(this.props.paintings, st.z, 3, 2.5);
      if (p) {
        this.lookBias = V(p.x * 0.55, 0.5, (p.z - st.z) * 0.6 + 1.0);
        sfx.creak && sfx.creak();
        p.eyes.userData.glow.visible = true;
        await this.tween(1.1, (k, raw) => { p.pivot.rotation.x = Math.sin(raw * Math.PI * 3) * (1 - raw) * 0.35 + 0.22 * raw * p.dir; }, 'linear');
        this.startle();
        this.mascotSay('Did… did she just look at me?! 😨', 1.8);
        await this.wait(1.0);
        p.eyes.userData.glow.visible = false;
        return;
      }
    }
    if (ev === 'door') {
      const d = this._nearest(this.props.doors, st.z, 3, 1.5);
      if (d) {
        this.lookBias = V(d.x * 0.45, 0.1, (d.z - st.z) * 0.6 + 0.8);
        this.startle();
        for (let n = 0; n < 3; n++) {
          sfx.knock && sfx.knock();
          await this.tween(0.32, (k, raw) => { d.pivot.rotation.y = Math.sin(raw * Math.PI) * 0.12; }, 'linear');
          if (my !== this.seq) return;
        }
        this.mascotSay('W-who’s there?! 🚪', 1.6);
        await this.wait(1.0);
        return;
      }
    }
    if (ev === 'clock') {
      const c = this._nearest(this.props.clocks, st.z, 3, 2);
      if (c) {
        this.lookBias = V(c.dir * 0.6, 0.3, (c.z - st.z) * 0.6 + 0.8);
        sfx.bell && sfx.bell();
        await this.tween(1.3, (k, raw) => { c.obj.position.x = c.base.x + Math.sin(raw * 60) * 4 * (1 - raw); }, 'linear');
        c.obj.position.copy(c.base);
        this.startle();
        this.mascotSay('Midnight already?! 🕛', 1.6);
        await this.wait(0.8);
        return;
      }
    }
    if (ev === 'blackout') {
      sfx.buzz && sfx.buzz();
      this.flicker = 0.5;
      await this.wait(0.5);
      this.lampLevel = 0.02;
      this.endEyes.position.set(st.i % 2 ? 0.8 : -0.8, 1.6, st.z - 4.2);
      this.endEyes.scale.setScalar(1.6);
      this.endEyes.visible = true;
      this.lookBias = V(0, 0.4, -1.5);
      this.startle();
      this.mascotSay('I-it’s so dark… 👀', 1.6);
      await this.wait(1.6);
      this.endEyes.visible = false;
      this.flicker = 0.35;
      this.lampLevel = 1;
      sfx.buzz && sfx.buzz();
      await this.wait(0.4);
      return;
    }
    // default: flickering lamps
    sfx.buzz && sfx.buzz();
    this.flicker = 1.3;
    this.startle();
    this.mascotSay('Eek! The lights! 😨', 1.6);
    const vase = this._nearest(this.props.vases, st.z, 2.5, 1.5);
    if (vase) this.tween(1.2, (k, raw) => { vase.pivot.rotation.z = Math.sin(raw * 30) * 0.12 * (1 - raw); }, 'linear');
    await this.wait(1.6);
  }

  /** one quick jump + a short tremble that fades out */
  startle() {
    const M = this.mascot;
    M.shiver = 0.8;
    if (this.onStartle) this.onStartle();
    this.tween(0.45, (k, raw) => { M.hop = Math.sin(raw * Math.PI) * 0.18; M.squash = Math.sin(raw * Math.PI * 2) * 0.06; }, 'linear').then(() => { M.hop = 0; M.squash = 0; });
  }

  _gk() { return this.portrait ? 0.6 : 1; }

  // where does the ghost come from at this station?
  _spawn(st) {
    const d = this._nearest(this.props.doors, st.z, 2.8, 1.2);
    let sp;
    if (d) sp = { type: 'door', ref: d, side: d.dir, pos: V(d.x - d.dir * 0.9, 1.35, d.z) };
    else {
      const p = this._nearest(this.props.paintings, st.z, 3, 2.5);
      if (p) sp = { type: 'paint', ref: p, side: p.dir, pos: V(p.x - p.dir * 0.05, p.y, p.z) };
      else { const side = st.i % 2 ? 1 : -1; sp = { type: 'wall', side, pos: V(side * 1.7, 1.4, st.z - 1.2) }; }
    }
    // the ghost ends up beside the mascot (a bit ahead), the camera frames both
    sp.out = V(sp.side * 0.85, 1.42, st.z - 0.7);
    return sp;
  }
  _frameGag(st, sp) {
    const M = this.mascot;
    M.pos.x = -sp.side * 0.15;
    this._placeLamps(st.z - 0.5);
    this.camOverride = this.portrait
      ? { pos: V(sp.side * 0.3, 1.62, st.z + 3.3), look: V(sp.side * 0.3, 1.22, st.z - 0.5) }
      : { pos: V(-sp.side * 0.4, 1.72, st.z + 2.5), look: V(sp.side * 0.3, 1.3, st.z - 0.5) };
  }

  async _ghostAppear(sp, my, sfx) {
    const G = this.ghost.root;
    G.visible = true;
    G.position.copy(sp.pos);
    G.rotation.set(0, sp.pos.x < 0 ? Math.PI / 2 : -Math.PI / 2, 0);
    if (sp.type === 'door') {
      sfx.creak && sfx.creak();
      this.setGhostOpacity(1);
      await this.tween(0.35, (k) => { sp.ref.pivot.rotation.y = k * 1.4; }, 'out');
    } else {
      this.setGhostOpacity(0);
    }
    if (my !== this.seq) return;
    const a = G.position.clone();
    await this.tween(0.45, (k) => { G.position.lerpVectors(a, sp.out, k); this.setGhostOpacity(Math.max(k, sp.type === 'door' ? 1 : 0)); G.scale.setScalar(sp.type === 'paint' ? lerp(0.2, 1, k) : 1); }, 'out');
  }

  async _ghostLeave(sp, my, sfx, spin = false) {
    const G = this.ghost.root;
    const a = G.position.clone();
    await this.tween(0.45, (k) => {
      G.position.lerpVectors(a, sp.pos, k);
      this.ghost.inner.rotation.y = spin ? k * Math.PI * 6 : 0;
      G.scale.setScalar(lerp(G.scale.x, sp.type === 'door' ? 1 : 0.2, k));
      if (sp.type !== 'door') this.setGhostOpacity(1 - k);
    }, 'in');
    if (sp.type === 'door') {
      sfx.slam && sfx.slam(); this.shake = 0.12;
      G.visible = false;
      await this.tween(0.15, (k) => { sp.ref.pivot.rotation.y = 1.4 * (1 - k); }, 'in');
    }
    G.visible = false;
  }

  _burstSparkles(center) {
    const sp = this.fx.sparkles;
    const pos = sp.geometry.attributes.position.array, v = sp.userData.v;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] = center.x; pos[i + 1] = center.y; pos[i + 2] = center.z;
      const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 1.6;
      v[i] = Math.cos(a) * s; v[i + 1] = 1 + Math.random() * 2.5; v[i + 2] = Math.sin(a) * s * 0.6;
    }
    sp.material.opacity = 1;
    const my = this.seq;
    this.tween(1.8, (k) => {
      if (my !== this.seq) return;
      for (let i = 0; i < pos.length; i += 3) { pos[i] += v[i] * 0.016; pos[i + 1] += v[i + 1] * 0.016; pos[i + 2] += v[i + 2] * 0.016; v[i + 1] -= 0.07; }
      sp.geometry.attributes.position.needsUpdate = true;
      sp.material.opacity = 1 - k;
    }, 'linear');
  }

  /** CORRECT majority: the ghost attacks but a mysterious force stops it */
  async gagBlocked(i, variant = 0, sfx = {}) {
    this.resetActors();
    const my = this.seq;
    const st = this.stations[Math.min(i, this.stations.length - 1)];
    const M = this.mascot, G = this.ghost.root;
    const sp = this._spawn(st);
    this._frameGag(st, sp);
    await this._ghostAppear(sp, my, sfx);
    if (my !== this.seq) return;
    this.startle();
    this.mascotSay('EEK!!', 1.0, 'shout');
    // lunge
    const a = G.position.clone();
    const mid = a.clone().lerp(M.pos, 0.55);
    sfx.whoosh && sfx.whoosh();
    await this.tween(0.3, (k) => { G.position.lerpVectors(a, mid, k); G.scale.setScalar(lerp(1, 1.2, k)); }, 'in');
    if (my !== this.seq) return;
    if (variant % 2 === 0) {
      // --- magic shield
      const S = this.fx.shield;
      S.visible = true;
      S.position.copy(mid.clone().lerp(M.pos, 0.45));
      S.lookAt(this.camera.position.clone().sub(HALL_ORIGIN).setY(S.position.y));
      sfx.zap && sfx.zap();
      this.flash(0.25);
      this.tween(1.6, (k, raw) => { S.material.opacity = raw < 0.15 ? raw / 0.15 : 1 - (raw - 0.15) / 0.85; S.rotation.z += 0.05; S.scale.setScalar(1 + Math.sin(raw * 30) * 0.04); }, 'linear');
      sfx.bonk && sfx.bonk();
      this.shake = 0.12;
      this.say('BONK!', this.wpos(G, V(0, 0.55 * this._gk(), 0)), 1.0, 'shout');
      const b = G.position.clone();
      const back = b.clone().lerp(sp.out, 0.7);
      await this.tween(0.35, (k, raw) => { G.position.lerpVectors(b, back, k); this.ghost.inner.scale.set(1 - Math.sin(raw * Math.PI) * 0.4, 1 + Math.sin(raw * Math.PI) * 0.3, 1); }, 'out');
      if (my !== this.seq) return;
      this.say('?!', this.wpos(G, V(0, 0.55 * this._gk(), 0)), 0.8);
      await this.wait(0.35);
      await this._ghostLeave(sp, my, sfx, true);
    } else {
      // --- mysterious vortex pulls the ghost away
      const Vx = this.fx.vortex;
      Vx.visible = true;
      Vx.position.copy(G.position.clone().lerp(sp.pos, 0.6));
      Vx.lookAt(this.camera.position.clone().sub(HALL_ORIGIN));
      sfx.zap && sfx.zap();
      this.say('W-what?! Let me go!', this.wpos(G, V(0, 0.55 * this._gk(), 0)), 1.2, 'shout');
      const b = G.position.clone();
      await this.tween(1.1, (k, raw) => {
        Vx.material.opacity = Math.min(1, raw * 3) * (raw > 0.85 ? (1 - raw) / 0.15 : 1);
        Vx.rotation.z -= 0.25;
        const pull = Math.max(0, (raw - 0.3) / 0.7);
        G.position.lerpVectors(b, Vx.position, ease.in(pull));
        this.ghost.inner.rotation.z = pull * Math.PI * 4;
        G.scale.setScalar(lerp(1.2, 0.05, ease.in(pull)));
        G.position.x += (Math.random() - 0.5) * 0.04 * (1 - pull);
      }, 'linear');
      G.visible = false; Vx.visible = false;
      sfx.slam && sfx.slam();
      if (sp.type === 'door') await this.tween(0.12, (k) => { sp.ref.pivot.rotation.y = 1.4 * (1 - k); });
    }
    if (my !== this.seq) return;
    // relief!
    sfx.sparkle && sfx.sparkle();
    this._burstSparkles(M.pos);
    this.mascotSay('Phew! Correct! ✨', 2, 'good');
    M.shiver = 0;
    await this.tween(1.6, (k, raw) => { M.hop = Math.abs(Math.sin(raw * Math.PI * 3)) * 0.25; M.squash = Math.sin(raw * Math.PI * 6) * 0.08; M.spin = raw < 0.4 ? raw / 0.4 * Math.PI * 2 : 0; }, 'linear');
    M.hop = 0; M.squash = 0; M.spin = 0;
  }

  /** WRONG majority: the ghost gets its revenge */
  async gagRetaliate(i, sfx = {}) {
    this.resetActors();
    const my = this.seq;
    const st = this.stations[Math.min(i, this.stations.length - 1)];
    const M = this.mascot, G = this.ghost.root;
    const sp = this._spawn(st);
    this._frameGag(st, sp);
    if (this.portrait) {
      this.camOverride.pos.set(sp.side * 0.25, 1.5, st.z + 3.6);
      this.camOverride.look.set(sp.side * 0.25, 1.0, st.z - 0.4);
    } else {
      this.camOverride.pos.set(-sp.side * 0.45, 1.62, st.z + 3.3);
      this.camOverride.look.set(sp.side * 0.25, 1.0, st.z - 0.4);
    }
    this.flicker = 0.4;
    sfx.buzz && sfx.buzz();
    await this._ghostAppear(sp, my, sfx);
    if (my !== this.seq) return;
    this.lampLevel = 0.3;
    // swoop right in front of the mascot: BOO!
    const a = G.position.clone();
    const front = M.pos.clone().add(V(sp.side * 0.55, 0.1, 0.25));
    sfx.boo && sfx.boo();
    this.shake = 0.2;
    this.say('BOO!!', this.wpos(G, V(0.15, 0.6 * this._gk(), 0)), 1.6, 'boo');
    await this.tween(0.3, (k) => { G.position.lerpVectors(a, front, k); G.scale.setScalar(lerp(1, 1.25, k)); G.rotation.y = lerp(G.rotation.y, -sp.side * 0.5, k); }, 'outBack');
    if (my !== this.seq) return;
    // mascot freaks out: jump, spin, faint
    sfx.wrong && sfx.wrong();
    M.shiver = 0.6;
    await this.tween(0.9, (k, raw) => { M.hop = Math.sin(raw * Math.PI) * 0.55; M.spin = raw * Math.PI * 4; M.red = Math.abs(Math.sin(raw * 20)); }, 'out');
    if (my !== this.seq) return;
    M.spin = 0; M.red = 0;
    await this.tween(0.45, (k) => { M.pos.y = lerp(1.3, 0.38, k); M.tilt = 1.45 * k; M.fallen = k; }, 'outBounce');
    sfx.thud && sfx.thud(); this.shake = 0.1;
    M.shiver = 0;
    this.fx.dizzy.visible = true;
    this.fx.dizzy.position.copy(M.pos).add(V(0, 0.32, 0));
    this.mascotSay('😵‍💫', 1.6, 'small');
    // ghost giggles
    this.say('Hehehe~ 😈', this.wpos(G, V(0.2, 0.6 * this._gk(), 0)), 1.6);
    const gx = G.position.clone();
    await this.tween(1.5, (k, raw) => { G.position.y = gx.y + Math.abs(Math.sin(raw * 16)) * 0.1; G.rotation.z = Math.sin(raw * 16) * 0.12; }, 'linear');
    if (my !== this.seq) return;
    G.rotation.z = 0;
    await this._ghostLeave(sp, my, sfx);
    this.lampLevel = 1;
    this.flicker = 0.2;
    // get back up, still shaking
    this.fx.dizzy.visible = false;
    await this.tween(0.5, (k) => { M.pos.y = lerp(0.38, 1.3, k); M.tilt = 1.45 * (1 - k); M.fallen = 1 - k; }, 'out');
    M.shiver = 0.5;
  }

  celebrateLoop() { this.resetActors(); }
}

// ============================================================ helpers
function makePortraitEyes() {
  const g = new THREE.Group();
  const white = new THREE.MeshBasicMaterial({ color: 0xf3ead8 });
  const pupilM = new THREE.MeshBasicMaterial({ color: 0x120404 });
  const pupils = [];
  for (const z of [-0.028, 0.028]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 8), white);
    w.scale.set(0.35, 0.7, 1); w.position.set(0, 0, z);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 6), pupilM);
    p.position.set(0.006, 0, z); p.userData.z0 = z;
    g.add(w, p); pupils.push(p);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,40,40,.9)', 'rgba(255,0,0,0)'), blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(0.22, 0.12, 1); glow.position.x = 0.01; glow.visible = false;
  g.add(glow);
  g.userData.pupils = pupils;
  g.userData.glow = glow;
  return g;
}

function makeGlowEyes(color) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color });
  for (const x of [-0.12, 0.12]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), m);
    e.position.x = x; e.scale.set(1, 0.55, 0.5); g.add(e);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,30,30,.85)', 'rgba(255,0,0,0)'), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glow.scale.set(0.9, 0.45, 1); g.add(glow);
  return g;
}

function radialTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function runeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128);
  g.strokeStyle = 'rgba(170,140,255,1)'; g.shadowColor = '#b48cff'; g.shadowBlur = 14; g.lineWidth = 5;
  g.beginPath(); g.arc(0, 0, 112, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 90, 0, Math.PI * 2); g.stroke();
  g.beginPath(); // star
  for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + i * (Math.PI * 4 / 5); const x = Math.cos(a) * 88, y = Math.sin(a) * 88; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
  g.font = 'bold 18px serif'; g.fillStyle = 'rgba(220,200,255,1)'; g.textAlign = 'center';
  const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊ';
  for (let i = 0; i < 16; i++) { g.save(); g.rotate(i / 16 * Math.PI * 2); g.fillText(runes[i], 0, -96); g.restore(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function vortexTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128);
  for (let arm = 0; arm < 4; arm++) {
    g.beginPath();
    for (let r = 4; r < 120; r += 2) { const a = arm * Math.PI / 2 + r * 0.05; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (r === 4) g.moveTo(x, y); else g.lineTo(x, y); }
    g.strokeStyle = arm % 2 ? 'rgba(140,90,255,0.9)' : 'rgba(80,220,200,0.8)'; g.lineWidth = 10; g.shadowColor = '#8b5cf6'; g.shadowBlur = 20; g.stroke();
  }
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 40); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(-40, -40, 80, 80);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
