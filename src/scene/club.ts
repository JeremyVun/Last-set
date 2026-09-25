import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { brick, planks, plaster, wood, labelTexture, loadImage } from './textures.ts';

export const ROOM = { x0: -7, x1: 7, z0: -5, z1: 5, h: 3.4, stageH: 0.36 };
export const SPOTS = {
  piano: new THREE.Vector3(-5.1, ROOM.stageH, -3.25),
  bench: new THREE.Vector3(-5.78, ROOM.stageH, -3.25),
  nell: new THREE.Vector3(-3.0, ROOM.stageH, -2.62),
  mic: new THREE.Vector3(-2.88, ROOM.stageH, -2.34),
  drums: new THREE.Vector3(-3.1, ROOM.stageH, -4.35),
  bassist: new THREE.Vector3(-1.85, ROOM.stageH, -3.75),
  ghostLight: new THREE.Vector3(-3.55, ROOM.stageH, -4.05),
  mae: new THREE.Vector3(6.35, 0, -1.6),
};
export const TABLES: [number, number][] = [
  [-4.6, 0.1], [-2.1, 0.9], [0.2, -1.1], [0.5, 2.0], [-3.3, 3.0], [2.4, 0.4], [2.5, -2.6],
];

export interface Hotspot {
  id: string;
  mesh: THREE.Object3D;
  focus: THREE.Vector3;
  view: { pos: THREE.Vector3; look: THREE.Vector3 };
}

export interface Club {
  root: THREE.Group;
  hotspots: Hotspot[];
  pressKey(midi: number, down: boolean): void;
  materials: Record<string, THREE.Material>;
  lights: {
    ambient: THREE.HemisphereLight;
    street: THREE.SpotLight;
    ghost: THREE.PointLight;
    ghostBulb: THREE.Mesh;
    neon: THREE.PointLight;
    stage: THREE.SpotLight;
    candles: THREE.PointLight[];
    candleFlames: THREE.Mesh[];
    bar: THREE.PointLight;
    dawn: THREE.PointLight;
    exit: THREE.PointLight;
  };
  neonMat: THREE.MeshBasicMaterial;
  exitMat: THREE.MeshBasicMaterial;
  barGlowMat: THREE.MeshBasicMaterial;
  pendantMat: THREE.MeshBasicMaterial;
  windows: THREE.Mesh[];
  door: THREE.Object3D;
  alley: THREE.Mesh;
  chairGeometry: THREE.BufferGeometry;
  bassGeometry: THREE.BufferGeometry;
  dawnMat: THREE.MeshBasicMaterial;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function cyl(rt: number, rb: number, h: number, mat: THREE.Material, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

const flat = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);

function pianoOutline() {
  const s = new THREE.Shape();
  s.moveTo(-0.72, 0);
  s.lineTo(0.72, 0);
  s.lineTo(0.72, 0.32);
  s.bezierCurveTo(0.72, 0.78, 0.1, 0.8, 0.02, 1.22);
  s.bezierCurveTo(-0.04, 1.52, -0.2, 1.72, -0.5, 1.72);
  s.bezierCurveTo(-0.66, 1.72, -0.72, 1.62, -0.72, 1.48);
  s.lineTo(-0.72, 0);
  return s;
}

function bassOutline() {
  const s = new THREE.Shape();
  const pts: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const y = t * 1.1;
    const lower = 0.33 * Math.sin(Math.PI * Math.min(1, y / 0.62));
    const upper = 0.26 * Math.sin(Math.PI * Math.max(0, (y - 0.52) / 0.62));
    const waist = y > 0.5 && y < 0.66 ? 0.2 + 0.03 * Math.cos(((y - 0.58) / 0.08) * Math.PI) : 0;
    const w = Math.max(lower * (y < 0.62 ? 1 : 0), upper * (y > 0.52 ? 1 : 0), waist, 0.02 + 0.2 * Math.sin(Math.PI * t) * 0.2);
    pts.push([w, y]);
  }
  s.moveTo(0, 0);
  for (const [w, y] of pts) s.lineTo(w, y);
  for (let i = pts.length - 1; i >= 0; i--) s.lineTo(-pts[i][0], pts[i][1]);
  return s;
}

export function makeBassGeometry() {
  const body = new THREE.ExtrudeGeometry(bassOutline(), { depth: 0.2, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 4 });
  body.translate(0, 0.08, -0.1);
  const neck = new THREE.BoxGeometry(0.06, 0.72, 0.05);
  neck.translate(0, 1.5, 0.08);
  const board = new THREE.BoxGeometry(0.07, 0.95, 0.02);
  board.translate(0, 1.2, 0.12);
  const scroll = new THREE.TorusGeometry(0.045, 0.018, 6, 12);
  scroll.rotateY(Math.PI / 2);
  scroll.translate(0, 1.9, 0.07);
  const pin = new THREE.CylinderGeometry(0.008, 0.008, 0.14);
  pin.translate(0, 0.03, 0);
  const g = mergeGeometries([body, neck, board, scroll, pin].map(flat));
  g.computeVertexNormals();
  return g;
}

export function makeChairGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const seat = new THREE.CylinderGeometry(0.2, 0.2, 0.035, 20);
  seat.translate(0, 0.46, 0);
  parts.push(seat);
  const ring = new THREE.TorusGeometry(0.17, 0.008, 5, 20);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 0.2, 0);
  parts.push(ring);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.CylinderGeometry(0.012, 0.014, 0.47, 6);
    leg.rotateZ(0.05);
    leg.rotateY(-a);
    leg.translate(Math.cos(a) * 0.165, 0.23, Math.sin(a) * 0.165);
    parts.push(leg);
  }
  for (const side of [-1, 1]) {
    const post = new THREE.CylinderGeometry(0.012, 0.012, 0.44, 6);
    post.translate(side * 0.15, 0.68, -0.15);
    parts.push(post);
  }
  const back = new THREE.TorusGeometry(0.16, 0.014, 5, 16, Math.PI);
  back.translate(0, 0.78, -0.15);
  parts.push(back);
  const g = mergeGeometries(parts.map(flat));
  g.computeVertexNormals();
  return g;
}

export function buildClub(): Club {
  const root = new THREE.Group();
  const hotspots: Hotspot[] = [];

  const floorTex = planks([7, 3]);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex.map, roughnessMap: floorTex.rough, roughness: 0.7, color: 0x8a7468, envMapIntensity: 1.0 });
  const brickTex = brick([5, 2]);
  const brickMat = new THREE.MeshStandardMaterial({ map: brickTex.map, bumpMap: brickTex.bump, bumpScale: 2.5, roughness: 0.92, color: 0xb0a8a8 });
  const wallMat = new THREE.MeshStandardMaterial({ map: plaster([3, 1], '#2a3748'), roughness: 0.95 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x07090d, roughness: 1 });
  const trimMat = new THREE.MeshStandardMaterial({ map: wood([1, 1], [34, 20, 14]), roughness: 0.5 });
  const darkWood = new THREE.MeshStandardMaterial({ map: wood([2, 1], [40, 24, 16]), roughness: 0.35, envMapIntensity: 1.2 });
  const lacquer = new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.55, specularIntensity: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.07, envMapIntensity: 1.2 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a26b, metalness: 1, roughness: 0.32 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xaab4c0, metalness: 1, roughness: 0.22 });
  const blackMetal = new THREE.MeshStandardMaterial({ color: 0x111317, metalness: 0.6, roughness: 0.5 });
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x1b2129, metalness: 0.2, roughness: 0.8, envMapIntensity: 0.3 });
  const stageMat = new THREE.MeshStandardMaterial({ map: wood([3, 1], [30, 22, 18]), roughness: 0.55 });
  const tableMat = new THREE.MeshStandardMaterial({ map: wood([1, 1], [44, 26, 18]), roughness: 0.3, envMapIntensity: 1.3 });
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.45 });
  const velvet = new THREE.MeshStandardMaterial({ color: 0x1c1a2c, roughness: 1 });

  const { x0, x1, z0, z1, h, stageH } = ROOM;
  const W = x1 - x0, D = z1 - z0;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D - 0.9), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, h, -0.45);
  root.add(ceil);
  const ceilFront = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 0.9), ceilMat);
  ceilFront.rotation.x = Math.PI / 2;
  ceilFront.position.set(x0 + 2.35, h, z1 - 0.45);
  root.add(ceilFront);

  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, h), wallMat);
  back.position.set(0, h / 2, z0);
  back.receiveShadow = true;
  root.add(back);
  const brickWall = new THREE.Mesh(new THREE.PlaneGeometry(6.2, h), brickMat);
  brickWall.position.set(x0 + 3.1, h / 2, z0 + 0.01);
  brickWall.receiveShadow = true;
  root.add(brickWall);

  const front = new THREE.Mesh(new THREE.PlaneGeometry(W, h), wallMat);
  front.rotation.y = Math.PI;
  front.position.set(0, h / 2, z1);
  root.add(front);

  const right = new THREE.Mesh(new THREE.PlaneGeometry(D, h), wallMat);
  right.rotation.y = -Math.PI / 2;
  right.position.set(x1, h / 2, 0);
  right.receiveShadow = true;
  root.add(right);

  // Left wall is built around three street-level window openings so the street lamp only enters through them.
  const winZ = [-0.7, 1.7, 3.9], winW = 1.25, winY0 = 2.42, winY1 = 3.12;
  const leftWall = new THREE.Group();
  const wallPiece = (zc: number, zw: number, yc: number, yh: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, yh, zw), wallMat);
    m.position.set(x0 - 0.15, yc, zc);
    m.castShadow = m.receiveShadow = true;
    leftWall.add(m);
  };
  wallPiece(0, D, winY0 / 2, winY0);
  wallPiece(0, D, (winY1 + h + 2) / 2, h + 2 - winY1);
  let zPrev = z0;
  for (const wz of winZ) {
    const a = wz - winW / 2;
    wallPiece((zPrev + a) / 2, a - zPrev, (winY0 + winY1) / 2, winY1 - winY0);
    zPrev = wz + winW / 2;
  }
  wallPiece((zPrev + z1) / 2, z1 - zPrev, (winY0 + winY1) / 2, winY1 - winY0);
  root.add(leftWall);

  const windows: THREE.Mesh[] = [];
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0c0f14, roughness: 0.7 });
  for (const wz of winZ) {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winY1 - winY0), new THREE.MeshBasicMaterial({ color: 0x223 }));
    glass.rotation.y = Math.PI / 2;
    glass.position.set(x0 - 0.22, (winY0 + winY1) / 2, wz);
    glass.userData.windowZ = wz;
    windows.push(glass);
    root.add(glass);
    const mull = box(0.04, winY1 - winY0, 0.04, frameMat, x0 - 0.2, (winY0 + winY1) / 2, wz);
    root.add(mull);
    for (const bz of [-0.3, 0.3]) root.add(box(0.02, winY1 - winY0, 0.015, blackMetal, x0 - 0.06, (winY0 + winY1) / 2, wz + bz));
    root.add(box(0.34, 0.05, winW + 0.1, frameMat, x0 - 0.12, winY0 - 0.02, wz));
    const hit = box(0.1, winY1 - winY0, winW, new THREE.MeshBasicMaterial({ visible: false }), x0 + 0.05, (winY0 + winY1) / 2, wz);
    hit.castShadow = false;
    root.add(hit);
    if (wz === winZ[1])
      hotspots.push({ id: 'window', mesh: hit, focus: new THREE.Vector3(x0, 2.8, wz), view: { pos: new THREE.Vector3(-4.2, 1.9, 2.4), look: new THREE.Vector3(x0, 2.75, wz) } });
  }

  const skirting = new THREE.MeshStandardMaterial({ color: 0x0d0f13, roughness: 0.6 });
  root.add(box(0.03, 0.14, D, skirting, x1 - 0.015, 0.07, 0));
  root.add(box(0.03, 0.14, D, skirting, x0 + 0.015, 0.07, 0));
  root.add(box(W, 0.14, 0.03, skirting, 0, 0.07, z1 - 0.015));

  for (const [pz, len, r] of [[-4.6, 14, 0.07], [0, 14, 0.05], [2, 14, 0.09]] as const) {
    const p = cyl(r, r, len, pipeMat, 10);
    p.rotation.z = Math.PI / 2;
    p.position.set(0, h - 0.18 - r, pz);
    p.castShadow = false;
    root.add(p);
  }
  for (const px of [-4.5, 0.5, 4.2]) {
    const p = cyl(0.04, 0.04, D, pipeMat, 8);
    p.rotation.x = Math.PI / 2;
    p.position.set(px, h - 0.1, 0);
    p.castShadow = false;
    root.add(p);
  }
  const duct = box(0.6, 0.35, D, pipeMat, 2.6, h - 0.2, 0);
  duct.castShadow = false;
  root.add(duct);

  // Stage
  root.add(box(6.2 - 0.4, stageH, 2.8, stageMat, x0 + 2.9, stageH / 2, z0 + 1.4));
  root.add(box(5.8, 0.06, 0.04, brass, x0 + 2.9, stageH - 0.03, z0 + 2.82));
  root.add(box(5.8, stageH - 0.02, 0.02, velvet, x0 + 2.9, (stageH - 0.02) / 2, z0 + 2.81));
  for (let i = 0; i < 2; i++) root.add(box(0.8, stageH * (i + 1) / 3, 0.28, stageMat, -1.35, (stageH * (i + 1)) / 6, z0 + 2.95 + 0.28 * (1 - i)));

  // Piano
  const piano = new THREE.Group();
  piano.position.copy(SPOTS.piano);
  piano.rotation.y = -Math.PI / 2;
  const caseGeo = new THREE.ExtrudeGeometry(pianoOutline(), { depth: 0.3, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 24 });
  caseGeo.rotateX(-Math.PI / 2);
  const pcase = new THREE.Mesh(caseGeo, lacquer);
  pcase.position.y = 0.64;
  pcase.castShadow = pcase.receiveShadow = true;
  piano.add(pcase);
  const plateShape = pianoOutline();
  const plateGeo = new THREE.ShapeGeometry(plateShape, 24);
  plateGeo.rotateX(-Math.PI / 2);
  const plate = new THREE.Mesh(plateGeo, new THREE.MeshStandardMaterial({ color: 0x8a6a36, metalness: 0.8, roughness: 0.45 }));
  plate.scale.set(0.93, 1, 0.93);
  plate.position.set(0, 0.935, -0.06);
  piano.add(plate);
  const strings = new THREE.Mesh(
    plateGeo.clone(),
    new THREE.MeshStandardMaterial({
      map: labelTexture((g, w, hh) => {
        g.clearRect(0, 0, w, hh);
        for (let i = 0; i < 90; i++) {
          g.fillStyle = i % 3 ? 'rgba(210,200,180,0.55)' : 'rgba(170,120,70,0.7)';
          g.fillRect((i / 90) * w, 0, 1, hh);
        }
      }, 512, 64),
      transparent: true,
      metalness: 1,
      roughness: 0.3,
    }),
  );
  strings.material.map!.repeat.set(1.4, 1);
  strings.scale.set(0.85, 1, 0.85);
  strings.position.set(0, 0.945, -0.12);
  piano.add(strings);
  const lidGeo = new THREE.ExtrudeGeometry(pianoOutline(), { depth: 0.022, bevelEnabled: false, curveSegments: 24 });
  lidGeo.rotateX(-Math.PI / 2);
  lidGeo.translate(0.72, 0, 0);
  const lidPivot = new THREE.Group();
  lidPivot.position.set(-0.72, 0.955, 0);
  const lid = new THREE.Mesh(lidGeo, lacquer);
  lid.castShadow = true;
  lidPivot.add(lid);
  lidPivot.rotation.z = 0.004;
  lid.scale.set(1, 1, 0.84);
  lid.position.z = -0.27;
  piano.add(lidPivot);
  const fallboard = box(1.44, 0.16, 0.26, lacquer, 0, 0.87, 0.02);
  piano.add(fallboard);
  const keybed = box(1.36, 0.06, 0.34, lacquer, 0, 0.66, 0.16);
  piano.add(keybed);
  for (const sx of [-0.7, 0.7]) piano.add(box(0.05, 0.12, 0.34, lacquer, sx, 0.72, 0.17));
  for (const [lx, lz] of [[-0.6, 0.05], [0.6, 0.05], [-0.45, -1.52]] as const) {
    const leg = cyl(0.05, 0.035, 0.64, lacquer, 12);
    leg.position.set(lx, 0.32, lz);
    piano.add(leg);
    const wheel = cyl(0.03, 0.03, 0.03, brass, 10);
    wheel.position.set(lx, 0.015, lz);
    piano.add(wheel);
  }
  const lyre = box(0.14, 0.5, 0.03, lacquer, 0, 0.36, -0.12);
  piano.add(lyre);
  for (const px of [-0.05, 0, 0.05]) piano.add(box(0.025, 0.012, 0.08, brass, px, 0.06, -0.06));

  const whiteKeys: number[] = [], blackKeys: number[] = [];
  for (let m = 21; m <= 108; m++) ([1, 3, 6, 8, 10].includes(m % 12) ? blackKeys : whiteKeys).push(m);
  const keyW = 1.3 / whiteKeys.length;
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.35 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.3 });
  const whiteMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(keyW * 0.92, 0.022, 0.15), whiteMat, whiteKeys.length);
  const blackMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(keyW * 0.55, 0.03, 0.09), blackMat, blackKeys.length);
  const keyIndex = new Map<number, { mesh: THREE.InstancedMesh; i: number; x: number; black: boolean }>();
  const tmp = new THREE.Object3D();
  whiteKeys.forEach((m, i) => {
    const x = -0.65 + keyW * (i + 0.5);
    keyIndex.set(m, { mesh: whiteMesh, i, x, black: false });
  });
  blackKeys.forEach((m, i) => {
    const left = keyIndex.get(m - 1)!;
    keyIndex.set(m, { mesh: blackMesh, i, x: left.x + keyW / 2, black: true });
  });
  const placeKey = (m: number, down: boolean) => {
    const k = keyIndex.get(m);
    if (!k) return;
    tmp.position.set(k.x, k.black ? 0.765 : 0.745, k.black ? 0.1 : 0.13);
    tmp.rotation.set(down ? 0.06 : 0, 0, 0);
    if (down) tmp.position.y -= 0.008;
    tmp.updateMatrix();
    k.mesh.setMatrixAt(k.i, tmp.matrix);
    k.mesh.instanceMatrix.needsUpdate = true;
  };
  for (const m of keyIndex.keys()) placeKey(m, false);
  piano.add(whiteMesh, blackMesh);
  root.add(piano);

  const bench = new THREE.Group();
  bench.position.copy(SPOTS.bench);
  bench.add(box(0.36, 0.06, 0.76, lacquer, 0, 0.5, 0));
  bench.add(box(0.34, 0.03, 0.72, velvet, 0, 0.545, 0));
  for (const [bx, bz] of [[-0.14, -0.32], [0.14, -0.32], [-0.14, 0.32], [0.14, 0.32]]) bench.add(box(0.04, 0.48, 0.04, lacquer, bx, 0.24, bz));
  root.add(bench);

  const pianoHit = box(1.9, 0.9, 1.6, new THREE.MeshBasicMaterial({ visible: false }), -4.25, stageH + 0.55, -3.25);
  pianoHit.castShadow = false;
  root.add(pianoHit);
  hotspots.push({
    id: 'piano',
    mesh: pianoHit,
    focus: new THREE.Vector3(-4.6, 1.3, -3.2),
    view: { pos: new THREE.Vector3(-6.05, 1.62, -2.72), look: new THREE.Vector3(-2.3, 1.12, -2.35) },
  });

  // The envelope rests on the music desk
  const envTex = labelTexture((g, w, hh) => {
    g.fillStyle = '#d9cfb8';
    g.fillRect(0, 0, w, hh);
    g.strokeStyle = 'rgba(80,60,40,0.4)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(w / 2, hh * 0.55);
    g.lineTo(w, 0);
    g.stroke();
    g.fillStyle = '#2b3b6b';
    g.font = 'italic 34px Spectral, serif';
    g.fillText('par avion', 20, hh - 30);
    g.fillStyle = '#7a3a2a';
    g.fillRect(w - 70, 16, 50, 60);
  }, 256, 180);
  const envelope = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.16), new THREE.MeshStandardMaterial({ map: envTex, roughness: 0.9 }));
  envelope.position.set(SPOTS.piano.x + 0.45, 0.99, SPOTS.piano.z + 0.18);
  envelope.rotation.set(-Math.PI / 2, 0, -Math.PI / 2 + 0.25);
  envelope.castShadow = true;
  root.add(envelope);
  const envHit = box(0.4, 0.2, 0.45, new THREE.MeshBasicMaterial({ visible: false }), SPOTS.piano.x + 0.45, 1.02, SPOTS.piano.z + 0.18);
  envHit.castShadow = false;
  root.add(envHit);
  hotspots.push({
    id: 'envelope',
    mesh: envHit,
    focus: envelope.position.clone(),
    view: { pos: new THREE.Vector3(-5.55, 1.62, -2.9), look: new THREE.Vector3(SPOTS.piano.x + 0.45, 0.99, SPOTS.piano.z + 0.18) },
  });

  // Mic stand
  const mic = new THREE.Group();
  mic.position.copy(SPOTS.mic);
  const micBase = cyl(0.14, 0.15, 0.03, blackMetal, 20);
  micBase.position.y = 0.015;
  mic.add(micBase);
  const pole = cyl(0.012, 0.012, 1.42, chrome, 8);
  pole.position.y = 0.72;
  mic.add(pole);
  const capsule = new THREE.Mesh(
    new THREE.LatheGeometry([0, 0.03, 0.045, 0.05, 0.048, 0.04, 0.025, 0].map((r, i) => new THREE.Vector2(r, i * 0.022)), 16),
    chrome,
  );
  capsule.position.y = 1.46;
  capsule.rotation.x = -0.35;
  capsule.castShadow = true;
  mic.add(capsule);
  root.add(mic);

  // Drum kit
  const kit = new THREE.Group();
  kit.position.copy(SPOTS.drums);
  const shell = new THREE.MeshStandardMaterial({ color: 0x3a1418, roughness: 0.3, metalness: 0.2, envMapIntensity: 1.4 });
  const head = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.8 });
  const kick = cyl(0.26, 0.26, 0.36, shell, 24);
  kick.rotation.x = Math.PI / 2;
  kick.position.set(0, 0.27, 0.05);
  kit.add(kick);
  const kickHead = new THREE.Mesh(
    new THREE.CircleGeometry(0.25, 24),
    new THREE.MeshStandardMaterial({
      roughness: 0.8,
      map: labelTexture((g, w, hh) => {
        g.fillStyle = '#d8d0bf';
        g.fillRect(0, 0, w, hh);
        g.fillStyle = '#1d3a5f';
        g.font = '72px "League Gothic", sans-serif';
        g.textAlign = 'center';
        g.fillText('NIGHTJAR', w / 2, hh / 2 + 24);
      }),
    }),
  );
  kickHead.position.set(0, 0.27, 0.235);
  kit.add(kickHead);
  const snare = cyl(0.17, 0.17, 0.13, shell, 20);
  snare.position.set(-0.28, 0.62, -0.18);
  kit.add(snare);
  const snareTop = cyl(0.168, 0.168, 0.005, head, 20);
  snareTop.position.set(-0.28, 0.69, -0.18);
  kit.add(snareTop);
  const tom = cyl(0.14, 0.14, 0.2, shell, 18);
  tom.position.set(0.05, 0.62, -0.02);
  tom.rotation.x = -0.3;
  kit.add(tom);
  const floorTom = cyl(0.2, 0.2, 0.36, shell, 20);
  floorTom.position.set(0.42, 0.3, -0.3);
  kit.add(floorTom);
  const cymbalGeo = new THREE.CylinderGeometry(0.012, 0.26, 0.025, 28);
  const ride = new THREE.Mesh(cymbalGeo, brass);
  ride.position.set(0.45, 0.98, 0.05);
  ride.rotation.z = -0.18;
  ride.castShadow = true;
  kit.add(ride);
  const hat1 = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.18, 0.02, 24), brass);
  hat1.position.set(-0.6, 0.86, -0.12);
  kit.add(hat1);
  const hat2 = hat1.clone();
  hat2.rotation.x = Math.PI;
  hat2.position.y = 0.84;
  kit.add(hat2);
  for (const [sx, sy, sz] of [[0.45, 0.98, 0.05], [-0.6, 0.86, -0.12], [-0.28, 0.6, -0.18]] as const) {
    const st = cyl(0.008, 0.008, sy, chrome, 6);
    st.position.set(sx, sy / 2, sz);
    kit.add(st);
  }
  const throne = cyl(0.17, 0.15, 0.08, velvet, 16);
  throne.position.set(0, 0.5, -0.55);
  kit.add(throne);
  const thronePole = cyl(0.02, 0.02, 0.46, chrome, 6);
  thronePole.position.set(0, 0.23, -0.55);
  kit.add(thronePole);
  root.add(kit);
  const kitHit = box(1.4, 1.1, 1.1, new THREE.MeshBasicMaterial({ visible: false }), SPOTS.drums.x, stageH + 0.55, SPOTS.drums.z);
  kitHit.castShadow = false;
  root.add(kitHit);
  hotspots.push({ id: 'drums', mesh: kitHit, focus: new THREE.Vector3(SPOTS.drums.x, 0.9, SPOTS.drums.z), view: { pos: new THREE.Vector3(-1.6, 1.8, -1.2), look: new THREE.Vector3(SPOTS.drums.x, 0.8, SPOTS.drums.z) } });

  // House bass leaning against the brick
  const bassGeometry = makeBassGeometry();
  const bassMat = new THREE.MeshStandardMaterial({ color: 0x5a2a14, roughness: 0.28, envMapIntensity: 1.5 });
  const bassMesh = new THREE.Mesh(bassGeometry, bassMat);
  bassMesh.position.set(-1.65, stageH, z0 + 0.32);
  bassMesh.rotation.set(-0.16, 0.25, 0.05);
  bassMesh.castShadow = true;
  root.add(bassMesh);
  const bassHit = box(0.7, 1.9, 0.5, new THREE.MeshBasicMaterial({ visible: false }), -1.65, stageH + 0.95, z0 + 0.35);
  bassHit.castShadow = false;
  root.add(bassHit);
  hotspots.push({ id: 'bass', mesh: bassHit, focus: new THREE.Vector3(-1.65, 1.2, z0 + 0.35), view: { pos: new THREE.Vector3(0.1, 1.5, -2.3), look: new THREE.Vector3(-1.65, 1.15, z0 + 0.3) } });

  // Ghost light: a bare bulb on a stand, left burning on the empty stage
  const gl = new THREE.Group();
  gl.position.copy(SPOTS.ghostLight);
  const glBase = cyl(0.16, 0.18, 0.05, blackMetal, 16);
  glBase.position.y = 0.025;
  gl.add(glBase);
  const glPole = cyl(0.015, 0.015, 1.55, blackMetal, 8);
  glPole.position.y = 0.8;
  gl.add(glPole);
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.2, 2.3) });
  const ghostBulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), bulbMat);
  ghostBulb.position.y = 1.64;
  gl.add(ghostBulb);
  const cage = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshStandardMaterial({ color: 0x222, wireframe: true }));
  cage.position.y = 1.64;
  gl.add(cage);
  root.add(gl);

  // Tables and chairs up for the night
  const chairGeometry = makeChairGeometry();
  const tableTop = new THREE.CylinderGeometry(0.38, 0.38, 0.035, 32);
  const candleGlass = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.1, transparent: true, opacity: 0.6 });
  const candleFlames: THREE.Mesh[] = [];
  const chairsUp = new THREE.InstancedMesh(chairGeometry, chairMat, TABLES.length * 2);
  chairsUp.castShadow = chairsUp.receiveShadow = true;
  const tableGroup = new THREE.Group();
  TABLES.forEach(([tx, tz], ti) => {
    const top = new THREE.Mesh(tableTop, tableMat);
    top.position.set(tx, 0.74, tz);
    top.castShadow = top.receiveShadow = true;
    tableGroup.add(top);
    const stem = cyl(0.03, 0.03, 0.72, blackMetal, 8);
    stem.position.set(tx, 0.36, tz);
    tableGroup.add(stem);
    const foot = cyl(0.22, 0.24, 0.03, blackMetal, 20);
    foot.position.set(tx, 0.015, tz);
    tableGroup.add(foot);
    const jar = cyl(0.035, 0.035, 0.07, candleGlass, 12);
    jar.position.set(tx + 0.05, 0.795, tz + 0.04);
    jar.castShadow = false;
    tableGroup.add(jar);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) }));
    flame.scale.y = 1.8;
    flame.position.set(tx + 0.05, 0.83, tz + 0.04);
    candleFlames.push(flame);
    tableGroup.add(flame);
    for (let c = 0; c < 2; c++) {
      const a = ti * 1.7 + c * Math.PI;
      tmp.position.set(tx + Math.cos(a) * 0.12, 0.757 + 0.83, tz + Math.sin(a) * 0.12);
      tmp.rotation.set(Math.PI, a + c * 0.4, 0.04 * (c ? 1 : -1));
      tmp.updateMatrix();
      chairsUp.setMatrixAt(ti * 2 + c, tmp.matrix);
    }
  });
  tableGroup.add(chairsUp);
  root.add(tableGroup);
  const tablesHit = box(0.9, 1.6, 0.9, new THREE.MeshBasicMaterial({ visible: false }), TABLES[1][0], 0.8, TABLES[1][1]);
  tablesHit.castShadow = false;
  root.add(tablesHit);
  hotspots.push({ id: 'tables', mesh: tablesHit, focus: new THREE.Vector3(TABLES[1][0], 1.1, TABLES[1][1]), view: { pos: new THREE.Vector3(-0.2, 1.7, 2.6), look: new THREE.Vector3(TABLES[1][0], 1.0, TABLES[1][1]) } });

  // Bar
  const bar = new THREE.Group();
  const barX = 5.8, barZ0 = -4.3, barZ1 = 0.7;
  bar.add(box(0.62, 1.04, barZ1 - barZ0, darkWood, barX, 0.52, (barZ0 + barZ1) / 2));
  for (let z = barZ0 + 0.35; z < barZ1; z += 0.62) bar.add(box(0.02, 0.8, 0.5, trimMat, barX - 0.315, 0.5, z));
  const top = box(0.78, 0.05, barZ1 - barZ0 + 0.1, darkWood, barX - 0.05, 1.065, (barZ0 + barZ1) / 2);
  bar.add(top);
  const rail = cyl(0.022, 0.022, barZ1 - barZ0, brass, 10);
  rail.rotation.x = Math.PI / 2;
  rail.position.set(barX - 0.45, 0.2, (barZ0 + barZ1) / 2);
  bar.add(rail);
  for (let z = barZ0 + 0.5; z < barZ1; z += 0.95) {
    const stool = new THREE.Group();
    const seat = cyl(0.19, 0.17, 0.07, velvet, 20);
    seat.position.y = 0.78;
    stool.add(seat);
    const post = cyl(0.025, 0.025, 0.75, chrome, 8);
    post.position.y = 0.38;
    stool.add(post);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.01, 6, 20), chrome);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    stool.add(ring);
    const foot = cyl(0.2, 0.22, 0.03, chrome, 20);
    foot.position.y = 0.015;
    stool.add(foot);
    stool.position.set(barX - 0.75, 0, z);
    bar.add(stool);
  }
  const shelfBack = box(0.04, 1.3, barZ1 - barZ0, new THREE.MeshStandardMaterial({ color: 0x8090a0, metalness: 1, roughness: 0.12 }), x1 - 0.03, 1.85, (barZ0 + barZ1) / 2);
  shelfBack.castShadow = false;
  bar.add(shelfBack);
  const barGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.55, 0.9) });
  const bottleGeo = new THREE.LatheGeometry(
    [[0, 0], [0.035, 0], [0.036, 0.02], [0.036, 0.16], [0.03, 0.2], [0.012, 0.24], [0.012, 0.3], [0, 0.3]].map(([r, y]) => new THREE.Vector2(r, y)),
    10,
  );
  const bottles = new THREE.InstancedMesh(
    bottleGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85, envMapIntensity: 2 }),
    72,
  );
  let bi = 0;
  const bottleColors = [0x2a4a2a, 0x5a3212, 0x1a2a4a, 0x6a5020, 0x202020, 0x3a1a2a, 0x7a6a50];
  for (const sy of [1.3, 1.68, 2.06]) {
    bar.add(box(0.28, 0.025, barZ1 - barZ0, darkWood, x1 - 0.16, sy, (barZ0 + barZ1) / 2));
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(barZ1 - barZ0, 0.02), barGlowMat);
    glow.rotation.y = -Math.PI / 2;
    glow.position.set(x1 - 0.05, sy + 0.02, (barZ0 + barZ1) / 2);
    bar.add(glow);
    for (let z = barZ0 + 0.15; z < barZ1 - 0.1 && bi < 72; z += 0.2 + Math.random() * 0.07) {
      const s = 0.8 + Math.random() * 0.45;
      tmp.position.set(x1 - 0.17 + (Math.random() - 0.5) * 0.08, sy + 0.013, z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(s, 0.8 + Math.random() * 0.5, s);
      tmp.updateMatrix();
      bottles.setMatrixAt(bi, tmp.matrix);
      bottles.setColorAt(bi, new THREE.Color(bottleColors[Math.floor(Math.random() * bottleColors.length)]));
      bi++;
    }
  }
  bottles.count = bi;
  bar.add(bottles);
  root.add(bar);

  const pendantMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });
  for (const pz of [-3.2, -1.6, 0]) {
    const cord = cyl(0.004, 0.004, 0.9, blackMetal, 4);
    cord.position.set(barX - 0.1, h - 0.45, pz);
    root.add(cord);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.18, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x1c2a22, metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide }));
    shade.position.set(barX - 0.1, h - 0.95, pz);
    root.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), pendantMat);
    bulb.position.set(barX - 0.1, h - 1.02, pz);
    root.add(bulb);
  }

  // Mae's note and keys at the near end of the bar
  const noteTex = labelTexture((g, w, hh) => {
    g.fillStyle = '#e8e0cc';
    g.fillRect(0, 0, w, hh);
    g.strokeStyle = 'rgba(40,40,70,0.75)';
    g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      let x = 20;
      g.moveTo(x, 40 + i * 28);
      while (x < w - 30 - (i === 5 ? 120 : 0)) {
        x += 6 + Math.random() * 10;
        g.lineTo(x, 40 + i * 28 + (Math.random() - 0.5) * 6);
      }
      g.stroke();
    }
  }, 256, 220);
  const note = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.14), new THREE.MeshStandardMaterial({ map: noteTex, roughness: 0.9 }));
  note.rotation.set(-Math.PI / 2, 0, 0.4);
  note.position.set(barX - 0.12, 1.092, 0.3);
  root.add(note);
  const keyring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.003, 6, 16), brass);
  keyring.rotation.x = -Math.PI / 2;
  keyring.position.set(barX - 0.02, 1.094, 0.38);
  root.add(keyring);
  for (let k = 0; k < 3; k++) {
    const key = box(0.05, 0.003, 0.012, brass, barX + 0.02 + k * 0.004, 1.094, 0.4 + k * 0.012);
    key.rotation.y = 0.5 + k * 0.4;
    root.add(key);
  }
  const noteHit = box(0.4, 0.25, 0.4, new THREE.MeshBasicMaterial({ visible: false }), barX - 0.1, 1.15, 0.32);
  noteHit.castShadow = false;
  root.add(noteHit);
  hotspots.push({ id: 'note', mesh: noteHit, focus: new THREE.Vector3(barX - 0.1, 1.1, 0.32), view: { pos: new THREE.Vector3(barX - 0.9, 1.75, 1.05), look: new THREE.Vector3(barX - 0.1, 1.09, 0.3) } });

  // The record, propped on the bar
  const sleeveTex = loadImage('art/sleeve-harbor-lights.jpg', (g, w, hh) => {
    g.fillStyle = '#16305a';
    g.fillRect(0, 0, w, hh);
    g.fillStyle = '#e8e0cc';
    g.font = '88px "League Gothic", sans-serif';
    g.fillText('HARBOR LIGHTS', 30, hh - 60);
    g.fillStyle = '#e8a85a';
    g.fillRect(30, 40, 90, 90);
  });
  const sleeve = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.31), new THREE.MeshStandardMaterial({ map: sleeveTex, roughness: 0.7 }));
  sleeve.position.set(barX + 0.15, 1.24, -1.0);
  sleeve.rotation.set(0, -Math.PI / 2 + 0.25, 0);
  sleeve.rotateX(-0.12);
  sleeve.castShadow = true;
  root.add(sleeve);
  const player = box(0.36, 0.1, 0.3, new THREE.MeshStandardMaterial({ color: 0x2a1f18, roughness: 0.5 }), barX, 1.14, -1.55);
  root.add(player);
  const platter = cyl(0.13, 0.13, 0.012, blackMetal, 32);
  platter.position.set(barX, 1.196, -1.55);
  root.add(platter);
  const recordHit = box(0.4, 0.45, 0.9, new THREE.MeshBasicMaterial({ visible: false }), barX + 0.05, 1.25, -1.25);
  recordHit.castShadow = false;
  root.add(recordHit);
  hotspots.push({ id: 'record', mesh: recordHit, focus: new THREE.Vector3(barX + 0.1, 1.24, -1.0), view: { pos: new THREE.Vector3(barX - 1.2, 1.6, -0.45), look: new THREE.Vector3(barX + 0.12, 1.22, -1.0) } });

  // Neon sign
  const neonTex = labelTexture((g, w, hh) => {
    g.clearRect(0, 0, w, hh);
    g.font = '300px "League Gothic", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(95,179,255,0.35)';
    g.lineWidth = 26;
    g.strokeText('NIGHTJAR', w / 2, hh / 2 + 10);
    g.strokeStyle = 'rgba(190,225,255,1)';
    g.lineWidth = 9;
    g.strokeText('NIGHTJAR', w / 2, hh / 2 + 10);
  }, 1024, 360);
  const neonMat = new THREE.MeshBasicMaterial({ map: neonTex, transparent: true, color: new THREE.Color(2.2, 3.2, 5), depthWrite: false, blending: THREE.AdditiveBlending });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.81), neonMat);
  neon.position.set(1.0, 2.8, z0 + 0.06);
  root.add(neon);
  root.add(box(2.2, 0.62, 0.03, new THREE.MeshStandardMaterial({ color: 0x0b0e14, roughness: 0.4 }), 1.0, 2.8, z0 + 0.02));
  const neonHit = box(2.3, 0.8, 0.1, new THREE.MeshBasicMaterial({ visible: false }), 1.0, 2.8, z0 + 0.08);
  neonHit.castShadow = false;
  root.add(neonHit);
  hotspots.push({ id: 'sign', mesh: neonHit, focus: new THREE.Vector3(1.0, 2.8, z0), view: { pos: new THREE.Vector3(1.6, 1.7, -1.4), look: new THREE.Vector3(1.0, 2.6, z0) } });

  // Back door and exit sign
  const doorGroup = new THREE.Group();
  const doorX = 3.3;
  const alley = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 2.12), new THREE.MeshBasicMaterial({ color: 0x0b1626 }));
  alley.position.set(doorX, 1.06, z0 - 0.05);
  root.add(alley);
  const doorPivot = new THREE.Group();
  doorPivot.position.set(doorX - 0.48, 0, z0 + 0.02);
  const door = box(0.94, 2.1, 0.05, new THREE.MeshStandardMaterial({ color: 0x1a2330, roughness: 0.6, metalness: 0.3 }), 0.47, 1.05, 0);
  doorPivot.add(door);
  const bar1 = box(0.7, 0.05, 0.05, chrome, 0.5, 1.0, 0.05);
  doorPivot.add(bar1);
  doorGroup.add(doorPivot);
  for (const s of [-1, 1]) doorGroup.add(box(0.08, 2.2, 0.08, trimMat, doorX + s * 0.52, 1.1, z0 + 0.03));
  doorGroup.add(box(1.12, 0.08, 0.08, trimMat, doorX, 2.18, z0 + 0.03));
  const exitMat = new THREE.MeshBasicMaterial({
    map: labelTexture((g, w, hh) => {
      g.fillStyle = '#300';
      g.fillRect(0, 0, w, hh);
      g.fillStyle = '#ff5a4a';
      g.font = '80px "League Gothic", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('EXIT', w / 2, hh / 2 + 4);
    }, 256, 110),
    color: new THREE.Color(1.6, 1.2, 1.2),
  });
  const exit = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.15, 0.06), exitMat);
  exit.position.set(doorX, 2.42, z0 + 0.05);
  doorGroup.add(exit);
  root.add(doorGroup);
  const doorHit = box(1.0, 2.2, 0.2, new THREE.MeshBasicMaterial({ visible: false }), doorX, 1.1, z0 + 0.1);
  doorHit.castShadow = false;
  root.add(doorHit);
  hotspots.push({ id: 'door', mesh: doorHit, focus: new THREE.Vector3(doorX, 1.2, z0), view: { pos: new THREE.Vector3(doorX + 0.5, 1.65, -2.0), look: new THREE.Vector3(doorX - 0.1, 1.25, z0) } });

  // Photographs and the poster on the back wall
  const frameMat2 = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.4 });
  const photoTex = loadImage('art/band-1952.jpg', (g, w, hh) => {
    g.fillStyle = '#9aa3aa';
    g.fillRect(0, 0, w, hh);
    g.fillStyle = '#20252a';
    g.fillRect(16, 16, w - 32, hh - 32);
  }, 384, 256);
  const addFrame = (x: number, y: number, w: number, hh: number, map?: THREE.Texture, tone = 0x2a2f36) => {
    const f = box(w + 0.06, hh + 0.06, 0.03, frameMat2, x, y, z0 + 0.03);
    root.add(f);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshStandardMaterial({ ...(map ? { map } : {}), color: map ? 0xffffff : tone, roughness: 0.35 }));
    pic.position.set(x, y, z0 + 0.05);
    root.add(pic);
    return pic;
  };
  const photo = addFrame(-0.35, 1.72, 0.6, 0.4, photoTex);
  const photoHit = box(0.7, 0.5, 0.1, new THREE.MeshBasicMaterial({ visible: false }), photo.position.x, photo.position.y, z0 + 0.1);
  photoHit.castShadow = false;
  root.add(photoHit);
  hotspots.push({ id: 'photo', mesh: photoHit, focus: photo.position.clone(), view: { pos: new THREE.Vector3(-0.15, 1.7, -3.3), look: new THREE.Vector3(-0.35, 1.7, z0) } });
  addFrame(0.45, 1.58, 0.26, 0.34, undefined, 0x2e343a);
  addFrame(2.05, 1.7, 0.34, 0.26, undefined, 0x3a3630);

  const posterTex = loadImage('art/poster-nightjar.jpg', (g, w, hh) => {
    g.fillStyle = '#d8ccb0';
    g.fillRect(0, 0, w, hh);
    g.fillStyle = '#1d3a5f';
    g.font = '110px "League Gothic", sans-serif';
    g.textAlign = 'center';
    g.fillText('THE NIGHTJAR', w / 2, 160);
    g.fillStyle = '#b5452a';
    g.font = '60px "League Gothic", sans-serif';
    g.fillText('JAZZ EVERY FRIDAY', w / 2, 260);
  }, 512, 768);
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.75), new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.85 }));
  poster.position.set(1.25, 1.62, z0 + 0.02);
  root.add(poster);
  const posterHit = box(0.55, 0.8, 0.1, new THREE.MeshBasicMaterial({ visible: false }), 1.25, 1.62, z0 + 0.08);
  posterHit.castShadow = false;
  root.add(posterHit);
  hotspots.push({ id: 'poster', mesh: posterHit, focus: poster.position.clone(), view: { pos: new THREE.Vector3(1.3, 1.6, -3.4), look: new THREE.Vector3(1.25, 1.6, z0) } });

  // Stairs up to the street, front-right corner
  const steps = 17, rise = h / steps, run = 5.4 / steps, sx0 = 1.3;
  const stairMat = new THREE.MeshStandardMaterial({ map: wood([1, 1], [36, 26, 20]), roughness: 0.6 });
  for (let i = 0; i < steps; i++) {
    const s = box(run, rise * (i + 1), 0.95, stairMat, sx0 + run * (i + 0.5), (rise * (i + 1)) / 2, z1 - 0.5);
    root.add(s);
  }
  for (let i = 0; i <= steps; i += 2) {
    const post = cyl(0.015, 0.015, 0.9, blackMetal, 6);
    post.position.set(sx0 + run * i, rise * i + 0.45, z1 - 1.0);
    root.add(post);
  }
  const railLen = Math.hypot(5.4, h);
  const handrail = cyl(0.025, 0.025, railLen, darkWood, 8);
  handrail.rotation.z = Math.PI / 2 - Math.atan2(h, 5.4);
  handrail.position.set(sx0 + 2.7, h / 2 + 0.9, z1 - 1.0);
  root.add(handrail);
  const stairHit = box(2.0, 1.4, 1.0, new THREE.MeshBasicMaterial({ visible: false }), sx0 + 0.9, 0.7, z1 - 0.5);
  stairHit.castShadow = false;
  root.add(stairHit);
  hotspots.push({ id: 'stairs', mesh: stairHit, focus: new THREE.Vector3(sx0 + 1, 0.8, z1 - 0.5), view: { pos: new THREE.Vector3(-0.6, 1.6, 2.6), look: new THREE.Vector3(4.5, 2.4, z1 - 0.5) } });
  const well = new THREE.Group();
  const wellMat = new THREE.MeshStandardMaterial({ color: 0x151b24, roughness: 1, side: THREE.DoubleSide });
  const wellBack = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3), wellMat);
  wellBack.position.set(x1 - 0.01, h + 1.5, z1 - 0.5);
  wellBack.rotation.y = -Math.PI / 2;
  well.add(wellBack);
  const wellSide = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3), wellMat);
  wellSide.position.set(x1 - 1.2, h + 1.5, z1 - 0.95);
  well.add(wellSide);
  const dawnMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.02, 0.03, 0.05) });
  const dawnDoor = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.0), dawnMat);
  dawnDoor.position.set(x1 - 0.03, h + 1.0, z1 - 0.5);
  dawnDoor.rotation.y = -Math.PI / 2;
  well.add(dawnDoor);
  root.add(well);

  // Lights
  const ambient = new THREE.HemisphereLight(0x2c4a74, 0x07090d, 0.55);
  root.add(ambient);

  const street = new THREE.SpotLight(0x9ec3ff, 260, 26, 0.62, 0.55, 1.6);
  street.position.set(x0 - 3.6, 5.2, 1.6);
  street.target.position.set(-3.2, 0, 1.2);
  street.castShadow = true;
  street.shadow.mapSize.set(1024, 1024);
  street.shadow.bias = -0.0004;
  street.shadow.radius = 4;
  root.add(street, street.target);

  const ghost = new THREE.PointLight(0xffd6a0, 10, 14, 1.4);
  ghost.position.copy(SPOTS.ghostLight).add(new THREE.Vector3(0, 1.64, 0));
  ghost.castShadow = true;
  ghost.shadow.mapSize.set(512, 512);
  ghost.shadow.bias = -0.002;
  ghost.shadow.radius = 6;
  root.add(ghost);

  const neonLight = new THREE.PointLight(0x5fb3ff, 5.5, 8, 1.4);
  neonLight.position.set(1.0, 2.7, z0 + 0.5);
  root.add(neonLight);

  const exitLight = new THREE.PointLight(0xff4a3a, 0.6, 2.5, 2);
  exitLight.position.set(doorX, 2.3, z0 + 0.3);
  root.add(exitLight);

  const stage = new THREE.SpotLight(0xffc98a, 0, 12, 0.55, 0.7, 1.2);
  stage.position.set(-2.6, h - 0.1, -0.2);
  stage.target.position.set(-3.3, stageH, -2.8);
  stage.castShadow = true;
  stage.shadow.mapSize.set(1024, 1024);
  stage.shadow.bias = -0.0005;
  stage.shadow.radius = 5;
  root.add(stage, stage.target);
  const can = cyl(0.09, 0.12, 0.28, blackMetal, 12);
  can.position.copy(stage.position);
  can.lookAt(stage.target.position);
  can.rotateX(Math.PI / 2);
  root.add(can);

  const candles: THREE.PointLight[] = [];
  for (const [cx, cz] of [[-3.2, 1.6], [0.6, 0.4], [2.6, -1.2]] as const) {
    const c = new THREE.PointLight(0xffa860, 0, 5, 1.8);
    c.position.set(cx, 1.0, cz);
    candles.push(c);
    root.add(c);
  }
  const barLight = new THREE.PointLight(0xffb070, 0, 6, 1.6);
  barLight.position.set(barX - 0.2, h - 1.1, -1.6);
  root.add(barLight);

  const dawn = new THREE.PointLight(0xbcd4ff, 0, 9, 1.2);
  dawn.position.set(x1 - 0.8, h + 0.4, z1 - 0.5);
  root.add(dawn);

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.userData.noShadow) o.castShadow = false;
  });

  return {
    root,
    hotspots,
    pressKey: placeKey,
    materials: { floor: floorMat, wall: wallMat, brick: brickMat, lacquer },
    lights: { ambient, street, ghost, ghostBulb, neon: neonLight, stage, candles, candleFlames, bar: barLight, dawn, exit: exitLight },
    neonMat,
    exitMat,
    barGlowMat,
    pendantMat,
    windows,
    door: doorPivot,
    alley,
    chairGeometry,
    bassGeometry,
    dawnMat,
  };
}

