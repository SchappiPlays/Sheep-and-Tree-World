// dragons.js — Full dragon system ported from game.html
// Includes: dragon/wyvern mesh, dynamic membrane wings, eggs, stone circle, hatching, growth, follow AI, riding, flight

import { BLOCK_SIZE } from './world.js';

const _wmv = new THREE.Vector3();
const _afv = new THREE.Vector3();

// ── Shared materials ──
const dragonEyeMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xdd9900, emissiveIntensity: 0.8 });
const dragonPupilMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

// ── Helper functions (exact from game.html) ──

function makePatagium(p0, p1, maxW, mat, parent) {
    const steps = 6, nFloats = steps * 2 * 9;
    const arr = new Float32Array(nFloats);
    let vi = 0;
    for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i + 1) / steps;
        const w0 = (0.15 + 0.85 * t0) * maxW;
        const w1 = (0.15 + 0.85 * t1) * maxW;
        const ax = p0[0]+(p1[0]-p0[0])*t0, ay = p0[1]+(p1[1]-p0[1])*t0, az = p0[2]+(p1[2]-p0[2])*t0;
        const bx = p0[0]+(p1[0]-p0[0])*t1, by = p0[1]+(p1[1]-p0[1])*t1, bz = p0[2]+(p1[2]-p0[2])*t1;
        arr[vi++]=ax; arr[vi++]=ay; arr[vi++]=az;
        arr[vi++]=ax; arr[vi++]=ay; arr[vi++]=az-w0;
        arr[vi++]=bx; arr[vi++]=by; arr[vi++]=bz;
        arr[vi++]=ax; arr[vi++]=ay; arr[vi++]=az-w0;
        arr[vi++]=bx; arr[vi++]=by; arr[vi++]=bz-w1;
        arr[vi++]=bx; arr[vi++]=by; arr[vi++]=bz;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    parent.add(mesh);
    return mesh;
}

function makeDragonBone(p1, p2, r1, r2, mat, parent) {
    const dx = p2[0]-p1[0], dy = p2[1]-p1[1], dz = p2[2]-p1[2];
    const len = Math.sqrt(dx*dx+dy*dy+dz*dz);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, 6), mat);
    b.position.set((p1[0]+p2[0])/2,(p1[1]+p2[1])/2,(p1[2]+p2[2])/2);
    const dir = new THREE.Vector3(dx,dy,dz).normalize();
    b.setRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), dir));
    b.castShadow = true;
    parent.add(b);
}

function toWgSpace(pt, space, elbowGrp, handGrp) {
    _wmv.set(pt[0], pt[1], pt[2]);
    if (space === 2) { _wmv.applyEuler(handGrp.rotation); _wmv.add(handGrp.position); }
    if (space >= 1) { _wmv.applyEuler(elbowGrp.rotation); _wmv.add(elbowGrp.position); }
    return [_wmv.x, _wmv.y, _wmv.z];
}

function applyFingerRots(w, rots) {
    if (!w._fingerGrps || !rots) return;
    const si = w._s;
    for (let fi = 0; fi < w._fingerGrps.length; fi++) {
        const fg = w._fingerGrps[fi], rot = rots[fi];
        fg.baseGrp.rotation.set(rot.liftX, si * rot.spreadY, 0);
        fg.midGrp.rotation.set(rot.curlX, 0, 0);
    }
}

function updateWyvernMembrane(w) {
    const outline = w._memOutline;
    const geo = w._memGeo;
    const elb = w._elbow, hand = w._hand;
    const pos = geo.attributes.position.array;
    const pts = [];
    for (let i = 0; i < outline.length; i++) {
        pts.push(toWgSpace(outline[i].p, outline[i].s, elb, hand));
    }
    const cx = w._memCenter;
    const c = toWgSpace(cx.p, cx.s, elb, hand);
    let vi = 0;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        pos[vi++]=c[0]; pos[vi++]=c[1]; pos[vi++]=c[2];
        pos[vi++]=a[0]; pos[vi++]=a[1]; pos[vi++]=a[2];
        pos[vi++]=b[0]; pos[vi++]=b[1]; pos[vi++]=b[2];
        pos[vi++]=c[0]; pos[vi++]=c[1]; pos[vi++]=c[2];
        pos[vi++]=b[0]; pos[vi++]=b[1]; pos[vi++]=b[2];
        pos[vi++]=a[0]; pos[vi++]=a[1]; pos[vi++]=a[2];
    }
    for (; vi < pos.length;) pos[vi++] = 0;
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    if (w._afGeo) updateArmFingerMem(w);
    if (w._ffGeo) updateFingerMembranes(w);
}

function updateArmFingerMem(w) {
    const elb = w._elbow, hand = w._hand;
    const si = w._s, fl = w._afFLen;
    let cTip, cMid;
    if (w._fingerGrps && w._fingerGrps[0]) {
        const fg = w._fingerGrps[0], br = fg.baseGrp.rotation;
        _afv.set(fg.midPos[0], fg.midPos[1], fg.midPos[2]);
        if (br.x || br.y) _afv.applyEuler(br);
        cMid = [_afv.x, _afv.y, _afv.z];
        _afv.set(fg.tipLocal[0], fg.tipLocal[1], fg.tipLocal[2]);
        if (fg.midGrp.rotation.x) _afv.applyEuler(new THREE.Euler(fg.midGrp.rotation.x, 0, 0));
        _afv.x += fg.midPos[0]; _afv.y += fg.midPos[1]; _afv.z += fg.midPos[2];
        if (br.x || br.y) _afv.applyEuler(br);
        cTip = [_afv.x, _afv.y, _afv.z];
    } else { cTip = w._afStaticTip; cMid = w._afStaticMid; }
    const N = 5;
    const arm = [], fin = [];
    for (let i = 0; i <= N; i++) {
        const t = i / N;
        arm.push(toWgSpace([si * fl * (1 - t), 0, 0], 1, elb, hand));
        let fp;
        if (t <= 0.5) { const u = t * 2; fp = [cMid[0]*u, cMid[1]*u, cMid[2]*u]; }
        else { const u = (t - 0.5) * 2; fp = [cMid[0]*(1-u)+cTip[0]*u, cMid[1]*(1-u)+cTip[1]*u, cMid[2]*(1-u)+cTip[2]*u]; }
        fin.push(toWgSpace(fp, 2, elb, hand));
    }
    const pos = w._afGeo.attributes.position.array;
    let vi = 0;
    for (let i = 0; i < N; i++) {
        const fa = arm[i], fb = arm[i+1], ga = fin[i], gb = fin[i+1];
        pos[vi++]=fa[0]; pos[vi++]=fa[1]; pos[vi++]=fa[2];
        pos[vi++]=ga[0]; pos[vi++]=ga[1]; pos[vi++]=ga[2];
        pos[vi++]=fb[0]; pos[vi++]=fb[1]; pos[vi++]=fb[2];
        pos[vi++]=ga[0]; pos[vi++]=ga[1]; pos[vi++]=ga[2];
        pos[vi++]=gb[0]; pos[vi++]=gb[1]; pos[vi++]=gb[2];
        pos[vi++]=fb[0]; pos[vi++]=fb[1]; pos[vi++]=fb[2];
    }
    if (w._afBodyPt) {
        const bp = toWgSpace(w._afBodyPt, 0, elb, hand);
        // Trailing membrane: connects the wing to the body
        // Front edge: shares the elbow edge of the arm-finger strip (arm[N], fin[N])
        // Back edge: extends to the body point (bp)
        // This makes the trailing membrane connect to the same edge the arm-finger strip ends on
        const armElbowEnd = arm[N]; // shared with end of arm-finger strip
        const finFingerEnd = fin[N]; // shared with end of arm-finger strip (finger side)
        const armShoulderEnd = toWgSpace([0, 0, 0], 0, elb, hand);
        // Single quad: from shared edge → body point
        // Front side: elbow point → shoulder point (along body)
        // Back side: finger end → body point (extension)
        const N2 = 3;
        const grid = [];
        for (let u = 0; u <= N2; u++) {
            grid.push([]);
            const tu = u / N2;
            for (let v = 0; v <= N2; v++) {
                const tv = v / N2;
                // u=0 → finger side (outer membrane edge)
                // u=1 → arm side (inner edge along body)
                // v=0 → at the elbow (shared with arm-finger strip end)
                // v=1 → at the body point / shoulder
                // Corners:
                // (0,0): finFingerEnd  (0,1): bp (body, finger-side end)
                // (1,0): armElbowEnd   (1,1): armShoulderEnd
                const c00 = finFingerEnd, c01 = bp;
                const c10 = armElbowEnd, c11 = armShoulderEnd;
                let x = c00[0]*(1-tu)*(1-tv) + c10[0]*tu*(1-tv) + c01[0]*(1-tu)*tv + c11[0]*tu*tv;
                let y = c00[1]*(1-tu)*(1-tv) + c10[1]*tu*(1-tv) + c01[1]*(1-tu)*tv + c11[1]*tu*tv;
                let z = c00[2]*(1-tu)*(1-tv) + c10[2]*tu*(1-tv) + c01[2]*(1-tu)*tv + c11[2]*tu*tv;
                // Subtle sag in the middle
                const sag = Math.sin(tu * Math.PI) * Math.sin(tv * Math.PI) * 0.06;
                y -= sag;
                grid[u].push([x, y, z]);
            }
        }
        // Render as triangles
        for (let u = 0; u < N2; u++) {
            for (let v = 0; v < N2; v++) {
                const a = grid[u][v], b = grid[u+1][v];
                const c = grid[u][v+1], d = grid[u+1][v+1];
                pos[vi++]=a[0]; pos[vi++]=a[1]; pos[vi++]=a[2];
                pos[vi++]=c[0]; pos[vi++]=c[1]; pos[vi++]=c[2];
                pos[vi++]=b[0]; pos[vi++]=b[1]; pos[vi++]=b[2];
                pos[vi++]=c[0]; pos[vi++]=c[1]; pos[vi++]=c[2];
                pos[vi++]=d[0]; pos[vi++]=d[1]; pos[vi++]=d[2];
                pos[vi++]=b[0]; pos[vi++]=b[1]; pos[vi++]=b[2];
            }
        }
    }
    for (; vi < pos.length;) pos[vi++] = 0;
    w._afGeo.attributes.position.needsUpdate = true;
    w._afGeo.computeVertexNormals();
    if (w._patGeo) {
        const elbWg = arm[N], finWg = fin[N];
        const tdx = finWg[0]-elbWg[0], tdy = finWg[1]-elbWg[1], tdz = finWg[2]-elbWg[2];
        const tdL = Math.sqrt(tdx*tdx+tdy*tdy+tdz*tdz) || 1;
        const td = [tdx/tdL, Math.min(tdy/tdL, 0.2), tdz/tdL];
        const p0 = w._patP0, p1 = w._patP1, mw = w._patMaxW;
        const pp = w._patGeo.attributes.position.array;
        let pv = 0;
        const steps = 6;
        for (let i = 0; i < steps; i++) {
            const t0 = i/steps, t1 = (i+1)/steps;
            const w0 = (0.15+0.85*t0)*mw, w1 = (0.15+0.85*t1)*mw;
            const ax = p0[0]+(p1[0]-p0[0])*t0, ay = p0[1]+(p1[1]-p0[1])*t0, az = p0[2]+(p1[2]-p0[2])*t0;
            const bx = p0[0]+(p1[0]-p0[0])*t1, by = p0[1]+(p1[1]-p0[1])*t1, bz = p0[2]+(p1[2]-p0[2])*t1;
            const ox0 = td[0]*w0*t0, oy0 = td[1]*w0*t0, oz0 = w0*(-1+t0*(1+td[2]));
            const ox1 = td[0]*w1*t1, oy1 = td[1]*w1*t1, oz1 = w1*(-1+t1*(1+td[2]));
            pp[pv++]=ax; pp[pv++]=ay; pp[pv++]=az; pp[pv++]=ax+ox0; pp[pv++]=ay+oy0; pp[pv++]=az+oz0;
            pp[pv++]=bx; pp[pv++]=by; pp[pv++]=bz; pp[pv++]=ax+ox0; pp[pv++]=ay+oy0; pp[pv++]=az+oz0;
            pp[pv++]=bx+ox1; pp[pv++]=by+oy1; pp[pv++]=bz+oz1; pp[pv++]=bx; pp[pv++]=by; pp[pv++]=bz;
        }
        w._patGeo.attributes.position.needsUpdate = true;
        w._patGeo.computeVertexNormals();
    }
}

function ffPt(mid, tip, t) {
    if (t <= 0.5) { const u = t*2; return [mid[0]*u, mid[1]*u, mid[2]*u]; }
    const u = (t-0.5)*2;
    return [mid[0]*(1-u)+tip[0]*u, mid[1]*(1-u)+tip[1]*u, mid[2]*(1-u)+tip[2]*u];
}

function updateFingerMembranes(w) {
    const elb = w._elbow, hand = w._hand;
    const tips = [], mids = [];
    if (w._fingerGrps) {
        for (let fi = 0; fi < 4; fi++) {
            const fg = w._fingerGrps[fi], br = fg.baseGrp.rotation;
            _afv.set(fg.midPos[0], fg.midPos[1], fg.midPos[2]);
            if (br.x || br.y) _afv.applyEuler(br);
            mids.push([_afv.x, _afv.y, _afv.z]);
            _afv.set(fg.tipLocal[0], fg.tipLocal[1], fg.tipLocal[2]);
            if (fg.midGrp.rotation.x) _afv.applyEuler(new THREE.Euler(fg.midGrp.rotation.x, 0, 0));
            _afv.x += fg.midPos[0]; _afv.y += fg.midPos[1]; _afv.z += fg.midPos[2];
            if (br.x || br.y) _afv.applyEuler(br);
            tips.push([_afv.x, _afv.y, _afv.z]);
        }
    } else {
        for (let fi = 0; fi < 4; fi++) { tips.push(w._ffStaticTips[fi]); mids.push(w._ffStaticMids[fi]); }
    }
    const pos = w._ffGeo.attributes.position.array;
    let vi = 0;
    const wristHS = [0,0,0];
    const wrist = toWgSpace(wristHS, 2, elb, hand);
    for (let gap = 0; gap < 3; gap++) {
        const mA = mids[gap], tA = tips[gap], mB = mids[gap+1], tB = tips[gap+1];
        const outline = [];
        for (const t of [0.15, 0.4, 0.7, 1.0]) outline.push(ffPt(mA, tA, t));
        const cpx = (tA[0]+tB[0])*0.35, cpy = (tA[1]+tB[1])*0.35, cpz = (tA[2]+tB[2])*0.35;
        for (const t of [0.15, 0.35, 0.5, 0.65, 0.85]) {
            const u = 1-t;
            outline.push([u*u*tA[0]+2*u*t*cpx+t*t*tB[0], u*u*tA[1]+2*u*t*cpy+t*t*tB[1], u*u*tA[2]+2*u*t*cpz+t*t*tB[2]]);
        }
        for (const t of [1.0, 0.7, 0.4, 0.15]) outline.push(ffPt(mB, tB, t));
        for (let i = 0; i < outline.length - 1; i++) {
            const a = toWgSpace(outline[i], 2, elb, hand);
            const b = toWgSpace(outline[i+1], 2, elb, hand);
            pos[vi++]=wrist[0]; pos[vi++]=wrist[1]; pos[vi++]=wrist[2];
            pos[vi++]=a[0]; pos[vi++]=a[1]; pos[vi++]=a[2];
            pos[vi++]=b[0]; pos[vi++]=b[1]; pos[vi++]=b[2];
        }
    }
    for (; vi < pos.length;) pos[vi++] = 0;
    w._ffGeo.attributes.position.needsUpdate = true;
    w._ffGeo.computeVertexNormals();
}

function computeFlap(t) {
    const cycle = 1.1, half = 0.55, active = 0.46;
    let pos = ((t % cycle) + cycle) % cycle;
    let shoulder, elbow;
    if (pos < half) {
        const st = Math.min(pos / active, 1);
        shoulder = -Math.cos(st * Math.PI);
        elbow = -Math.cos((pos / half) * Math.PI);
    } else {
        const upos = pos - half;
        const st = Math.min(upos / active, 1);
        shoulder = Math.cos(st * Math.PI);
        elbow = Math.cos((upos / half) * Math.PI);
    }
    return [shoulder, elbow];
}

function getDragonMaxHP(age) {
    if (age < 1200) return 15 + (age / 1200) * 15;
    if (age < 2400) return 30 + ((age - 1200) / 1200) * 30;
    if (age < 3600) return 60 + ((age - 2400) / 1200) * 40;
    if (age < 7200) return 100 + ((age - 3600) / 3600) * 50;
    return 150;
}


// ── makeBabyDragon — exact mesh from game.html ──
function makeBabyDragon(x, z, terrainY, eggColor, wingColor, isWyvern) {
    const S = 2.55;
    const babyScale = 0.04;
    const g = new THREE.Group();

    const baseHue = new THREE.Color(eggColor);
    const midHue = baseHue.clone().multiplyScalar(1.15);
    midHue.r = Math.min(midHue.r, 1); midHue.g = Math.min(midHue.g, 1); midHue.b = Math.min(midHue.b, 1);
    const darker = baseHue.clone().multiplyScalar(0.55);
    const boneColor = baseHue.clone().multiplyScalar(0.25);
    const bellyColor = baseHue.clone().lerp(new THREE.Color(0xc4a032), 0.7);
    const memColor = wingColor ? new THREE.Color(wingColor) : darker;

    const bTop = new THREE.MeshStandardMaterial({ color: baseHue, roughness: 0.55, metalness: 0.2 });
    const bMid = new THREE.MeshStandardMaterial({ color: midHue, roughness: 0.5, metalness: 0.18 });
    const bDark = new THREE.MeshStandardMaterial({ color: darker, roughness: 0.45, metalness: 0.25 });
    const bBelly = new THREE.MeshStandardMaterial({ color: bellyColor, roughness: 0.65 });
    const bHorn = new THREE.MeshStandardMaterial({ color: boneColor, roughness: 0.35, metalness: 0.4 });
    const bBone = new THREE.MeshStandardMaterial({ color: boneColor, roughness: 0.4, metalness: 0.3 });
    const bMem = new THREE.MeshStandardMaterial({ color: memColor, roughness: 0.75, side: THREE.DoubleSide });

    // Body
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.8*S, 0.55*S, 1.0*S), bTop);
    chest.position.set(0, 0, 0.2*S); chest.castShadow = true; g.add(chest);
    const midBody = new THREE.Mesh(new THREE.BoxGeometry(0.7*S, 0.5*S, 0.8*S), bMid);
    midBody.position.set(0, 0, -0.3*S); midBody.castShadow = true; g.add(midBody);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(0.6*S, 0.45*S, 0.7*S), bTop);
    rear.position.set(0, -0.05*S, -0.8*S); rear.castShadow = true; g.add(rear);
    // Belly plates
    for (let i = 0; i < 4; i++) {
        const bp = new THREE.Mesh(new THREE.BoxGeometry(0.45*S, 0.08*S, 0.3*S), bBelly);
        bp.position.set(0, -0.22*S, 0.5*S - i*0.35*S); g.add(bp);
    }
    // Spines
    for (let i = 0; i < 8; i++) {
        const t = i / 7;
        const h = 0.12 + Math.sin(t * Math.PI) * 0.15;
        const ridge = new THREE.Mesh(new THREE.ConeGeometry(0.04*S, h*S, 4), bDark);
        ridge.position.set(0, 0.42*S, 0.6*S - i*0.22*S); ridge.castShadow = true; g.add(ridge);
    }
    // Neck
    const neckGrp = new THREE.Group();
    neckGrp.position.set(0, 0.1*S, 0.75*S);
    const neckSegs = [];
    for (let i = 0; i < 4; i++) {
        const t = i / 3; const w = (0.5 - t * 0.15) * S;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(w, w, 0.4*S), i % 2 === 0 ? bTop : bMid);
        seg.position.set(0, t*0.9*S, t*0.7*S); seg.castShadow = true;
        neckGrp.add(seg); neckSegs.push(seg);
    }
    g.add(neckGrp);
    // Head
    const headGrp = new THREE.Group();
    headGrp.position.set(0, 1.0*S, 0.9*S);
    const cranium = new THREE.Mesh(new THREE.BoxGeometry(0.65*S, 0.5*S, 0.65*S), bTop);
    cranium.castShadow = true; headGrp.add(cranium);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.45*S, 0.3*S, 0.5*S), bMid);
    snout.position.set(0, -0.05*S, 0.45*S); headGrp.add(snout);
    // Eyes
    for (let s = -1; s <= 1; s += 2) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12*S, 0.1*S, 0.14*S), dragonEyeMat);
        eye.position.set(s*0.3*S, 0.1*S, 0.28*S); headGrp.add(eye);
        const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.03*S, 0.08*S, 0.06*S), dragonPupilMat);
        pupil.position.set(s*0.04*S, 0, 0.045*S); eye.add(pupil);
    }
    // Horns
    for (let s = -1; s <= 1; s += 2) {
        makeDragonBone([s*0.18*S, 0.25*S, -0.1*S], [s*0.25*S, 0.5*S, -0.25*S], 0.05*S, 0.04*S, bHorn, headGrp);
        makeDragonBone([s*0.25*S, 0.5*S, -0.25*S], [s*0.28*S, 0.7*S, -0.5*S], 0.04*S, 0.015*S, bHorn, headGrp);
    }
    // Jaw
    const jawGrp = new THREE.Group();
    jawGrp.position.set(0, -0.2*S, 0.2*S);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.4*S, 0.12*S, 0.55*S), bMid);
    jaw.position.set(0, 0, 0.1*S); jawGrp.add(jaw);
    headGrp.add(jawGrp); headGrp.scale.setScalar(0.75);
    neckGrp.add(headGrp);
    // Tail
    const tailGrp = new THREE.Group();
    tailGrp.position.set(0, -0.05*S, -1.1*S);
    const tailSegs = [];
    for (let i = 0; i < 10; i++) {
        const t = i / 9; const w = (0.35 - t*0.28)*S;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(w, w, 0.3*S), i % 2 === 0 ? bTop : bMid);
        seg.position.set(0, -t*0.3*S, -i*0.28*S); seg.castShadow = true;
        tailGrp.add(seg); tailSegs.push(seg);
    }
    for (let s = -1; s <= 1; s += 2) {
        const spade = new THREE.Mesh(new THREE.BoxGeometry(0.02*S, 0.2*S, 0.3*S), bDark);
        spade.position.set(s*0.05*S, -0.35*S, -2.6*S); spade.rotation.z = s*0.5;
        spade.castShadow = true; tailGrp.add(spade);
    }
    tailGrp.scale.z = 1.18;
    g.add(tailGrp);
    // Legs
    const legs = [];
    const legCfg = [
        { x: 0.3, z: 0.3, front: true }, { x: -0.3, z: 0.3, front: true },
        { x: 0.3, z: -0.7, front: false }, { x: -0.3, z: -0.7, front: false },
    ];
    for (const cfg of legCfg) {
        const hip = new THREE.Group();
        hip.position.set(cfg.x*S, -0.25*S, cfg.z*S);
        const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.25*S, 0.45*S, 0.25*S), bTop);
        thigh.position.y = -0.2*S; thigh.castShadow = true; hip.add(thigh);
        const shin = new THREE.Mesh(new THREE.BoxGeometry(0.2*S, 0.4*S, 0.2*S), bMid);
        shin.position.set(0, -0.5*S, 0.05*S); shin.castShadow = true; hip.add(shin);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.28*S, 0.08*S, 0.35*S), bDark);
        foot.position.set(0, -0.7*S, 0.1*S); hip.add(foot);
        g.add(hip); legs.push(hip);
    }
    if (isWyvern) { legs[0].visible = false; legs[1].visible = false; }

    // Wings
    const wingsArr = [];
    for (let s = -1; s <= 1; s += 2) {
      if (isWyvern) {
        // ── Wyvern wing-arm ──
        const wg = new THREE.Group();
        wg.position.set(s * 0.3 * S, 0.1 * S, 0.4 * S);
        const uLen = 0.75 * S;
        const upperBone = new THREE.Mesh(new THREE.CylinderGeometry(0.08*S, 0.06*S, uLen, 6), bBone);
        upperBone.rotation.z = s * -Math.PI / 2;
        upperBone.position.set(s * uLen / 2, 0, 0);
        upperBone.castShadow = true; wg.add(upperBone);
        const _patM = makePatagium([s*-0.35*S, 0, -0.1*S], [s*uLen,0,0], 0.9*S, bMem, wg);
        wg._patMesh = _patM;
        wg._patGeo = _patM.geometry; wg._patP0 = [s*-0.35*S, 0, -0.1*S]; wg._patP1 = [s*uLen,0,0]; wg._patMaxW = 0.9*S;
        const elbowGrp = new THREE.Group();
        elbowGrp.position.set(s * uLen, 0, 0); wg.add(elbowGrp);
        elbowGrp.add(new THREE.Mesh(new THREE.SphereGeometry(0.075*S, 6, 4), bBone));
        const fLen = 2.0 * S;
        const foreBone = new THREE.Mesh(new THREE.CylinderGeometry(0.06*S, 0.045*S, fLen, 6), bBone);
        foreBone.rotation.z = s * -Math.PI / 2;
        foreBone.position.set(s * fLen / 2, 0, 0); elbowGrp.add(foreBone);
        const wristKnob = new THREE.Mesh(new THREE.SphereGeometry(0.055*S, 6, 4), bBone);
        wristKnob.position.set(s * fLen, 0, 0); elbowGrp.add(wristKnob);
        const wristClaw = new THREE.Mesh(new THREE.ConeGeometry(0.035*S, 0.12*S, 4), bHorn);
        wristClaw.position.set(s * fLen, -0.07*S, 0); elbowGrp.add(wristClaw);
        const handGrp = new THREE.Group();
        handGrp.position.set(s * fLen, 0, 0); elbowGrp.add(handGrp);
        // 4 finger bones
        const fingerDefs = [
            { tip: [s*-1.71*S, 0, -1.74*S], mid: [s*-0.61*S, 0, -1.23*S] },
            { tip: [s*-0.09*S, 0, -2.41*S], mid: [s*0.32*S, 0, -1.41*S] },
            { tip: [s*0.81*S, 0, -2.27*S], mid: [s*1.1*S, 0, -1.2*S] },
            { tip: [s*2.25*S, 0, -1.45*S], mid: [s*1.27*S, 0, -0.59*S] },
        ];
        const fTips = [], fMids = [];
        const fingerGrps = [];
        for (const fd of fingerDefs) {
            fMids.push(fd.mid); fTips.push(fd.tip);
            const tipLocal = [fd.tip[0]-fd.mid[0], fd.tip[1]-fd.mid[1], fd.tip[2]-fd.mid[2]];
            const baseGrp = new THREE.Group(); handGrp.add(baseGrp);
            makeDragonBone([0,0,0], fd.mid, 0.03*S, 0.02*S, bBone, baseGrp);
            const midGrp = new THREE.Group();
            midGrp.position.set(fd.mid[0], fd.mid[1], fd.mid[2]); baseGrp.add(midGrp);
            makeDragonBone([0,0,0], tipLocal, 0.02*S, 0.008*S, bBone, midGrp);
            fingerGrps.push({ baseGrp, midGrp, midPos: fd.mid, tipLocal });
        }
        const _groundFRots = [{spreadY:-0.56,liftX:0,curlX:0},{spreadY:-0.07,liftX:0,curlX:0},{spreadY:0.24,liftX:0,curlX:0},{spreadY:0.52,liftX:0,curlX:0}];
        const _flyFRots = [{spreadY:0,liftX:0,curlX:0},{spreadY:0,liftX:0,curlX:0},{spreadY:0,liftX:0,curlX:0},{spreadY:0,liftX:0,curlX:0}];
        // Main membrane
        const memOutline = [];
        memOutline.push({ p: fTips[3], s: 2 });
        for (let i = 2; i >= 0; i--) {
            const a = fTips[i+1], b = fTips[i];
            memOutline.push({ p: [(a[0]+b[0])/2, 0, (a[2]+b[2])/2*0.85], s: 2 });
            memOutline.push({ p: b, s: 2 });
        }
        memOutline.push({ p: [s*fLen, 0, -0.5*S], s: 1 });
        memOutline.push({ p: [s*fLen*0.75, 0, -0.45*S], s: 1 });
        memOutline.push({ p: [s*fLen*0.45, 0, -0.7*S], s: 1 });
        memOutline.push({ p: [s*fLen*0.15, 0, -0.85*S], s: 1 });
        memOutline.push({ p: [0, 0, -0.9*S], s: 1 });
        memOutline.push({ p: [s*uLen*0.5, 0, -0.7*S], s: 0 });
        memOutline.push({ p: [s*uLen*0.15, 0, -0.85*S], s: 0 });
        memOutline.push({ p: [0, 0, -0.9*S], s: 0 });
        memOutline.push({ p: [0, 0, 0], s: 0 });
        memOutline.push({ p: [s*uLen*0.5, 0, 0.15*S], s: 0 });
        memOutline.push({ p: [0, 0, 0.15*S], s: 1 });
        memOutline.push({ p: [s*fLen*0.5, 0, 0.1*S], s: 1 });
        memOutline.push({ p: [s*fLen, 0, 0.05*S], s: 1 });
        const memCenter = { p: [s * fLen, 0, 0], s: 1 };
        const nFloats = memOutline.length * 2 * 9;
        const memArr = new Float32Array(nFloats);
        const memGeo = new THREE.BufferGeometry();
        memGeo.setAttribute('position', new THREE.BufferAttribute(memArr, 3));
        const memMesh = new THREE.Mesh(memGeo, bMem);
        memMesh.castShadow = true; memMesh.visible = false; wg.add(memMesh);
        wg._memGeo = memGeo; wg._memOutline = memOutline; wg._memOutlineGround = memOutline; wg._memOutlineFly = memOutline; wg._memCenter = memCenter;
        wg._elbow = elbowGrp; wg._hand = handGrp; wg._s = s;
        wg._fingerGrps = fingerGrps; wg._groundFRots = _groundFRots; wg._flyFRots = _flyFRots;
        // Arm-finger membrane
        const afArr = new Float32Array(300);
        const afGeo = new THREE.BufferGeometry();
        afGeo.setAttribute('position', new THREE.BufferAttribute(afArr, 3));
        const afMesh = new THREE.Mesh(afGeo, bMem); afMesh.castShadow = true; wg.add(afMesh);
        wg._afGeo = afGeo; wg._afFLen = fLen; wg._afBodyPt = [s*-0.35*S, 0, -0.22*S];
        wg._afGroundedBodyPt = [s*-0.05*S, -0.05*S, -0.4*S];
        wg._afStaticTip = fTips[0]; wg._afStaticMid = fMids[0];
        // Inter-finger membranes
        const ffArr = new Float32Array(324);
        const ffGeo = new THREE.BufferGeometry();
        ffGeo.setAttribute('position', new THREE.BufferAttribute(ffArr, 3));
        const ffMesh = new THREE.Mesh(ffGeo, bMem); ffMesh.castShadow = true; wg.add(ffMesh);
        wg._ffGeo = ffGeo; wg._ffStaticTips = fTips; wg._ffStaticMids = fMids;
        applyFingerRots(wg, _groundFRots);
        updateWyvernMembrane(wg);
        wg.scale.setScalar(1.35);
        g.add(wg); wingsArr.push(wg);
      } else {
        // ── Normal dragon wings ──
        const wg = new THREE.Group();
        wg.position.set(s * 0.2 * S, 0.35 * S, 0.4 * S);
        const uLen = 1.1 * S;
        const upperBone = new THREE.Mesh(new THREE.CylinderGeometry(0.08*S, 0.06*S, uLen, 6), bBone);
        upperBone.rotation.z = s * -Math.PI / 2;
        upperBone.position.set(s * uLen / 2, 0, 0);
        upperBone.castShadow = true; wg.add(upperBone);
        const _patM2 = makePatagium([s*-0.35*S, 0, -0.1*S], [s*uLen,0,0], 0.9*S, bMem, wg);
        wg._patMesh = _patM2;
        wg._patGeo = _patM2.geometry; wg._patP0 = [s*-0.35*S, 0, -0.1*S]; wg._patP1 = [s*uLen,0,0]; wg._patMaxW = 0.9*S;
        const elbowGrp = new THREE.Group();
        elbowGrp.position.set(s * uLen, 0, 0); wg.add(elbowGrp);
        elbowGrp.add(new THREE.Mesh(new THREE.SphereGeometry(0.075*S, 6, 4), bBone));
        const fLen = 1.6 * S;
        const foreBone = new THREE.Mesh(new THREE.CylinderGeometry(0.06*S, 0.045*S, fLen, 6), bBone);
        foreBone.rotation.z = s * -Math.PI / 2;
        foreBone.position.set(s * fLen / 2, 0, 0);
        foreBone.castShadow = true; elbowGrp.add(foreBone);
        const wristKnob = new THREE.Mesh(new THREE.SphereGeometry(0.055*S, 6, 4), bBone);
        wristKnob.position.set(s * fLen, 0, 0); wristKnob.castShadow = true; elbowGrp.add(wristKnob);
        const wristClaw = new THREE.Mesh(new THREE.ConeGeometry(0.035*S, 0.12*S, 4), bHorn);
        wristClaw.position.set(s * fLen, -0.07*S, 0); wristClaw.castShadow = true; elbowGrp.add(wristClaw);
        const handGrp = new THREE.Group();
        handGrp.position.set(s * fLen, 0, 0); elbowGrp.add(handGrp);
        const fingerDefs = [
            { tip: [s*-1.8*S, 0, -0.8*S], mid: [s*-0.65*S, 0, -0.2*S] },
            { tip: [s*-0.6*S, 0, -1.5*S], mid: [s*-0.15*S, 0, -0.55*S] },
            { tip: [s*0.65*S, 0, -1.7*S], mid: [s*0.45*S, 0, -0.65*S] },
            { tip: [s*1.6*S, 0, -1.3*S], mid: [s*0.9*S, 0, -0.4*S] },
        ];
        const fTips = [], fMids = [];
        const fingerGrps = [];
        for (const fd of fingerDefs) {
            fMids.push(fd.mid); fTips.push(fd.tip);
            const tipLocal = [fd.tip[0]-fd.mid[0], fd.tip[1]-fd.mid[1], fd.tip[2]-fd.mid[2]];
            const baseGrp = new THREE.Group(); handGrp.add(baseGrp);
            makeDragonBone([0,0,0], fd.mid, 0.03*S, 0.02*S, bBone, baseGrp);
            const midGrp = new THREE.Group();
            midGrp.position.set(fd.mid[0], fd.mid[1], fd.mid[2]); baseGrp.add(midGrp);
            makeDragonBone([0,0,0], tipLocal, 0.02*S, 0.008*S, bBone, midGrp);
            fingerGrps.push({ baseGrp, midGrp, midPos: fd.mid, tipLocal });
        }
        const _groundFRots = [{spreadY:0,liftX:0,curlX:0},{spreadY:0,liftX:0,curlX:0},{spreadY:0,liftX:0,curlX:0},{spreadY:0,liftX:0,curlX:0}];
        const _flyFRots = [{spreadY:0,liftX:0,curlX:0},{spreadY:0,liftX:0,curlX:0},{spreadY:0,liftX:0,curlX:0},{spreadY:0,liftX:0,curlX:0}];
        const memOutline = [
            { p: fTips[3], s: 2 },
            { p: [(fTips[3][0]+fTips[2][0])/2, 0, (fTips[3][2]+fTips[2][2])/2*0.85], s: 2 },
            { p: fTips[2], s: 2 },
            { p: [(fTips[2][0]+fTips[1][0])/2, 0, (fTips[2][2]+fTips[1][2])/2*0.85], s: 2 },
            { p: fTips[1], s: 2 },
            { p: [(fTips[1][0]+fTips[0][0])/2, 0, (fTips[1][2]+fTips[0][2])/2*0.85], s: 2 },
            { p: fTips[0], s: 2 },
            { p: [s*fLen*0.75, 0, -0.45*S], s: 1 },
            { p: [s*fLen*0.45, 0, -0.7*S], s: 1 },
            { p: [s*fLen*0.15, 0, -0.85*S], s: 1 },
            { p: [0, 0, -0.9*S], s: 1 },
            { p: [s*uLen*0.5, 0, -0.7*S], s: 0 },
            { p: [s*uLen*0.15, 0, -0.85*S], s: 0 },
            { p: [0, 0, -0.9*S], s: 0 },
            { p: [0, 0, 0], s: 0 },
            { p: [s*uLen*0.5, 0, 0.15*S], s: 0 },
            { p: [0, 0, 0.15*S], s: 1 },
            { p: [s*fLen*0.5, 0, 0.1*S], s: 1 },
            { p: [s*fLen, 0, 0.05*S], s: 1 },
        ];
        const memCenter = { p: [s * fLen, 0, 0], s: 1 };
        const nFloats = memOutline.length * 2 * 9;
        const memArr = new Float32Array(nFloats);
        const memGeo = new THREE.BufferGeometry();
        memGeo.setAttribute('position', new THREE.BufferAttribute(memArr, 3));
        const memMesh = new THREE.Mesh(memGeo, bMem);
        memMesh.castShadow = true; memMesh.visible = false; wg.add(memMesh);
        wg._memGeo = memGeo; wg._memOutline = memOutline; wg._memOutlineGround = memOutline; wg._memOutlineFly = memOutline; wg._memCenter = memCenter;
        wg._elbow = elbowGrp; wg._hand = handGrp; wg._s = s;
        wg._fingerGrps = fingerGrps; wg._groundFRots = _groundFRots; wg._flyFRots = _flyFRots;
        // Arm-finger + inter-finger membranes
        const afArr = new Float32Array(300);
        const afGeo = new THREE.BufferGeometry();
        afGeo.setAttribute('position', new THREE.BufferAttribute(afArr, 3));
        const afMesh = new THREE.Mesh(afGeo, bMem); afMesh.castShadow = true; wg.add(afMesh);
        wg._afGeo = afGeo; wg._afFLen = fLen; wg._afBodyPt = [s*-0.35*S, 0, -0.22*S];
        wg._afGroundedBodyPt = [s*-0.05*S, -0.05*S, -0.4*S];
        wg._afStaticTip = fTips[0]; wg._afStaticMid = fMids[0];
        const ffArr = new Float32Array(324);
        const ffGeo = new THREE.BufferGeometry();
        ffGeo.setAttribute('position', new THREE.BufferAttribute(ffArr, 3));
        const ffMesh = new THREE.Mesh(ffGeo, bMem); ffMesh.castShadow = true; wg.add(ffMesh);
        wg._ffGeo = ffGeo; wg._ffStaticTips = fTips; wg._ffStaticMids = fMids;
        updateWyvernMembrane(wg);
        wg.scale.setScalar(1.15);
        g.add(wg); wingsArr.push(wg);
      }
    }

    g.scale.setScalar(babyScale);
    const footOffset = 0.95 * S * babyScale;
    g.position.set(x, terrainY + footOffset, z);
    g.rotation.order = 'YXZ';
    g.rotation.y = Math.random() * Math.PI * 2;

    return {
        group: g, legs, headGrp, neckGrp, neckSegs, tailGrp, tailSegs, jawGrp, wings: wingsArr,
        chest, midBody, x, z,
        angle: g.rotation.y, speed: 0,
        walkPhase: Math.random() * Math.PI * 2,
        wanderTimer: 0, walking: true,
        state: 'alive', type: 'babyDragon',
        eggColor, wingColor: wingColor || null,
        isWyvern: !!isWyvern,
        followDist: 2.5, footOffset,
        dragonName: '', age: 0, growthScale: babyScale,
        hp: getDragonMaxHP(0), maxHP: getDragonMaxHP(0),
        _tilt: 0, flying: false, flyHeight: 0, flightStamina: 100,
        staying: false, lastHitTime: 999,
    };
}


// ── Dragon Manager ──
export { makeBabyDragon, computeFlap, applyFingerRots, updateWyvernMembrane };

// Fire breath particle system — shared across all dragons
const FIRE_PARTICLE_MAX = 200;
function _initFireParticles(scene) {
    const geo = new THREE.SphereGeometry(0.15, 6, 5);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 });
    const mesh = new THREE.InstancedMesh(geo, mat, FIRE_PARTICLE_MAX);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FIRE_PARTICLE_MAX * 3), 3);
    mesh.count = 0;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return {
        mesh,
        px: new Float32Array(FIRE_PARTICLE_MAX),
        py: new Float32Array(FIRE_PARTICLE_MAX),
        pz: new Float32Array(FIRE_PARTICLE_MAX),
        vx: new Float32Array(FIRE_PARTICLE_MAX),
        vy: new Float32Array(FIRE_PARTICLE_MAX),
        vz: new Float32Array(FIRE_PARTICLE_MAX),
        age: new Float32Array(FIRE_PARTICLE_MAX),
        life: new Float32Array(FIRE_PARTICLE_MAX),
        size: new Float32Array(FIRE_PARTICLE_MAX),
        active: new Uint8Array(FIRE_PARTICLE_MAX),
        count: 0,
    };
}

export class DragonManager {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.eggs = [];
        this.dragons = [];
        this._fireParticles = _initFireParticles(scene);
        this.heldEgg = null; // egg data currently held (from inventory)
        this.ridingDragon = null;
        this.ridingRef = null;
        this.altarX = -505;
        this.altarZ = -335;
        this._built = false;
        this.carriedEggGrp = null;
        this.carriedEggMat = null;
        this.carriedVeinMat = null;
        // Inventory integration — set by index.html
        this.addToInventory = null;
        this.removeFromInventory = null;
        this.getHeldItem = null; // () => { type, egg } or null
    }

    buildCarriedEgg(playerSpine) {
        // Carried egg visual — attached to player spine, hidden until carrying
        this.carriedEggMat = new THREE.MeshStandardMaterial({ color: 0x882222, roughness: 0.3, metalness: 0.2, emissive: 0x441111, emissiveIntensity: 0.1 });
        this.carriedVeinMat = new THREE.MeshStandardMaterial({ color: 0xcc4422, emissive: 0xcc4422, emissiveIntensity: 0.15, roughness: 0.2 });
        this.carriedEggGrp = new THREE.Group();
        const eggMesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), this.carriedEggMat);
        eggMesh.scale.set(1.0, 1.3, 1.0);
        eggMesh.castShadow = true;
        this.carriedEggGrp.add(eggMesh);
        for (let vi = 0; vi < 4; vi++) {
            const va = (vi / 4) * Math.PI * 2;
            const vein = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.35, 4), this.carriedVeinMat);
            vein.position.set(Math.cos(va) * 0.19, 0, Math.sin(va) * 0.19);
            vein.rotation.z = (Math.random() - 0.5) * 0.4;
            this.carriedEggGrp.add(vein);
        }
        this.carriedEggGrp.position.set(0, 0.35, 0.35);
        this.carriedEggGrp.visible = false;
        playerSpine.add(this.carriedEggGrp);
    }

    build(getHeight) {
        if (this._built) return;
        this._built = true;
        this.getHeight = getHeight;

        // ── Stone circle + altar near eggs ──
        const ax = this.altarX, az = this.altarZ;
        const ay = getHeight(ax, az);
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a7a72, roughness: 0.95 });
        const mossMat = new THREE.MeshStandardMaterial({ color: 0x5a6a52, roughness: 0.95 });
        // Standing stones
        for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            const r = 5;
            const px = ax + Math.cos(a) * r, pz = az + Math.sin(a) * r;
            const py = getHeight(px, pz);
            const h = 2.5 + Math.random() * 1.5;
            const w = 0.4 + Math.random() * 0.2;
            const stone = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.7), Math.random() > 0.35 ? stoneMat : mossMat);
            stone.position.set(px, py + h / 2, pz);
            stone.rotation.y = Math.random() * Math.PI;
            stone.castShadow = true;
            this.scene.add(stone);
        }
        // Altar slab
        const altarBase = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 1.6), stoneMat);
        altarBase.position.set(ax, ay + 0.15, az); altarBase.castShadow = true; this.scene.add(altarBase);
        const altarTop = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.15, 1.2), mossMat);
        altarTop.position.set(ax, ay + 0.38, az); altarTop.castShadow = true; this.scene.add(altarTop);

        // ── Eggs — exact colours from game.html ──
        const eggDefs = [
            // Wyverns
            { dx: -3, dz: 2, color: 0x882222, emissive: 0x441111, veinColor: 0xcc4422, glowColor: 0xff4422, isWyvern: true, name: 'Dark Red Wyvern' },
            { dx: 4, dz: -1, color: 0x443388, emissive: 0x221155, veinColor: 0x7744cc, glowColor: 0x7744ff, isWyvern: true, name: 'Purple Wyvern' },
            { dx: -2, dz: -4, color: 0x228844, emissive: 0x114422, veinColor: 0x22cc66, glowColor: 0x22ff66, isWyvern: true, name: 'Emerald Wyvern' },
            { dx: 5, dz: 3, color: 0x4488cc, emissive: 0x224466, veinColor: 0xccaa33, glowColor: 0x44aaff, wingColor: 0xccaa33, isWyvern: true, name: 'Steel Blue Wyvern' },
            { dx: -5, dz: -1, color: 0x886622, emissive: 0x443311, veinColor: 0xcc8822, glowColor: 0xffaa22, isWyvern: true, name: 'Amber Wyvern' },
            { dx: 3, dz: 4, color: 0x2255aa, emissive: 0x112a55, veinColor: 0xff8833, glowColor: 0x4488ff, wingColor: 0xff8833, isWyvern: true, name: 'Royal Blue Wyvern' },
            { dx: 2, dz: 5, color: 0x1a1a1a, emissive: 0x110505, veinColor: 0xaa2222, glowColor: 0xff2222, wingColor: 0xaa2020, isWyvern: true, name: 'Shadow Wyvern' },
            { dx: -4, dz: 4, color: 0xb0d4e8, emissive: 0x5a7a8a, veinColor: 0xd4aa40, glowColor: 0xb0d4ff, wingColor: 0xd4aa40, isWyvern: true, name: 'Ice & Gold Wyvern' },
            { dx: 6, dz: -3, color: 0xaa2222, emissive: 0x551111, veinColor: 0xff4422, glowColor: 0xff4422, isWyvern: true, name: 'Crimson Wyvern' },
            { dx: -6, dz: -3, color: 0xe8e0f0, emissive: 0x6a5aa0, veinColor: 0xaa66ff, glowColor: 0xcc88ff, wingColor: 0x9955ee, isWyvern: true, name: 'Lavender Wyvern' },
            { dx: 3, dz: -5, color: 0x080808, emissive: 0x1a0800, veinColor: 0xffaa22, glowColor: 0xffcc44, wingColor: 0xdd6600, isWyvern: true, name: 'Obsidian Wyvern' },
            { dx: -3, dz: -6, color: 0x227744, emissive: 0x113a22, veinColor: 0x33cc66, glowColor: 0x33ff77, wingColor: 0x33cc66, isWyvern: true, name: 'Forest Wyvern' },
        ];
        const eggGeo = new THREE.SphereGeometry(0.22, 12, 10);
        const nestRockGeo = new THREE.DodecahedronGeometry(0.2, 0);
        const nestRockMat = new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.95 });
        const veinGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.5, 4);

        for (const ed of eggDefs) {
            const ex = ax + ed.dx, ez = az + ed.dz;
            const ey = getHeight(ex, ez);
            const eggGrp = new THREE.Group();
            // Nest rocks
            for (let ni = 0; ni < 8; ni++) {
                const na = (ni / 8) * Math.PI * 2;
                const nrs = 0.15 + Math.random() * 0.15;
                const nr = new THREE.Mesh(nestRockGeo, nestRockMat);
                nr.scale.setScalar(nrs / 0.2);
                nr.position.set(Math.cos(na) * 0.6, nrs * 0.4, Math.sin(na) * 0.6);
                nr.rotation.set(Math.random(), Math.random(), Math.random());
                eggGrp.add(nr);
            }
            // Egg mesh
            const eggMat = new THREE.MeshStandardMaterial({ color: ed.color, roughness: 0.3, metalness: 0.2, emissive: ed.emissive, emissiveIntensity: 0.1 });
            const eggMesh = new THREE.Mesh(eggGeo, eggMat);
            eggMesh.scale.set(1.0, 1.35, 1.0);
            eggMesh.position.y = 0.3;
            eggGrp.add(eggMesh);
            // Veins
            const veinMat = new THREE.MeshStandardMaterial({ color: ed.veinColor, emissive: ed.veinColor, emissiveIntensity: 0.15, roughness: 0.2 });
            for (let vi = 0; vi < 5; vi++) {
                const va = (vi / 5) * Math.PI * 2;
                const vein = new THREE.Mesh(veinGeo, veinMat);
                vein.position.set(Math.cos(va) * 0.18, 0.3, Math.sin(va) * 0.18);
                vein.rotation.z = (Math.random() - 0.5) * 0.4;
                eggGrp.add(vein);
            }
            // No glow light — removed for performance

            eggGrp.position.set(ex, ey, ez);
            this.scene.add(eggGrp);
            this.eggs.push({
                group: eggGrp, x: ex, z: ez, pickedUp: false,
                color: ed.color, emissive: ed.emissive, veinColor: ed.veinColor,
                wingColor: ed.wingColor || null,
                isWyvern: !!ed.isWyvern, name: ed.name || 'Dragon',
            });
        }
    }

    // Called each frame
    update(dt, player, keys) {
        const px = player.position.x, pz = player.position.z, py = player.position.y;
        // Update fire particles every frame
        this._updateFireParticles(dt);

        // ── L key: age up nearest dragon by 2 mins ──
        if (keys['KeyL'] && !this._lDown) {
            this._lDown = true;
            let nearest = null, nearDist = Infinity;
            for (const bd of this.dragons) {
                if (bd.state !== 'alive') continue;
                const dx = px - bd.x, dz = pz - bd.z;
                const d = dx * dx + dz * dz;
                if (d < nearDist) { nearDist = d; nearest = bd; }
            }
            if (nearest) nearest.age += 120; // 2 minutes
        }
        if (!keys['KeyL']) this._lDown = false;

        // ── Update carried egg visual ──
        const held = this.getHeldItem ? this.getHeldItem() : null;
        this._holdingEgg = false;
        if (held && held.type === 'egg' && this.carriedEggGrp) {
            this.carriedEggGrp.visible = true;
            this.carriedEggMat.color.setHex(held.egg.color);
            this.carriedEggMat.emissive.setHex(held.egg.emissive);
            this.carriedVeinMat.color.setHex(held.egg.veinColor);
            this.carriedVeinMat.emissive.setHex(held.egg.veinColor);
            this.heldEgg = held.egg;
            this._holdingEgg = true;
        } else {
            if (this.carriedEggGrp) this.carriedEggGrp.visible = false;
            this.heldEgg = null;
        }

        // ── E key actions ──
        if (keys['KeyE'] && !this._eDown) {
            this._eDown = true;
            if (this.ridingDragon) {
                // Dismount — reset player pose
                this.ridingDragon = false;
                const bd = this.ridingRef;
                if (bd && bd.flying) { bd.flying = false; bd.flyHeight = 0; }
                this.ridingRef = null;
                player.leftLeg.hip.rotation.z = 0;
                player.rightLeg.hip.rotation.z = 0;
                player.spine.rotation.x = 0;
                player.headGroup.rotation.x = 0;
                player.body.rotation.x = 0;
                player.group.rotation.x = 0;
                player.group.rotation.order = 'XYZ';
            } else if (this.heldEgg) {
                // Check if near altar or campfire — hatch!
                let canHatch = false;
                const adx = px - this.altarX, adz = pz - this.altarZ;
                if (adx * adx + adz * adz < 16) canHatch = true;
                // Check for nearby campfire blocks
                if (!canHatch && this._world) {
                    const BS = 1.9 / 4; // BLOCK_SIZE
                    const yOff = 128;
                    for (let dx = -3; dx <= 3 && !canHatch; dx++) {
                        for (let dz = -3; dz <= 3 && !canHatch; dz++) {
                            const bx = Math.floor(px / BS) + dx;
                            const by = Math.floor(py / BS) + yOff;
                            const bz = Math.floor(pz / BS) + dz;
                            for (let dy = -2; dy <= 1; dy++) {
                                if (this._world.getBlockAt(bx, by + dy, bz) === 26) { canHatch = true; break; }
                            }
                        }
                    }
                }
                if (canHatch) {
                    // Limit: max 3 player-owned dragons
                    const ownedCount = this.dragons.filter(d => !d._fortressGuardian && !d._stationary && d.state === 'alive').length;
                    if (ownedCount >= 3) {
                        // Can't hatch more
                        if (typeof window !== 'undefined' && window.addChatMessage) {
                            window.addChatMessage('You already have 3 dragons. They cannot all coexist.', 'rgba(255,150,100,0.9)');
                        }
                    } else {
                        const egg = this.heldEgg;
                        if (this.removeFromInventory) this.removeFromInventory('egg_' + egg._idx);
                        const hy = this.getHeight(px, pz);
                        const bd = makeBabyDragon(px, pz, hy, egg.color, egg.wingColor, egg.isWyvern);
                        this.scene.add(bd.group);
                        this.dragons.push(bd);
                        bd.dragonName = egg.name;
                        this.heldEgg = null;
                    }
                }
            } else {
                // Check for nearby egg to pick up → add to inventory
                let pickedEgg = false;
                for (let i = 0; i < this.eggs.length; i++) {
                    const egg = this.eggs[i];
                    if (egg.pickedUp) continue;
                    const edx = px - egg.x, edz = pz - egg.z;
                    if (edx * edx + edz * edz < 4) {
                        egg.pickedUp = true;
                        egg.group.visible = false;
                        egg._idx = i;
                        if (this.addToInventory) this.addToInventory('egg_' + i, egg);
                        pickedEgg = true;
                        break;
                    }
                }
                // Check for nearby dragon to ride
                if (!pickedEgg) {
                    for (const bd of this.dragons) {
                        if (bd.state !== 'alive' || bd.age < 1150) continue;
                        const ddx = px - bd.x, ddz = pz - bd.z;
                        if (ddx * ddx + ddz * ddz < 6 * bd.growthScale + 4) {
                            this.ridingDragon = true;
                            this.ridingRef = bd;
                            break;
                        }
                    }
                }
            }
        }
        if (!keys['KeyE']) this._eDown = false;

        // ── Update all dragons ──
        for (let bi = this.dragons.length - 1; bi >= 0; bi--) {
            const bd = this.dragons[bi];
            if (bd.state === 'dead') {
                this.scene.remove(bd.group);
                this.dragons.splice(bi, 1);
                continue;
            }
            if (bd.state !== 'alive') continue;
            // Stationary or fortress dragons skip growth + follow AI entirely
            if (bd._stationary || bd._fortressGuardian) {
                this._animateDragon(dt, bd);
                continue;
            }

            // HP regen — 1% per sec
            if (bd.hp < bd.maxHP) bd.hp = Math.min(bd.maxHP, bd.hp + bd.maxHP * 0.01 * dt);

            // Death check
            if (bd.hp <= 0) {
                bd.state = 'dead';
                if (this.ridingRef === bd) {
                    this.ridingDragon = false;
                    this.ridingRef = null;
                }
                continue;
            }

            // Growth
            bd.age += dt;
            let gs;
            if (bd.age < 1200) gs = 0.04 + (bd.age / 1200) * (0.25 - 0.04);
            else if (bd.age < 2400) gs = 0.25 + ((bd.age - 1200) / 1200) * (0.50 - 0.25);
            else if (bd.age < 3600) gs = 0.50 + ((bd.age - 2400) / 1200) * (1.0 - 0.50);
            else if (bd.age < 7200) gs = 1.0 + ((bd.age - 3600) / 3600) * (2.0 - 1.0);
            else gs = 2.0;
            bd.growthScale = gs;
            bd.group.scale.setScalar(gs);
            bd.footOffset = 0.95 * 2.55 * gs;
            bd.followDist = 2.5 + gs * 3;
            // Update max HP as dragon grows
            const newMaxHP = getDragonMaxHP(bd.age);
            if (newMaxHP > bd.maxHP) {
                bd.hp += (newMaxHP - bd.maxHP); // grow with new HP
                bd.maxHP = newMaxHP;
            }

            // ── Riding ──
            if (this.ridingDragon && this.ridingRef === bd) {
                this._updateRiding(dt, bd, player, keys);
                continue;
            }

            // ── Shoulder dragon (baby on player's shoulder) ──
            if (bd._onShoulder) {
                // Position on player's shoulder
                bd.x = player.position.x;
                bd.z = player.position.z;
                const sy = player.position.y + 1.5;
                bd.group.position.set(bd.x, sy, bd.z);
                bd.group.rotation.y = player.group.rotation.y;
                // Scale down further for shoulder
                bd.group.scale.setScalar(gs * 0.7);
                continue;
            }

            // Default to following the player
            if (bd._followingPlayer === undefined) bd._followingPlayer = true;

            // ── Combat AI — find nearby hostile creature to fight ──
            // Fire damage scales with age: 0.5 at baby, 1 at teen, 2 at adult, 3 at elder
            let dragonFireDmg = 0.5;
            if (bd.age >= 1200) dragonFireDmg = 1;
            if (bd.age >= 2400) dragonFireDmg = 2;
            if (bd.age >= 3600) dragonFireDmg = 3;

            let target = null, targetDist = 25;
            if (this._creatureMgr) {
                for (const c of this._creatureMgr.creatures) {
                    if (c.dead || !c.hostile || c._tamed) continue;
                    if (c.type === 'babyDragon' || c.type === 'dragon') continue;
                    if (c._isBoss && (c._isColossus || c._isEmberLord || c._isNecromancer || c._isSWNecromancer)) continue;
                    const cdx = c.x - bd.x, cdz = c.z - bd.z;
                    const cd = Math.sqrt(cdx*cdx + cdz*cdz);
                    if (cd < targetDist) {
                        // Only engage if target is close to player too
                        const pdx = c.x - px, pdz = c.z - pz;
                        if (pdx*pdx + pdz*pdz < 30 * 30) {
                            targetDist = cd;
                            target = c;
                        }
                    }
                }
            }

            bd._fireBreathTimer = (bd._fireBreathTimer || 0) - dt;

            if (target) {
                // Chase target
                const tdx = target.x - bd.x, tdz = target.z - bd.z;
                bd.angle = Math.atan2(tdx, tdz);
                bd.group.rotation.y = bd.angle;
                const desiredDist = 4;
                if (targetDist > desiredDist) {
                    const cspd = Math.min(targetDist * 1.5, 6 + gs * 4) * dt;
                    bd.x += Math.sin(bd.angle) * cspd;
                    bd.z += Math.cos(bd.angle) * cspd;
                    bd.walking = true;
                } else {
                    bd.walking = false;
                }
                // Breathe fire if close enough — emit particles toward target
                if (targetDist < 12) {
                    const headOff = 1.5 * gs;
                    const mx = bd.x + Math.sin(bd.angle) * headOff;
                    const my = bd.group.position.y + 1.2 * gs;
                    const mz = bd.z + Math.cos(bd.angle) * headOff;
                    // Direction toward target
                    const tdy = (target.group.position.y || 0) - my;
                    const tdx = target.x - mx;
                    const tdz = target.z - mz;
                    this._emitFire(mx, my, mz, tdx, tdy, tdz, 2);
                    if (bd._fireBreathTimer <= 0) {
                        bd._fireBreathTimer = 0.33;
                        target.hp -= dragonFireDmg;
                        if (target.hp <= 0) { target.hp = 0; target.dead = true; target.deathTimer = 0; target.walking = false; target.speed = 0; }
                    }
                }
                const tY = this.getHeight(bd.x, bd.z);
                bd.group.position.set(bd.x, tY + bd.footOffset, bd.z);
                this._animateDragon(dt, bd);
                continue;
            }

            // ── Follow player AI ──
            const bdx = px - bd.x, bdz = pz - bd.z;
            const bDist = Math.sqrt(bdx * bdx + bdz * bdz);

            // Only follow if flag is set
            if (!bd._followingPlayer) {
                bd.walking = false;
                const tY = this.getHeight(bd.x, bd.z);
                bd.group.position.set(bd.x, tY + bd.footOffset, bd.z);
                this._animateDragon(dt, bd);
                continue;
            }

            // Teleport if too far
            if (bDist > 50) {
                bd.x = px - Math.sin(player.group.rotation.y) * 3;
                bd.z = pz - Math.cos(player.group.rotation.y) * 3;
            }

            const maxSpd = 8 + gs * 6;
            if (bDist > bd.followDist) {
                const targetAngle = Math.atan2(bdx, bdz);
                let da = targetAngle - bd.angle;
                while (da > Math.PI) da -= Math.PI * 2;
                while (da < -Math.PI) da += Math.PI * 2;
                bd.angle += da * Math.min(dt * 5, 1);
                bd.group.rotation.y = bd.angle;
                const spd = Math.min(bDist * 1.5, maxSpd) * dt;
                bd.x += Math.sin(bd.angle) * spd;
                bd.z += Math.cos(bd.angle) * spd;
                bd.walking = true;
            } else {
                bd.walking = false;
            }

            const bTerrainY = this.getHeight(bd.x, bd.z);
            bd.group.position.set(bd.x, bTerrainY + bd.footOffset, bd.z);

            // ── Animation ──
            this._animateDragon(dt, bd);
        }
    }

    _updateRiding(dt, bd, player, keys) {
        const gs = bd.growthScale;
        const flySpeed = 25 + gs * 15;
        const walkSpeed = 6 + gs * 4;
        const turnRate = 2.5;

        // F key — breathe fire as projectile particles
        bd._fireBreathTimer = (bd._fireBreathTimer || 0) - dt;
        if (keys['KeyF']) {
            bd._breathingFire = true;
            // Mouth/head position
            const headOffset = 1.5 * bd.growthScale;
            const mx = bd.x + Math.sin(bd.angle) * headOffset;
            const my = bd.group.position.y + 1.2 * bd.growthScale;
            const mz = bd.z + Math.cos(bd.angle) * headOffset;
            // Direction: where the player is looking
            const lookYaw = player.group.rotation.y;
            const lookPitch = (player._lookPitch !== undefined) ? player._lookPitch : 0;
            const dx = Math.sin(lookYaw) * Math.cos(lookPitch);
            const dy = -Math.sin(lookPitch);
            const dz = Math.cos(lookYaw) * Math.cos(lookPitch);
            // Emit particles
            this._emitFire(mx, my, mz, dx, dy, dz, 3);
            // Damage creatures in cone — every 0.33s for 3 dmg/sec
            if (bd._fireBreathTimer <= 0) {
                bd._fireBreathTimer = 0.33;
                this._damageInFireCone(mx, my, mz, dx, dy, dz, 1);
            }
        } else {
            bd._breathingFire = false;
        }

        if (keys['KeyA'] || keys['ArrowLeft']) bd.angle += turnRate * dt;
        if (keys['KeyD'] || keys['ArrowRight']) bd.angle -= turnRate * dt;
        let wantDir = 0;
        if (keys['KeyW'] || keys['ArrowUp']) wantDir = 1;
        if (keys['KeyS'] || keys['ArrowDown']) wantDir = -1;

        const canFly = bd.age >= 1550;
        const speed = bd.flying ? flySpeed : walkSpeed;

        // Flight controls
        let ascending = false, descending = false;
        if (canFly) {
            if (keys['Space'] && !bd.flying) {
                bd.flying = true;
                bd.flyHeight = bd.group.position.y + 2;
            }
            if (bd.flying) {
                if (keys['Space']) { bd.flyHeight += 12 * dt; ascending = true; }
                if (keys['ShiftLeft']) { bd.flyHeight -= 8 * dt; descending = true; }
                const terrY = this.getHeight(bd.x, bd.z) + bd.footOffset;
                if (bd.flyHeight < terrY + 0.5) {
                    bd.flyHeight = terrY + 0.5;
                    if (keys['ShiftLeft']) { bd.flying = false; bd.flyHeight = 0; }
                }
                const maxH = 80 + gs * 160;
                if (bd.flyHeight > maxH) bd.flyHeight = maxH;
            }
        }

        // Movement
        if (wantDir !== 0) {
            const spd = speed * wantDir * dt;
            bd.x += Math.sin(bd.angle) * spd;
            bd.z += Math.cos(bd.angle) * spd;
        }
        bd.group.rotation.y = bd.angle;

        // Dragon pitch tilt when ascending/descending (exact from game.html)
        if (bd.flying) {
            let dPitch = 0;
            if (ascending) dPitch = -0.35;
            else if (descending) dPitch = 0.35;
            else if (wantDir > 0) dPitch = 0.12;
            else if (wantDir === 0) dPitch = -0.2; // tilt back when hovering
            if (!bd._flyTilt) bd._flyTilt = 0;
            bd._flyTilt += (dPitch - bd._flyTilt) * 3 * dt;
            bd.group.rotation.x = bd._flyTilt;
            bd.group.position.set(bd.x, bd.flyHeight, bd.z);
        } else {
            bd.group.rotation.x = 0;
            const terrY = this.getHeight(bd.x, bd.z);
            bd.group.position.set(bd.x, terrY + bd.footOffset, bd.z);
        }

        // Player sits on dragon's back — compute seat position in dragon's local space
        // then transform to world space so player tilts/moves with the dragon
        const S = 2.55;
        const seatLocalY = 0.28 * S; // on top of chest (y=0 is body center)
        const seatLocalZ = 0.2 * S;  // slightly forward (chest is at z=0.2*S)

        // Get seat world position from dragon's group matrix
        bd.group.updateMatrixWorld(true);
        const _seatPos = new THREE.Vector3(0, seatLocalY, seatLocalZ);
        _seatPos.applyMatrix4(bd.group.matrixWorld);

        player.position.set(_seatPos.x, _seatPos.y, _seatPos.z);
        player.group.position.copy(player.position);
        player.group.rotation.order = 'YXZ'; // Y first (facing), then X (pitch)
        player.group.rotation.y = bd.angle;
        const tilt = bd._flyTilt || 0;
        player.group.rotation.x = tilt;
        player.speed = 0;
        player.jumpVel = 0;

        // ── Player riding pose (exact from game.html) ──
        player.leftLeg.hip.rotation.set(-1.5, 0, -0.2);
        player.rightLeg.hip.rotation.set(-1.5, 0, 0.2);
        player.leftLeg.knee.rotation.x = 0.15;
        player.rightLeg.knee.rotation.x = 0.15;
        player.leftArm.shoulder.rotation.set(-0.5, 0, 0.3);
        player.rightArm.shoulder.rotation.set(-0.5, 0, -0.3);
        player.leftArm.elbow.rotation.x = -0.8;
        player.rightArm.elbow.rotation.x = -0.8;
        player.spine.rotation.x = 0.15;
        player.headGroup.rotation.x = -0.1;
        player.body.position.y = player.hipHeight;
        // Reset body sub-rotations that walk animation might have set
        player.body.rotation.x = 0;
        player.spine.rotation.y = 0;
        player.spine.rotation.z = 0;

        bd.walking = wantDir !== 0;
        this._animateDragon(dt, bd);
    }

    _animateDragon(dt, bd) {
        const gs = bd.growthScale;
        if (bd.flying) {
            bd.walkPhase += dt * 12;
            bd._flapT = (bd._flapT || 0) + dt;
            for (const w of bd.wings) {
                const si = w._s;
                const [sFlap, eFlap] = computeFlap(bd._flapT);
                w.rotation.set(0, 0, 0);
                w.rotation.y = si * 0.15;
                w.rotation.z = si * (-0.1 + sFlap * 0.4);
                w.rotation.x = sFlap * 0.08;
                w._elbow.rotation.set(0, si * -0.25, si * (-0.15 + eFlap * 0.45));
                w._hand.rotation.set(0, 0, 0);
                if (w._memOutlineFly) w._memOutline = w._memOutlineFly;
                applyFingerRots(w, w._flyFRots);
                // Flying: show patagium, restore afMesh body point
                if (w._patMesh) w._patMesh.visible = true;
                if (w._afOrigBodyPt) w._afBodyPt = w._afOrigBodyPt;
                updateWyvernMembrane(w);
            }
            for (const leg of bd.legs) leg.rotation.x = 0.6;
            for (let ti = 0; ti < bd.tailSegs.length; ti++) {
                bd.tailSegs[ti].rotation.y = Math.sin(bd.walkPhase * 0.5 + ti * 0.35) * 0.07;
            }
            bd.headGrp.rotation.x = -0.08;
            if (bd.neckGrp) bd.neckGrp.rotation.x = 0.15;
        } else {
            bd.walkPhase += dt * (bd.walking ? 3 : 0.5);
            if (bd.walking) {
                const phase = bd.walkPhase;
                if (!bd.isWyvern) {
                    bd.legs[0].rotation.x = Math.sin(phase) * 0.4;
                    bd.legs[1].rotation.x = Math.sin(phase + Math.PI) * 0.4;
                }
                bd.legs[2].rotation.x = Math.sin(phase + Math.PI) * 0.35;
                bd.legs[3].rotation.x = Math.sin(phase) * 0.35;
            } else {
                for (const leg of bd.legs) leg.rotation.x *= 0.9;
            }
            for (let wi = 0; wi < bd.wings.length; wi++) {
                const w = bd.wings[wi];
                const si = w._s;
                const wp = bd.walking ? bd.walkPhase : 0;
                const wb = bd.walking ? 1 : 0;
                if (bd.isWyvern) {
                    const walkOff = wi === 0 ? Math.PI : 0; // alternate wing-arms
                    const wc = Math.sin(wp + walkOff);
                    // -0.5 rad (~30° the other way) rotation on Y axis
                    const outward = si * -0.5;
                    if (wb) {
                        w.rotation.set(wc*0.5, si*(0.54-wc*0.4) + outward, si*(0.5-wc*0.25));
                        w._elbow.rotation.set(1.41-Math.max(0,wc)*0.4, si*-1.85, si*0.74);
                        w._hand.rotation.set(-0.2, si*1.25, si*-0.48);
                    } else {
                        w.rotation.set(0, si*0.54 + outward, si*0.5);
                        w._elbow.rotation.set(1.41, si*-1.85, si*0.74);
                        w._hand.rotation.set(-0.2, si*1.25, si*-0.48);
                    }
                } else {
                    w.rotation.set(0, 0, 0);
                    w.rotation.y = si * 0.6;
                    w.rotation.z = si * -0.45;
                    w.rotation.x = Math.sin(wp * 0.6) * 0.03 * wb;
                    w._elbow.rotation.set(0, 0, 0);
                    w._elbow.rotation.y = si * -0.6;
                    w._elbow.rotation.z = si * -0.3;
                    w._hand.rotation.set(0.5, si * 0.4, 0);
                }
                if (w._memOutlineGround) w._memOutline = w._memOutlineGround;
                applyFingerRots(w, w._groundFRots);
                // Grounded: hide patagium, move afMesh body point to patagium's body point
                if (w._patMesh) w._patMesh.visible = false;
                if (w._afBodyPt && w._afGroundedBodyPt) {
                    if (!w._afOrigBodyPt) w._afOrigBodyPt = w._afBodyPt.slice();
                    w._afBodyPt = w._afGroundedBodyPt;
                }
                updateWyvernMembrane(w);
            }
            for (let ti = 0; ti < bd.tailSegs.length; ti++) {
                bd.tailSegs[ti].rotation.y = Math.sin(bd.walkPhase * 1.5 + ti * 0.4) * 0.15;
            }
            bd.headGrp.rotation.x = Math.sin(bd.walkPhase * 0.8) * 0.1;
        }
    }

    // Apply egg carry pose overlay on player (call after player.update)
    applyPlayerPose(player) {
        if (this._holdingEgg && !this.ridingDragon) {
            // Egg carry pose — both arms cradling egg (exact from game.html)
            player.leftArm.shoulder.rotation.x = -0.7;
            player.leftArm.shoulder.rotation.z = 0.5;
            player.leftArm.elbow.rotation.x = -1.4;
            player.rightArm.shoulder.rotation.x = -0.7;
            player.rightArm.shoulder.rotation.z = -0.5;
            player.rightArm.elbow.rotation.x = -1.4;
            player.spine.rotation.x += 0.04;
        }
    }

    _makeDragon(x, z, terrainY, eggColor, wingColor, isWyvern) {
        return makeBabyDragon(x, z, terrainY, eggColor, wingColor, isWyvern);
    }

    // Emit fire particles from a position in a direction
    _emitFire(ox, oy, oz, dx, dy, dz, count) {
        const fp = this._fireParticles;
        const _len = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
        dx /= _len; dy /= _len; dz /= _len;
        for (let i = 0; i < count; i++) {
            // Find an inactive slot
            let slot = -1;
            for (let s = 0; s < FIRE_PARTICLE_MAX; s++) {
                if (!fp.active[s]) { slot = s; break; }
            }
            if (slot < 0) return;
            fp.active[slot] = 1;
            fp.px[slot] = ox + (Math.random() - 0.5) * 0.3;
            fp.py[slot] = oy + (Math.random() - 0.5) * 0.3;
            fp.pz[slot] = oz + (Math.random() - 0.5) * 0.3;
            const speed = 18 + Math.random() * 6;
            const spread = 0.15;
            fp.vx[slot] = dx * speed + (Math.random() - 0.5) * spread * speed;
            fp.vy[slot] = dy * speed + (Math.random() - 0.5) * spread * speed;
            fp.vz[slot] = dz * speed + (Math.random() - 0.5) * spread * speed;
            fp.age[slot] = 0;
            fp.life[slot] = 0.7 + Math.random() * 0.4;
            fp.size[slot] = 0.6 + Math.random() * 0.5;
        }
    }

    _updateFireParticles(dt) {
        const fp = this._fireParticles;
        const _m = new THREE.Matrix4();
        const _c = new THREE.Color();
        let active = 0;
        for (let i = 0; i < FIRE_PARTICLE_MAX; i++) {
            if (!fp.active[i]) continue;
            fp.age[i] += dt;
            if (fp.age[i] >= fp.life[i]) {
                fp.active[i] = 0;
                continue;
            }
            // Move
            fp.px[i] += fp.vx[i] * dt;
            fp.py[i] += fp.vy[i] * dt;
            fp.pz[i] += fp.vz[i] * dt;
            // Slow down
            fp.vx[i] *= 0.96;
            fp.vy[i] *= 0.96;
            fp.vz[i] *= 0.96;
            // Slight upward drift
            fp.vy[i] += 4 * dt;
            // Compute color (yellow → orange → red → smoke)
            const t = fp.age[i] / fp.life[i];
            let r, g, b;
            if (t < 0.3) { r = 1.0; g = 0.85 - t * 0.5; b = 0.1; }
            else if (t < 0.7) { r = 1.0; g = 0.4 - (t - 0.3) * 0.6; b = 0.05; }
            else { const u = (t - 0.7) / 0.3; r = 0.5 - u * 0.3; g = 0.15 - u * 0.1; b = 0.1 - u * 0.05; }
            _c.setRGB(r, g, b);
            // Scale shrinks slightly with age
            const sc = fp.size[i] * (1 - t * 0.3);
            _m.makeScale(sc, sc, sc);
            _m.setPosition(fp.px[i], fp.py[i], fp.pz[i]);
            fp.mesh.setMatrixAt(active, _m);
            fp.mesh.setColorAt(active, _c);
            active++;
        }
        fp.mesh.count = active;
        if (active > 0) {
            fp.mesh.instanceMatrix.needsUpdate = true;
            if (fp.mesh.instanceColor) fp.mesh.instanceColor.needsUpdate = true;
        }
    }

    // Damage creatures in a cone in front of a position
    _damageInFireCone(ox, oy, oz, dx, dy, dz, dmgPerTick) {
        if (!this._creatureMgr) return;
        const _l = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
        dx /= _l; dy /= _l; dz /= _l;
        for (const c of this._creatureMgr.creatures) {
            if (c.dead) continue;
            if (c._isBoss && (c._isColossus || c._isEmberLord || c._isNecromancer || c._isSWNecromancer)) continue;
            if (c.type === 'dragon' || c.type === 'babyDragon') continue;
            const cdx = c.x - ox, cdy = (c.group.position.y || 0) - oy, cdz = c.z - oz;
            const cd = Math.sqrt(cdx*cdx + cdy*cdy + cdz*cdz);
            if (cd > 12 || cd < 0.1) continue;
            const dot = (cdx * dx + cdy * dy + cdz * dz) / cd;
            if (dot < 0.7) continue;
            c.hp -= dmgPerTick;
            if (c.hp <= 0) { c.hp = 0; c.dead = true; c.deathTimer = 0; c.walking = false; c.speed = 0; }
        }
    }

    // Damage a dragon — respects weapon tier (only steel+ from players)
    damageDragon(bd, amount, source) {
        if (!bd || bd.state !== 'alive' || bd._fortressGuardian || bd._stationary) return false;
        if (source === 'player_weapon') {
            // Check held weapon tier — only steel/dragonsteel hurts dragons
            const tier = (typeof window !== 'undefined' && window._playerWeaponTier) || 'wood';
            if (tier !== 'steel' && tier !== 'diamond' && tier !== 'dragonsteel') return false;
        }
        bd.hp = Math.max(0, bd.hp - amount);
        return true;
    }

    // Find the dragon the player is looking at (raycast-style — closest in front, within range)
    getLookedAtDragon(player) {
        const px = player.position.x, pz = player.position.z;
        const fwdX = Math.sin(player.group.rotation.y);
        const fwdZ = Math.cos(player.group.rotation.y);
        let best = null, bestDot = 0.85;
        for (const bd of this.dragons) {
            if (bd.state !== 'alive' || bd._fortressGuardian || bd._stationary) continue;
            const dx = bd.x - px, dz = bd.z - pz;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > 12 || dist < 0.1) continue;
            const dot = (dx * fwdX + dz * fwdZ) / dist;
            if (dot > bestDot) { bestDot = dot; best = bd; }
        }
        return best;
    }

    toggleFollow(bd) {
        if (!bd) return;
        if (bd._followingPlayer === undefined) bd._followingPlayer = true;
        bd._followingPlayer = !bd._followingPlayer;
        return bd._followingPlayer;
    }

    putOnShoulder(bd) {
        if (!bd) return false;
        // Only baby dragons (age < 1200)
        if (bd.age >= 1200) return false;
        bd._onShoulder = true;
        bd._followingPlayer = false;
        return true;
    }

    takeOffShoulder(bd) {
        if (!bd || !bd._onShoulder) return false;
        bd._onShoulder = false;
        bd._followingPlayer = true;
        bd.group.scale.setScalar(bd.growthScale);
        return true;
    }

    getShoulderDragon() {
        for (const bd of this.dragons) if (bd._onShoulder) return bd;
        return null;
    }

    getPrompt(player) {
        const px = player.position.x, py = player.position.y, pz = player.position.z;
        if (this.ridingDragon) return 'Press E to dismount' + (this.ridingRef && this.ridingRef.age >= 1550 ? ' | Space/Shift = fly up/down' : '');
        if (this.heldEgg) {
            const adx = px - this.altarX, adz = pz - this.altarZ;
            let nearHatchSite = adx*adx + adz*adz < 16;
            if (!nearHatchSite && this._world) {
                const BS = 1.9 / 4;
                const yOff = 128;
                for (let dx = -3; dx <= 3 && !nearHatchSite; dx++)
                    for (let dz = -3; dz <= 3 && !nearHatchSite; dz++) {
                        const bx = Math.floor(px / BS) + dx, by = Math.floor(py / BS) + yOff, bz = Math.floor(pz / BS) + dz;
                        for (let dy = -2; dy <= 1; dy++) if (this._world.getBlockAt(bx, by+dy, bz) === 26) { nearHatchSite = true; break; }
                    }
            }
            return nearHatchSite ? 'Press E to hatch egg' : 'Bring egg to campfire or altar';
        }
        for (const egg of this.eggs) {
            if (egg.pickedUp) continue;
            const dx = px - egg.x, dz = pz - egg.z;
            if (dx*dx + dz*dz < 4) return 'Press E to pick up dragon egg';
        }
        for (const bd of this.dragons) {
            if (bd.state !== 'alive' || bd.age < 1150 || bd._unrideable) continue;
            const dx = px - bd.x, dz = pz - bd.z;
            if (dx*dx + dz*dz < 6 * bd.growthScale + 4) return 'Press E to ride ' + bd.dragonName;
        }
        return null;
    }
}

