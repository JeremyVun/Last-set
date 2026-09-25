import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uWarmth: { value: 0 },
    uExposure: { value: 1 },
    uFade: { value: 0 },
    uGrain: { value: 0.05 },
    uDawn: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uSoft: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uWarmth;
    uniform float uExposure;
    uniform float uFade;
    uniform float uGrain;
    uniform float uDawn;
    uniform float uSoft;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 aces(vec3 x) {
      const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    void main() {
      vec2 uv = vUv;
      vec2 cc = uv - 0.5;
      float r2 = dot(cc, cc);
      float ca = 0.006 * r2 + uSoft * 0.002;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + cc * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - cc * ca).b;
      if (uSoft > 0.0) {
        vec2 px = 1.5 / uRes;
        vec3 blur = texture2D(tDiffuse, uv + vec2(px.x, 0.0)).rgb + texture2D(tDiffuse, uv - vec2(px.x, 0.0)).rgb +
                    texture2D(tDiffuse, uv + vec2(0.0, px.y)).rgb + texture2D(tDiffuse, uv - vec2(0.0, px.y)).rgb;
        col = mix(col, blur * 0.25, uSoft * 0.6);
      }
      float flicker = 1.0 + uWarmth * 0.025 * sin(uTime * 23.0) * sin(uTime * 7.3);
      col *= uExposure * flicker;
      col = aces(col);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 hiCool = vec3(0.86, 0.95, 1.1);
      vec3 hiWarm = vec3(1.16, 0.97, 0.74);
      vec3 hiDawn = vec3(0.95, 0.98, 1.05);
      vec3 hi = mix(mix(hiCool, hiWarm, uWarmth), hiDawn, uDawn);
      col = mix(col, col * hi, smoothstep(0.02, 0.5, l));
      vec3 shadowTint = mix(vec3(0.012, 0.026, 0.055), vec3(0.03, 0.022, 0.03), uWarmth * 0.6);
      col += shadowTint * (1.0 - smoothstep(0.0, 0.25, l));
      float sat = mix(0.72, 1.02, uWarmth);
      col = mix(vec3(l), col, sat);
      float vig = smoothstep(0.95, 0.18, length(cc * vec2(1.15, 1.0)));
      col *= mix(0.25, 1.0, vig);
      col = toSRGB(clamp(col, 0.0, 1.0));
      float g = hash(uv * uRes + fract(uTime * 13.7) * 91.0) - 0.5;
      col += g * uGrain * (1.2 - dot(col, vec3(0.33)));
      col *= uFade;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export interface Post {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  grade: ShaderPass;
  setSize(w: number, h: number, pr: number): void;
  render(): void;
}

export function buildPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): Post {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.5, 0.5, 0.92);
  // Specular spikes on the lacquer would otherwise bloom into huge discs.
  bloom.materialHighPassFilter.fragmentShader = bloom.materialHighPassFilter.fragmentShader.replace(
    'gl_FragColor = mix( outputColor, texel, alpha );',
    'gl_FragColor = min(mix( outputColor, texel, alpha ), vec4(2.5));',
  );
  bloom.materialHighPassFilter.needsUpdate = true;
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  return {
    composer,
    bloom,
    grade,
    setSize(w, h, pr) {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      bloom.resolution.set(w * 0.5, h * 0.5);
      grade.uniforms.uRes.value.set(w * pr, h * pr);
    },
    render() {
      composer.render();
    },
  };
}
