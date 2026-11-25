// Template video: the approved 5 s opener (interior → fly-out through the windshield → rear-end collision).
// This is the only kind of file to write per video: build stages from the engine, describe motion as pure
// functions of time, list the shots. Copy a shot block to start a new one.
import { THREE, V3, clamp, lerp, ease, DEG, table, track, run } from 'engine/core.js';
import { makeStage } from 'engine/stage.js';
import { addHighway } from 'engine/sets/highway.js';
import { M, paint, blobShadow } from 'engine/materials.js';
import { makeCar, buildCar, addInterior, tintGlass, rollWheels, brakeLights, COUPE, SUV, IC, IS } from 'engine/cars.js';
import { makeChar, exprAt } from 'engine/chars.js';
import { puffs, tyreSmoke, skids, skid, debris, lightMats } from 'engine/fx.js';
import CAST from './cast.json' with { type: 'json' };
import { stand, sit, sitOn } from 'engine/chars.js';
import { flat, box, lacquer } from 'engine/materials.js';
import { camBox, cashPile, sign, screen, counterUnit, chair, plant, pendant } from 'engine/props.js';
import { addRoom } from 'engine/sets/room.js';
import { addHouse } from 'engine/sets/house.js';
import { cashBurst } from 'engine/transitions.js';
import { captionsFromWords, sentenceStarts } from 'engine/captions.js';
import { withLook } from './sets.js';

// ------------------------------------------------------------------ shot 1: the brake check (0 to 5 s)
const st = makeStage({ mood: 'day' });
const { scene, camera } = st;
addHighway(scene);
const LANE = 5.55;

const coupe = makeCar(COUPE, 0xffbf0a); addInterior(coupe, IC, true); scene.add(coupe);
const suv = makeCar(SUV, 0xbfe9dc); addInterior(suv, IS, false); scene.add(suv);
const lead = makeChar({ R: 0.195, shirt: 0x7a45e0, hair: '#1c1c24', hair2: '#3a3a48', style: 'mess' }); coupe.body.add(lead);
const victim = makeChar({ R: 0.215, shirt: 0xff6a3d, hair: '#d9722b', hair2: '#f09a52', style: 'bowl', glasses: true }); suv.body.add(victim);
// background traffic: [car, lane z, x at t=0, speed m/s]
const traffic = [[makeCar(COUPE, 0x2f6fe0), 1.85, 34, 29.5], [makeCar(SUV, 0x8f97a6), -1.85, -46, 31.5], [makeCar(COUPE, 0xf2f2f2), -5.55, 70, 27]];
for (const [c] of traffic) { tintGlass(c); scene.add(c); }
for (const [car, L, Wd] of [[coupe, 5.6, 2.9], [suv, 6.3, 3.2], [traffic[0][0], 5.6, 2.9], [traffic[1][0], 6.3, 3.2], [traffic[2][0], 5.6, 2.9]]) car.add(blobShadow(L, Wd));

// kinematics: lead brakes at TB, rear driver reacts at TN, impact at TI. xRef = lead without the impact kick
// (the camera follows it, so the camera does not jerk on impact).
const TB = 0.32, TN = 2.6, TI = 3.9, DUR = 5;
const L_ = table(DUR), R_ = table(DUR), S_ = table(DUR);
{
  let x = 0, v = 26, xr = 0, vr = 26, xs = 0, vs = 27, hitL = false, hitS = false;
  for (let i = 0; i < L_.n; i++) {
    const t = i * L_.dt; L_.arr[i] = x; R_.arr[i] = xr; S_.arr[i] = xs;
    let a = 0; if (t >= TI) { if (!hitL) { v = 9.8; hitL = true; } a = v > 0 ? -8.0 : 0; } else if (t >= TB) a = v > 7 ? -9.5 : -0.4;
    v = Math.max(0, v + a * L_.dt); x += v * L_.dt;
    let ar = 0; if (t >= TI) ar = vr > 0 ? -2.56 : 0; else if (t >= TB) ar = vr > 7 ? -9.5 : -0.4;
    vr = Math.max(0, vr + ar * L_.dt); xr += vr * L_.dt;
    let as = 0; if (t >= TI) { if (!hitS) { vs = 9.4; hitS = true; } as = vs > 0 ? -8.4 : 0; } else if (t >= TN) as = -10.5;
    vs = Math.max(0, vs + as * L_.dt); xs += vs * L_.dt;
  }
  const iI = Math.round(TI / L_.dt), shift = L_.arr[iI] - 2.13 - 2.40 + 0.07 - S_.arr[iI];
  for (let i = 0; i < S_.n; i++) S_.arr[i] += shift;
}
const xL = L_.at, xRef = R_.at, xS = S_.at;

const P = puffs(scene, 230), SK = skids(scene, 4);
const DB = debris(scene, [paint(0xffbf0a), lightMats.tail(), M.trim, lightMats.glassShard()], 30, 99);

//      t     px    py    pz     lx     ly    lz   roll  fov     (relative to the lead car)
const CAM = track([
  [0.00, 0.40, 0.50, 0.62, 0.30, 0.72, -0.40, 15, 106],
  [1.05, 0.44, 0.55, 0.60, 0.28, 0.76, -0.40, 12, 106],
  [1.30, 0.60, 1.00, 0.24, -0.25, 1.00, -0.38, 5, 100],
  [1.50, 1.00, 1.14, 0.06, -0.28, 1.00, -0.36, 2, 90],
  [1.72, 2.70, 1.24, 0.22, -0.25, 0.96, -0.30, 0, 70],
  [2.05, 5.60, 1.22, 0.90, -1.00, 0.90, 0.00, 0, 54],
  [2.75, 8.60, 1.45, 2.20, -3.60, 0.95, 0.00, 0, 48],
  [3.50, 7.60, 1.40, 4.10, -1.90, 0.92, 0.00, 0, 46],
  [3.90, 6.60, 1.32, 4.60, -1.20, 0.90, 0.00, 0, 44],
  [5.00, 5.80, 1.22, 4.50, -1.15, 0.90, 0.00, 0, 41],
]);
const LEAD_EXPR = [[0, 'smug'], [0.30, 'grit'], [0.92, 'grin'], [3.90, 'jolt'], [4.35, 'grin']];
const VIC_EXPR = [[0, 'calm'], [2.42, 'shock'], [3.92, 'jolt'], [4.3, 'dazed']];

function update1(t) {
  const xl = xL(t), xs = xS(t), xr = xRef(t), ti = t - TI;
  // cars: brake dive, wheels, lights, crumpled bumpers
  const diveL = -2.7 * ease(TB, TB + 0.2, t) * (1 - 0.8 * ease(2.2, 2.6, t)) + (ti > 0 ? 3.2 * Math.exp(-5 * ti) * Math.cos(13 * ti) : 0);
  const diveS = -3.3 * ease(TN, TN + 0.2, t) * (1 - 0.9 * ease(TI + 0.5, TI + 1.0, t)) + (ti > 0 ? -2.5 * Math.exp(-5 * ti) * Math.cos(11 * ti) : 0);
  coupe.position.set(xl, 0, LANE); coupe.body.rotation.z = diveL * DEG;
  suv.position.set(xs, 0, LANE); suv.body.rotation.z = diveS * DEG;
  const lockL = t > TB && t < 1.3; rollWheels(coupe, lockL ? xL(TB) + (xL(t) - xL(TB)) * 0.15 : xl);
  rollWheels(suv, t > TN ? xS(TN) : xs);
  brakeLights(coupe, t > TB); brakeLights(suv, t > TN);
  if (ti > 0) { const k = 1 - Math.exp(-9 * ti); coupe.bumperR.rotation.x = 0.5 * k; coupe.bumperR.position.y = COUPE.yb + 0.13 - 0.12 * k; coupe.bumperR.rotation.y = 0.09 * k; suv.bumperF.rotation.x = -0.12 * k; suv.bumperF.position.y = SUV.yb + 0.13 - 0.05 * k; }
  else { coupe.bumperR.rotation.set(0, 0, 0); coupe.bumperR.position.y = COUPE.yb + 0.13; suv.bumperF.rotation.set(0, 0, 0); suv.bumperF.position.y = SUV.yb + 0.13; }
  for (const [c, z, x0, v] of traffic) { c.position.set(x0 + v * t, 0, z); for (const w of c.wheels) w.rotation.z = -(v * t) / 0.34; }
  // interior props: pedal, rolling can, swinging charm, phone sliding into the footwell
  const tb = t - TB;
  coupe.brake.rotation.z = 0.30 * ease(0.38, 0.47, t);
  { const cx = 0.14 + 0.78 * ease(0.36, 0.92, t) - 0.07 * ease(0.92, 1.25, t); coupe.can.position.set(cx, 0.283 + 0.033, 0.24 + 0.05 * ease(0.36, 0.92, t)); coupe.can.rotation.z = -(cx - 0.14) / 0.033; }
  coupe.charm.rotation.z = tb > 0 ? (0.75 * (1 - Math.exp(-5 * tb) * Math.cos(9 * tb))) * (1 - 0.8 * ease(2.2, 2.7, t)) : 0.03 * Math.sin(t * 9);
  {
    const u = clamp((t - 0.37) / 0.26), sx = -0.10 + 0.22 * u * u, f = clamp((t - 0.63) / 0.34);
    const px = sx + 0.30 * f, py = 0.492 - (0.492 - 0.272) * f * f + Math.sin(f * Math.PI) * 0.03;
    coupe.phone.position.set(px, py, 0.40 - 0.05 * f); coupe.phone.rotation.set(f * 0.5, 0.35 + u * 0.5 + f * 1.2, -f * (1 - f) * 2.4);
  }
  // camera, relative to the smoothed lead car; locked to the real car while inside it
  const k = CAM(t), shake = ti > 0 ? Math.exp(-7 * ti) * 0.09 : 0;
  camera.position.set(xr + k[0] + shake * Math.sin(ti * 71), k[1] + shake * Math.sin(ti * 93 + 1), LANE + k[2] + shake * Math.sin(ti * 57 + 2));
  if (t < 1.75) camera.position.x += xl - xr;
  camera.fov = k[7]; camera.near = t < 1.8 ? 0.03 : 0.25; camera.updateProjectionMatrix();
  camera.up.set(0, 1, 0); camera.lookAt(xr + (t < 1.75 ? xl - xr : 0) + k[3], k[4], LANE + k[5]); camera.rotateZ(k[6] * DEG);
  camera.updateMatrixWorld(true);
  st.frame(); st.follow(xr - 5, 0, LANE);
  // lead driver
  const lean = (-0.10 + 0.34 * ease(TB, TB + 0.16, t) - 0.20 * ease(0.62, 1.2, t)) + (ti > 0 ? -0.45 * Math.exp(-6 * ti) * Math.cos(10 * ti) : 0);
  const hip = V3(-0.20, 0.53, -0.38), neck = hip.clone().add(V3(Math.sin(lean) * 0.30, Math.cos(lean) * 0.30, 0));
  const wr = coupe.wheelRig, hL = wr.rimPoint(Math.PI - 0.55), hR = wr.rimPoint(0.55);
  const stp = ease(0.26, 0.36, t), push = ease(0.38, 0.47, t);
  const foot = V3(lerp(0.90, 0.885, stp) + 0.075 * push, lerp(0.37, 0.385, stp) + Math.sin(stp * Math.PI) * 0.09 - 0.025 * push, lerp(-0.25, -0.41, stp));
  const look = t < 0.28 ? V3(0.75, 0.45, 0.5) : (ti > 0.45 ? V3(0.8, 0.05, 0.6) : V3(1, 0.0, 0.18));
  lead.pose({ hip, neck, face: look, expr: exprAt(LEAD_EXPR, t),
    arms: [[V3(0.10, 0.62, -0.60), hL], [V3(0.10, 0.62, -0.16), hR]],
    legs: [[V3(0.36, 0.60, -0.50), V3(0.80, 0.30, -0.56)], [V3(0.36, 0.66, -0.33), foot]] }, camera);
  // rear driver
  const vl = (ti > 0 ? 0.5 * Math.exp(-6 * ti) * Math.cos(9 * ti) : 0) + 0.12 * ease(TN, TN + 0.15, t);
  const vh = V3(0.24, 0.80, -0.42), vn = vh.clone().add(V3(Math.sin(vl) * 0.33, Math.cos(vl) * 0.33, 0)), sw = suv.wheelRig;
  const brace = ease(2.45, 2.6, t);
  victim.pose({ hip: vh, neck: vn, face: V3(1, -0.05, 0), expr: exprAt(VIC_EXPR, t),
    arms: [[V3(0.55, lerp(0.95, 1.2, brace), -0.68), sw.rimPoint(Math.PI - 0.6)], [V3(0.55, lerp(0.95, 1.2, brace), -0.18), sw.rimPoint(0.6)]],
    legs: [[V3(0.75, 0.80, -0.52), V3(1.25, 0.52, -0.55)], [V3(0.75, 0.84, -0.34), V3(1.28, 0.56, -0.38)]] }, camera);
  // smoke, skids, debris
  P.begin();
  tyreSmoke(P, xS, t, TN + 0.02, TI + 0.25, 0.02, [1.5, -1.45], 0.84, 0.55, LANE);
  tyreSmoke(P, xL, t, TB + 0.03, 1.3, 0.06, [1.28, -1.25], 0.75, 0.30, LANE);
  for (let te = TI + 0.12, j = 0; te < t; te += 0.07, j++) { const age = t - te; if (age > 1.4) continue; P.add(xS(t) + 2.25 + 0.3 * age, 0.95 + 1.3 * age, LANE + (j % 3 - 1) * 0.35, 0.45 + 1.5 * age, 0.38 * Math.min(1, age / 0.1) * (1 - age / 1.4), 0xffffff); }
  if (ti > 0 && ti < 0.9) for (let j = 0; j < 10; j++) { const an = j * 0.7; P.add(xL(t) - 2.13 + Math.cos(an) * (0.3 + 2.0 * ti), 0.55 + (0.5 + (j % 3) * 0.5) * ti, LANE + Math.sin(an) * (0.5 + 2.2 * ti), 0.8 + 3.2 * ti, 0.6 * (1 - ti / 0.9), 0xfff4d6); }
  P.end();
  skid(SK[0], xS, t, TN, TI + 0.9, -1.45, LANE - 0.84, 1.1); skid(SK[1], xS, t, TN, TI + 0.9, -1.45, LANE + 0.84, 1.1);
  skid(SK[2], xL, t, TB, 1.3, -1.25, LANE - 0.75, 0.9); skid(SK[3], xL, t, TB, 1.3, -1.25, LANE + 0.75, 0.9);
  DB.update(ti, xL(TI) - 2.13, LANE);
}


// ================================================================== the 30 s story (sentences from the voice)
const WORDS = await (await fetch('/audio/vo.words.json')).json();
const S = sentenceStarts(WORDS); const END = 30;
const mkRex = () => makeChar({ R: 0.195, shirt: 0x7a45e0, hair: '#1c1c24', hair2: '#3a3a48', style: 'mess' });
const mkSam = () => makeChar({ ...CAST.characters.quiet });
const mkJudge = () => makeChar({ R: 0.21, shirt: 0x1a1a22, hair: '#d8d8d8', hair2: '#eeeeee', style: 'flattop', outfit: 'suit', acc: ['mustache'], build: 'big' });
function look(stg, p, l, fov, roll = 0, near = 0.05) {
  const c = stg.camera; c.position.set(p[0], p[1], p[2]); c.fov = fov; c.near = near; c.updateProjectionMatrix();
  c.up.set(0, 1, 0); c.lookAt(l[0], l[1], l[2]); c.rotateZ(roll * DEG); c.updateMatrixWorld(true); stg.frame();
}
const grp = (stg, x, y, z, ry) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; stg.scene.add(g); return g; };
const FACE = -Math.PI / 2;   // faces +z (camera side)

// ---- shot A: Rex's brake check (sentences 1-2), the approved opener stretched over 8 s
const update1A = (t) => update1(t * 0.6);

// ---- shot B: easy money on the shoulder (sentence 3)
const sB = makeStage({ mood: withLook('day', 'outdoor') }); addHighway(sB.scene);
const carB = makeCar(COUPE, 0xffbf0a); carB.position.set(2.5, 0, 5.55); carB.add(blobShadow(5.6, 2.9)); sB.scene.add(carB);
const GB = grp(sB, 1.5, 0, 8.4, FACE); const rexB = mkRex(); GB.add(rexB);
const pileB = cashPile({ r: 0.75, h: 0.65, n: 380 }); pileB.position.set(0.3, 0, 8.9); sB.scene.add(pileB);
const CAMB = track([[0, 3.0, 1.45, 14.0, 0.9, 1.2, 8.2, 3, 56], [3, 1.8, 1.35, 11.8, 0.9, 1.15, 8.2, -2, 46]]);
function updateB(t, lt) {
  const k = CAMB(lt); look(sB, [k[0], k[1], k[2]], [k[3], k[4], k[5]], k[7], k[6]); sB.follow(1, 0, 8);
  pileB.grow(ease(0.15, 2.4, lt));
  rexB.pose(stand(rexB, { arms: ['up', 'up'], bob: 0.02 * Math.sin(lt * 11), face: V3(1, 0.1, 0.1), expr: exprAt([[0, 'smug'], [0.6, 'grin']], lt) }), sB.camera);
}

// ---- shot C: rich on the lawn (sentence 4), cash burst in
const sC = makeStage({ mood: withLook('day', 'outdoor') });
const houseC = addHouse(sC.scene, { x: 0, z: 0, storeys: 2, roof: 'hip', garage: 'right', seed: 5 });
const lawn = houseC.at.lawn;
const pileC = cashPile({ r: 1.5, h: 1.5, n: 1100 }); pileC.position.set(lawn.x + 1.5, 0, lawn.z + 0.8); sC.scene.add(pileC);
const carC = makeCar(COUPE, 0xffbf0a); carC.position.copy(houseC.at.driveway); carC.rotation.y = Math.PI / 2; sC.scene.add(carC);
const GC = grp(sC, lawn.x + 0.1, 0, lawn.z + 1.6, FACE); const rexC = mkRex(); GC.add(rexC);
const CAMC = track([[0, lawn.x + 1.2, 1.3, 10.4, lawn.x, 1.5, 2.2, -3, 58], [3.7, lawn.x + 0.2, 1.2, 8.2, lawn.x, 1.6, 2.4, 2, 46]]);
function updateC(t, lt) {
  const k = CAMC(lt); look(sC, [k[0], k[1], k[2]], [k[3], k[4], k[5]], k[7], k[6]); sC.follow(lawn.x, 0, 3);
  pileC.grow(ease(0, 3.0, lt));
  rexC.pose(stand(rexC, { arms: ['up', 'hips'], bob: 0.03 * Math.abs(Math.sin(lt * 7)), face: V3(1, 0.1, 0.1), expr: exprAt([[0, 'grin'], [1.8, 'smug']], lt) }), sC.camera);
}

// ---- shot D: Sam sticks a dash cam on his windshield (sentence 5)
const sD = makeStage({ mood: withLook('day', 'outdoor') }); addHighway(sD.scene);
const carD = buildCar(CAST.cars.quiet); carD.position.set(0, 0, 5.55); carD.add(blobShadow(5.6, 2.9)); sD.scene.add(carD);
const samD = mkSam(); carD.body.add(samD);
const camD = camBox(); camD.scale.setScalar(2.0); camD.rotation.y = 0; carD.body.add(camD);
const ID = carD.I;
camD.position.set(ID.roofX + 0.14, ID.roofY - 0.12, 0);
const CAMD = track([[0, -2.6, 1.9, 4.2, 0.2, 1.1, 0, -2, 56], [2.2, 0.6, 1.25, 1.15, 0.0, 1.2, -0.35, 2, 50], [3.2, 0.5, 1.28, 1.6, 0.2, 1.28, -0.1, 0, 42], [4.6, 0.4, 1.3, 1.4, 0.22, 1.28, -0.1, 0, 36]]);
function updateD(t, lt) {
  const x = 3 + 6 * lt; carD.position.x = x; rollWheels(carD, x);
  const pop = lt < 2.7 ? 0.001 : (u => 1 + 0.25 * Math.sin(u * Math.PI) * (1 - u) * 2)(clamp((lt - 2.7) / 0.6)) * ease(2.7, 3.0, lt) + 0.001;
  camD.scale.setScalar(2.0 * Math.max(0.001, pop)); camD.visible = lt > 2.7;
  if (camD.led) camD.led.visible = ((lt * 2) % 1) < 0.65;
  const k = CAMD(lt); look(sD, [x + k[0], k[1], 5.55 + k[2]], [x + k[3], k[4], 5.55 + k[5]], k[7], k[6], 0.03); sD.follow(x - 4, 0, 5.55);
  samD.pose(sit(samD, ID, carD.wheelRig, { lean: 0.08, expr: exprAt([[0, 'calm'], [2.5, 'smug'], [3.4, 'grin']], lt), face: lt < 2.4 ? V3(1, 0, 0.1) : V3(1, 0.35, 0.3) }), sD.camera);
}

// ---- shot E: the dash cam's own view (sentence 6): Rex brakes, Sam crashes, the camera records it
function updateE(t, lt) {
  const tau = 0.3 + lt * 1.2; update1(tau);
  const xs = xS(tau), ti = tau - TI, sh = ti > 0 ? Math.exp(-7 * ti) * 0.07 : 0;
  camera.position.set(xs + 0.98 + sh * Math.sin(ti * 83), 1.48 + sh * Math.sin(ti * 97), LANE + 0.02 + sh * Math.sin(ti * 59));
  camera.fov = 78; camera.near = 0.03; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0);
  camera.lookAt(xs + 30, 1.05 + (ti > 0 ? -0.15 * Math.min(1, ti * 4) : 0), LANE + 0.02); camera.updateMatrixWorld(true); st.frame();
}
function hud(ctx, t) {
  if (t < S[5] || t >= S[6]) return;
  const f = t - S[5]; ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 6; ctx.strokeRect(36, 36, 1008, 1848);
  ctx.font = '800 54px Cap'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 8;
  ctx.strokeText('DASHCAM', 110, 130); ctx.fillText('DASHCAM', 110, 130);
  if (((t * 2) % 1) < 0.65) { ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(76, 112, 16, 0, 7); ctx.fill(); }
  ctx.font = '800 42px Cap'; ctx.fillStyle = '#fff'; const ts = '00:' + String(Math.floor(f)).padStart(2, '0') + '.' + String(Math.floor((f % 1) * 100)).padStart(2, '0');
  ctx.strokeText(ts, 110, 190); ctx.fillText(ts, 110, 190);
  const ti = (0.3 + f * 1.2) - TI; if (ti > 0 && ti < 0.9) { ctx.font = '800 150px Cap'; ctx.textAlign = 'center'; ctx.lineWidth = 18; ctx.strokeStyle = '#1a1a1a'; ctx.fillStyle = '#ffe83a'; ctx.strokeText('CRASH!', 540, 760); ctx.fillText('CRASH!', 540, 760); }
  ctx.restore();
}

// ---- shot F: the courtroom (sentence 7)
const sF = makeStage({ mood: withLook('day', 'indoor') });
const dF = 5.2, wF = 7.6;
const roomF = addRoom(sF.scene, { kind: 'empty', w: wF, d: dF, h: 3.4, wall: 0xe9dcc0, floor: 'wood', window: false, light: true, seed: 3 });
{
  const wood = flat(0x5b3a1f, 0.5); const G = roomF.group;
  G.add(box(3.8, 0.3, 1.5, flat(0x4a2a12, 0.6), 0, 0.15, -dF + 1.0));
  const bench = counterUnit({ w: 3.0, color: 0x5b3a1f }); bench.position.set(0, 0.3, -dF + 1.55); G.add(bench);
  const sg = sign('COURT', { post: false, w: 2.4, h: 0.44, bg: '#1d2f6b', fg: '#f0c43a' }); sg.position.set(0, 2.6, -dF + 0.03); G.add(sg);
  const tvF = screen({ w: 1.5, h: 0.9, draw: (g, W, H) => { g.fillStyle = '#7ec8ff'; g.fillRect(0, 0, W, H); g.fillStyle = '#4a4e58'; g.fillRect(0, H * 0.55, W, H * 0.45); g.fillStyle = '#ffffff'; g.fillRect(W * 0.1, H * 0.78, W * 0.14, H * 0.04); g.fillRect(W * 0.4, H * 0.78, W * 0.14, H * 0.04); g.fillRect(W * 0.7, H * 0.78, W * 0.14, H * 0.04);
    g.fillStyle = '#2d7ff9'; g.fillRect(W * 0.12, H * 0.45, W * 0.3, H * 0.2); g.fillStyle = '#e53935'; g.fillRect(W * 0.48, H * 0.45, W * 0.3, H * 0.2);
    g.fillStyle = '#ffe83a'; g.font = `800 ${Math.round(H * 0.17)}px Cap`; g.textAlign = 'center'; g.fillText('CRASH!', W / 2, H * 0.3);
    g.fillStyle = '#ff2a2a'; g.beginPath(); g.arc(W * 0.07, H * 0.09, W * 0.025, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = `800 ${Math.round(H * 0.08)}px Cap`; g.textAlign = 'left'; g.fillText('REC', W * 0.12, H * 0.12); } });
  tvF.position.set(2.75, 1.0, -dF + 0.06); G.add(tvF);
  for (const x of [-1.4, 1.4]) { const p = pendant({ color: 0xf4f1ea, r: 0.26, cord: 0.4, intensity: 7, range: 6 }); p.position.set(x, 3.4, -1.6); G.add(p); }
  lacquer(G);
}
const judge = mkJudge(), rexF = mkRex(), samF = mkSam();
const GJ = grp(sF, 0, 0.3, -dF + 0.7, FACE); GJ.add(judge);
const GR = grp(sF, -1.3, 0, -1.6, FACE); GR.add(rexF);
const GS = grp(sF, 1.3, 0, -1.6, FACE); GS.add(samF);
const pileR = cashPile({ r: 0.5, h: 0.45, n: 260 }); pileR.position.set(-0.7, 0, -1.0); sF.scene.add(pileR);
const pileS = cashPile({ r: 0.5, h: 0.45, n: 260 }); pileS.position.set(0.8, 0, -1.0); sF.scene.add(pileS);
const CAMF = track([[0, 0.3, 1.8, 3.6, 0, 1.2, -2.6, 2, 70], [1.1, 0.0, 1.6, 2.2, 0, 1.25, -2.8, 0, 62], [1.8, -0.5, 1.4, 0.6, -1.3, 1.25, -1.6, -3, 46], [2.8, 0.2, 1.45, 1.2, 0.0, 1.2, -1.6, 2, 58], [3.1, 0.2, 1.45, 1.1, 0.0, 1.2, -1.6, 2, 56]]);
function updateF(t, lt) {
  const k = CAMF(lt); look(sF, [k[0], k[1], k[2]], [k[3], k[4], k[5]], k[7], k[6]); sF.follow(0, 0, -2);
  const give = ease(1.9, 2.8, lt); pileR.grow(1 - give); pileS.grow(give);
  judge.pose(stand(judge, { arms: ['down', 'down'], face: V3(1, -0.05, 0.1), expr: exprAt([[0, 'stern'], [1.9, 'stern']], lt) }), sF.camera);
  rexF.pose(stand(rexF, { arms: ['down', 'shrug'], face: V3(1, 0, 0.2), expr: exprAt([[0, 'worried'], [1.6, 'shock'], [2.4, 'dazed']], lt, { pop: false }) }), sF.camera);
  samF.pose(stand(samF, { arms: ['hips', 'down'], face: V3(1, 0, -0.2), expr: exprAt([[0, 'calm'], [1.9, 'smug'], [2.6, 'grin']], lt) }), sF.camera);
}

// ---- shot G: the reveal (sentence 8), "...and that's how the dashcam was invented"
const sG = makeStage({ mood: withLook('day', 'indoor') });
const dG = 6, wG = 7.6;
const roomG = addRoom(sG.scene, { kind: 'empty', w: wG, d: dG, h: 3.8, wall: 0x4a2fc4, floor: 'tile', window: false, light: true, seed: 9 });
const heroG = camBox({ color: 0xf2f2f8 }); heroG.scale.setScalar(9);
const baseG = new THREE.Group(); baseG.position.set(0, 0, -2.4); baseG.add(heroG); heroG.position.y = 1.35; sG.scene.add(baseG);
{
  const G = roomG.group;
  G.add(box(2.2, 0.5, 2.2, flat(0xffd23a, 0.4), 0, 0.25, -2.4, 0.04));
  const sg = sign('DASHCAM', { post: false, w: 3.2, h: 0.7, bg: '#ffd23a', fg: '#2a1a7a', key: true }); sg.position.set(0, 3.0, -dG + 0.03); G.add(sg);
  for (const x of [-1.8, 1.8]) { const p = pendant({ color: 0xf4f1ea, r: 0.26, cord: 0.4, intensity: 8, range: 7 }); p.position.set(x, 3.8, -2.4); G.add(p); }
  lacquer(G);
}
heroG.position.y = 1.9;
const CAMG = track([[0, 0.8, 1.9, 4.0, 0, 1.9, -2.4, 3, 58], [4.2, 0.0, 1.8, 2.6, 0, 2.0, -2.4, -2, 44]]);
function updateG(t, lt) {
  const k = CAMG(lt); look(sG, [k[0], k[1], k[2]], [k[3], k[4], k[5]], k[7], k[6]); sG.follow(0, 0, -2);
  const u = clamp(lt / 0.5); heroG.scale.setScalar(9 * (1 + 0.5 * Math.pow(1 - u, 2) * Math.sin(u * 9)) * Math.max(0.05, u));
  baseG.rotation.y = lt * 0.9 - 0.5; if (heroG.led) heroG.led.visible = ((lt * 2) % 1) < 0.65;
}

// ------------------------------------------------------------------ the edit
run({
  shots: [
    { start: 0, end: S[2], stage: st, update: (t, lt) => update1A(t), grade: st.grade, type: 'interior' },
    { start: S[2], end: S[3], stage: sB, update: updateB, grade: sB.grade, type: 'twoshot' },
    { start: S[3], end: S[4], stage: sC, update: updateC, grade: sC.grade, type: 'house', in: { type: 'burst', frames: 18, fx: cashBurst() } },
    { start: S[4], end: S[5], stage: sD, update: updateD, grade: sD.grade, type: 'interior', in: { type: 'dissolve', frames: 6 } },
    { start: S[5], end: S[6], stage: st, update: (t, lt) => updateE(t, lt), grade: st.grade, type: 'pov', locked: true },
    { start: S[6], end: S[7], stage: sF, update: updateF, grade: sF.grade, type: 'wide', in: { type: 'dissolve', frames: 8 } },
    { start: S[7], end: END, stage: sG, update: updateG, grade: sG.grade, type: 'wide', in: { type: 'dissolve', frames: 10, slow: true } },
  ],
  captions: captionsFromWords(WORDS),
  overlay: hud,
  samples: () => 1,
});
