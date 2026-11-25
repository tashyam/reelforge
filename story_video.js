// Generic 30 s "fake origin story" scene. Everything story-specific comes from /story.json (written by factory.py).
// Beats follow the sentences of the voiceover: hook, loophole, payoff, greed, quiet victim, invention's view, judge, reveal.
import { THREE, V3, clamp, lerp, ease, DEG, track, run } from 'engine/core.js';
import { makeStage } from 'engine/stage.js';
import { addHighway } from 'engine/sets/highway.js';
import { makeChar, exprAt } from 'engine/chars.js';
import { stand } from 'engine/chars.js';
import { makeCar, COUPE } from 'engine/cars.js';
import { blobShadow, flat, box, lacquer } from 'engine/materials.js';
import { camBox, cashPile, sign, screen, counterUnit, pendant, laptop, paper, deskPhone, parcel, mailbox } from 'engine/props.js';
import { addRoom } from 'engine/sets/room.js';
import { addHouse } from 'engine/sets/house.js';
import { cashBurst } from 'engine/transitions.js';
import { captionsFromWords } from 'engine/captions.js';
import CAST from './cast.json' with { type: 'json' };
import { withLook } from './sets.js';

const WORDS = await (await fetch('/audio/vo.words.json')).json();
const STORY = await (await fetch('/story.json')).json();
const END = 30;
const NB = 8;
const S0 = STORY.starts;                                         // sentence start times from the voice
const B = Array.from({ length: NB }, (_, i) => S0[Math.min(S0.length - 1, Math.floor(i * S0.length / NB))]);
B[0] = 0; for (let i = 1; i < NB; i++) B[i] = Math.max(B[i], B[i - 1] + 1.2);
const FACE = -Math.PI / 2, TOWARD_BACK = Math.PI / 2;          // FACE: looks toward +z (camera side). TOWARD_BACK: looks toward -z

const mk = (c, over = {}) => makeChar({ ...c, ...over });
const mkRex = () => mk(CAST.characters.schemer);
const mkSam = () => mk(CAST.characters.quiet);
const mkVic = () => mk(CAST.characters.victim);
const mkJudge = () => makeChar({ R: 0.21, shirt: 0x1a1a22, hair: '#d8d8d8', hair2: '#eeeeee', style: 'flattop', outfit: 'suit', acc: ['mustache'], build: 'big' });
const grp = (stg, x, y, z, ry) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; stg.scene.add(g); return g; };
function look(stg, p, l, fov, roll = 0, near = 0.05) {
  const c = stg.camera; c.position.set(p[0], p[1], p[2]); c.fov = fov; c.near = near; c.updateProjectionMatrix();
  c.up.set(0, 1, 0); c.lookAt(l[0], l[1], l[2]); c.rotateZ(roll * DEG); c.updateMatrixWorld(true); stg.frame();
}
const camTrack = (stg, tr, lt) => { const k = tr(lt); look(stg, [k[0], k[1], k[2]], [k[3], k[4], k[5]], k[7], k[6]); };
const dur = (i) => B[i + 1] - B[i];

// hero (the invention) in the chosen shape; [size on the counter, size in the reveal]
const HERO = { camBox: [3, 9], laptop: [1.2, 3], paper: [1.6, 4], deskPhone: [1.6, 4.5], parcel: [1.4, 3.2], mailbox: [1.2, 2.4], screen: [1.2, 2.4] };
const heroType = HERO[STORY.hero] ? STORY.hero : 'camBox';
function mkHero() {
  const n = (STORY.invention || 'THING').toUpperCase();
  switch (heroType) {
    case 'laptop': return laptop({});
    case 'paper': return paper([n], { w: 0.21, h: 0.28 });
    case 'deskPhone': return deskPhone({});
    case 'parcel': return parcel({ label: n.slice(0, 8) });
    case 'mailbox': return mailbox({});
    case 'screen': return screen({ w: 0.45, h: 0.28, lines: [n] });
    default: return camBox({ color: 0xf2f2f8 });
  }
}
// scale a prop and set its bounding box centre to (cx, cy, cz) or sit it on y = bottom
function fitHero(h, scale, cx, cy, cz, bottomY) {
  h.scale.setScalar(scale); h.position.set(0, 0, 0); h.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(h), c = bb.getCenter(new THREE.Vector3());
  h.position.set(cx - c.x, bottomY !== undefined ? bottomY - bb.min.y : cy - c.y, cz - c.z);
}
const pop = (u) => { u = clamp(u); return u <= 0 ? 0.001 : u < 1 ? 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2) : 1; };

// ------------------------------------------------------------------ the room (beats 1, 2, 3, 5, 6)
const place = ['shop', 'office', 'kitchen', 'living', 'empty'].includes(STORY.place) ? STORY.place : 'shop';
const sR = makeStage({ mood: withLook('day', 'indoor') });
const dR = 5.2, wR = 6.4;
const roomR = addRoom(sR.scene, { kind: place, w: wR, d: dR, h: 3.3, window: place !== 'empty', light: true, seed: STORY.seed || 5 });
const COUNTER_Z = -2.55;
{
  const G = roomR.group;
  const ctr = counterUnit({ w: 2.8, color: STORY.counterColor || 0x7fa88a, top: 0x9b7a55 }); ctr.position.set(0, 0, COUNTER_Z); G.add(ctr);
  const sg = sign((STORY.placeSign || 'SHOP').toUpperCase(), { post: false, w: 2.2, h: 0.46, bg: '#1d2f6b', fg: '#ffd23a' }); sg.position.set(0, 2.55, -dR + 0.06); G.add(sg);
  const board = sign(STORY.schemeText || ['NO PROOF', 'NO PROBLEM'], { post: true, postH: 1.3, w: 1.15, h: 0.62, bg: '#202633', fg: '#ffe83a' }); board.position.set(-1.45, 0, -3.05); G.add(board);
  lacquer(G);
}
const GRx = grp(sR, 0, 0, -3.2, FACE); const rexR = mkRex(); GRx.add(rexR);
const GVc = grp(sR, -0.15, 0, -1.75, TOWARD_BACK); const vicR = mkVic(); GVc.add(vicR);
const GSm = grp(sR, 0.15, 0, -1.8, TOWARD_BACK); const samR = mkSam(); GSm.add(samR);
const pileR = cashPile({ r: 0.62, h: 0.55, n: 320 }); pileR.position.set(1.95, 0, -3.15); sR.scene.add(pileR);
const heroR = mkHero(); fitHero(heroR, HERO[heroType][0], 0.0, 0, COUNTER_Z + 0.02, 0.62); sR.scene.add(heroR);
const heroRBase = heroR.scale.x;

const CAMS = [
  track([[0, 1.1, 1.5, 0.5, 0.0, 1.2, -3.1, 2, 56], [dur(0), 0.7, 1.4, -0.2, 0.0, 1.2, -3.1, -1, 46]]),
  track([[0, 1.5, 1.4, -0.4, -0.65, 1.2, -3.0, -2, 48], [dur(1), 1.0, 1.35, -1.0, -0.6, 1.2, -3.0, 2, 40]]),
  track([[0, 2.9, 1.7, 0.7, 0.5, 1.0, -3.0, 3, 54], [dur(2), 1.4, 1.5, -0.5, 0.7, 1.0, -3.0, -2, 46]]),
  null,
  track([[0, 2.3, 1.5, 0.3, -0.2, 1.05, -2.7, 3, 52], [dur(4), 1.5, 1.4, -0.3, -0.2, 1.05, -2.7, 0, 44]]),
  track([[0, 0.0, 1.05, -1.0, 0.0, 1.2, -3.15, 0, 56], [dur(5), 0.0, 1.1, -1.5, 0.0, 1.25, -3.15, 0, 46]]),
];
function roomUpdate(beat, lt) {
  camTrack(sR, CAMS[beat], lt); sR.follow(0, 0, -2.6);
  const t = B[beat] + lt;
  // who is visible, what is shown
  GVc.visible = beat <= 1; GSm.visible = beat === 4; heroR.visible = beat >= 4;
  pileR.visible = beat >= 2; pileR.grow(beat === 2 ? ease(0.15, dur(2) * 0.85, lt) : 1);
  heroR.scale.setScalar(heroRBase * pop((lt - 0.7) / 0.5));
  if (heroR.led) heroR.led.visible = ((t * 2) % 1) < 0.65;
  // schemer
  let rexExpr = exprAt([[0, 'smug'], [0.8, 'grin']], lt), rexArms = ['hips', 'down'];
  if (beat === 1) { rexExpr = exprAt([[0, 'smug'], [1.0, 'grin']], lt); rexArms = ['hips', 'wave']; }
  if (beat === 2) { rexExpr = exprAt([[0, 'grin'], [1.6, 'smug']], lt); rexArms = ['up', 'up']; }
  if (beat === 4) { rexExpr = exprAt([[0, 'smug'], [1.15, 'shock']], lt, { pop: false }); rexArms = lt > 1.15 ? ['up', 'up'] : ['hips', 'down']; }
  if (beat === 5) { rexExpr = exprAt([[0, 'shock'], [1.4, 'worried']], lt, { pop: false }); rexArms = ['up', 'up']; }
  rexR.pose(stand(rexR, { arms: rexArms, bob: 0.02 * Math.sin(t * 9), face: V3(1, 0.05, 0.1), expr: rexExpr }), sR.camera);
  // customer (hook, loophole)
  if (beat <= 1) vicR.pose(stand(vicR, { arms: [beat === 0 ? 'shrug' : 'down', 'down'], face: V3(1, 0.02, -0.1), expr: exprAt([[0, 'shock'], [1.2, 'worried']], lt, { pop: false }) }), sR.camera);
  // quiet victim: points at the invention
  if (beat === 4) samR.pose(stand(samR, { arms: [lt > 1.0 ? 'point' : 'down', 'down'], target: V3(1.0, 0.6, -0.7), face: V3(1, 0, 0.1), expr: PRE_FLAT(lt) }), sR.camera);
}
const PRE_FLAT = (lt) => exprAt([[0, 'flat'], [2, 'flat']], lt);

// ------------------------------------------------------------------ beat 4: rich on the lawn
const sC = makeStage({ mood: withLook('day', 'outdoor') });
const houseC = addHouse(sC.scene, { x: 0, z: 0, storeys: 2, roof: 'hip', garage: 'right', seed: STORY.seed || 5 });
const lawn = houseC.at.lawn;
const pileC = cashPile({ r: 1.5, h: 1.5, n: 1100 }); pileC.position.set(lawn.x + 1.5, 0, lawn.z + 0.8); sC.scene.add(pileC);
const carC = makeCar(COUPE, STORY.carColor || 0xffbf0a); carC.position.copy(houseC.at.driveway); carC.rotation.y = Math.PI / 2; sC.scene.add(carC);
const GC = grp(sC, lawn.x + 0.1, 0, lawn.z + 1.6, FACE); const rexC = mkRex(); GC.add(rexC);
const CAMC = track([[0, lawn.x + 1.2, 1.3, 10.4, lawn.x, 1.5, 2.2, -3, 58], [dur(3), lawn.x + 0.2, 1.2, 8.2, lawn.x, 1.6, 2.4, 2, 46]]);
function updateC(t, lt) {
  const k = CAMC(lt); look(sC, [k[0], k[1], k[2]], [k[3], k[4], k[5]], k[7], k[6]); sC.follow(lawn.x, 0, 3);
  pileC.grow(ease(0, dur(3) * 0.8, lt));
  rexC.pose(stand(rexC, { arms: ['up', 'hips'], bob: 0.03 * Math.abs(Math.sin(lt * 7)), face: V3(1, 0.1, 0.1), expr: exprAt([[0, 'grin'], [1.8, 'smug']], lt) }), sC.camera);
}

// ------------------------------------------------------------------ beat 7: the courtroom
const sF = makeStage({ mood: withLook('day', 'indoor') });
const dF = 5.2, wF = 7.6;
const roomF = addRoom(sF.scene, { kind: 'empty', w: wF, d: dF, h: 3.4, wall: 0xe9dcc0, floor: 'wood', window: false, light: true, seed: 3 });
{
  const G = roomF.group;
  G.add(box(3.8, 0.3, 1.5, flat(0x4a2a12, 0.6), 0, 0.15, -dF + 1.0));
  const bench = counterUnit({ w: 3.0, color: 0x5b3a1f }); bench.position.set(0, 0.3, -dF + 1.55); G.add(bench);
  const sg = sign('COURT', { post: false, w: 2.4, h: 0.44, bg: '#1d2f6b', fg: '#f0c43a' }); sg.position.set(0, 2.6, -dF + 0.03); G.add(sg);
  const tvF = screen({ w: 1.5, h: 0.9, draw: (g, W, H) => { g.fillStyle = '#10151f'; g.fillRect(0, 0, W, H); g.fillStyle = '#ff2a2a'; g.beginPath(); g.arc(W * 0.07, H * 0.09, W * 0.025, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = `800 ${Math.round(H * 0.08)}px Cap`; g.textAlign = 'left'; g.fillText('REPLAY', W * 0.12, H * 0.12);
    g.fillStyle = '#ffe83a'; g.textAlign = 'center'; g.font = `800 ${Math.round(H * 0.15)}px Cap`; (STORY.viewLines || ['CAUGHT']).slice(0, 3).forEach((l, i) => g.fillText(String(l).toUpperCase().slice(0, 16), W / 2, H * (0.42 + i * 0.2))); } });
  tvF.position.set(2.75, 1.0, -dF + 0.06); G.add(tvF);
  for (const x of [-1.4, 1.4]) { const p = pendant({ color: 0xf4f1ea, r: 0.26, cord: 0.4, intensity: 7, range: 6 }); p.position.set(x, 3.4, -1.6); G.add(p); }
  lacquer(G);
}
const judge = mkJudge(), rexF = mkRex(), samF = mkSam();
const GJ = grp(sF, 0, 0.3, -dF + 0.7, FACE); GJ.add(judge);
const GR = grp(sF, -1.3, 0, -1.6, FACE); GR.add(rexF);
const GS = grp(sF, 1.3, 0, -1.6, FACE); GS.add(samF);
const pileRF = cashPile({ r: 0.5, h: 0.45, n: 260 }); pileRF.position.set(-0.7, 0, -1.0); sF.scene.add(pileRF);
const pileSF = cashPile({ r: 0.5, h: 0.45, n: 260 }); pileSF.position.set(0.8, 0, -1.0); sF.scene.add(pileSF);
const d6 = dur(6), k6 = d6 / 3.0;
const CAMF = track([[0, 0.3, 1.8, 3.6, 0, 1.2, -2.6, 2, 70], [1.1 * k6, 0.0, 1.6, 2.2, 0, 1.25, -2.8, 0, 62], [1.8 * k6, -0.5, 1.4, 0.6, -1.3, 1.25, -1.6, -3, 46], [2.8 * k6, 0.2, 1.45, 1.2, 0.0, 1.2, -1.6, 2, 58], [d6 + 0.01, 0.2, 1.45, 1.1, 0.0, 1.2, -1.6, 2, 56]]);
function updateF(t, lt) {
  camTrack(sF, CAMF, lt); sF.follow(0, 0, -2);
  const give = ease(1.9 * k6, 2.8 * k6, lt); pileRF.grow(1 - give); pileSF.grow(give);
  judge.pose(stand(judge, { arms: ['down', 'down'], face: V3(1, -0.05, 0.1), expr: exprAt([[0, 'stern'], [2, 'stern']], lt) }), sF.camera);
  rexF.pose(stand(rexF, { arms: ['down', 'shrug'], face: V3(1, 0, 0.2), expr: exprAt([[0, 'worried'], [1.6 * k6, 'shock'], [2.4 * k6, 'dazed']], lt, { pop: false }) }), sF.camera);
  samF.pose(stand(samF, { arms: ['hips', 'down'], face: V3(1, 0, -0.2), expr: exprAt([[0, 'flat'], [1.9 * k6, 'smug'], [2.6 * k6, 'grin']], lt) }), sF.camera);
}

// ------------------------------------------------------------------ beat 8: the reveal
const sG = makeStage({ mood: withLook('day', 'indoor') });
const dG = 6, wG = 7.6;
const roomG = addRoom(sG.scene, { kind: 'empty', w: wG, d: dG, h: 3.8, wall: 0x4a2fc4, floor: 'tile', window: false, light: true, seed: 9 });
const heroG = mkHero(); fitHero(heroG, HERO[heroType][1], 0, 1.9, 0);
const baseG = new THREE.Group(); baseG.position.set(0, 0, -2.4); baseG.add(heroG); sG.scene.add(baseG);
const heroGScale = heroG.scale.x;
{
  const G = roomG.group;
  G.add(box(2.2, 0.5, 2.2, flat(0xffd23a, 0.4), 0, 0.25, -2.4, 0.04));
  const nm = (STORY.invention || 'INVENTION').toUpperCase();
  const sg = sign(nm, { post: false, w: Math.min(4.6, 1.2 + nm.length * 0.3), h: 0.7, bg: '#ffd23a', fg: '#2a1a7a', key: true }); sg.position.set(0, 3.0, -dG + 0.03); G.add(sg);
  for (const x of [-1.8, 1.8]) { const p = pendant({ color: 0xf4f1ea, r: 0.26, cord: 0.4, intensity: 8, range: 7 }); p.position.set(x, 3.8, -2.4); G.add(p); }
  lacquer(G);
}
const CAMG = track([[0, 0.8, 1.9, 4.0, 0, 1.9, -2.4, 3, 58], [Math.max(3, END - B[7]), 0.0, 1.8, 2.6, 0, 2.0, -2.4, -2, 44]]);
function updateG(t, lt) {
  camTrack(sG, CAMG, lt); sG.follow(0, 0, -2);
  const u = clamp(lt / 0.5); heroG.scale.setScalar(heroGScale * (1 + 0.5 * Math.pow(1 - u, 2) * Math.sin(u * 9)) * Math.max(0.05, u));
  baseG.rotation.y = lt * 0.9 - 0.5; if (heroG.led) heroG.led.visible = ((lt * 2) % 1) < 0.65;
}

// ------------------------------------------------------------------ HUD: the invention's own view (beat 6)
function hud(ctx, t) {
  if (t < B[5] || t >= B[6]) return;
  const f = t - B[5]; ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 6; ctx.strokeRect(36, 36, 1008, 1848);
  ctx.font = '800 54px Cap'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 8;
  const title = (STORY.viewTitle || STORY.invention || 'RECORDING').toUpperCase().slice(0, 18);
  ctx.strokeText(title, 110, 130); ctx.fillText(title, 110, 130);
  if (((t * 2) % 1) < 0.65) { ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(76, 112, 16, 0, 7); ctx.fill(); }
  ctx.font = '800 42px Cap'; ctx.fillStyle = '#fff'; const ts = '00:' + String(Math.floor(f)).padStart(2, '0') + '.' + String(Math.floor((f % 1) * 100)).padStart(2, '0');
  ctx.strokeText(ts, 110, 190); ctx.fillText(ts, 110, 190);
  const lines = (STORY.viewLines || []).slice(0, 3); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  lines.forEach((l, i) => { const a = clamp((f - 0.5 - i * 0.8) / 0.25); if (a <= 0) return; ctx.globalAlpha = a; ctx.font = '800 76px Cap'; ctx.lineWidth = 14; ctx.strokeStyle = '#1a1a1a'; ctx.fillStyle = i === lines.length - 1 ? '#ff4b3a' : '#ffe83a'; const y = 520 + i * 120 + (1 - a) * 20; ctx.strokeText(String(l).toUpperCase().slice(0, 22), 540, y); ctx.fillText(String(l).toUpperCase().slice(0, 22), 540, y); });
  ctx.restore();
}

// ------------------------------------------------------------------ the edit
run({
  shots: [
    { start: B[0], end: B[1], stage: sR, update: (t, lt) => roomUpdate(0, lt), grade: sR.grade, type: 'twoshot' },
    { start: B[1], end: B[2], stage: sR, update: (t, lt) => roomUpdate(1, lt), grade: sR.grade, type: 'closeup' },
    { start: B[2], end: B[3], stage: sR, update: (t, lt) => roomUpdate(2, lt), grade: sR.grade, type: 'twoshot', in: { type: 'dissolve', frames: 6 } },
    { start: B[3], end: B[4], stage: sC, update: updateC, grade: sC.grade, type: 'house', in: { type: 'burst', frames: 18, fx: cashBurst() } },
    { start: B[4], end: B[5], stage: sR, update: (t, lt) => roomUpdate(4, lt), grade: sR.grade, type: 'twoshot', in: { type: 'dissolve', frames: 6 } },
    { start: B[5], end: B[6], stage: sR, update: (t, lt) => roomUpdate(5, lt), grade: sR.grade, type: 'pov', locked: true },
    { start: B[6], end: B[7], stage: sF, update: updateF, grade: sF.grade, type: 'wide', in: { type: 'dissolve', frames: 8 } },
    { start: B[7], end: END, stage: sG, update: updateG, grade: sG.grade, type: 'wide', in: { type: 'dissolve', frames: 10, slow: true } },
  ],
  captions: captionsFromWords(WORDS),
  overlay: hud,
  samples: () => 1,
});
