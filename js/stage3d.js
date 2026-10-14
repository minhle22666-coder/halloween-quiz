// ============================================================
//  3D stage for the HOST screen (three.js)
//  - haunted house diorama world, moon, stars, fog
//  - intro cinematic (castle gate opens + thunder)
//  - wizard mascot with procedural animations (correct / wrong gags)
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

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

// Bone names of the Meshy wizard rig (found by inspecting the FBX)
const RIG = {
  armR: 'Bone008', foreR: 'Bone009', handR: 'Bone010',
  armL: 'Bone004', foreL: 'Bone006', handL: 'Bone007',
  head: 'Bone', tail: 'Bone005', tail2: 'Bone011',
};
const SKIN_COLORS = { // fallback colouring when texture_0.png is not provided
  skin: new THREE.Color(0x86cf63), robe: new THREE.Color(0x4a2585), dark: new THREE.Color(0x140b1f),
};

export class Stage {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = 'stage-canvas';

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x1b1033, 28, 140);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 600);
    this.camPos = V(0, 20, 60);
    this.camLook = V(0, 3, 0);
    this.shake = 0;
    this.flashLevel = 0;
    this.tweens = [];
    this.updaters = [];
    this.mixers = [];
    this.mode = 'lobby';
    this.seq = 0;
    this.clock = new THREE.Clock();
    this.t = 0;

    // overlay for flash / bolts / speech bubbles
    this.overlay = document.createElement('div');
    this.overlay.className = 'stage-overlay';
    this.overlay.innerHTML = '<div class="flash"></div><svg class="bolt" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline/><polyline class="core"/></svg>';
    container.appendChild(this.overlay);
    this.flashEl = this.overlay.querySelector('.flash');
    this.boltEl = this.overlay.querySelector('.bolt');
    this.bubbles = [];

    this._resize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    new ResizeObserver(this._resize).observe(container);
    this._resize();
  }

  // ---------------------------------------------------------- loading
  async load(onProgress = () => {}) {
    const manager = new THREE.LoadingManager();
    const hasTex = await fetch('assets/models/texture_0.jpg', { method: 'HEAD' }).then((r) => r.ok).catch(() => false);
    this.wizardTextured = hasTex;
    const blank = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    manager.setURLModifier((url) => {
      if (/texture_0_(metallic|roughness)/.test(url)) return blank; // not needed
      if (/texture_0\.png$/.test(url)) return hasTex ? 'assets/models/texture_0.jpg' : blank;
      return url;
    });
    const gltf = new GLTFLoader(manager);
    const fbx = new FBXLoader(manager);
    let done = 0;
    const step = (x) => { done++; onProgress(done / 6); return x; };
    const [house, door, ghost, banana, wizard, hall] = await Promise.all([
      gltf.loadAsync('assets/models/halloween.glb').then(step),
      gltf.loadAsync('assets/models/door.glb').then(step),
      gltf.loadAsync('assets/models/ghost.glb').then(step),
      gltf.loadAsync('assets/models/banana.glb').then(step),
      fbx.loadAsync('assets/models/wizard.fbx').then(step),
      gltf.loadAsync('assets/models/haunted_diorama.glb').then(step).catch(() => null), // optional
    ]);
    // strip any lights / cameras baked into the downloaded models
    for (const root of [house.scene, door.scene, ghost.scene, banana.scene, wizard, hall && hall.scene].filter(Boolean)) {
      const junk = [];
      root.traverse((o) => { if (o.isLight || o.isCamera) junk.push(o); });
      junk.forEach((o) => o.parent && o.parent.remove(o));
    }
    this._buildSky();
    this._buildLights();
    this._buildHouse(house);
    this._buildGate(door);
    this._buildHall(hall);
    this._buildStage(door, ghost, banana, wizard);
    this.setMode('lobby');
    this.renderer.setAnimationLoop(() => this._frame());
  }

  _buildSky() {
    const geo = new THREE.SphereGeometry(400, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { flash: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; uniform float flash;
        void main(){
          float h = vP.y;
          vec3 top = vec3(0.04,0.02,0.10);
          vec3 mid = vec3(0.17,0.07,0.30);
          vec3 hor = vec3(0.55,0.20,0.32);
          vec3 c = mix(mid, top, smoothstep(0.05, 0.7, h));
          c = mix(hor, c, smoothstep(-0.08, 0.22, h));
          c += flash * vec3(0.55,0.6,0.9);
          gl_FragColor = vec4(c,1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.scene.add(this.sky);

    // stars
    const n = 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.9 + 0.1);
      const r = 380;
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xfff6dd, size: 1.4, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.85 }));
    this.scene.add(this.stars);

    // moon + glow
    const tl = new THREE.TextureLoader();
    const moonTex = tl.load('assets/img/moon.webp'); moonTex.colorSpace = THREE.SRGBColorSpace;
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false }));
    moon.scale.set(46, 44, 1);
    moon.position.set(-90, 120, -260);
    this.scene.add(moon);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,236,170,0.55)', 'rgba(255,200,120,0)'), fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(150, 150, 1);
    glow.position.copy(moon.position).add(V(0, 0, 5));
    this.scene.add(glow);
    this.moon = moon;

    // bat flock sprites crossing the moon
    const batTex = tl.load('assets/img/bats.webp'); batTex.colorSpace = THREE.SRGBColorSpace;
    this.bats = [];
    for (let i = 0; i < 2; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: batTex, fog: false, depthWrite: false, transparent: true, opacity: 0.9 }));
      s.scale.set(14, 20, 1);
      s.userData.phase = i * 0.5;
      this.scene.add(s);
      this.bats.push(s);
    }
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0x8f80e0, 0x2a1440, 0.55);
    this.scene.add(this.hemi);
    this.moonLight = new THREE.DirectionalLight(0xb9c2ff, 0.85);
    this.moonLight.position.set(-30, 50, 30);
    this.scene.add(this.moonLight);
    this.warm = new THREE.PointLight(0xff9a3c, 6, 18, 1.4);
    this.scene.add(this.warm);
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
      if (o.isMesh) {
        o.material.flatShading = false;
        if (/pupmpkin_0|lamp_body/.test(o.name)) { o.material.emissive = new THREE.Color(0xff6a00); o.material.emissiveIntensity = 0.35; }
      }
    });
    this.scene.add(root);
    this.house = root;
    root.updateMatrixWorld(true);

    // find the house door & ground for placing the quiz stage
    let doorMesh = null;
    root.traverse((o) => { if (o.isMesh && /^door_/.test(o.name) && !doorMesh) doorMesh = o; });
    const dBox = new THREE.Box3().setFromObject(doorMesh || root);
    this.houseDoor = dBox.getCenter(V());
    this.houseCenter = new THREE.Box3().setFromObject(root).getCenter(V());
    this.warm.position.copy(this.houseDoor).add(V(0, 1.5, 2.5));

    // raycast down to find the ground in front of the steps
    const probe = this.houseDoor.clone().add(V(0, 20, 5.8));
    const ray = new THREE.Raycaster(probe, V(0, -1, 0));
    const hit = ray.intersectObject(root, true)[0];
    this.anchor = V(probe.x, hit ? hit.point.y : 0.5, probe.z);
  }

  _buildGate(doorGltf) {
    // A castle gate set far away from the house; used only by the intro cinematic.
    const g = new THREE.Group();
    g.position.set(0, 0, 220);
    const door = skeletonClone(doorGltf.scene);
    const box = new THREE.Box3().setFromObject(door);
    const s = 6 / (box.max.y - box.min.y);
    door.scale.setScalar(s);
    door.position.y = -box.min.y * s;
    recolorDoor(door, true);
    g.add(door);
    const stone = new THREE.MeshStandardMaterial({ color: 0x3b3150, roughness: 0.95 });
    const dw = (box.max.x - box.min.x) * s, dh = 6;
    const half = dw / 2 - 0.05;
    const wallL = new THREE.Mesh(new THREE.BoxGeometry(14, 16, 1.8), stone); wallL.position.set(-half - 7, 8, 0);
    const wallR = wallL.clone(); wallR.position.x = half + 7;
    const top = new THREE.Mesh(new THREE.BoxGeometry(dw + 0.2, 16 - dh, 1.8), stone); top.position.set(0, dh + (16 - dh) / 2, 0);
    g.add(wallL, wallR, top);
    for (let i = -4; i <= 4; i++) { // battlements
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 1.8), stone);
      m.position.set(i * 4, 16.8, 0); g.add(m);
    }
    // glow behind the door
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(5, 7), new THREE.MeshBasicMaterial({ color: 0xffe7a8, fog: false }));
    glow.position.set(0, 3, -2.2);
    g.add(glow);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 40), new THREE.MeshStandardMaterial({ color: 0x20152e, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; g.add(floor);
    // torches
    this.torches = [];
    for (const x of [-3.1, 3.1]) {
      const l = new THREE.PointLight(0xff7a2a, 18, 12, 1.5);
      l.position.set(x, 4.2, 1.2); g.add(l);
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,220,120,1)', 'rgba(255,90,0,0)'), blending: THREE.AdditiveBlending, depthWrite: false }));
      f.scale.set(0.9, 1.3, 1); f.position.copy(l.position); g.add(f);
      this.torches.push({ l, f });
    }
    this.scene.add(g);
    this.gate = g;
    this.gateMixer = new THREE.AnimationMixer(door);
    this.mixers.push(this.gateMixer);
    this.gateDoor = makeDoorController(this.gateMixer, doorGltf.animations);
    this.gateDoor.set(0);
  }

  _buildHall(gltf) {
    // Haunted hallway (haunted_diorama.glb): wall on +x, arch at z≈+0.9, corridor runs to z≈-12.6
    this.hall = null;
    if (!gltf) return;
    const g = new THREE.Group();
    g.position.set(-300, 0, 0);
    const root = gltf.scene;
    root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    g.add(root);
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1024, roughness: 1 });
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.4, 14), dark); left.position.set(-1.38, 1.6, -5.8);
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.1, 14), dark); ceil.position.set(-0.05, 3.08, -5.8);
    const end = new THREE.Mesh(new THREE.BoxGeometry(2.7, 3.4, 0.1), dark); end.position.set(-0.05, 1.6, -12.7);
    g.add(left, ceil, end);
    // pitch-black room behind the side door… with something staring back
    const room = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 2.4), new THREE.MeshBasicMaterial({ color: 0x030106, side: THREE.BackSide }));
    room.position.set(2.45, 1.4, -3.8); g.add(room);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    for (const dz of [-0.11, 0.11]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), eyeMat);
      e.position.set(1.75, 1.7, -4.45 + dz); e.scale.set(1, 0.55, 1); g.add(e);
    }
    const eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,40,40,.8)', 'rgba(255,0,0,0)'), blending: THREE.AdditiveBlending, depthWrite: false }));
    eyeGlow.position.set(1.73, 1.7, -4.45); eyeGlow.scale.set(0.6, 0.3, 1); g.add(eyeGlow);
    // warm wall lamps (positions of the glass bulbs) + a cold "window" light
    this.hallLights = [];
    for (const [x, y, z] of [[0.6, 2.3, -1.05], [0.6, 2.3, -10.7], [0.4, 2.2, -5.4]]) {
      const l = new THREE.PointLight(0xffb066, 3.2, 7, 1.6);
      l.position.set(x, y, z); g.add(l); this.hallLights.push(l);
    }
    const cold = new THREE.PointLight(0x8f9cff, 1.5, 9, 1.4); cold.position.set(-0.8, 2.6, -7.5); g.add(cold);
    this.hallFlicker = 0;
    this.scene.add(g);
    this.hall = g;
    g.visible = false;
    const mixer = new THREE.AnimationMixer(root);
    this.mixers.push(mixer);
    if (gltf.animations[0]) {
      const a = mixer.clipAction(gltf.animations[0]);
      a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
      this.hallDoor = a;
    }
  }

  _buildStage(doorGltf, ghostGltf, bananaGltf, wizardFbx) {
    const A = this.anchor;
    const stage = new THREE.Group();
    stage.position.copy(A);
    this.scene.add(stage);
    this.stage = stage;

    // magic circle under the wizard
    const circle = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 48), new THREE.MeshBasicMaterial({ color: 0x8a5cff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    circle.rotation.x = -Math.PI / 2; circle.position.y = 0.03;
    stage.add(circle);
    this.circle = circle;
    this.stageLight = new THREE.SpotLight(0xffd9a8, 60, 14, 0.6, 0.6, 1.2);
    this.stageLight.position.set(1.5, 5.5, 4.5);
    this.stageLight.target.position.set(0, 0.8, 0);
    stage.add(this.stageLight, this.stageLight.target);
    const rim = new THREE.PointLight(0x9d6bff, 14, 8, 1.5);
    rim.position.set(-1.8, 2.4, -1.5);
    stage.add(rim);

    // ---- wizard
    this.wiz = this._makeWizard(wizardFbx);
    stage.add(this.wiz.root);
    // soul (ghostly copy) for the scare gag
    const soulModel = skeletonClone(this.wiz.model);
    const soulMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    soulModel.traverse((o) => { if (o.isMesh) { o.material = soulMat; o.frustumCulled = false; } });
    const soulRoot = new THREE.Group();
    soulRoot.add(soulModel);
    soulRoot.visible = false;
    stage.add(soulRoot);
    this.soul = { root: soulRoot, model: soulModel, mat: soulMat, rig: makeRig(soulModel) };

    // ---- hat
    this.hat = makeHat();
    this.scene.add(this.hat);
    this._attachHat();

    // ---- ghost
    const ghost = ghostGltf.scene;
    const gb = new THREE.Box3().setFromObject(ghost);
    const gs = 1.15 / (gb.max.y - gb.min.y);
    const ghostInner = new THREE.Group();
    ghost.scale.setScalar(gs);
    ghost.position.y = -gb.min.y * gs;
    ghostInner.add(ghost);
    ghost.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;
        if (o.material.transparent || o.material.opacity < 1) {
          o.material.color.set(0xe4ddff); o.material.opacity = Math.max(o.material.opacity, 0.62);
          o.material.emissive = new THREE.Color(0x6a58e0); o.material.emissiveIntensity = 0.55; o.material.depthWrite = false;
        }
      }
    });
    const ghostRoot = new THREE.Group();
    ghostRoot.add(ghostInner);
    stage.add(ghostRoot);
    const gm = new THREE.AnimationMixer(ghost);
    if (ghostGltf.animations[0]) gm.clipAction(ghostGltf.animations[0]).play();
    this.mixers.push(gm);
    this.ghost = { root: ghostRoot, inner: ghostInner, mats: [] };
    ghost.traverse((o) => { if (o.isMesh) { o.material.transparent = true; this.ghost.mats.push({ m: o.material, base: o.material.opacity }); } });

    // ---- banana
    const banana = bananaGltf.scene;
    const bb = new THREE.Box3().setFromObject(banana);
    const bs = 0.5 / (bb.max.y - bb.min.y);
    banana.scale.setScalar(bs);
    banana.position.set(-(bb.min.x + bb.max.x) / 2 * bs, -bb.min.y * bs, -(bb.min.z + bb.max.z) / 2 * bs);
    banana.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    const bananaRoot = new THREE.Group();
    bananaRoot.add(banana);
    bananaRoot.visible = false;
    stage.add(bananaRoot);
    const bm = new THREE.AnimationMixer(banana);
    this.bananaRun = bananaGltf.animations[0] ? bm.clipAction(bananaGltf.animations[0]) : null;
    if (this.bananaRun) this.bananaRun.play();
    this.mixers.push(bm);
    this.banana = { root: bananaRoot, mixer: bm };

    // ---- door prop (for the "ghost stuck in door" gag)
    const door = skeletonClone(doorGltf.scene);
    const db = new THREE.Box3().setFromObject(door);
    const ds = 2.3 / (db.max.y - db.min.y);
    door.scale.setScalar(ds);
    door.position.y = -db.min.y * ds;
    recolorDoor(door, false);
    const doorRoot = new THREE.Group();
    doorRoot.add(door);
    doorRoot.position.set(2.15, 0, -0.9);
    doorRoot.rotation.y = -0.55;
    stage.add(doorRoot);
    const dm = new THREE.AnimationMixer(door);
    this.mixers.push(dm);
    this.doorProp = { root: doorRoot, ctl: makeDoorController(dm, doorGltf.animations) };
    this.doorProp.ctl.set(0);

    // dizzy stars
    this.dizzy = new THREE.Group();
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), starMat);
      s.userData.a = (i / 4) * Math.PI * 2;
      this.dizzy.add(s);
    }
    this.dizzy.visible = false;
    stage.add(this.dizzy);

    // sparkles (celebration)
    const sp = new Float32Array(120 * 3);
    const spg = new THREE.BufferGeometry(); spg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.sparkles = new THREE.Points(spg, new THREE.PointsMaterial({ color: 0xffd76a, size: 0.09, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sparkles.userData.v = new Float32Array(120 * 3);
    stage.add(this.sparkles);

    this.resetActors();
  }

  _makeWizard(fbx) {
    const model = fbx;
    const box = new THREE.Box3().setFromObject(model);
    const s = 1.55 / (box.max.y - box.min.y);
    model.scale.setScalar(s);
    model.position.y = -box.min.y * s;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      if (this.wizardTextured) {
        const old = Array.isArray(o.material) ? o.material[0] : o.material;
        o.material = new THREE.MeshStandardMaterial({ map: old.map, roughness: 0.75, metalness: 0.0 });
        if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
      } else {
        paintWizard(o);
        o.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 });
      }
    });
    const root = new THREE.Group();
    const tilt = new THREE.Group(); // pivot at feet for falling over
    tilt.add(model);
    root.add(tilt);
    return { root, tilt, model, rig: makeRig(model), height: 1.55 };
  }

  _attachHat() {
    const head = this.wiz.rig.bones.head;
    this.scene.updateMatrixWorld(true);
    // rest placement: top of the head
    const top = V(0, 1.44, 0.0);
    this.wiz.root.localToWorld(top);
    const m = new THREE.Matrix4().compose(top, new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, 0, 0.12)), V(1, 1, 1));
    this.hatOffset = new THREE.Matrix4().copy(head.matrixWorld).invert().multiply(m);
    this.hat.matrixAutoUpdate = false;
    this.hatAttached = true;
  }

  // ---------------------------------------------------------- frame loop
  _frame() {
    if (this.paused) return;
    this._update(Math.min(this.clock.getDelta(), 0.05));
    this.renderer.render(this.scene, this.camera);
    this._updateBubbles();
  }

  // dev helper: simulate `sec` seconds instantly (used for screenshots/tests)
  advance(sec, step = 1 / 30) {
    for (let t = 0; t < sec; t += step) this._update(step);
    this.renderer.render(this.scene, this.camera);
    this._updateBubbles();
  }

  _update(dt) {
    this.t += dt;
    // tweens
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      if (tw.dead) { this.tweens.splice(i, 1); tw.res(false); continue; }
      tw.t += dt;
      const p = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.ease(p), p);
      if (p >= 1) { this.tweens.splice(i, 1); tw.res(true); }
    }
    for (const u of this.updaters) u(dt, this.t);
    for (const m of this.mixers) m.update(dt);

    this._idle(dt);
    applyRig(this.wiz.rig);
    if (this.soul.root.visible) applyRig(this.soul.rig);

    // hat follows head
    if (this.hatAttached) {
      this.wiz.root.updateMatrixWorld(true);
      this.hat.matrix.multiplyMatrices(this.wiz.rig.bones.head.matrixWorld, this.hatOffset);
      this.hat.matrixWorldNeedsUpdate = true;
    }

    // lightning flash decay
    if (this.flashLevel > 0) this.flashLevel = Math.max(0, this.flashLevel - dt * 3.2);
    this.hemi.intensity = this.baseHemi + this.flashLevel * 7;
    this.sky.material.uniforms.flash.value = this.flashLevel * 0.6;

    // bats crossing
    for (const b of this.bats) {
      const p = ((this.t * 0.02 + b.userData.phase) % 1);
      b.position.set(lerp(-220, 60, p), 70 + Math.sin(p * 9) * 8, -230);
      b.material.opacity = Math.sin(p * Math.PI) * 0.9;
    }
    for (const tch of this.torches) {
      const f = 0.85 + Math.sin(this.t * 13 + tch.l.position.x) * 0.1 + Math.random() * 0.08;
      tch.l.intensity = 18 * f; tch.f.scale.set(0.9 * f, 1.3 * f, 1);
    }
    if (this.hall && this.hall.visible) {
      const fl = this.hallFlicker > 0 ? (Math.random() < 0.5 ? 0.05 : 1.6) : 0.9 + Math.sin(this.t * 17) * 0.06 + Math.random() * 0.06;
      this.hallFlicker = Math.max(0, this.hallFlicker - dt);
      this.hallLights.forEach((l) => { l.intensity = 3.2 * fl; });
    }
    this.circle.rotation.z += dt * 0.4;
    this.circle.material.opacity = 0.25 + Math.sin(this.t * 2) * 0.1;

    // camera
    if (this.mode === 'lobby' || this.mode === 'final') {
      const a = this.t * 0.05;
      const c = this.houseCenter;
      this.camPos.set(c.x + Math.sin(a) * 34, c.y + 9 + Math.sin(this.t * 0.2) * 1.5, c.z + Math.cos(a) * 34);
      this.camLook.copy(c).add(V(0, 1, 0));
    } else if (this.mode === 'quiz' && !this.camLocked) {
      const base = this.quizCam;
      this.camPos.set(base.pos.x + Math.sin(this.t * 0.25) * 0.25, base.pos.y + Math.sin(this.t * 0.31) * 0.08, base.pos.z);
      this.camLook.copy(base.look);
    }
    this.camera.position.copy(this.camPos);
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.pow(0.02, dt);
    }
    this.camera.lookAt(this.camLook);
  }

  _idle() {
    const r = this.wiz.rig.pose;
    if (!this.wizBusy) {
      const t = this.t;
      r.armR.z = 1.15 + Math.sin(t * 1.6) * 0.05; r.armR.x = 0.15;
      r.armL.z = -1.15 - Math.sin(t * 1.6 + 1) * 0.05; r.armL.x = 0.15;
      r.foreR.z = 0.15; r.foreL.z = -0.15;
      r.head.y = Math.sin(t * 0.7) * 0.18; r.head.z = Math.sin(t * 0.9) * 0.05; r.head.x = 0;
      this.wiz.model.position.y = this.wiz.baseY + Math.sin(t * 2.2) * 0.008;
    }
    r.tail.y = Math.sin(this.t * 1.3) * 0.25;
    if (!this.ghostBusy && this.mode === 'quiz') {
      const t = this.t;
      this.ghost.root.position.set(-2.1 + Math.sin(t * 0.5) * 0.25, 1.0 + Math.sin(t * 1.4) * 0.12, -1.6);
      this.ghost.root.rotation.set(0, 0.6 + Math.sin(t * 0.8) * 0.2, Math.sin(t * 1.1) * 0.08);
    }
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
    requestAnimationFrame(() => {
      this.flashEl.style.transition = 'opacity .5s ease-out';
      this.flashEl.style.opacity = '0';
    });
    // lightning bolt
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

  // ---------------------------------------------------------- modes
  setMode(mode) {
    this.mode = mode;
    this.camLocked = false;
    const quizVisible = mode !== 'intro-gate' && mode !== 'intro-hall';
    this.gate.visible = mode === 'intro-gate';
    if (this.hall) this.hall.visible = mode === 'intro-hall';
    this.stage.visible = quizVisible;
    this.hat.visible = quizVisible;
    if (mode === 'quiz') {
      const A = this.anchor;
      this.quizCam = { pos: V(A.x + 0.25, A.y + 1.45, A.z + 4.6), look: V(A.x + 0.25, A.y + 0.95, A.z) };
      this.camPos.copy(this.quizCam.pos); this.camLook.copy(this.quizCam.look);
    }
  }

  // The castle-gate cinematic. callbacks: { onThunder, onLaugh }
  async playIntro(cb = {}) {
    const my = ++this.seq;
    this.mode = 'intro';
    this.stage.visible = true;
    const c = this.houseCenter, d = this.houseDoor;
    // 1. swoop from the moon down to the house
    const p0 = V(c.x - 30, c.y + 30, c.z + 70), l0 = V(-40, 40, -100);
    const p1 = V(d.x + 2, d.y + 3, d.z + 16), l1 = d.clone().add(V(0, 1, 0));
    this.camPos.copy(p0); this.camLook.copy(l0);
    await this.tween(3.2, (k) => { this.camPos.lerpVectors(p0, p1, k); this.camLook.lerpVectors(l0, l1, k); });
    if (my !== this.seq) return;
    // 2. thunder + shake + laugh
    this.flash(1); this.shake = 0.9; cb.onThunder && cb.onThunder(1);
    await this.wait(0.35);
    this.flash(0.7); cb.onLaugh && cb.onLaugh();
    const p2 = V(d.x, d.y + 1.2, d.z + 7);
    await this.tween(1.6, (k) => { this.camPos.lerpVectors(p1, p2, k); });
    this.flash(1); this.shake = 1.2; cb.onThunder && cb.onThunder(1.2);
    await this.wait(0.25);
    if (my !== this.seq) return;
    // 3. cut to the castle gate, door creaks open, camera pushes through
    this.mode = 'intro-gate';
    this.setMode('intro-gate');
    this.mode = 'intro';
    const G = this.gate.position;
    const g0 = V(G.x, G.y + 4.5, G.z + 22), g1 = V(G.x, G.y + 3.2, G.z + 9);
    const gl = V(G.x, G.y + 3, G.z);
    this.camPos.copy(g0); this.camLook.copy(gl);
    this.gateDoor.set(0);
    await this.tween(2.2, (k) => this.camPos.lerpVectors(g0, g1, k), 'out');
    cb.onDoor && cb.onDoor();
    this.flash(0.5); this.shake = 0.3;
    await this.tween(1.8, (k) => this.gateDoor.set(k), 'inOut');
    const g2 = V(G.x, G.y + 3, G.z - 1.5);
    if (this.hall) {
      // 3b. push through the gate into the haunted hallway
      this.flashEl.style.transition = 'opacity .5s ease-in';
      this.flashEl.classList.add('warm');
      this.flashEl.style.opacity = '1';
      await this.tween(0.6, (k) => this.camPos.lerpVectors(g1, g2, k), 'in');
      if (my !== this.seq) return;
      this.setMode('intro-hall'); this.mode = 'intro';
      const H = this.hall.position;
      const h = (x, y, z) => V(H.x + x, H.y + y, H.z + z);
      const hp0 = h(-0.15, 1.6, 3.4), hp1 = h(-0.35, 1.5, -1.6), hp2 = h(-0.25, 1.45, -7.4);
      const hl0 = h(0.1, 1.5, -6), hl1 = h(0.9, 1.4, -3.8), hl2 = h(1.1, 2.3, -8.7);
      this.camPos.copy(hp0); this.camLook.copy(hl0);
      if (this.hallDoor) { this.hallDoor.stop(); this.hallDoor.reset(); this.hallDoor.paused = true; }
      this.flashEl.style.transition = 'opacity .6s ease-out';
      this.flashEl.style.opacity = '0';
      await this.tween(2.0, (k) => { this.camPos.lerpVectors(hp0, hp1, k); this.camLook.lerpVectors(hl0, hl1, k); }, 'inOut');
      if (my !== this.seq) return;
      // the side door bursts open, lamps flicker, thunder
      if (this.hallDoor) { this.hallDoor.paused = false; this.hallDoor.play(); }
      cb.onDoor && cb.onDoor();
      this.hallFlicker = 1.1; this.shake = 0.25;
      cb.onThunder && cb.onThunder(0.8);
      this.flash(0.35);
      await this.wait(0.9);
      if (my !== this.seq) return;
      await this.tween(2.6, (k) => { this.camPos.lerpVectors(hp1, hp2, k); this.camLook.lerpVectors(hl1, hl2, k); }, 'inOut');
      if (my !== this.seq) return;
      this.hallFlicker = 0.6;
      this.flashEl.style.transition = 'opacity .9s ease-in';
      this.flashEl.style.opacity = '1';
      const hp3 = hp2.clone().add(V(0.3, 0.3, -1.6));
      await this.tween(1.0, (k) => { this.camPos.lerpVectors(hp2, hp3, k); }, 'in');
    } else {
      this.flashEl.style.transition = 'opacity 1.1s ease-in';
      this.flashEl.style.opacity = '1';
      this.flashEl.classList.add('warm');
      await this.tween(1.2, (k) => this.camPos.lerpVectors(g1, g2, k), 'in');
    }
    if (my !== this.seq) return;
    // 4. arrive at the quiz stage
    this.setMode('quiz');
    this.resetActors();
    this.flashEl.style.transition = 'opacity 1.2s ease-out';
    this.flashEl.style.opacity = '0';
    setTimeout(() => this.flashEl.classList.remove('warm'), 1300);
    const q = this.quizCam;
    const s0 = q.pos.clone().add(V(0, 1.2, 4));
    this.camLocked = true;
    await this.tween(1.6, (k) => this.camPos.lerpVectors(s0, q.pos, k), 'out');
    this.camLocked = false;
    this.wave();
  }

  skipIntro() { this.seq++; this.killTweens(); this.setMode('quiz'); this.resetActors(); this.flashEl.style.opacity = '0'; }

  // ---------------------------------------------------------- actors
  resetActors() {
    this.seq++;
    this.killTweens();
    this.clearBubbles();
    this.wizBusy = false; this.ghostBusy = false;
    const w = this.wiz;
    w.root.position.set(0, 0, 0); w.root.rotation.set(0, 0, 0);
    w.tilt.rotation.set(0, 0, 0); w.tilt.position.set(0, 0, 0);
    w.baseY = w.baseY ?? w.model.position.y;
    w.model.position.y = w.baseY;
    Object.values(w.rig.pose).forEach((p) => { p.x = 0; p.y = 0; p.z = 0; });
    this.soul.root.visible = false; this.soul.mat.opacity = 0;
    this.hat.visible = this.mode !== 'intro-gate';
    this._attachHatDirect();
    this.ghost.root.scale.setScalar(1);
    this.ghost.inner.rotation.set(0, 0, 0); this.ghost.inner.scale.set(1, 1, 1); this.ghost.inner.position.set(0, 0, 0);
    this.setGhostOpacity(1);
    this.banana.root.visible = false;
    this.doorProp.ctl.set(0);
    this.dizzy.visible = false;
    this.sparkles.material.opacity = 0;
  }
  _attachHatDirect() { this.hatAttached = true; this.hat.matrixAutoUpdate = false; }
  setGhostOpacity(a) { this.ghost.mats.forEach(({ m, base }) => { m.opacity = base * a; }); }

  wave() {
    const my = this.seq;
    this.wizBusy = true;
    const p = this.wiz.rig.pose;
    return this.tween(1.6, (k, raw) => {
      if (my !== this.seq) return;
      p.armR.z = lerp(1.15, -0.9, Math.min(1, raw * 3)); p.foreR.z = -0.4 + Math.sin(raw * 18) * 0.5;
      p.armL.z = -1.15; p.head.z = Math.sin(raw * 6) * 0.08;
      if (raw >= 1) this.wizBusy = false;
    }, 'linear');
  }

  _celebrate(my, dur = 2.6) {
    const p = this.wiz.rig.pose;
    this._burstSparkles();
    return this.tween(dur, (k, raw) => {
      if (my !== this.seq) return;
      const hop = Math.abs(Math.sin(raw * Math.PI * 4)) * 0.22;
      this.wiz.tilt.position.y = hop;
      p.armR.z = -1.0 + Math.sin(raw * 25) * 0.2; p.armL.z = 1.0 - Math.sin(raw * 25) * 0.2;
      p.foreR.z = -0.3; p.foreL.z = 0.3;
      p.head.x = -0.15; p.head.z = Math.sin(raw * 12) * 0.12;
    }, 'linear');
  }

  _burstSparkles() {
    const pos = this.sparkles.geometry.attributes.position.array, v = this.sparkles.userData.v;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] = 0; pos[i + 1] = 1.2; pos[i + 2] = 0;
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2;
      v[i] = Math.cos(a) * s; v[i + 1] = 2 + Math.random() * 3; v[i + 2] = Math.sin(a) * s * 0.5;
    }
    this.sparkles.material.opacity = 1;
    const my = this.seq;
    this.tween(2.2, (k) => {
      if (my !== this.seq) return;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i] += v[i] * 0.016; pos[i + 1] += v[i + 1] * 0.016; pos[i + 2] += v[i + 2] * 0.016; v[i + 1] -= 0.09;
      }
      this.sparkles.geometry.attributes.position.needsUpdate = true;
      this.sparkles.material.opacity = 1 - k;
    }, 'linear');
  }

  // ---------- CORRECT gag A: ghost slips on a banana
  async gagBanana(sfx = {}) {
    this.resetActors();
    const my = this.seq;
    this.wizBusy = false; this.ghostBusy = true;
    const B = this.banana.root, G = this.ghost.root;
    B.visible = true;
    B.position.set(-3.8, 0, 0.75); B.rotation.set(0, Math.PI / 2, 0);
    if (this.bananaRun) { this.bananaRun.paused = false; this.bananaRun.timeScale = 1.4; }
    // banana runs in from the left and stops beside the wizard
    await this.tween(1.3, (k) => { B.position.x = lerp(-3.8, -0.95, k); }, 'out');
    if (my !== this.seq) return;
    if (this.bananaRun) this.bananaRun.paused = true;
    this.say('🍌', this.wpos(B, V(0, 0.75, 0)), 1.2, 'small');
    // ghost sneaks up on the wizard from the left…
    G.position.set(-3.4, 0.55, 0.75); G.rotation.set(0, Math.PI / 2, 0);
    this.say('Hehe… sneak sneak', this.wpos(G, V(0, 1.3, 0)), 1.6);
    await this.tween(1.5, (k, raw) => { G.position.x = lerp(-3.4, -1.3, k); G.position.y = 0.45 + Math.abs(Math.sin(raw * 10)) * 0.08; }, 'linear');
    if (my !== this.seq) return;
    // …and slips on the banana!
    sfx.slip && sfx.slip();
    this.say('WHOAAA!', this.wpos(G, V(0, 1.3, 0)), 1.2, 'shout');
    const startX = G.position.x;
    await this.tween(0.75, (k, raw) => {
      G.position.x = lerp(startX, startX - 0.7, raw);
      G.position.y = 0.45 + Math.sin(raw * Math.PI) * 1.4 - raw * 0.45;
      this.ghost.inner.rotation.z = raw * Math.PI * 2.5;
    }, 'linear');
    if (my !== this.seq) return;
    sfx.thud && sfx.thud(); this.shake = 0.12;
    this.ghost.inner.rotation.z = Math.PI / 2;
    this.ghost.inner.position.y = 0.2;
    await this.tween(0.25, (k) => { this.ghost.inner.scale.set(1 + 0.3 * Math.sin(k * Math.PI), 1 - 0.3 * Math.sin(k * Math.PI), 1); });
    this.dizzy.visible = true;
    this.dizzy.position.set(G.position.x - 0.5, 0.55, G.position.z);
    const dz = this.tween(3.5, (k, raw) => {
      if (my !== this.seq) return;
      this.dizzy.children.forEach((s) => { const a = s.userData.a + raw * 14; s.position.set(Math.cos(a) * 0.3, Math.sin(raw * 30) * 0.03, Math.sin(a) * 0.3); });
    }, 'linear');
    // wizard is oblivious & celebrates
    this.wizBusy = true;
    sfx.sparkle && sfx.sparkle();
    this.say('Correct! ✨', this.wpos(this.wiz.root, V(0, 1.85, 0)), 2.2, 'good');
    await this._celebrate(my, 2.4);
    if (my !== this.seq) return;
    this.wizBusy = false;
    await dz;
  }

  // ---------- CORRECT gag B: ghost gets stuck in the door
  async gagDoor(sfx = {}) {
    this.resetActors();
    const my = this.seq;
    this.ghostBusy = true;
    const G = this.ghost.root, D = this.doorProp;
    // ghost hides behind the door
    const toStage = (v) => this.stage.worldToLocal(D.root.localToWorld(v));
    const behind = toStage(V(0.05, 0.5, -1.0));
    const doorway = toStage(V(0.15, 0.5, -0.05));
    const stuck = toStage(V(0.43, 0.5, -0.1));
    G.position.copy(behind); G.rotation.set(0, D.root.rotation.y - 0.35, 0);
    sfx.creak && sfx.creak();
    await this.tween(0.7, (k) => D.ctl.set(k * 0.8), 'out');
    if (my !== this.seq) return;
    // ghost rushes out…
    this.say('Here I come! 👻', this.wpos(G, V(0, 1.3, 0)), 1.2);
    await this.tween(0.55, (k) => { G.position.lerpVectors(behind, doorway, k); }, 'in');
    // …and the door slams on it
    sfx.thud && sfx.thud(); this.shake = 0.15;
    await this.tween(0.16, (k) => { D.ctl.set(lerp(0.8, 0.2, k)); G.position.lerpVectors(doorway, stuck, k); this.ghost.inner.scale.set(lerp(1, 0.5, k), lerp(1, 1.08, k), 1); }, 'in');
    if (my !== this.seq) return;
    this.say('Ugh!! I’m STUCK!', this.wpos(G, V(0, 1.3, 0)), 3.6, 'shout');
    const wiggle = this.tween(4, (k, raw) => {
      if (my !== this.seq) return;
      this.ghost.inner.rotation.z = Math.sin(raw * 40) * 0.1;
      this.ghost.inner.position.y = Math.abs(Math.sin(raw * 22)) * 0.04;
      D.ctl.set(0.2 + Math.abs(Math.sin(raw * 40)) * 0.025);
    }, 'linear');
    sfx.squeak && sfx.squeak();
    // wizard looks around, sees nothing
    this.wizBusy = true;
    const p = this.wiz.rig.pose;
    await this.tween(1.6, (k, raw) => {
      if (my !== this.seq) return;
      p.head.y = Math.sin(raw * Math.PI * 2) * 0.7; p.armR.z = 1.1; p.armL.z = -1.1;
    }, 'linear');
    if (my !== this.seq) return;
    this.say('Hm? Nothing here~', this.wpos(this.wiz.root, V(0, 1.85, 0)), 1.4);
    await this.tween(0.9, (k) => { p.armR.z = lerp(1.1, 0.2, k); p.armL.z = lerp(-1.1, -0.2, k); p.foreR.z = -0.6 * k; p.foreL.z = 0.6 * k; p.head.z = 0.2 * k; });
    if (my !== this.seq) return;
    sfx.sparkle && sfx.sparkle();
    this.say('Correct! ✨', this.wpos(this.wiz.root, V(0, 1.85, 0)), 2, 'good');
    await this._celebrate(my, 2);
    this.wizBusy = false;
    await wiggle;
  }

  // ---------- WRONG gag: ghost scares the wizard, soul pops out, hat falls
  async gagScare(sfx = {}) {
    this.resetActors();
    const my = this.seq;
    this.ghostBusy = true; this.wizBusy = true;
    const G = this.ghost.root, W = this.wiz, p = W.rig.pose;
    // ghost rises from behind the wizard
    G.position.set(-0.2, -0.5, -1.0); G.rotation.set(0, 0, 0);
    this.setGhostOpacity(0);
    await this.tween(0.9, (k) => { G.position.y = lerp(-0.5, 1.2, k); this.setGhostOpacity(k); }, 'out');
    if (my !== this.seq) return;
    // swoops in front: BOO!
    sfx.boo && sfx.boo();
    this.say('BOO!!', this.wpos(G, V(0.35, 0.95, 0)), 1.8, 'boo');
    this.shake = 0.18;
    await this.tween(0.35, (k) => { G.position.set(lerp(-0.2, -1.05, k), lerp(1.2, 0.45, k), lerp(-1.0, 0.6, k)); G.scale.setScalar(lerp(1, 1.4, k)); G.rotation.y = lerp(0, 0.55, k); }, 'outBack');
    // wizard jumps in fright, hat flies off
    this._detachHat();
    const H = this.hat;
    const h0 = H.position.clone();
    const hEnd = this.stage.localToWorld(V(0.95, 0.06, 0.15));
    const hq0 = H.quaternion.clone();
    const hq1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0.4, -0.55));
    const hatFly = this.tween(1.4, (k, raw) => {
      H.position.x = lerp(h0.x, hEnd.x, raw); H.position.z = lerp(h0.z, hEnd.z, raw);
      H.position.y = lerp(h0.y, hEnd.y, ease.outBounce(raw)) + Math.sin(raw * Math.PI) * 1.2 * (1 - raw);
      H.quaternion.slerpQuaternions(hq0, hq1, Math.min(1, raw * 1.3));
    }, 'linear').then(() => sfx.thud && sfx.thud());
    await this.tween(0.45, (k, raw) => {
      W.tilt.position.y = Math.sin(raw * Math.PI) * 0.45;
      p.armR.z = lerp(1.15, -1.25, k); p.armL.z = lerp(-1.15, 1.25, k);
      p.foreR.z = -0.5 * k; p.foreL.z = 0.5 * k; p.head.x = -0.35 * k;
    }, 'out');
    if (my !== this.seq) return;
    sfx.wrong && sfx.wrong();
    // soul leaves the body
    const S = this.soul;
    S.root.visible = true;
    S.root.position.set(0, 0, 0);
    Object.keys(S.rig.pose).forEach((k) => Object.assign(S.rig.pose[k], p[k]));
    S.rig.pose.armR.z = -1.3; S.rig.pose.armL.z = 1.3;
    this.say('Aaaahh…', this.wpos(S.root, V(0, 2.1, 0)), 2.2);
    const soulRise = this.tween(2.6, (k, raw) => {
      if (my !== this.seq) return;
      S.root.position.y = raw * 1.9; S.root.position.x = Math.sin(raw * 9) * 0.18;
      S.root.rotation.z = Math.sin(raw * 7) * 0.15;
      S.mat.opacity = 0.55 * Math.sin(Math.min(1, raw * 1.15) * Math.PI);
      S.rig.pose.armR.z = -1.3 + Math.sin(raw * 20) * 0.3; S.rig.pose.armL.z = 1.3 - Math.sin(raw * 20) * 0.3;
    }, 'linear');
    // body faints backwards
    await this.tween(0.8, (k) => {
      W.tilt.rotation.x = -1.35 * k; W.tilt.position.y = 0;
      p.armR.z = lerp(-1.25, 0.2, k); p.armL.z = lerp(1.25, -0.2, k); p.head.x = 0;
    }, 'outBounce');
    if (my !== this.seq) return;
    sfx.thud && sfx.thud(); this.shake = 0.1;
    // ghost giggles
    this.say('Hehehe~ 😈', this.wpos(G, V(0.2, 1.05, 0)), 2.2);
    const gx = G.position.x;
    await this.tween(2.2, (k, raw) => { if (my !== this.seq) return; G.position.y = 0.5 + Math.abs(Math.sin(raw * 18)) * 0.12; G.position.x = gx + Math.sin(raw * 9) * 0.05; G.rotation.z = Math.sin(raw * 18) * 0.1; }, 'linear');
    await Promise.all([hatFly, soulRise]);
    S.root.visible = false;
  }

  _detachHat() {
    this.hatAttached = false;
    this.hat.matrix.decompose(this.hat.position, this.hat.quaternion, this.hat.scale);
    this.hat.matrixAutoUpdate = true;
  }

  // final screen: wizard celebrates in the background
  celebrateLoop() {
    this.resetActors();
    const my = this.seq;
    const loop = async () => { while (my === this.seq) { this.wizBusy = true; await this._celebrate(my, 2.4); this.wizBusy = false; await this.wait(1.2); } };
    loop();
  }
}

// ============================================================ rig helpers
function makeRig(model) {
  const bones = {};
  model.traverse((o) => { if (o.isBone) for (const [k, n] of Object.entries(RIG)) if (o.name === n) bones[k] = o; });
  model.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const rest = {}, rel = {}, relInv = {}, pose = {};
  const tmpM = new THREE.Matrix4();
  for (const [k, b] of Object.entries(bones)) {
    rest[k] = b.quaternion.clone();
    tmpM.multiplyMatrices(rootInv, b.parent.matrixWorld);
    const q = new THREE.Quaternion(); tmpM.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    rel[k] = q; relInv[k] = q.clone().invert();
    pose[k] = { x: 0, y: 0, z: 0 };
  }
  return { bones, rest, rel, relInv, pose, _e: new THREE.Euler(), _q: new THREE.Quaternion() };
}
function applyRig(rig) {
  for (const k in rig.bones) {
    const p = rig.pose[k];
    rig._e.set(p.x, p.y, p.z, 'ZXY');
    rig._q.setFromEuler(rig._e);
    // local = relInv * R(model space) * rel * rest
    rig.bones[k].quaternion.copy(rig.relInv[k]).multiply(rig._q).multiply(rig.rel[k]).multiply(rig.rest[k]);
  }
}

// colour the untextured wizard by dominant bone weight
function paintWizard(mesh) {
  const g = mesh.geometry;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, pos = g.attributes.position, nor = g.attributes.normal;
  const bones = mesh.skeleton.bones.map((b) => b.name);
  const colors = new Float32Array(pos.count * 3);
  const skinBones = /^(Bone|Bone001|Bone010|Bone007|Bone012|Bone013|Bone014|Bone015|Bone016|Bone017|Bone005|Bone011|Bone018|Bone019|Bone020|Bone021|Bone022|Bone023)$/;
  // geometry is Z-up inside the FBX: bring it into the model (Y-up) frame first
  mesh.updateMatrix();
  const M = mesh.matrix, N = new THREE.Matrix3().getNormalMatrix(M);
  const P = new Float32Array(pos.count * 3), NZ = new Float32Array(pos.count);
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  const box = new THREE.Box3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(M); P.set([v.x, v.y, v.z], i * 3); box.expandByPoint(v);
    if (nor) { n.fromBufferAttribute(nor, i).applyMatrix3(N).normalize(); NZ[i] = n.z; } else NZ[i] = 1;
  }
  const H = box.max.y - box.min.y, W = box.max.x - box.min.x, cx = (box.max.x + box.min.x) / 2;
  const c = new THREE.Color(), belly = new THREE.Color(0xd8f2a6), gold = new THREE.Color(0xf0b429);
  for (let i = 0; i < pos.count; i++) {
    let best = 0, bw = -1;
    for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j); if (w > bw) { bw = w; best = si.getComponent(i, j); } }
    const name = bones[best] || '';
    const x = P[i * 3] - cx, yN = (P[i * 3 + 1] - box.min.y) / H, z = P[i * 3 + 2];
    let isSkin = skinBones.test(name);
    if (/^Bone01[2-7]$/.test(name) && yN > 0.075) isSkin = false; // legs are hidden under the robe
    c.copy(isSkin ? SKIN_COLORS.skin : SKIN_COLORS.robe);
    if (name === 'Bone' || name === 'Bone001') {
      // big eyes: dark glossy sockets on the front of the head
      const ex = (Math.abs(x) - 0.145 * W) / H, ey = yN - 0.727;
      if (z > 0 && NZ[i] > -0.2 && ex * ex + ey * ey < 0.085 * 0.085) c.copy(SKIN_COLORS.dark);
      else if (yN < 0.6 && z > 0) c.lerp(belly, 0.35);
    }
    if (!isSkin && yN < 0.12 && yN > 0.06) c.copy(gold); // robe hem trim
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function makeHat() {
  const g = new THREE.Group();
  const purple = new THREE.MeshStandardMaterial({ color: 0x3d1f6e, roughness: 0.7 });
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.27 * (1 - t) + 0.01, t * 0.7)); }
  const cone = new THREE.LatheGeometry(pts, 24);
  const p = cone.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0.35) { const k = (y - 0.35) / 0.35; p.setX(i, p.getX(i) - k * k * 0.22); p.setY(i, y - k * k * 0.06); } }
  cone.computeVertexNormals();
  const coneM = new THREE.Mesh(cone, purple); coneM.position.y = 0.02;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.55, 0.03, 32), purple);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.27, 0.07, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xf0a31a, roughness: 0.4, metalness: 0.4, side: THREE.DoubleSide }));
  band.position.y = 0.07;
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.035 : 0.08, a = (i / 10) * Math.PI * 2 + Math.PI / 2; if (i) starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const star = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape, { depth: 0.015, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffb000, emissiveIntensity: 0.6 }));
  star.position.set(0, 0.24, 0.2); star.rotation.x = -0.35;
  g.add(coneM, brim, band, star);
  g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return g;
}

function recolorDoor(door, gate) {
  door.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const m = o.material = o.material.clone();
    if (/Cube004|Cube003/.test(o.name)) { // wall chunk around the frame
      m.map = null; m.color.set(gate ? 0x3b3150 : 0x4a3c63); m.roughness = 0.95;
    } else {
      m.color.multiplyScalar(gate ? 0.55 : 0.7);
    }
    m.needsUpdate = true;
  });
}

function makeDoorController(mixer, clips) {
  const actions = clips.map((c) => { const a = mixer.clipAction(c); a.play(); a.paused = true; a.clampWhenFinished = true; return a; });
  const main = actions[0];
  return {
    set(k) { // 0 = closed, 1 = open
      if (!main) return;
      actions.forEach((a) => { a.time = Math.max(0, Math.min(a.getClip().duration - 1e-4, k * a.getClip().duration)); });
      mixer.update(0);
    },
  };
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
