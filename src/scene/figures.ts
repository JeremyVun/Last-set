import * as THREE from 'three';
import { SPOTS, TABLES } from './club.ts';

const ghostVertex = /* glsl */ `
varying vec3 vN;
varying vec3 vW;
void main() {
  vec4 local = vec4(position, 1.0);
  vec3 n = normal;
#ifdef USE_INSTANCING
  local = instanceMatrix * local;
  n = mat3(instanceMatrix) * n;
#endif
  vec4 wp = modelMatrix * local;
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const ghostFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform float uPulse;
uniform float uSeed;
uniform float uFloor;
varying vec3 vN;
varying vec3 vW;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  vec3 v = normalize(cameraPosition - vW);
  float facing = abs(dot(normalize(vN), v));
  float rim = pow(1.0 - facing, 2.2);
  float n = noise(vW * 4.0 + vec3(0.0, -uTime * 0.35, uSeed));
  float drift = noise(vW * 1.3 + vec3(uTime * 0.1, uSeed, 0.0));
  float scan = 0.88 + 0.12 * sin(vW.y * 90.0 - uTime * 2.0);
  float dist = length(cameraPosition - vW);
  float a = (0.34 + rim * 0.3) * (0.4 + 0.9 * n) * scan * uOpacity;
  a *= smoothstep(0.15, 0.55, drift + uOpacity * 0.5);
  a *= clamp(1.4 - dist * 0.06, 0.3, 1.0);
  a *= 0.15 + 0.85 * smoothstep(uFloor + 0.05, uFloor + 0.75, vW.y);
  vec3 c = uColor * (0.75 + rim * 0.6 + uPulse * 1.2);
  gl_FragColor = vec4(c * a, a);
}`;

export function ghostMaterial(color: THREE.ColorRepresentation, seed = Math.random() * 10) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uSeed: { value: seed },
      uFloor: { value: 0 },
    },
    vertexShader: ghostVertex,
    fragmentShader: ghostFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

type Pose = 'stand' | 'sit';

const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true });

// Ghosts draw only their nearest surface: a depth pre-pass hides the overlapping capsules inside each figure.
function withDepthPrepass(obj: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.userData.depthTwin) meshes.push(o as THREE.Mesh);
  });
  for (const m of meshes) {
    const inst = m as THREE.InstancedMesh;
    const twin = inst.isInstancedMesh ? new THREE.InstancedMesh(m.geometry, depthOnly, inst.count) : new THREE.Mesh(m.geometry, depthOnly);
    if (inst.isInstancedMesh) (twin as THREE.InstancedMesh).instanceMatrix = inst.instanceMatrix;
    twin.userData.depthTwin = true;
    twin.renderOrder = 1;
    m.renderOrder = 2;
    m.add(twin);
  }
}

export interface Figure {
  root: THREE.Group;
  mat: THREE.ShaderMaterial;
  kind: 'nell' | 'bassist' | 'drummer' | 'mae' | 'guest';
  threshold: number;
  phase: number;
  joints: {
    hips: THREE.Group;
    chest: THREE.Group;
    head: THREE.Group;
    shoulderL: THREE.Group;
    shoulderR: THREE.Group;
    elbowL: THREE.Group;
    elbowR: THREE.Group;
  };
  prop?: THREE.Object3D;
  opacity: number;
}

function limb(len: number, r: number, mat: THREE.Material) {
  const g = new THREE.CapsuleGeometry(r, len - r * 2, 4, 10);
  g.translate(0, -len / 2, 0);
  return new THREE.Mesh(g, mat);
}

function makeHuman(mat: THREE.ShaderMaterial, pose: Pose, opts: { dress?: boolean; hair?: boolean; scale?: number; coat?: boolean; hat?: boolean } = {}) {
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = pose === 'stand' ? 0.94 : 0.5;
  root.add(hips);

  const legLen = 0.46;
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.09, 0, 0);
    hips.add(hip);
    const thigh = limb(legLen, 0.065, mat);
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -legLen;
    hip.add(knee);
    const shin = limb(legLen, 0.052, mat);
    knee.add(shin);
    if (pose === 'sit') {
      hip.rotation.x = -Math.PI / 2 + 0.1;
      knee.rotation.x = Math.PI / 2 - 0.05;
      hip.rotation.z = side * 0.06;
    }
  }
  if (opts.dress || opts.coat) {
    const profile = opts.dress
      ? [[0.13, 0.05], [0.16, -0.1], [0.21, -0.35], [0.25, -0.58], [0.27, -0.62]]
      : [[0.15, 0.05], [0.17, -0.2], [0.19, -0.5], [0.2, -0.62]];
    const skirt = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 18), mat);
    if (pose === 'sit') {
      skirt.scale.set(1, 0.35, 1.3);
      skirt.position.z = 0.1;
    }
    hips.add(skirt);
  }

  const chest = new THREE.Group();
  hips.add(chest);
  const torsoProfile = opts.dress
    ? [[0.001, -0.05], [0.14, -0.02], [0.115, 0.12], [0.14, 0.28], [0.155, 0.38], [0.12, 0.46], [0.05, 0.5], [0.042, 0.56], [0.001, 0.57]]
    : [[0.001, -0.08], [0.16, -0.06], [0.155, 0.12], [0.17, 0.28], [0.19, 0.4], [0.15, 0.47], [0.06, 0.5], [0.048, 0.56], [0.001, 0.57]];
  const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoProfile.map(([r, y]) => new THREE.Vector2(r, y)), 18), mat);
  torso.scale.z = 0.72;
  chest.add(torso);

  const head = new THREE.Group();
  head.position.y = 0.6;
  chest.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 14), mat);
  skull.scale.set(0.9, 1.08, 1);
  skull.position.y = 0.06;
  head.add(skull);
  if (opts.hat) {
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.09, 16), mat);
    crown.position.y = 0.16;
    head.add(crown);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.012, 20), mat);
    brim.position.y = 0.12;
    brim.rotation.x = 0.08;
    head.add(brim);
  }
  if (opts.hair) {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), mat);
    hair.position.set(0, 0.08, -0.012);
    hair.scale.set(1.05, 1, 1.08);
    head.add(hair);
  }

  const mkArm = (side: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.2, 0.42, 0);
    chest.add(shoulder);
    shoulder.add(limb(0.29, 0.052, mat));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), mat);
    cap.scale.set(1, 0.8, 0.9);
    shoulder.add(cap);
    const elbow = new THREE.Group();
    elbow.position.y = -0.29;
    shoulder.add(elbow);
    elbow.add(limb(0.27, 0.042, mat));
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat);
    hand.scale.set(0.8, 1.2, 0.6);
    hand.position.y = -0.29;
    elbow.add(hand);
    shoulder.rotation.z = side * 0.12;
    return { shoulder, elbow };
  };
  const L = mkArm(-1), R = mkArm(1);
  if (opts.scale) root.scale.setScalar(opts.scale);
  return { root, joints: { hips, chest, head, shoulderL: L.shoulder, shoulderR: R.shoulder, elbowL: L.elbow, elbowR: R.elbow } };
}

function trumpet(mat: THREE.Material) {
  const g = new THREE.Group();
  const bell = new THREE.Mesh(
    new THREE.LatheGeometry([[0.008, 0], [0.012, 0.12], [0.02, 0.2], [0.035, 0.25], [0.06, 0.28]].map(([r, y]) => new THREE.Vector2(r, y)), 16, 0, Math.PI * 2),
    mat,
  );
  bell.rotation.x = Math.PI / 2;
  bell.position.z = 0.16;
  g.add(bell);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), mat);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(0, -0.03, 0.12);
  g.add(tube);
  const valves = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.08), mat);
  valves.position.set(0, -0.02, 0.1);
  g.add(valves);
  const mute = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.06, 14), mat);
  mute.rotation.x = Math.PI / 2;
  mute.position.z = 0.45;
  g.add(mute);
  return g;
}

function faceToward(obj: THREE.Object3D, target: THREE.Vector3, jitter = 0) {
  const d = target.clone().sub(obj.position);
  obj.rotation.y = Math.atan2(d.x, d.z) + jitter;
}

export interface Memory {
  group: THREE.Group;
  figures: Figure[];
  chairs: THREE.InstancedMesh;
  chairMat: THREE.ShaderMaterial;
  bassMat: THREE.ShaderMaterial;
  update(t: number, beat: number, warmth: number, nellPlaying: number, nellPulse: number, dt: number): void;
  setVisible(on: boolean): void;
}

export function buildMemory(chairGeometry: THREE.BufferGeometry, bassGeometry: THREE.BufferGeometry): Memory {
  const group = new THREE.Group();
  const figures: Figure[] = [];
  const amber = 0xffb468;
  const stageTarget = new THREE.Vector3(-3.4, 1.2, -3.2);

  const add = (kind: Figure['kind'], threshold: number, pose: Pose, pos: THREE.Vector3, opts: Parameters<typeof makeHuman>[2] = {}, color = amber) => {
    const mat = ghostMaterial(color);
    const human = makeHuman(mat, pose, opts);
    human.root.position.copy(pos);
    mat.uniforms.uFloor.value = pos.y;
    group.add(human.root);
    queueMicrotask(() => withDepthPrepass(human.root));
    const f: Figure = { root: human.root, mat, kind, threshold, phase: Math.random() * Math.PI * 2, joints: human.joints, opacity: 0 };
    figures.push(f);
    return f;
  };

  const nell = add('nell', 0, 'stand', SPOTS.nell, { dress: true, hair: true, scale: 0.97 }, 0xffc27a);
  nell.root.rotation.y = -0.45;
  const horn = trumpet(nell.mat);
  nell.root.add(horn);
  nell.prop = horn;

  const bassist = add('bassist', 0.2, 'stand', SPOTS.bassist, { coat: true, hat: true });
  bassist.root.rotation.y = -0.35;
  const bassMat = ghostMaterial(amber);
  bassMat.uniforms.uFloor.value = SPOTS.bassist.y;
  const bass = new THREE.Mesh(bassGeometry, bassMat);
  bass.position.set(-0.12, 0, 0.28);
  bass.rotation.set(-0.12, 0.3, 0.12);
  bassist.root.add(bass);
  bassist.prop = bass;

  const drummer = add('drummer', 0.38, 'sit', SPOTS.drums.clone().add(new THREE.Vector3(0, 0, -0.55)), {});
  drummer.root.rotation.y = 0;

  const mae = add('mae', 0.55, 'stand', SPOTS.mae, { dress: true, hair: true });
  mae.root.rotation.y = -Math.PI / 2 - 0.3;

  const chairMat = ghostMaterial(amber, 3.3);
  chairMat.uniforms.uFloor.value = -0.3;
  const seats: THREE.Matrix4[] = [];
  const tmp = new THREE.Object3D();
  TABLES.forEach(([tx, tz], ti) => {
    const count = ti % 3 === 0 ? 3 : 2;
    for (let s = 0; s < count; s++) {
      const toStage = Math.atan2(stageTarget.x - tx, stageTarget.z - tz);
      const a = toStage + Math.PI + (s - (count - 1) / 2) * 1.35;
      const px = tx + Math.sin(a) * 0.62, pz = tz + Math.cos(a) * 0.62;
      tmp.position.set(px, 0, pz);
      faceToward(tmp, new THREE.Vector3(tx, 0, tz));
      tmp.rotation.y += Math.PI;
      tmp.updateMatrix();
      seats.push(tmp.matrix.clone());
      const guest = add('guest', 0.5 + ((ti * 3 + s) % 7) * 0.06, 'sit', new THREE.Vector3(px, 0, pz), {
        dress: (ti + s) % 2 === 0,
        hair: (ti + s) % 2 === 0,
        coat: (ti + s) % 3 === 1,
        hat: (ti + s) % 2 === 1 && (ti * 7 + s) % 3 !== 0,
        scale: 0.94 + ((ti + s) % 4) * 0.03,
      });
      faceToward(guest.root, new THREE.Vector3(tx, 0, tz));
      const look = Math.atan2(stageTarget.x - px, stageTarget.z - pz);
      let delta = look - guest.root.rotation.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      guest.root.rotation.y += delta * 0.55;
      guest.joints.head.rotation.y = delta * 0.35;
      guest.joints.shoulderL.rotation.x = -0.9 - Math.random() * 0.3;
      guest.joints.elbowL.rotation.x = -0.6;
      guest.joints.shoulderR.rotation.x = -0.5 - Math.random() * 0.6;
      guest.joints.elbowR.rotation.x = -0.9;
    }
  });
  const chairs = new THREE.InstancedMesh(chairGeometry, chairMat, seats.length);
  seats.forEach((m, i) => {
    const flip = new THREE.Matrix4().makeRotationY(Math.PI);
    chairs.setMatrixAt(i, m.clone().multiply(flip));
  });
  group.add(chairs);
  withDepthPrepass(chairs);

  let visible = true;
  let chairOpacity = 0;

  return {
    group,
    figures,
    chairs,
    chairMat,
    bassMat,
    setVisible(on) {
      visible = on;
      group.visible = on;
    },
    update(t, beat, warmth, nellPlaying, nellPulse, dt) {
      if (!visible) return;
      const beatPhase = beat % 1;
      const onBeat = Math.pow(1 - beatPhase, 3);
      for (const f of figures) {
        const target = f.kind === 'nell' ? Math.min(1, 0.62 + warmth * 0.5) : THREE.MathUtils.smoothstep(warmth, f.threshold, f.threshold + 0.18);
        f.opacity += (target - f.opacity) * Math.min(1, dt * 1.5);
        f.mat.uniforms.uOpacity.value = f.opacity;
        f.mat.uniforms.uTime.value = t;
        const j = f.joints;
        const sway = Math.sin(beat * Math.PI + f.phase) * 0.03;
        if (f.kind === 'nell') {
          f.mat.uniforms.uPulse.value = nellPulse * 0.6;
          const up = nellPlaying;
          j.chest.rotation.z = sway * 1.3;
          j.chest.rotation.x = -0.08 * up + 0.04;
          j.head.rotation.x = -0.12 * up + 0.08 * (1 - up);
          j.shoulderR.rotation.set(-1.25 * up - 0.1, 0, 0.35 * up + 0.12);
          j.elbowR.rotation.set(-1.5 * up - 0.25, 0, 0);
          j.shoulderL.rotation.set(-1.2 * up - 0.05, 0, -0.45 * up - 0.12);
          j.elbowL.rotation.set(-1.55 * up - 0.2, 0, 0);
          const horn = f.prop!;
          horn.position.set(0.04 * (1 - up) + 0.19, 1.52 * up + 0.72 * (1 - up), 0.08 + 0.02 * up);
          horn.rotation.set(0.25 * up + 1.2 * (1 - up), 0, 0);
        } else if (f.kind === 'bassist') {
          f.mat.uniforms.uPulse.value = onBeat * 0.15;
          j.chest.rotation.z = sway;
          j.head.rotation.x = 0.1 + onBeat * 0.05;
          j.shoulderL.rotation.set(-1.8, 0, -0.1);
          j.elbowL.rotation.set(-1.1, 0, 0);
          j.shoulderR.rotation.set(-0.5, 0, 0.25 + onBeat * 0.1);
          j.elbowR.rotation.set(-0.8 - onBeat * 0.2, 0, 0);
          (f.prop as THREE.Mesh).material = bassMat;
          bassMat.uniforms.uOpacity.value = f.opacity * 0.8;
          bassMat.uniforms.uTime.value = t;
        } else if (f.kind === 'drummer') {
          const hitL = Math.pow(1 - ((beat + 0.5) % 1), 4), hitR = onBeat;
          j.chest.rotation.x = 0.1 + onBeat * 0.03;
          j.shoulderR.rotation.set(-0.9 - hitR * 0.25, 0, 0.3);
          j.elbowR.rotation.set(-0.8 + hitR * 0.3, 0, 0);
          j.shoulderL.rotation.set(-0.9 - hitL * 0.2, 0, -0.3);
          j.elbowL.rotation.set(-0.9 + hitL * 0.3, 0, 0);
          j.head.rotation.z = sway * 2;
        } else if (f.kind === 'mae') {
          j.shoulderR.rotation.set(-0.9 + Math.sin(t * 1.3) * 0.2, 0, 0.1);
          j.elbowR.rotation.set(-1.2, 0, 0);
          j.shoulderL.rotation.set(-0.8, 0, -0.2);
          j.elbowL.rotation.set(-1.3, 0, 0);
          j.head.rotation.y = Math.sin(t * 0.3) * 0.4 - 0.3;
        } else {
          j.chest.rotation.z = sway * 0.6;
          j.head.rotation.x = 0.04 + onBeat * 0.035 * Math.sin(f.phase);
        }
      }
      const target = THREE.MathUtils.smoothstep(warmth, 0.45, 0.8);
      chairOpacity += (target - chairOpacity) * Math.min(1, dt * 1.5);
      chairMat.uniforms.uOpacity.value = chairOpacity * 0.55;
      chairMat.uniforms.uTime.value = t;
    },
  };
}
