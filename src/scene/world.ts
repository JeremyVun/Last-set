import * as THREE from 'three';
import { buildClub, type Club, type Hotspot } from './club.ts';
import { buildMemory, type Memory } from './figures.ts';
import { buildAtmosphere, type Atmosphere } from './atmosphere.ts';
import { buildPost, type Post } from './post.ts';

export interface Shot {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov?: number;
}

export const SHOTS = {
  title: { pos: new THREE.Vector3(3.6, 1.55, 3.4), look: new THREE.Vector3(-3.4, 1.0, -3.0), fov: 40 },
  hub: { pos: new THREE.Vector3(3.5, 2.05, 3.8), look: new THREE.Vector3(-2.2, 0.8, -2.8), fov: 48 },
  piano: { pos: new THREE.Vector3(-6.4, 1.74, -3.1), look: new THREE.Vector3(-2.9, 1.2, -2.45), fov: 50 },
  alley: { pos: new THREE.Vector3(2.9, 1.6, -3.1), look: new THREE.Vector3(2.3, 1.3, -6.0), fov: 44 },
  stairs: { pos: new THREE.Vector3(0.55, 1.55, 4.55), look: new THREE.Vector3(6.4, 4.1, 4.5), fov: 52 },
};

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(46, 1, 0.05, 60);
  club: Club;
  memory: Memory;
  atmosphere: Atmosphere;
  post: Post;
  warmth = 0;
  warmthTarget = 0;
  dawn = 0;
  dawnTarget = 0;
  fade = 0;
  fadeTarget = 1;
  soft = 0;
  softTarget = 0;
  nellPlaying = 0;
  nellPlayingTarget = 0;
  nellPulse = 0;
  ghostOn = 1;
  playerPulse = 0;
  beat = 0;
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private from: Shot = SHOTS.title;
  private to: Shot = SHOTS.title;
  private shotT = 1;
  private shotDur = 1;
  private mouse = new THREE.Vector2();
  private mouseSmooth = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private enabled = new Set<string>();
  private marker: THREE.Sprite;
  private markerTarget: string | null = null;
  private timer = new THREE.Timer();
  private time = 0;
  private fogNight = new THREE.Color(0x06101c);
  private fogWarm = new THREE.Color(0x140e0b);
  private fogDawn = new THREE.Color(0x2a3444);
  private skyCool = new THREE.Color(0x2c4a74);
  private skyWarm = new THREE.Color(0x5a3d2a);
  private skyDawn = new THREE.Color(0x8fa6c4);
  private barCool = new THREE.Color(0.35, 0.55, 0.9);
  private barWarm = new THREE.Color(2.2, 1.2, 0.5);
  private neonFlicker = 1;
  private neonNext = 3;
  onFrame: ((dt: number, t: number) => void) | null = null;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene.fog = new THREE.FogExp2(this.fogNight.getHex(), 0.055);
    this.scene.background = new THREE.Color(0x02050a);

    this.club = buildClub();
    this.scene.add(this.club.root);
    this.memory = buildMemory(this.club.chairGeometry, this.club.bassGeometry);
    this.scene.add(this.memory.group);
    this.atmosphere = buildAtmosphere(this.scene, this.club.windows, this.club.lights.street, this.club.lights.stage, this.club.alley);
    this.post = buildPost(this.renderer, this.scene, this.camera);

    const ring = document.createElement('canvas');
    ring.width = ring.height = 128;
    const g = ring.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,230,190,0.9)');
    grd.addColorStop(0.12, 'rgba(255,210,160,0.5)');
    grd.addColorStop(0.35, 'rgba(255,190,130,0.08)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(ring);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0 }));
    this.marker.renderOrder = 20;
    this.scene.add(this.marker);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointermove', (e) => {
      this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    });
    this.cut(SHOTS.title);
    this.bakeEnvironment();
  }

  private bakeEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const hidden = [this.memory.group, this.marker];
    hidden.forEach((o) => (o.visible = false));
    this.club.lights.stage.intensity = 30;
    const rt = pmrem.fromScene(this.scene, 0.02, 0.1, 30, { position: new THREE.Vector3(-1, 1.6, -0.5), size: 256 });
    this.club.lights.stage.intensity = 0;
    hidden.forEach((o) => (o.visible = true));
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.9;
    pmrem.dispose();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio, 1.75);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    const portrait = w / h < 0.9;
    this.camera.zoom = portrait ? 0.62 : 1;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h, pr);
  }

  cut(shot: Shot) {
    this.from = this.to = shot;
    this.shotT = 1;
  }

  go(shot: Shot, seconds = 2.4) {
    this.from = this.currentShot();
    this.to = shot;
    this.shotT = 0;
    this.shotDur = this.reducedMotion ? 0.001 : seconds;
  }

  private currentShot(): Shot {
    const k = ease(Math.min(1, this.shotT));
    return {
      pos: this.from.pos.clone().lerp(this.to.pos, k),
      look: this.from.look.clone().lerp(this.to.look, k),
      fov: THREE.MathUtils.lerp(this.from.fov ?? 46, this.to.fov ?? 46, k),
    };
  }

  hotspot(id: string): Hotspot | undefined {
    return this.club.hotspots.find((h) => h.id === id);
  }

  inspectShot(id: string): Shot {
    const h = this.hotspot(id)!;
    return { pos: h.view.pos, look: h.view.look, fov: 40 };
  }

  setEnabled(ids: string[]) {
    this.enabled = new Set(ids);
  }

  setMarker(id: string | null) {
    this.markerTarget = id;
  }

  pick(clientX: number, clientY: number): string | null {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes = this.club.hotspots.filter((h) => this.enabled.has(h.id)).map((h) => h.mesh);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    return this.club.hotspots.find((h) => h.mesh === hit.object)?.id ?? null;
  }

  screenOf(id: string) {
    const h = this.hotspot(id);
    if (!h) return null;
    const p = h.focus.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight, visible: p.z < 1 };
  }

  start() {
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private frame() {
    this.timer.update();
    const dt = Math.min(0.05, this.timer.getDelta());
    this.time += dt;
    const t = this.time;
    this.onFrame?.(dt, t);

    const k = (rate: number) => 1 - Math.exp(-dt * rate);
    this.warmth += (this.warmthTarget - this.warmth) * k(1.2);
    this.dawn += (this.dawnTarget - this.dawn) * k(0.35);
    this.fade += (this.fadeTarget - this.fade) * k(this.fadeTarget > this.fade ? 1.1 : 2.2);
    this.soft += (this.softTarget - this.soft) * k(3);
    this.nellPlaying += (this.nellPlayingTarget - this.nellPlaying) * k(5);
    this.nellPulse *= Math.exp(-dt * 5);
    this.playerPulse *= Math.exp(-dt * 6);

    if (this.shotT < 1) this.shotT += dt / this.shotDur;
    const shot = this.currentShot();
    this.mouseSmooth.lerp(this.mouse, k(2));
    const drift = this.reducedMotion ? 0 : 1;
    const breathe = new THREE.Vector3(Math.sin(t * 0.21) * 0.03, Math.sin(t * 0.33) * 0.02, Math.cos(t * 0.17) * 0.03).multiplyScalar(drift);
    this.camera.position.copy(shot.pos).add(breathe);
    const look = shot.look.clone();
    const right = new THREE.Vector3().subVectors(look, shot.pos).cross(new THREE.Vector3(0, 1, 0)).normalize();
    look.addScaledVector(right, this.mouseSmooth.x * 0.25 * drift);
    look.y += this.mouseSmooth.y * 0.15 * drift;
    this.camera.lookAt(look);
    if (Math.abs(this.camera.fov - (shot.fov ?? 46)) > 0.01) {
      this.camera.fov = shot.fov ?? 46;
      this.camera.updateProjectionMatrix();
    }

    this.applyMood(t, dt);
    this.memory.update(t, this.beat, this.warmth, this.nellPlaying, this.nellPulse, dt);
    this.atmosphere.update(t, dt, this.warmth);

    if (this.markerTarget) {
      const h = this.hotspot(this.markerTarget);
      if (h) {
        this.marker.position.copy(h.focus);
        const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
        this.marker.material.opacity += ((0.35 + pulse * 0.4) - this.marker.material.opacity) * k(4);
        const s = 0.35 + pulse * 0.12;
        this.marker.scale.setScalar(s * this.camera.position.distanceTo(h.focus) * 0.18);
      }
    } else {
      this.marker.material.opacity *= Math.exp(-dt * 6);
    }

    const g = this.post.grade.uniforms;
    g.uTime.value = t;
    g.uWarmth.value = this.warmth * 0.9;
    g.uDawn.value = this.dawn;
    g.uFade.value = this.fade;
    g.uSoft.value = this.soft;
    this.post.bloom.strength = 0.5 + this.warmth * 0.2 + this.soft * 0.3;
    this.post.render();
  }

  private applyMood(t: number, dt: number) {
    const w = this.warmth, d = this.dawn;
    const L = this.club.lights;
    L.stage.intensity = w * 70;
    this.atmosphere.stageShaft.uniforms.uIntensity.value = w * 0.11;
    L.candles.forEach((c, i) => (c.intensity = w * 2.4 * (0.85 + 0.15 * Math.sin(t * 9 + i * 3) * Math.sin(t * 5.3 + i))));
    for (const f of L.candleFlames) (f.material as THREE.MeshBasicMaterial).color.setRGB(5 * w, 2.6 * w, 0.8 * w);
    L.bar.intensity = w * 5;
    this.club.pendantMat.color.setRGB(2 * w, 1.2 * w, 0.55 * w);
    const bulb = Math.max(0, 1 - w * 1.1) * this.ghostOn;
    L.ghost.intensity = 10 * bulb * (1 - d * 0.6);
    (L.ghostBulb.material as THREE.MeshBasicMaterial).color.setRGB(2.4 * bulb, 2 * bulb, 1.5 * bulb);
    this.atmosphere.ghostHalo.material.opacity = 0.4 * bulb;
    L.ambient.color.copy(this.skyCool).lerp(this.skyWarm, w * 0.6).lerp(this.skyDawn, d);
    L.ambient.intensity = 0.55 + w * 0.25 + d * 3.2;
    L.street.intensity = 260 * (1 + d * 1.2);
    L.street.color.setRGB(0.62 + d * 0.3, 0.76 + d * 0.2, 1);
    L.dawn.intensity = d * 55;
    this.club.dawnMat.color.setRGB(0.02 + d * 1.6, 0.03 + d * 1.75, 0.05 + d * 2.0);
    this.club.barGlowMat.color.copy(this.barCool).lerp(this.barWarm, w);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(this.fogNight).lerp(this.fogWarm, w * 0.7).lerp(this.fogDawn, d * 0.6);
    fog.density = 0.055 - d * 0.02;

    this.neonNext -= dt;
    if (this.neonNext < 0) {
      this.neonFlicker = this.neonFlicker < 1 ? 1 : 0.35 + Math.random() * 0.3;
      this.neonNext = this.neonFlicker < 1 ? 0.04 + Math.random() * 0.1 : 2 + Math.random() * 9;
    }
    const neon = this.neonFlicker * (1 - d * 0.85);
    this.club.neonMat.color.setRGB(1.4 * neon, 2.1 * neon, 3.3 * neon);
    L.neon.intensity = 5.5 * neon;
  }
}
