import * as THREE from 'three';
import { ROOM, SPOTS } from './club.ts';

const noiseGlsl = /* glsl */ `
float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}`;

function shaftMaterial(color: THREE.ColorRepresentation) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: 1 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float along;
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        vAlong = along;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uTime;
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vW;
      ${noiseGlsl}
      void main() {
        vec3 v = normalize(cameraPosition - vW);
        float facing = abs(dot(normalize(vN), v));
        float soft = pow(facing, 2.4);
        float along = smoothstep(0.0, 0.12, vAlong) * mix(1.0, 0.25, vAlong);
        float dust = 0.65 + 0.5 * vnoise(vW * 2.2 + vec3(0.0, uTime * 0.04, uTime * 0.02));
        float near = smoothstep(0.2, 1.4, length(cameraPosition - vW));
        float a = soft * along * dust * uIntensity * near;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
}

function coneShaft(tip: THREE.Vector3, target: THREE.Vector3, angle: number, mat: THREE.ShaderMaterial) {
  const len = tip.distanceTo(target);
  const geo = new THREE.ConeGeometry(Math.tan(angle) * len, len, 40, 8, true);
  const along = new Float32Array(geo.attributes.position.count);
  for (let i = 0; i < along.length; i++) along[i] = 0.5 - geo.attributes.position.getY(i) / len;
  geo.setAttribute('along', new THREE.BufferAttribute(along, 1));
  geo.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(tip);
  const dir = target.clone().sub(tip).normalize();
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  m.renderOrder = 5;
  return m;
}

function volumeMaterial(color: THREE.ColorRepresentation, inverse: THREE.Matrix4) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: 1 },
      uTime: { value: 0 },
      uInv: { value: inverse },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uTime;
      uniform mat4 uInv;
      varying vec3 vW;
      ${noiseGlsl}
      void main() {
        vec3 rd = normalize(vW - cameraPosition);
        vec3 o = (uInv * vec4(cameraPosition, 1.0)).xyz;
        vec3 d = (uInv * vec4(rd, 0.0)).xyz;
        vec3 t0 = (vec3(-0.5) - o) / d;
        vec3 t1 = (vec3(0.5) - o) / d;
        vec3 tn = min(t0, t1), tf = max(t0, t1);
        float a = max(max(tn.x, tn.y), tn.z);
        float b = min(min(tf.x, tf.y), tf.z);
        a = max(a, 0.0);
        b = min(b, length(vW - cameraPosition));
        float thick = max(0.0, b - a);
        vec3 mid = o + d * (a + b) * 0.5;
        float along = mid.z + 0.5;
        float edge = (1.0 - pow(abs(mid.x) * 2.0, 3.0)) * (1.0 - pow(abs(mid.y) * 2.0, 3.0));
        float fall = smoothstep(0.0, 0.08, along) * mix(1.0, 0.35, along);
        vec3 wm = cameraPosition + rd * (a + b) * 0.5;
        float dust = 0.6 + 0.6 * vnoise(wm * 2.5 + vec3(0.0, uTime * 0.05, uTime * 0.03));
        float v = thick * max(edge, 0.0) * fall * dust * uIntensity;
        gl_FragColor = vec4(uColor * v, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });
}

function volumeShaft(center: THREE.Vector3, across: THREE.Vector3, up: THREE.Vector3, along: THREE.Vector3, color: THREE.ColorRepresentation) {
  const m = new THREE.Matrix4().makeBasis(across, up, along).setPosition(center.clone().addScaledVector(along, 0.5));
  const mat = volumeMaterial(color, m.clone().invert());
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(m);
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  return mesh;
}

const windowShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uCar;
    uniform float uCarX;
    uniform float uDawn;
    uniform float uSeed;
    uniform float uRain;
    varying vec2 vUv;
    float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    vec3 street(vec2 uv) {
      vec3 night = mix(vec3(0.015, 0.03, 0.06), vec3(0.05, 0.09, 0.16), smoothstep(0.1, 1.0, uv.y));
      vec3 morning = mix(vec3(0.25, 0.3, 0.38), vec3(0.62, 0.7, 0.82), smoothstep(0.1, 1.0, uv.y));
      vec3 c = mix(night, morning, uDawn);
      float lamp = exp(-pow(length((uv - vec2(0.7 + uSeed * 0.2, 0.95)) * vec2(1.0, 1.6)) * 3.2, 2.0));
      c += vec3(0.55, 0.72, 1.0) * lamp * 1.4 * (1.0 - uDawn * 0.8);
      float wet = smoothstep(0.3, 0.0, uv.y) * (0.5 + 0.5 * sin(uv.x * 30.0 + uSeed * 10.0));
      c += vec3(0.3, 0.45, 0.7) * wet * lamp * 0.3;
      float kerb = smoothstep(0.2, 0.17, uv.y);
      c *= 1.0 - kerb * 0.6;
      float car = exp(-pow((uv.x - uCarX) * 3.0, 2.0)) * exp(-pow((uv.y - 0.28) * 7.0, 2.0));
      c += vec3(1.0, 0.95, 0.85) * car * uCar * 3.0;
      float rail = step(0.92, fract(uv.x * 7.0 + uSeed)) * step(0.2, uv.y);
      c *= 1.0 - rail * 0.85;
      return c;
    }
    vec2 dropLayer(vec2 uv, float t, float scale, inout float trail) {
      vec2 a = vec2(3.0, 1.0);
      vec2 st = uv * scale * a;
      vec2 id = floor(st);
      st.y += t * 0.22 + h21(vec2(id.x, 7.0));
      id = floor(st);
      vec2 f = fract(st) - 0.5;
      float n = h21(id + uSeed);
      float x = (n - 0.5) * 0.7;
      float ti = fract(t * 0.35 + n);
      float y = -0.4 + 0.8 * smoothstep(0.0, 0.85, ti) * (0.9 + 0.1 * sin(t * 7.0 + n * 20.0));
      vec2 p = (f - vec2(x + sin(uv.y * 30.0 + n * 6.0) * 0.03, y)) / a;
      float d = length(p);
      float drop = smoothstep(0.06, 0.035, d) * step(0.35, n);
      float tr = smoothstep(0.03, 0.0, abs(p.x)) * smoothstep(y, y + 0.5, f.y) * step(0.35, n);
      trail = max(trail, tr * (1.0 - smoothstep(0.0, 0.5, f.y - y)));
      return p * drop * 18.0;
    }
    vec2 staticDrops(vec2 uv, float scale) {
      vec2 st = uv * scale;
      vec2 id = floor(st);
      vec2 f = fract(st) - 0.5;
      float n = h21(id + uSeed * 3.1);
      vec2 o = vec2(h21(id + 1.3), h21(id + 2.7)) - 0.5;
      vec2 p = f - o * 0.6;
      float d = length(p);
      float s = smoothstep(0.18 * n, 0.1 * n, d) * step(0.55, n);
      return p * s * 4.0;
    }
    void main() {
      vec2 uv = vUv;
      float t = uTime + uSeed * 10.0;
      float trail = 0.0;
      vec2 off = dropLayer(uv, t, 5.0, trail) + dropLayer(uv * 1.3 + 0.2, t * 0.9, 7.0, trail);
      off += staticDrops(uv * vec2(2.0, 1.0), 26.0) + staticDrops(uv * vec2(2.0, 1.0) + 0.37, 38.0);
      off *= uRain;
      vec3 blurA = street(uv + off * 0.12);
      vec3 blurB = street(uv + off * 0.12 + vec2(0.01, 0.006));
      vec3 col = mix(blurA, blurB, 0.5);
      col += vec3(0.08, 0.12, 0.18) * trail * uRain;
      col *= 0.9 + 0.1 * smoothstep(0.0, 0.1, uv.x) * smoothstep(1.0, 0.9, uv.x);
      gl_FragColor = vec4(col * 1.6, 1.0);
    }`,
};

export interface Atmosphere {
  update(t: number, dt: number, warmth: number): void;
  stageShaft: THREE.ShaderMaterial;
  windowShaft: THREE.ShaderMaterial;
  ghostHalo: THREE.Sprite;
  setDawn(v: number): void;
  setRain(v: number): void;
  dust: THREE.Points;
}

export function buildAtmosphere(scene: THREE.Scene, windows: THREE.Mesh[], street: THREE.SpotLight, stage: THREE.SpotLight, alley: THREE.Mesh): Atmosphere {
  const group = new THREE.Group();
  scene.add(group);

  const alleyMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uDawn: { value: 0 } },
    vertexShader: windowShader.vertexShader,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uDawn;
      varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 uv = vUv;
        vec3 c = mix(vec3(0.008, 0.016, 0.03), vec3(0.03, 0.05, 0.09), uv.y);
        c = mix(c, vec3(0.3, 0.35, 0.45) * uv.y, uDawn * 0.6);
        float lamp = exp(-pow(length((uv - vec2(0.72, 0.86)) * vec2(1.0, 1.4)) * 4.5, 2.0));
        c += vec3(0.45, 0.6, 0.9) * lamp;
        float bricks = step(0.92, fract(uv.y * 26.0)) + step(0.95, fract(uv.x * 7.0 + floor(uv.y * 26.0) * 0.5));
        c *= 1.0 - 0.25 * clamp(bricks, 0.0, 1.0) * smoothstep(0.25, 0.4, uv.y);
        float wet = smoothstep(0.25, 0.0, uv.y);
        c += vec3(0.25, 0.35, 0.55) * wet * (0.2 + lamp * 2.0) * (0.6 + 0.4 * sin(uv.x * 50.0 + uTime * 2.0));
        float r = 0.0;
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          vec2 st = uv * vec2(40.0 + fi * 25.0, 2.0) + vec2(fi * 3.1, uTime * (2.5 + fi * 0.8));
          vec2 id = floor(st);
          float k = h(id);
          float y = fract(st.y + k * 7.0);
          float x = abs(fract(st.x) - 0.5);
          r += step(0.55, k) * smoothstep(0.6, 0.0, y) * smoothstep(0.08, 0.0, x);
        }
        c += vec3(0.55, 0.65, 0.85) * r * (0.12 + lamp * 0.8);
        gl_FragColor = vec4(c * 1.4, 1.0);
      }`,
  });
  alley.material = alleyMat;

  const windowMats = windows.map((w, i) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCar: { value: 0 },
        uCarX: { value: 0 },
        uDawn: { value: 0 },
        uSeed: { value: i * 0.37 + 0.1 },
        uRain: { value: 1 },
      },
      vertexShader: windowShader.vertexShader,
      fragmentShader: windowShader.fragmentShader,
    });
    w.material = mat;
    return mat;
  });

  const windowShafts: THREE.ShaderMaterial[] = [];
  for (const w of windows) {
    const wz = w.userData.windowZ as number;
    const center = new THREE.Vector3(ROOM.x0 + 0.02, 2.77, wz);
    const dir = center.clone().sub(street.position).normalize();
    const along = dir.clone().multiplyScalar((center.y - 0.0) / -dir.y);
    const shaft = volumeShaft(center, new THREE.Vector3(0, 0, 1.15), new THREE.Vector3(0, 0.62, 0), along, 0x86aef0);
    windowShafts.push(shaft.material as THREE.ShaderMaterial);
    group.add(shaft);
  }
  const windowShaft = windowShafts[0];

  const stageShaft = shaftMaterial(0xffc890);
  stageShaft.uniforms.uIntensity.value = 0;
  group.add(coneShaft(stage.position, stage.target.position.clone().add(new THREE.Vector3(0, -0.2, 0)), stage.angle * 0.85, stageShaft));

  const haloTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,240,220,1)');
    grd.addColorStop(0.15, 'rgba(255,220,180,0.35)');
    grd.addColorStop(0.5, 'rgba(255,200,150,0.06)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const ghostHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.4 }));
  ghostHalo.position.copy(SPOTS.ghostLight).add(new THREE.Vector3(0, 1.64, 0));
  ghostHalo.scale.setScalar(0.42);
  group.add(ghostHalo);

  const count = 900;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const zone = i % 3;
    let x: number, y: number, z: number;
    if (zone === 0) {
      x = -4.6 + Math.random() * 3.6;
      y = 0.4 + Math.random() * 2.8;
      z = -4.2 + Math.random() * 3.2;
    } else if (zone === 1) {
      x = -6.9 + Math.random() * 4.5;
      y = Math.random() * 3.1;
      z = -1.6 + Math.random() * 6.4;
    } else {
      x = -6 + Math.random() * 12.5;
      y = Math.random() * 3.3;
      z = -4.8 + Math.random() * 9.5;
    }
    positions.set([x, y, z], i * 3);
    seeds[i] = Math.random();
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  dustGeo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const dustMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWarm: { value: 0 },
      uPixel: { value: Math.min(window.devicePixelRatio, 2) },
      uStage: { value: new THREE.Vector3(-3.6, 0.36, -3.2) },
      uStageOn: { value: 0 },
      uLight: { value: SPOTS.ghostLight.clone().add(new THREE.Vector3(0, 1.64, 0)) },
    },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float uTime;
      uniform float uPixel;
      uniform vec3 uLight;
      uniform float uStageOn;
      varying float vA;
      void main() {
        vec3 p = position;
        float t = uTime * (0.02 + seed * 0.03);
        p.x += sin(t * 3.0 + seed * 40.0) * 0.25;
        p.y += mod(t * 0.5 + seed * 3.3, 3.3) - 1.65 + sin(t * 5.0 + seed * 9.0) * 0.1;
        p.y = mod(p.y, 3.3);
        p.z += cos(t * 2.3 + seed * 17.0) * 0.25;
        float nearLight = exp(-pow(length(p - uLight) * 0.55, 2.0));
        float inWindow = smoothstep(-2.5, -5.5, p.x) * smoothstep(-1.8, 0.2, p.z);
        float inStage = uStageOn * smoothstep(1.8, 0.4, length(p.xz - vec2(-3.4, -3.0)));
        vA = (0.12 + nearLight * 1.2 + inWindow * 0.55 + inStage * 1.3) * (0.5 + 0.5 * sin(uTime * (0.5 + seed) + seed * 30.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (1.2 + seed * 1.8) * uPixel * (4.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uWarm;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA;
        vec3 c = mix(vec3(0.7, 0.82, 1.0), vec3(1.0, 0.8, 0.55), uWarm);
        gl_FragColor = vec4(c * a * 0.6, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  group.add(dust);

  const carLight = new THREE.SpotLight(0xdde8ff, 0, 20, 0.35, 0.8, 1.2);
  carLight.position.set(ROOM.x0 - 1.5, 2.8, 0);
  carLight.target.position.set(4, 3.6, 0);
  scene.add(carLight, carLight.target);

  let nextCar = 6 + Math.random() * 8;
  let carT = -1;
  let carDir = 1;
  let dawn = 0;

  return {
    stageShaft,
    windowShaft,
    ghostHalo,
    dust,
    setDawn(v) {
      dawn = v;
    },
    setRain(v) {
      for (const m of windowMats) m.uniforms.uRain.value = v;
    },
    update(t, dt, warmth) {
      for (const m of windowMats) {
        m.uniforms.uTime.value = t;
        m.uniforms.uDawn.value = dawn;
      }
      alleyMat.uniforms.uTime.value = t;
      alleyMat.uniforms.uDawn.value = dawn;
      for (const m of windowShafts) {
        m.uniforms.uTime.value = t;
        m.uniforms.uIntensity.value = 0.11 * (1 - warmth * 0.5) + dawn * 0.1;
      }
      stageShaft.uniforms.uTime.value = t;
      dustMat.uniforms.uTime.value = t;
      dustMat.uniforms.uWarm.value = warmth;
      dustMat.uniforms.uStageOn.value = stage.intensity > 0 ? Math.min(1, stage.intensity / 40) : 0;

      nextCar -= dt;
      if (nextCar <= 0 && carT < 0) {
        carT = 0;
        carDir = Math.random() > 0.5 ? 1 : -1;
        nextCar = 14 + Math.random() * 22;
      }
      if (carT >= 0) {
        carT += dt / 3.2;
        const k = Math.sin(Math.min(1, carT) * Math.PI);
        const x = carDir > 0 ? carT : 1 - carT;
        const z = THREE.MathUtils.lerp(-3.5, 6, x);
        carLight.position.z = z - carDir * 1.5;
        carLight.target.position.set(5, 3.2, z + carDir * 2.5);
        carLight.intensity = 90 * k * (1 - dawn);
        for (const m of windowMats) {
          const wz = (windows[windowMats.indexOf(m)].userData.windowZ as number);
          m.uniforms.uCar.value = k;
          m.uniforms.uCarX.value = 0.5 + (z - wz) * -0.45 * 1.0;
        }
        if (carT >= 1) {
          carT = -1;
          carLight.intensity = 0;
          for (const m of windowMats) m.uniforms.uCar.value = 0;
        }
      }
    },
  };
}
