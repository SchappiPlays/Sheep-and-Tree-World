// dragons.js — Full dragon system ported from game.html
// Includes: dragon/wyvern mesh, dynamic membrane wings, eggs, stone circle, hatching, growth, follow AI, riding, flight

import { BLOCK_SIZE } from './world.js';

const _wmv = new THREE.Vector3();
const _afv = new THREE.Vector3();
const _afInvMat = new THREE.Matrix4();

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

// Two-tone spike: skinMat on bottom ~22%, boneMat on top ~78%. Group with base at y=0, tip pointing up.
function gradientSpike(r, h, segs, skinMat, boneMat) {
    const grp = new THREE.Group();
    const splitFrac = 0.22;
    const baseH = h * splitFrac;
    const tipH = h * (1 - splitFrac);
    const splitR = r * (1 - splitFrac * 0.45);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(splitR, r, baseH, segs), skinMat);
    base.position.y = baseH * 0.5;
    grp.add(base);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(splitR, tipH, segs), boneMat);
    tip.position.y = baseH + tipH * 0.5;
    grp.add(tip);
    return grp;
}

function makeDragonBone(p1, p2, r1, r2, mat, parent) {
    const dx = p2[0]-p1[0], dy = p2[1]-p1[1], dz = p2[2]-p1[2];
    const len = Math.sqrt(dx*dx+dy*dy+dz*dz);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, 6), mat);
    b.position.set((p1[0]+p2[0])/2,(p1[1]+p2[1])/2,(p1[2]+p2[2])/2);
    const dir = new THREE.Vector3(dx,dy,dz).normalize();
    b.setRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), dir));
    // Small bones (horns/tusks/fingers) skip shadow casting — adds tons of draw calls and
    // the shadow contribution from thin cylinders is barely visible anyway.
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
        for (const t of [0.15, 0.35, 0.5, 0.6, 0.8, 1.0]) outline.push(ffPt(mA, tA, t));
        const cpx = (tA[0]+tB[0])*0.35, cpy = (tA[1]+tB[1])*0.35, cpz = (tA[2]+tB[2])*0.35;
        for (const t of [0.15, 0.35, 0.5, 0.65, 0.85]) {
            const u = 1-t;
            outline.push([u*u*tA[0]+2*u*t*cpx+t*t*tB[0], u*u*tA[1]+2*u*t*cpy+t*t*tB[1], u*u*tA[2]+2*u*t*cpz+t*t*tB[2]]);
        }
        for (const t of [1.0, 0.8, 0.6, 0.5, 0.35, 0.15]) outline.push(ffPt(mB, tB, t));
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
    if (age < 4800) return 40 + (age / 4800) * 20;
    if (age < 9600) return 60 + ((age - 4800) / 4800) * 40;
    if (age < 14400) return 100 + ((age - 9600) / 4800) * 50;
    if (age < 28800) return 150 + ((age - 14400) / 14400) * 50;
    return 200;
}


// ── makeBabyDragon — exact mesh from game.html ──
function makeBabyDragon(x, z, terrainY, eggColor, wingColor, isWyvern, isLightning, isIce, hasTusks) {
    const S = 2.55;
    const babyScale = 0.04;
    const g = new THREE.Group();

    const baseHue = new THREE.Color(eggColor);
    const midHue = baseHue.clone().multiplyScalar(1.15);
    midHue.r = Math.min(midHue.r, 1); midHue.g = Math.min(midHue.g, 1); midHue.b = Math.min(midHue.b, 1);
    const darker = baseHue.clone().multiplyScalar(0.55);
    const wingBoneColor = baseHue.clone().multiplyScalar(0.8);
    const bellyColor = baseHue.clone().lerp(new THREE.Color(0xc4a032), 0.7);
    const memColor = wingColor ? new THREE.Color(wingColor) : darker;
    // Accent color for horns, spikes, and wrist claws — varies by dragon type.
    // Fire wyverns: ~half roll the ivory accent. Tusked dragons always use ivory bone.
    const ivoryRoll = ((eggColor * 0x9E3779B1) >>> 0) / 0xFFFFFFFF;
    const fireUsesIvory = !!isWyvern && !hasTusks && ivoryRoll < 0.5;
    let accentHex;
    if (isLightning) accentHex = 0x2C2C2B;
    else if (isIce) accentHex = 0x9FB9D4;
    else accentHex = 0xE8DCC8; // bone/ivory — all normal dragons get bone-colored horns
    const accentColor = new THREE.Color(accentHex);
    // Gradient horns/spikes: base matches skin, tip is ivory bone
    const useBoneGrad = (accentHex === 0xE8DCC8);

    const bTop = new THREE.MeshStandardMaterial({ color: baseHue, roughness: 0.55, metalness: 0.2 });
    const bMid = new THREE.MeshStandardMaterial({ color: midHue, roughness: 0.5, metalness: 0.18 });
    const bDark = new THREE.MeshStandardMaterial({ color: darker, roughness: 0.45, metalness: 0.25 });
    const bBelly = new THREE.MeshStandardMaterial({ color: bellyColor, roughness: 0.65 });
    const bHorn = new THREE.MeshStandardMaterial({
        color: accentColor,
        roughness: isIce ? 0.15 : 0.35,
        metalness: isIce ? 0.1 : 0.4,
        transparent: !!isIce,
        opacity: isIce ? 0.9 : 1.0,
    });
    const bSpike = new THREE.MeshStandardMaterial({
        color: accentColor,
        roughness: isIce ? 0.15 : 0.4,
        metalness: isIce ? 0.1 : 0.3,
        transparent: !!isIce,
        opacity: isIce ? 0.9 : 1.0,
    });
    // Wing bones blend with body tone so they don't read as separate hardware
    const bBone = new THREE.MeshStandardMaterial({ color: wingBoneColor, roughness: 0.55, metalness: 0.15 });
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
        let ridge;
        if (useBoneGrad) {
            ridge = gradientSpike(0.04*S, h*S, 4, bTop, bSpike);
            ridge.position.set(0, 0.42*S - h*S*0.5, 0.6*S - i*0.22*S);
        } else {
            ridge = new THREE.Mesh(new THREE.ConeGeometry(0.04*S, h*S, 4), bSpike);
            ridge.position.set(0, 0.42*S, 0.6*S - i*0.22*S);
        }
        ridge.castShadow = true; g.add(ridge);
    }
    // Neck — chained groups so rotations propagate (allowing real bend)
    const neckGrp = new THREE.Group();
    neckGrp.position.set(0, 0.1*S, 0.75*S);
    const neckSegs = [];
    let neckParent = neckGrp;
    for (let i = 0; i < 4; i++) {
        const t = i / 3; const w = (0.5 - t * 0.15) * S;
        const segGrp = new THREE.Group();
        if (i > 0) segGrp.position.set(0, 0.3*S, 0.233*S);
        const seg = new THREE.Mesh(new THREE.BoxGeometry(w, w, 0.4*S), i % 2 === 0 ? bTop : bMid);
        seg.castShadow = true;
        segGrp.add(seg);
        neckParent.add(segGrp);
        neckSegs.push(segGrp);
        neckParent = segGrp;
    }
    g.add(neckGrp);
    // Head — child of last neck segment so neck bend carries the head
    const headGrp = new THREE.Group();
    headGrp.position.set(0, 0.1*S, 0.2*S);
    const cranium = new THREE.Mesh(new THREE.BoxGeometry(0.65*S, 0.5*S, 0.65*S), bTop);
    cranium.castShadow = true; headGrp.add(cranium);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.45*S, 0.3*S, 0.5*S), bMid);
    snout.position.set(0, -0.05*S, 0.45*S); headGrp.add(snout);
    // Eyes
    const eyes = [];
    for (let s = -1; s <= 1; s += 2) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12*S, 0.1*S, 0.14*S), dragonEyeMat);
        eye.position.set(s*0.3*S, 0.1*S, 0.28*S); headGrp.add(eye);
        const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.03*S, 0.08*S, 0.06*S), dragonPupilMat);
        pupil.position.set(s*0.04*S, 0, 0.045*S); eye.add(pupil);
        eyes.push(eye);
    }
    // Horns — taper from wide base to pointy tip at top
    if (isLightning) {
        // 3 pairs of backward-sweeping horns
        for (let s = -1; s <= 1; s += 2) {
            // Top pair — upper rear
            makeDragonBone([s*0.15*S, 0.28*S, -0.1*S], [s*0.17*S, 0.32*S, -0.45*S], 0.05*S, 0.06*S, bHorn, headGrp);
            makeDragonBone([s*0.17*S, 0.32*S, -0.45*S], [s*0.19*S, 0.34*S, -0.8*S], 0.02*S, 0.05*S, bHorn, headGrp);
            // Middle pair — outer side
            makeDragonBone([s*0.28*S, 0.15*S, -0.1*S], [s*0.34*S, 0.16*S, -0.45*S], 0.05*S, 0.06*S, bHorn, headGrp);
            makeDragonBone([s*0.34*S, 0.16*S, -0.45*S], [s*0.38*S, 0.16*S, -0.82*S], 0.02*S, 0.05*S, bHorn, headGrp);
            // Bottom pair — lower rear
            makeDragonBone([s*0.22*S, 0.0*S, -0.1*S], [s*0.26*S, -0.04*S, -0.45*S], 0.05*S, 0.06*S, bHorn, headGrp);
            makeDragonBone([s*0.26*S, -0.04*S, -0.45*S], [s*0.3*S, -0.08*S, -0.8*S], 0.02*S, 0.05*S, bHorn, headGrp);
        }
    } else {
        for (let s = -1; s <= 1; s += 2) {
            if (useBoneGrad) {
                // Skin only on the bottom ~25% of the horn (midpoint of first segment)
                const pHMid = [s*0.215*S, 0.375*S, -0.175*S];
                makeDragonBone([s*0.18*S, 0.25*S, -0.1*S], pHMid, 0.045*S, 0.05*S, bTop, headGrp);
                makeDragonBone(pHMid, [s*0.25*S, 0.5*S, -0.25*S], 0.04*S, 0.045*S, bHorn, headGrp);
            } else {
                makeDragonBone([s*0.18*S, 0.25*S, -0.1*S], [s*0.25*S, 0.5*S, -0.25*S], 0.04*S, 0.05*S, bHorn, headGrp);
            }
            makeDragonBone([s*0.25*S, 0.5*S, -0.25*S], [s*0.28*S, 0.7*S, -0.5*S], 0.015*S, 0.04*S, bHorn, headGrp);
        }
        // Some ice dragons grow an extra crown of icicle-like spikes across the head
        const iceCrownRoll = ((eggColor * 0x85EBCA77) >>> 0) / 0xFFFFFFFF;
        if (isIce && iceCrownRoll < 0.5) {
            // Icicles along the top and sides of the cranium, varied lengths, slight lean
            const spikes = [
                [ 0.00,  0.34, -0.28, 0.45, 0.0],
                [ 0.00,  0.36, -0.05, 0.55, 0.0],
                [ 0.08,  0.34,  0.05, 0.40, 0.1],
                [-0.08,  0.34,  0.05, 0.40,-0.1],
                [ 0.14,  0.30, -0.10, 0.35, 0.25],
                [-0.14,  0.30, -0.10, 0.35,-0.25],
                [ 0.22,  0.20, -0.05, 0.30, 0.45],
                [-0.22,  0.20, -0.05, 0.30,-0.45],
                [ 0.05,  0.35,  0.20, 0.30, 0.0],
                [-0.05,  0.35,  0.20, 0.30, 0.0],
                [ 0.15,  0.28,  0.12, 0.28, 0.15],
                [-0.15,  0.28,  0.12, 0.28,-0.15],
            ];
            for (const sp of spikes) {
                const [x, y, z, len, lean] = sp;
                const ico = new THREE.Mesh(
                    new THREE.ConeGeometry(0.04*S, len*S, 5),
                    bHorn
                );
                ico.position.set(x*S, y*S + len*S*0.5, z*S);
                ico.rotation.z = lean;
                headGrp.add(ico);
            }
        }
    }
    // Curved tusks — sweep down and forward from the cheek, chained segments form the arc
    if (hasTusks) {
        for (let s = -1; s <= 1; s += 2) {
            // Arc points: start behind jaw line, curve down-and-forward past the snout
            const p0 = [s*0.30*S, -0.02*S, 0.14*S];
            const p1 = [s*0.34*S, -0.08*S, 0.42*S];
            const p2 = [s*0.32*S, -0.15*S, 0.72*S];
            const p3 = [s*0.24*S, -0.20*S, 1.00*S];
            const p4 = [s*0.12*S, -0.22*S, 1.22*S];
            // Only the root segment (~25% of arc) uses skin colour, rest tapers to bone
            const tuskRootMat = useBoneGrad ? bTop : bHorn;
            makeDragonBone(p0, p1, 0.085*S, 0.100*S, tuskRootMat, headGrp);
            makeDragonBone(p1, p2, 0.065*S, 0.085*S, bHorn, headGrp);
            makeDragonBone(p2, p3, 0.040*S, 0.065*S, bHorn, headGrp);
            makeDragonBone(p3, p4, 0.015*S, 0.040*S, bHorn, headGrp);
        }
    }
    // Jaw
    const jawGrp = new THREE.Group();
    jawGrp.position.set(0, -0.2*S, 0.2*S);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.4*S, 0.12*S, 0.55*S), bMid);
    jaw.position.set(0, 0, 0.1*S); jawGrp.add(jaw);
    headGrp.add(jawGrp); headGrp.scale.setScalar(0.75);
    neckSegs[neckSegs.length - 1].add(headGrp);
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
        const upperBone = new THREE.Mesh(new THREE.CylinderGeometry(0.06*S, 0.08*S, uLen, 6), bBone);
        upperBone.rotation.z = s * -Math.PI / 2;
        upperBone.position.set(s * uLen / 2, 0, 0);
        upperBone.castShadow = true; wg.add(upperBone);
        const _patM = makePatagium([s*-0.35*S, 0, -0.1*S], [s*uLen,0,0], 0.9*S, bMem, wg);
        wg._patMesh = _patM;
        wg._patGeo = _patM.geometry; wg._patP0 = [s*-0.35*S, 0, -0.1*S]; wg._patP1 = [s*uLen,0,0]; wg._patMaxW = 0.9*S;
        const elbowGrp = new THREE.Group();
        elbowGrp.position.set(s * uLen, 0, 0); wg.add(elbowGrp);
        elbowGrp.add(new THREE.Mesh(new THREE.SphereGeometry(0.075*S, 6, 4), bBone));
        const fLen = 1.5 * S;
        const foreBone = new THREE.Mesh(new THREE.CylinderGeometry(0.045*S, 0.06*S, fLen, 6), bBone);
        foreBone.rotation.z = s * -Math.PI / 2;
        foreBone.position.set(s * fLen / 2, 0, 0); elbowGrp.add(foreBone);
        const wristKnob = new THREE.Mesh(new THREE.SphereGeometry(0.055*S, 6, 4), bBone);
        wristKnob.position.set(s * fLen, 0, 0); elbowGrp.add(wristKnob);
        const wristClaw = new THREE.Mesh(new THREE.ConeGeometry(0.035*S, 0.12*S, 4), bHorn);
        wristClaw.rotation.x = Math.PI; // flip so tip points downward
        wristClaw.position.set(s * fLen, -0.07*S, 0); elbowGrp.add(wristClaw);
        const handGrp = new THREE.Group();
        handGrp.position.set(s * fLen, 0, 0); elbowGrp.add(handGrp);
        // 4 finger bones — consistent 35° bend, finger 3 shorter + closer to finger 2
        const fingerDefs = [
            { tip: [s*-1.63*S, 0, -1.77*S], mid: [s*-0.6*S, 0, -1.21*S] },
            { tip: [s*-0.12*S, 0, -2.78*S], mid: [s*0.36*S, 0, -1.62*S] },
            { tip: [s*1.15*S, 0, -2.59*S], mid: [s*1.12*S, 0, -1.51*S] },
            { tip: [s*2.21*S, 0, -1.98*S], mid: [s*1.46*S, 0, -0.68*S] },
        ];
        const fTips = [], fMids = [];
        const fingerGrps = [];
        for (const fd of fingerDefs) {
            fMids.push(fd.mid); fTips.push(fd.tip);
            const tipLocal = [fd.tip[0]-fd.mid[0], fd.tip[1]-fd.mid[1], fd.tip[2]-fd.mid[2]];
            const baseGrp = new THREE.Group(); handGrp.add(baseGrp);
            makeDragonBone([0,0,0], fd.mid, 0.02*S, 0.03*S, bBone, baseGrp);
            const midGrp = new THREE.Group();
            midGrp.position.set(fd.mid[0], fd.mid[1], fd.mid[2]); baseGrp.add(midGrp);
            makeDragonBone([0,0,0], tipLocal, 0.008*S, 0.02*S, bBone, midGrp);
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
        memMesh.visible = false; wg.add(memMesh);
        wg._memGeo = memGeo; wg._memOutline = memOutline; wg._memOutlineGround = memOutline; wg._memOutlineFly = memOutline; wg._memCenter = memCenter;
        wg._elbow = elbowGrp; wg._hand = handGrp; wg._s = s;
        wg._fingerGrps = fingerGrps; wg._groundFRots = _groundFRots; wg._flyFRots = _flyFRots;
        // Arm-finger membrane
        const afArr = new Float32Array(300);
        const afGeo = new THREE.BufferGeometry();
        afGeo.setAttribute('position', new THREE.BufferAttribute(afArr, 3));
        const afMesh = new THREE.Mesh(afGeo, bMem);   wg.add(afMesh);
        wg._afGeo = afGeo; wg._afFLen = fLen; wg._afBodyPt = [s*-0.35*S, 0, -0.22*S];
        wg._afGroundedBodyPt = [s*-0.05*S, -0.05*S, -1.5*S];
        wg._afStaticTip = fTips[0]; wg._afStaticMid = fMids[0];
        // Inter-finger membranes
        const ffArr = new Float32Array(432);
        const ffGeo = new THREE.BufferGeometry();
        ffGeo.setAttribute('position', new THREE.BufferAttribute(ffArr, 3));
        const ffMesh = new THREE.Mesh(ffGeo, bMem);   wg.add(ffMesh);
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
        const upperBone = new THREE.Mesh(new THREE.CylinderGeometry(0.06*S, 0.08*S, uLen, 6), bBone);
        upperBone.rotation.z = s * -Math.PI / 2;
        upperBone.position.set(s * uLen / 2, 0, 0);
        upperBone.castShadow = true; wg.add(upperBone);
        const _patM2 = makePatagium([s*-0.35*S, 0, -0.1*S], [s*uLen,0,0], 0.9*S, bMem, wg);
        wg._patMesh = _patM2;
        wg._patGeo = _patM2.geometry; wg._patP0 = [s*-0.35*S, 0, -0.1*S]; wg._patP1 = [s*uLen,0,0]; wg._patMaxW = 0.9*S;
        const elbowGrp = new THREE.Group();
        elbowGrp.position.set(s * uLen, 0, 0); wg.add(elbowGrp);
        elbowGrp.add(new THREE.Mesh(new THREE.SphereGeometry(0.075*S, 6, 4), bBone));
        const fLen = 1.2 * S;
        const foreBone = new THREE.Mesh(new THREE.CylinderGeometry(0.045*S, 0.06*S, fLen, 6), bBone);
        foreBone.rotation.z = s * -Math.PI / 2;
        foreBone.position.set(s * fLen / 2, 0, 0);
        foreBone.castShadow = true; elbowGrp.add(foreBone);
        const wristKnob = new THREE.Mesh(new THREE.SphereGeometry(0.055*S, 6, 4), bBone);
        wristKnob.position.set(s * fLen, 0, 0); wristKnob.castShadow = true; elbowGrp.add(wristKnob);
        const wristClaw = new THREE.Mesh(new THREE.ConeGeometry(0.035*S, 0.12*S, 4), bHorn);
        wristClaw.rotation.x = Math.PI; // flip so tip points downward
        wristClaw.position.set(s * fLen, -0.07*S, 0); wristClaw.castShadow = true; elbowGrp.add(wristClaw);
        const handGrp = new THREE.Group();
        handGrp.position.set(s * fLen, 0, 0); elbowGrp.add(handGrp);
        // Consistent 20° bend, finger 3 shorter + closer to finger 2
        const fingerDefs = [
            { tip: [s*-2.22*S, 0, -0.16*S], mid: [s*-0.74*S, 0, -0.23*S] },
            { tip: [s*-0.89*S, 0, -1.61*S], mid: [s*-0.18*S, 0, -0.63*S] },
            { tip: [s*0.52*S, 0, -1.85*S], mid: [s*0.40*S, 0, -0.80*S] },
            { tip: [s*1.98*S, 0, -1.36*S], mid: [s*1.04*S, 0, -0.46*S] },
        ];
        const fTips = [], fMids = [];
        const fingerGrps = [];
        for (const fd of fingerDefs) {
            fMids.push(fd.mid); fTips.push(fd.tip);
            const tipLocal = [fd.tip[0]-fd.mid[0], fd.tip[1]-fd.mid[1], fd.tip[2]-fd.mid[2]];
            const baseGrp = new THREE.Group(); handGrp.add(baseGrp);
            makeDragonBone([0,0,0], fd.mid, 0.02*S, 0.03*S, bBone, baseGrp);
            const midGrp = new THREE.Group();
            midGrp.position.set(fd.mid[0], fd.mid[1], fd.mid[2]); baseGrp.add(midGrp);
            makeDragonBone([0,0,0], tipLocal, 0.008*S, 0.02*S, bBone, midGrp);
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
        memMesh.visible = false; wg.add(memMesh);
        wg._memGeo = memGeo; wg._memOutline = memOutline; wg._memOutlineGround = memOutline; wg._memOutlineFly = memOutline; wg._memCenter = memCenter;
        wg._elbow = elbowGrp; wg._hand = handGrp; wg._s = s;
        wg._fingerGrps = fingerGrps; wg._groundFRots = _groundFRots; wg._flyFRots = _flyFRots;
        // Arm-finger + inter-finger membranes
        const afArr = new Float32Array(300);
        const afGeo = new THREE.BufferGeometry();
        afGeo.setAttribute('position', new THREE.BufferAttribute(afArr, 3));
        const afMesh = new THREE.Mesh(afGeo, bMem);   wg.add(afMesh);
        wg._afGeo = afGeo; wg._afFLen = fLen; wg._afBodyPt = [s*-0.35*S, 0, -0.22*S];
        wg._afGroundedBodyPt = [s*-0.05*S, -0.05*S, -1.5*S];
        wg._afStaticTip = fTips[0]; wg._afStaticMid = fMids[0];
        const ffArr = new Float32Array(432);
        const ffGeo = new THREE.BufferGeometry();
        ffGeo.setAttribute('position', new THREE.BufferAttribute(ffArr, 3));
        const ffMesh = new THREE.Mesh(ffGeo, bMem);   wg.add(ffMesh);
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
        group: g, legs, headGrp, neckGrp, neckSegs, tailGrp, tailSegs, jawGrp, wings: wingsArr, eyes,
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

// Lightning bolt system — jagged polylines used by lightning dragons
const LIGHTNING_BOLT_MAX = 80;
const LIGHTNING_BOLT_SEGS = 14; // 14 points = 13 segments
function _initLightningBolts(scene) {
    const bolts = [];
    for (let i = 0; i < LIGHTNING_BOLT_MAX; i++) {
        const positions = new Float32Array(LIGHTNING_BOLT_SEGS * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.LineBasicMaterial({
            color: 0xddf4ff,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            linewidth: 4,
        });
        const line = new THREE.Line(geo, mat);
        line.frustumCulled = false;
        line.visible = false;
        scene.add(line);
        bolts.push({ line, positions, active: false, age: 0, life: 0.1 });
    }
    return bolts;
}

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
        damping: new Float32Array(FIRE_PARTICLE_MAX),
        gravity: new Float32Array(FIRE_PARTICLE_MAX),
        iceMode: new Uint8Array(FIRE_PARTICLE_MAX),
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
        this._lightningBolts = _initLightningBolts(scene);
        this.heldEgg = null; // egg data currently held (from inventory)
        this.ridingDragon = null;
        this.ridingRef = null;
        this.altarX = -1010;
        this.altarZ = -670;
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

    // ── Multiplayer sync helpers ──
    setMyPid(pid) { this._myPid = pid; }

    // Remove "world" dragons so the host's sync can take over (called when joining as client)
    removeWorldDragons() {
        for (let i = this.dragons.length - 1; i >= 0; i--) {
            const bd = this.dragons[i];
            if (bd._fortressGuardian || bd._stationary || bd._iceDragon || bd._lightningDragon) {
                this.scene.remove(bd.group);
                this.dragons.splice(i, 1);
            }
        }
    }

    // Remove all phantom dragons owned by a peer (call when peer disconnects)
    removeDragonsForPeer(pid) {
        if (!this._remoteDragons) return;
        for (const [id, bd] of this._remoteDragons) {
            if (bd._ownerPid === pid) {
                this.scene.remove(bd.group);
                this._remoteDragons.delete(id);
            }
        }
    }

    // Serialize this peer's owned dragons for broadcast
    serializeDragonsForSync() {
        const myPid = this._myPid || 'local';
        const list = [];
        for (const bd of this.dragons) {
            if (bd.state !== 'alive') continue;
            if (bd._isRemote) continue; // never broadcast phantoms
            if (bd._fortressGuardian || bd._stationary || bd._iceDragon || bd._lightningDragon) continue; // world dragons exist locally for everyone
            if (!bd._ownerPid) bd._ownerPid = myPid; // claim unowned dragons
            if (bd._ownerPid !== myPid) continue;
            if (!bd._mpId) {
                this._nextMpId = (this._nextMpId || 0) + 1;
                bd._mpId = myPid + ':' + this._nextMpId;
            }
            list.push({
                id: bd._mpId,
                ow: bd._ownerPid,
                x: +bd.x.toFixed(2), z: +bd.z.toFixed(2),
                y: +bd.group.position.y.toFixed(2),
                ry: +bd.angle.toFixed(3),
                rx: +(bd.group.rotation.x || 0).toFixed(3),
                gs: +bd.growthScale.toFixed(3),
                ag: +(bd.age || 0).toFixed(0),
                wp: +bd.walkPhase.toFixed(2),
                ec: bd.eggColor, wc: bd.wingColor || 0,
                wy: bd.isWyvern ? 1 : 0,
                fl: bd.flying ? 1 : 0,
                wk: bd.walking ? 1 : 0,
                bf: bd._breathingFire ? 1 : 0,
                ib: bd._iceBreath ? 1 : 0,
                il: bd._lightningBreath ? 1 : 0,
                ic: bd._iceDragon ? 1 : 0,
                fy: bd._fireDirYaw !== undefined ? +bd._fireDirYaw.toFixed(2) : 999,
                fp: bd._fireDirPitch !== undefined ? +bd._fireDirPitch.toFixed(2) : 0,
                nm: bd.dragonName || '',
            });
        }
        return list;
    }

    // Receive a peer's dragon list and update phantom dragons (per-peer despawn)
    applyDragonSync(list, fromPid) {
        if (!this._remoteDragons) this._remoteDragons = new Map();
        const myPid = this._myPid;
        const seen = new Set();
        for (const d of list) {
            // Skip echoes of our own dragons
            if (d.ow === myPid) continue;
            seen.add(d.id);
            let bd = this._remoteDragons.get(d.id);
            if (!bd) {
                const hy = this.getHeight ? this.getHeight(d.x, d.z) : 0;
                bd = makeBabyDragon(d.x, d.z, hy, d.ec, d.wc || null, !!d.wy);
                bd._mpId = d.id;
                bd._ownerPid = d.ow;
                bd._isRemote = true;
                bd.dragonName = d.nm || '';
                bd.x = d.x; bd.z = d.z;
                bd.angle = d.ry;
                bd.group.position.set(d.x, d.y, d.z);
                bd.group.rotation.y = d.ry;
                bd.group.rotation.x = d.rx;
                bd.growthScale = d.gs;
                bd.group.scale.setScalar(d.gs);
                bd.footOffset = 0.95 * 2.55 * d.gs;
                bd._tgtX = d.x; bd._tgtY = d.y; bd._tgtZ = d.z;
                bd._tgtRY = d.ry; bd._tgtRX = d.rx; bd._tgtGS = d.gs;
                this.scene.add(bd.group);
                this._remoteDragons.set(d.id, bd);
            }
            // Update lerp targets
            bd._tgtX = d.x; bd._tgtY = d.y; bd._tgtZ = d.z;
            bd._tgtRY = d.ry; bd._tgtRX = d.rx;
            bd._tgtGS = d.gs;
            bd.age = d.ag;
            bd.walking = !!d.wk;
            bd.flying = !!d.fl;
            bd._breathingFire = !!d.bf;
            bd._iceBreath = !!d.ib;
            bd._lightningBreath = !!d.il;
            if (d.fy !== 999) {
                bd._fireDirYaw = d.fy;
                bd._fireDirPitch = d.fp;
            }
        }
        // Despawn dragons of this peer that weren't in this latest sync
        if (fromPid) {
            for (const [id, bd] of this._remoteDragons) {
                if (bd._ownerPid === fromPid && !seen.has(id)) {
                    this.scene.remove(bd.group);
                    this._remoteDragons.delete(id);
                }
            }
        }
    }

    // Animate phantom dragons each frame: smooth lerp + wing/walk animation
    updateRemoteDragons(dt) {
        if (!this._remoteDragons) return;
        const lerp = Math.min(1, 12 * dt);
        for (const bd of this._remoteDragons.values()) {
            if (bd._tgtX === undefined) continue;
            // Lerp position
            bd.x += (bd._tgtX - bd.x) * lerp;
            bd.z += (bd._tgtZ - bd.z) * lerp;
            const py = bd.group.position.y;
            bd.group.position.set(bd.x, py + (bd._tgtY - py) * lerp, bd.z);
            // Lerp yaw (shortest path)
            let dy = bd._tgtRY - bd.angle;
            while (dy > Math.PI) dy -= Math.PI * 2;
            while (dy < -Math.PI) dy += Math.PI * 2;
            bd.angle += dy * lerp;
            bd.group.rotation.y = bd.angle;
            bd.group.rotation.x += (bd._tgtRX - bd.group.rotation.x) * lerp;
            // Lerp scale
            const cs = bd.growthScale || 0.04;
            const ns = cs + (bd._tgtGS - cs) * lerp;
            bd.growthScale = ns;
            bd.group.scale.setScalar(ns);
            bd.footOffset = 0.95 * 2.55 * ns;
            // Drive walk/flap phase locally
            bd.walkPhase += dt * (bd.flying ? 12 : (bd.walking ? 3 : 0.5));
            this._animateDragon(dt, bd);
            // Emit fire/ice particles from phantom mouths so other peers see breath visually
            if (bd._breathingFire && bd._fireDirYaw !== undefined) {
                this._getMouthWorld(bd, _afv);
                const mx = _afv.x, my = _afv.y, mz = _afv.z;
                const fdx = Math.sin(bd._fireDirYaw) * Math.cos(bd._fireDirPitch);
                const fdy = -Math.sin(bd._fireDirPitch);
                const fdz = Math.cos(bd._fireDirYaw) * Math.cos(bd._fireDirPitch);
                this._emitFire(mx, my, mz, fdx, fdy, fdz, 2, 1, bd._lightningBreath ? 2 : (bd._iceBreath ? 1 : 0));
            }
        }
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
            { dx: -3, dz: 2, color: 0x882222, emissive: 0x441111, veinColor: 0xcc4422, glowColor: 0xff4422, wingColor: 0xff5533, isWyvern: true, name: 'Dark Red Wyvern' },
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
        // Egg: 3D diamond scales tightly packed on egg surface
        const eggGeo = new THREE.SphereGeometry(0.18, 8, 6); // inner core (mostly hidden)
        // 3D scale: diamond shape (two equally pointy ends) with curvature
        const _scaleW = 0.012, _scaleH = 0.016, _scaleD = 0.005;
        // Build a curved diamond scale using a custom BufferGeometry
        // Diamond shape: top point, right point, bottom point, left point
        // Curved outward to conform to egg surface
        function buildScaleGeo() {
            // Grid resolution for curvature
            const segsX = 4, segsY = 6;
            const verts = [], indices = [], normals = [], uvs = [];
            for (let iy = 0; iy <= segsY; iy++) {
                const ty = iy / segsY; // 0=top, 1=bottom
                const y = _scaleH - ty * 2 * _scaleH; // +_scaleH to -_scaleH
                // Diamond width: 0 at top & bottom, max at middle
                const widthT = 1 - Math.abs(ty - 0.5) * 2; // 0→1→0
                const halfW = _scaleW * widthT;
                for (let ix = 0; ix <= segsX; ix++) {
                    const tx = ix / segsX; // 0=left, 1=right
                    const x = -halfW + tx * 2 * halfW;
                    // Curvature: bulge outward in center, creating a dome
                    const cx = (tx - 0.5) * 2; // -1 to 1
                    const cy = (ty - 0.5) * 2; // -1 to 1
                    const bulge = (1 - cx*cx) * (1 - cy*cy);
                    const z = bulge * _scaleD;
                    verts.push(x, y, z);
                    // Normal: approximate from bulge gradient
                    const nx = -cx * _scaleD * 2;
                    const ny = -cy * _scaleD * 0.5;
                    const nz = 1;
                    const nl = Math.sqrt(nx*nx + ny*ny + nz*nz);
                    normals.push(nx/nl, ny/nl, nz/nl);
                    uvs.push(tx, ty);
                }
            }
            for (let iy = 0; iy < segsY; iy++) {
                for (let ix = 0; ix < segsX; ix++) {
                    const a = iy * (segsX+1) + ix;
                    const b = a + 1;
                    const c = a + segsX + 1;
                    const d = c + 1;
                    // Skip degenerate triangles at diamond tips
                    const ax = verts[a*3], bx = verts[b*3];
                    if (Math.abs(ax - bx) < 0.0001) { indices.push(a, c, d); }
                    else { indices.push(a, c, b); indices.push(b, c, d); }
                }
            }
            // Back face (flat, slightly recessed)
            const backOff = verts.length / 3;
            for (let iy = 0; iy <= segsY; iy++) {
                const ty = iy / segsY;
                const y = _scaleH - ty * 2 * _scaleH;
                const widthT = 1 - Math.abs(ty - 0.5) * 2;
                const halfW = _scaleW * widthT;
                for (let ix = 0; ix <= segsX; ix++) {
                    const tx = ix / segsX;
                    const x = -halfW + tx * 2 * halfW;
                    verts.push(x, y, -0.001);
                    normals.push(0, 0, -1);
                    uvs.push(tx, ty);
                }
            }
            for (let iy = 0; iy < segsY; iy++) {
                for (let ix = 0; ix < segsX; ix++) {
                    const a = backOff + iy * (segsX+1) + ix;
                    const b = a + 1;
                    const c = a + segsX + 1;
                    const d = c + 1;
                    const ax = verts[a*3], bx = verts[b*3];
                    if (Math.abs(ax - bx) < 0.0001) { indices.push(a, d, c); }
                    else { indices.push(a, b, c); indices.push(b, d, c); }
                }
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geo.setIndex(indices);
            return geo;
        }
        const scaleGeo = buildScaleGeo();
        const nestRockGeo = new THREE.DodecahedronGeometry(0.2, 0);
        const nestRockMat = new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.95 });

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
            // Inner egg core
            const eggMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(ed.color).multiplyScalar(0.5).getHex(), roughness: 0.9 });
            const eggMesh = new THREE.Mesh(eggGeo, eggMat);
            eggMesh.scale.set(1.0, 1.35, 1.0);
            eggMesh.position.y = 0.3;
            eggGrp.add(eggMesh);
            // Tightly packed 3D scales covering the entire egg
            const baseCol = new THREE.Color(ed.color);
            const darkCol = new THREE.Color(ed.color).multiplyScalar(0.7);
            const lightCol = new THREE.Color(ed.color).multiplyScalar(1.25);
            const accentCol = new THREE.Color(ed.veinColor);
            const baseMat = new THREE.MeshStandardMaterial({ color: baseCol, roughness: 0.35, metalness: 0.3 });
            const darkMat = new THREE.MeshStandardMaterial({ color: darkCol, roughness: 0.45, metalness: 0.2 });
            const lightMat = new THREE.MeshStandardMaterial({ color: lightCol, roughness: 0.3, metalness: 0.4 });
            const accentMat = new THREE.MeshStandardMaterial({ color: accentCol, emissive: accentCol, emissiveIntensity: 0.12, roughness: 0.25, metalness: 0.35 });
            const eggR = 0.21, eggYScale = 1.35, eggCY = 0.3;
            // Row spacing: heavy overlap so top point of each scale is hidden by row above
            const rowStep = _scaleH * 1.1;
            const totalH = eggR * eggYScale * 2;
            const scaleRows = Math.floor(totalH / rowStep);
            for (let sr = 0; sr <= scaleRows; sr++) {
                const t = sr / scaleRows; // 0 = top, 1 = bottom
                const phi = t * Math.PI;
                const sinPhi = Math.sin(phi);
                const ringR = sinPhi * eggR;
                const cy = Math.cos(phi) * eggR * eggYScale + eggCY;
                if (ringR < 0.02) continue; // skip poles
                // Tight horizontal packing — scales touch edge to edge
                const circumference = 2 * Math.PI * ringR;
                const cols = Math.max(4, Math.round(circumference / (_scaleW * 1.5)));
                const stagger = (sr % 2) * 0.5;
                for (let sc = 0; sc < cols; sc++) {
                    const theta = ((sc + stagger) / cols) * Math.PI * 2;
                    // Color variation + accent scales
                    const hash = Math.sin(sr * 127.1 + sc * 311.7) * 43758.5453;
                    const rnd = hash - Math.floor(hash);
                    let mat;
                    if (rnd < 0.12) mat = accentMat;
                    else if (rnd < 0.35) mat = darkMat;
                    else if (rnd < 0.55) mat = lightMat;
                    else mat = baseMat;
                    const scale = new THREE.Mesh(scaleGeo, mat);
                    // Position on egg surface
                    const surfR = ringR + _scaleD * 0.5;
                    scale.position.set(
                        Math.cos(theta) * surfR,
                        cy,
                        Math.sin(theta) * surfR
                    );
                    // Orient: face outward from egg surface normal
                    // Compute surface normal of the ellipsoid (x, y/yScale², z)
                    const nx = Math.cos(theta) * sinPhi;
                    const ny = (cy - eggCY) / (eggYScale * eggYScale * eggR);
                    const nz = Math.sin(theta) * sinPhi;
                    const nl = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
                    scale.lookAt(
                        scale.position.x + nx / nl,
                        scale.position.y + ny / nl,
                        scale.position.z + nz / nl
                    );
                    // Tilt so bottom tip points down along egg surface —
                    // top point gets tucked under the row above
                    scale.rotateX(-0.45);
                    eggGrp.add(scale);
                }
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
        this._playerX = px; this._playerZ = pz;
        // Update fire particles every frame
        this._updateFireParticles(dt);
        this._updateLightningBolts(dt);


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
                        const eggKey = 'egg_' + egg._idx;
                        if (this.removeFromInventory) this.removeFromInventory(eggKey);
                        if (this.onEggHatched) this.onEggHatched(eggKey);
                        const hy = this.getHeight(px, pz);
                        const bd = makeBabyDragon(px, pz, hy, egg.color, egg.wingColor, egg.isWyvern, egg.isLightning, egg.isIce, egg.hasTusks);
                        if (egg.hasTusks) bd._hasTusks = true;
                        this.scene.add(bd.group);
                        this.dragons.push(bd);
                        bd.dragonName = egg.name || '';
                        if (egg.isIce) bd._iceBreath = true;
                        if (egg.isLightning) { bd._lightningBreath = true; bd._isLightning = true; }
                        this.heldEgg = null;
                        // Prompt player to name the dragon
                        if (this.onDragonHatched) this.onDragonHatched(bd);
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
                        if (this.onEggPickedUp) this.onEggPickedUp(i);
                        pickedEgg = true;
                        break;
                    }
                }
                // Check for nearby dragon to ride
                if (!pickedEgg) {
                    for (const bd of this.dragons) {
                        if (bd.state !== 'alive' || bd.age < 7200) continue;
                        const ddx = px - bd.x, ddz = pz - bd.z;
                        if (ddx * ddx + ddz * ddz < 6 * bd.growthScale + 4) {
                            this.ridingDragon = true;
                            this.ridingRef = bd;
                            this._wakeFromSleep(bd);
                            break;
                        }
                    }
                }
            }
        }
        if (!keys['KeyE']) this._eDown = false;

        // Clear player target after timeout
        if (this._playerTargetTimer > 0) {
            this._playerTargetTimer -= dt;
            if (this._playerTargetTimer <= 0 || (this._playerTarget && this._playerTarget.dead)) this._playerTarget = null;
        }

        // ── Update all dragons ──
        for (let bi = this.dragons.length - 1; bi >= 0; bi--) {
            const bd = this.dragons[bi];
            if (bd.state === 'dead') {
                if (!bd._isCorpse) this._toCorpse(bd);
                continue;
            }
            if (bd.state !== 'alive') continue;
            // Ice dragon — runs its own AI even though it's stationary-marked
            if (bd._iceDragon) {
                this._updateIceDragon(dt, bd, player);
                this._animateDragon(dt, bd);
                continue;
            }
            if (bd._lightningDragon) {
                this._updateLightningDragon(dt, bd, player);
                this._animateDragon(dt, bd);
                continue;
            }
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
            if (bd.age < 4800) gs = 0.04 + (bd.age / 4800) * (0.25 - 0.04);
            else if (bd.age < 9600) gs = 0.25 + ((bd.age - 4800) / 4800) * (0.50 - 0.25);
            else if (bd.age < 14400) gs = 0.50 + ((bd.age - 9600) / 4800) * (1.0 - 0.50);
            else if (bd.age < 28800) gs = 1.0 + ((bd.age - 14400) / 14400) * (2.0 - 1.0);
            else gs = 2.0;
            bd.growthScale = gs;
            bd.group.scale.setScalar(gs);
            bd.footOffset = 0.95 * 2.55 * gs;
            bd.followDist = 4 + gs * 5;
            // Update max HP as dragon grows
            const newMaxHP = getDragonMaxHP(bd.age);
            if (newMaxHP > bd.maxHP) {
                bd.hp += (newMaxHP - bd.maxHP); // grow with new HP
                bd.maxHP = newMaxHP;
            }

            // ── Dragon falling (dropped from bite) ──
            if (bd._dragonFalling) {
                bd._dragonFallVel = (bd._dragonFallVel || 0) + 25 * dt;
                bd.group.position.y -= bd._dragonFallVel * dt;
                const terrY = this.getHeight(bd.x, bd.z) + bd.footOffset;
                if (bd.group.position.y <= terrY) {
                    bd.group.position.y = terrY;
                    const fallH = bd._dragonFallStartY - terrY;
                    if (fallH > 3) {
                        bd.hp -= Math.floor(fallH * 1.5);
                        if (bd.hp <= 0) { bd.hp = 0; bd.state = 'dead'; }
                    }
                    bd._dragonFalling = false;
                    bd._dragonFallVel = 0;
                }
                this._animateDragon(dt, bd);
                continue;
            }

            // ── Riding ──
            if (this.ridingDragon && this.ridingRef === bd) {
                this._updateRiding(dt, bd, player, keys);
                continue;
            }

            // ── Shoulder dragon (baby on player's shoulder) ──
            if (bd._onShoulder) {
                // Offset sideways onto the right shoulder (perpendicular to facing)
                const angle = player.group.rotation.y;
                const sideOff = 0.28; // world units offset onto shoulder
                bd.x = player.position.x + Math.cos(angle) * sideOff;
                bd.z = player.position.z - Math.sin(angle) * sideOff;
                const sy = player.position.y + 1.45;
                bd.group.position.set(bd.x, sy, bd.z);
                bd.group.rotation.y = player.group.rotation.y;
                bd.group.scale.setScalar(gs * 0.7);
                continue;
            }

            // Default to following the player
            if (bd._followingPlayer === undefined) { bd._followingPlayer = true; bd._followMode = 'follow'; }

            // ── Sleep at night (if not following player) ──
            const tod = (this._timeOfDay !== undefined) ? this._timeOfDay : 0.5;
            const isNight = tod < 0.22 || tod > 0.78;
            if (isNight && !bd._followingPlayer) {
                bd._sleeping = true;
                bd.walking = false;
                bd.speed = 0;
                bd._breathingFire = false;
                // Sleep pose — lower body to ground (reduce footOffset)
                const bTerrainY = this.getHeight(bd.x, bd.z);
                bd.group.position.set(bd.x, bTerrainY + bd.footOffset * 0.35, bd.z);
                this._animateDragonSleep(dt, bd);
                continue;
            }
            if (bd._sleeping) this._wakeFromSleep(bd);

            // ── Combat AI — find nearby hostile creature to fight ──
            // Breath damage scales with age: 1 at baby, 2 at teen, 4 at adult, 6 at elder
            let dragonFireDmg = 1;
            if (bd.age >= 4800) dragonFireDmg = 2;
            if (bd.age >= 9600) dragonFireDmg = 4;
            if (bd.age >= 14400) dragonFireDmg = 6;

            // Flee when low HP (< 25%) — fly away from threats
            const lowHP = bd.hp < bd.maxHP * 0.25;
            if (lowHP && this._creatureMgr) {
                let fleeX = 0, fleeZ = 0, threatCount = 0;
                for (const c of this._creatureMgr.creatures) {
                    if (c.dead || !c.hostile) continue;
                    const cdx = c.x - bd.x, cdz = c.z - bd.z;
                    if (cdx * cdx + cdz * cdz < 900) { fleeX -= cdx; fleeZ -= cdz; threatCount++; }
                }
                if (threatCount > 0) {
                    const fd = Math.sqrt(fleeX * fleeX + fleeZ * fleeZ) || 1;
                    if (!bd.flying) { bd.flying = true; bd.flyHeight = bd.group.position.y + 10 + gs * 8; }
                    const fleeSpd = (16 + gs * 10) * dt * this._speedMult(bd);
                    bd.x += (fleeX / fd) * fleeSpd;
                    bd.z += (fleeZ / fd) * fleeSpd;
                    bd.angle = Math.atan2(fleeX / fd, fleeZ / fd);
                    bd.group.rotation.y = bd.angle;
                    const targetH = this.getHeight(bd.x, bd.z) + bd.footOffset + 15 + gs * 10;
                    bd.flyHeight += (targetH - bd.flyHeight) * dt * 2;
                    bd.group.position.set(bd.x, bd.flyHeight, bd.z);
                    bd.walking = false;
                    bd._breathingFire = false;
                    this._animateDragon(dt, bd);
                    continue;
                }
            }

            let target = null, targetDist = 25;
            if (this._creatureMgr && !bd._passive && !lowHP) {
                // Priority 1: attack whatever the player is attacking
                if (this._playerTarget && !this._playerTarget.dead) {
                    const pt = this._playerTarget;
                    const cdx = pt.x - bd.x, cdz = pt.z - bd.z;
                    const cd = Math.sqrt(cdx*cdx + cdz*cdz);
                    if (cd < 50) { target = pt; targetDist = cd; }
                }
                // Priority 2: nearby hostile creatures
                if (!target) {
                    for (const c of this._creatureMgr.creatures) {
                        if (c.dead || !c.hostile || c._tamed) continue;
                        if (c.type === 'babyDragon' || c.type === 'dragon') continue;
                        if (c._isBoss && (c._isColossus || c._isEmberLord || c._isNecromancer || c._isSWNecromancer)) continue;
                        const cdx = c.x - bd.x, cdz = c.z - bd.z;
                        const cd = Math.sqrt(cdx*cdx + cdz*cdz);
                        if (cd < targetDist) {
                            const pdx = c.x - px, pdz = c.z - pz;
                            if (pdx*pdx + pdz*pdz < 30 * 30) {
                                targetDist = cd;
                                target = c;
                            }
                        }
                    }
                }
                // Priority 3: nearby wild dragons (fortress/ice/lightning) — only if near player
                if (!target) {
                    for (const other of this.dragons) {
                        if (other === bd || !other || other.state !== 'alive' || other._isCorpse) continue;
                        if (!(other._fortressGuardian || other._iceDragon || other._lightningDragon)) continue;
                        const cdx = other.x - bd.x, cdz = other.z - bd.z;
                        const cd = Math.sqrt(cdx*cdx + cdz*cdz);
                        if (cd < targetDist) {
                            const pdx = other.x - px, pdz = other.z - pz;
                            if (pdx*pdx + pdz*pdz < 60 * 60) {
                                targetDist = cd;
                                target = other;
                            }
                        }
                    }
                }
            }

            bd._fireBreathTimer = (bd._fireBreathTimer || 0) - dt;

            if (!target && bd._breathingFire) {
                bd._breathingFire = false;
                bd._fireDirYaw = undefined;
                bd._fireDirPitch = undefined;
            }
            if (target) {
                // Chase target
                const tdx = target.x - bd.x, tdz = target.z - bd.z;
                bd.angle = Math.atan2(tdx, tdz);
                bd.group.rotation.y = bd.angle;
                const desiredDist = 4;
                if (targetDist > desiredDist) {
                    const cspd = Math.min(targetDist * 1.5, 6 + gs * 4) * dt * this._speedMult(bd);
                    bd.x += Math.sin(bd.angle) * cspd;
                    bd.z += Math.cos(bd.angle) * cspd;
                    bd.walking = true;
                } else {
                    bd.walking = false;
                }
                // Breathe fire if close enough — emit particles toward target
                if (targetDist < 12) {
                    bd._breathingFire = true;
                    // Aim head at target before sampling mouth position
                    const aimDx = target.x - bd.x;
                    const aimDz = target.z - bd.z;
                    const aimY = (target.group.position.y || 0) - (bd.group.position.y + 1.0 * gs);
                    const aimHoriz = Math.sqrt(aimDx*aimDx + aimDz*aimDz) || 1;
                    bd._fireDirYaw = Math.atan2(aimDx, aimDz);
                    bd._fireDirPitch = -Math.atan2(aimY, aimHoriz);
                    this._aimDragonHead(bd, true);
                    const _mouth = _afv;
                    this._getMouthWorld(bd, _mouth);
                    const mx = _mouth.x, my = _mouth.y, mz = _mouth.z;
                    // Direction toward target
                    const tdy = (target.group.position.y || 0) - my;
                    const tdx = target.x - mx;
                    const tdz = target.z - mz;
                    this._emitFire(mx, my, mz, tdx, tdy, tdz, 2, 0, bd._lightningBreath ? 2 : (bd._iceBreath ? 1 : 0));
                    if (bd._fireBreathTimer <= 0) {
                        bd._fireBreathTimer = 0.33;
                        const mode = bd._lightningBreath ? 2 : (bd._iceBreath ? 1 : 0);
                        const breathMult = mode === 2 ? 1.5 : (mode === 1 ? 0.75 : 1.0);
                        const dmg = dragonFireDmg * breathMult;
                        if (target.state !== undefined && target.group) {
                            this.damageDragon(target, dmg, 'breath', mode);
                        } else {
                            target.hp -= dmg;
                            if (target.hp <= 0) { target.hp = 0; target.dead = true; target.deathTimer = 0; target.walking = false; target.speed = 0; }
                        }
                    }
                } else {
                    bd._breathingFire = false;
                }
                const tY = this.getHeight(bd.x, bd.z);
                bd.group.position.set(bd.x, tY + bd.footOffset, bd.z);
                this._animateDragon(dt, bd);
                continue;
            }

            // ── Follow player AI ──
            const bdx = px - bd.x, bdz = pz - bd.z;
            const bDist = Math.sqrt(bdx * bdx + bdz * bdz);

            // ── Stay mode — just idle ──
            if (bd._followMode === 'stay') {
                bd.walking = false;
                const tY = this.getHeight(bd.x, bd.z);
                bd.group.position.set(bd.x, tY + bd.footOffset, bd.z);
                this._animateDragon(dt, bd);
                continue;
            }

            // ── Wander mode — roam within 100u of home, occasionally grab sheep ──
            if (bd._followMode === 'wander') {
                const homeX = bd._wanderHomeX || bd.x;
                const homeZ = bd._wanderHomeZ || bd.z;
                bd._wanderTimer = (bd._wanderTimer || 0) - dt;

                // Pick new wander target when timer expires
                if (bd._wanderTimer <= 0) {
                    bd._wanderTimer = 5 + Math.random() * 10;
                    const angle = Math.random() * Math.PI * 2;
                    const dist = 10 + Math.random() * 80;
                    bd._wanderTargetX = homeX + Math.sin(angle) * dist;
                    bd._wanderTargetZ = homeZ + Math.cos(angle) * dist;
                    // Clamp to within 120u of home
                    const wdx = bd._wanderTargetX - homeX, wdz = bd._wanderTargetZ - homeZ;
                    const wd = Math.sqrt(wdx * wdx + wdz * wdz);
                    if (wd > 120) {
                        bd._wanderTargetX = homeX + (wdx / wd) * 120;
                        bd._wanderTargetZ = homeZ + (wdz / wd) * 120;
                    }
                    // Teens+ sometimes take off to fly to target
                    if (bd.age >= 6200 && !bd.flying && Math.random() < 0.4) {
                        bd.flying = true;
                        bd.flyHeight = bd.group.position.y + 15 + Math.random() * 25;
                        bd._wanderTimer = 8 + Math.random() * 15; // fly longer
                    }
                    // Flying dragons sometimes land
                    if (bd.flying && Math.random() < 0.25) {
                        bd.flying = false;
                        bd.flyHeight = 0;
                    }
                }

                // Move toward wander target
                const wtdx = bd._wanderTargetX - bd.x, wtdz = bd._wanderTargetZ - bd.z;
                const wtDist = Math.sqrt(wtdx * wtdx + wtdz * wtdz);
                if (wtDist > 2) {
                    const targetAngle = Math.atan2(wtdx, wtdz);
                    let da = targetAngle - bd.angle;
                    while (da > Math.PI) da -= Math.PI * 2;
                    while (da < -Math.PI) da += Math.PI * 2;
                    bd.angle += da * Math.min(dt * 3, 1);
                    bd.group.rotation.y = bd.angle;
                    if (bd.flying) {
                        // Fly toward target
                        const flySpd = (12 + gs * 8) * dt * this._speedMult(bd);
                        bd.x += Math.sin(bd.angle) * flySpd;
                        bd.z += Math.cos(bd.angle) * flySpd;
                        // Gently vary height
                        const targetH = this.getHeight(bd.x, bd.z) + bd.footOffset + 15 + Math.sin(bd._wanderTimer * 0.5) * 8;
                        bd.flyHeight += (targetH - bd.flyHeight) * dt * 1.5;
                        bd.group.position.set(bd.x, bd.flyHeight, bd.z);
                        bd.walking = false;
                    } else {
                        const spd = Math.min(wtDist, 4 + gs * 2) * dt * this._speedMult(bd);
                        bd.x += Math.sin(bd.angle) * spd;
                        bd.z += Math.cos(bd.angle) * spd;
                        bd.walking = true;
                    }
                } else {
                    bd.walking = false;
                }

                // Drift back if too far from home
                const hdx = bd.x - homeX, hdz = bd.z - homeZ;
                if (hdx * hdx + hdz * hdz > 10000) { // > 100u
                    bd._wanderTargetX = homeX;
                    bd._wanderTargetZ = homeZ;
                    bd._wanderTimer = 0;
                }

                // Occasionally grab a nearby sheep in talons
                bd._wanderGrabTimer = (bd._wanderGrabTimer || 30) - dt;
                if (bd._wanderGrabTimer <= 0 && !bd._grabbedCreature && this._creatureMgr) {
                    bd._wanderGrabTimer = 40 + Math.random() * 80;
                    for (const c of this._creatureMgr.creatures) {
                        if (c.dead || (c.type !== 'sheep' && c.type !== 'pig')) continue;
                        const cdx = c.x - bd.x, cdz = c.z - bd.z;
                        if (cdx * cdx + cdz * cdz < 25 * gs) {
                            bd._grabbedCreature = c;
                            bd._wanderDropTimer = 5 + Math.random() * 10;
                            break;
                        }
                    }
                }
                // Hold grabbed creature at feet, drop after timer
                if (bd._grabbedCreature) {
                    const c = bd._grabbedCreature;
                    if (c.dead) { bd._grabbedCreature = null; }
                    else {
                        c.x = bd.x; c.z = bd.z;
                        c.group.position.set(bd.x, bd.group.position.y - bd.footOffset * 0.5, bd.z);
                        c.walking = false; c.speed = 0;
                        bd._wanderDropTimer = (bd._wanderDropTimer || 5) - dt;
                        if (bd._wanderDropTimer <= 0) {
                            bd._grabbedCreature = null;
                        }
                    }
                }

                if (!bd.flying) {
                    const tY = this.getHeight(bd.x, bd.z);
                    bd.group.position.set(bd.x, tY + bd.footOffset, bd.z);
                }
                this._animateDragon(dt, bd);
                continue;
            }

            // ── Follow mode — fly back if returning from wander ──
            if (bd._flyingBack) {
                if (bDist < 15) {
                    bd._flyingBack = false;
                    bd.flying = false;
                    bd.flyHeight = 0;
                } else if (bd.flying) {
                    // Fly toward player
                    const targetAngle = Math.atan2(bdx, bdz);
                    let da = targetAngle - bd.angle;
                    while (da > Math.PI) da -= Math.PI * 2;
                    while (da < -Math.PI) da += Math.PI * 2;
                    bd.angle += da * Math.min(dt * 4, 1);
                    bd.group.rotation.y = bd.angle;
                    const flySpd = (20 + gs * 15) * dt * this._speedMult(bd);
                    bd.x += Math.sin(bd.angle) * flySpd;
                    bd.z += Math.cos(bd.angle) * flySpd;
                    // Adjust height toward player
                    const targetH = Math.max(py + 10, this.getHeight(bd.x, bd.z) + bd.footOffset + 8);
                    bd.flyHeight += (targetH - bd.flyHeight) * 2 * dt;
                    bd.group.position.set(bd.x, bd.flyHeight, bd.z);
                    bd.walking = false;
                    this._animateDragon(dt, bd);
                    continue;
                }
            }

            // Don't teleport — let dragon walk/fly back naturally
            if (bDist > 50 && !bd._flyingBack) {
                bd.x = px - Math.sin(player.group.rotation.y) * 3;
                bd.z = pz - Math.cos(player.group.rotation.y) * 3;
            }

            // Take off: sprinting, far away, riding, or combat
            const shouldFly = this._playerSprinting || bDist > 15 || this._playerRiding || (target && targetDist < 20);
            if (shouldFly && !bd.flying && !bd._landing) {
                bd.flying = true;
                // Start from current ground position — height will rise gradually
                bd.flyHeight = bd.group.position.y;
                bd._takingOff = true;
            }
            // Trigger landing — still "flying" until on ground
            if (!shouldFly && bd.flying && !bd._landing) {
                bd._landing = true;
                bd._takingOff = false;
            }

            const maxSpd = (8 + gs * 6) * this._speedMult(bd);
            let moveX = 0, moveZ = 0;
            if (bd.flying) {
                // Flying follow — circle around player
                // Pick a fly-to point near the player, change it periodically
                bd._flyGoalTimer = (bd._flyGoalTimer || 0) - dt;
                if (bd._flyGoalTimer <= 0 || !bd._flyGoalX) {
                    bd._flyGoalTimer = 3 + Math.random() * 5;
                    const ang = Math.random() * Math.PI * 2;
                    const r = 3 + Math.random() * (5 + gs * 4);
                    bd._flyGoalX = px + Math.sin(ang) * r;
                    bd._flyGoalZ = pz + Math.cos(ang) * r;
                }
                // Move goal with player so it doesn't fall behind
                bd._flyGoalX += (px - (bd._prevPX || px)); bd._flyGoalZ += (pz - (bd._prevPZ || pz));
                bd._prevPX = px; bd._prevPZ = pz;
                const flySpd = (14 + gs * 10) * dt * this._speedMult(bd);
                const gx = bd._flyGoalX - bd.x, gz = bd._flyGoalZ - bd.z;
                const gd = Math.sqrt(gx * gx + gz * gz) || 1;
                if (bDist > 12 + gs * 6) {
                    // Far — fly toward player
                    moveX = bdx / bDist * flySpd;
                    moveZ = bdz / bDist * flySpd;
                } else {
                    // Swoop toward goal point
                    moveX = gx / gd * flySpd;
                    moveZ = gz / gd * flySpd;
                    // Pick new goal if reached
                    if (gd < 3) bd._flyGoalTimer = 0;
                }
                bd.x += moveX; bd.z += moveZ;
                // Determine target height based on state
                const groundY = this.getHeight(bd.x, bd.z) + bd.footOffset;
                let targetH;
                if (bd._landing) {
                    // Descend smoothly toward ground
                    targetH = groundY;
                    bd.flyHeight += (targetH - bd.flyHeight) * dt * 1.5;
                    // Once close to ground, finish landing
                    if (bd.flyHeight - groundY < 0.3) {
                        bd.flying = false;
                        bd._landing = false;
                        bd.flyHeight = 0;
                    }
                } else if (bd._takingOff) {
                    // Rise smoothly to cruise height
                    targetH = Math.max(py + 3, groundY + 6 + Math.random() * 4 * gs);
                    bd.flyHeight += (targetH - bd.flyHeight) * dt * 1.2;
                    if (bd.flyHeight > targetH - 0.5) bd._takingOff = false;
                } else {
                    targetH = Math.max(py + 3, groundY + 6 + Math.sin((bd._flyGoalTimer || 0) * 0.8) * 4 * gs);
                    bd.flyHeight += (targetH - bd.flyHeight) * dt * 2;
                }
                bd.walking = false;
            } else if (bDist > bd.followDist) {
                // Walking — go toward player
                const spd = Math.min(bDist * 1.5, maxSpd) * dt;
                moveX = bdx / bDist * spd;
                moveZ = bdz / bDist * spd;
                bd.x += moveX; bd.z += moveZ;
                bd.walking = true;
            } else if (bDist > bd.followDist * 0.5) {
                // Close — slow approach
                const spd = Math.min(bDist * 0.5, maxSpd * 0.3) * dt;
                moveX = bdx / bDist * spd;
                moveZ = bdz / bDist * spd;
                bd.x += moveX; bd.z += moveZ;
                bd.walking = true;
            } else {
                bd.walking = false;
            }
            // Face movement direction (flying) or face player (ground)
            let faceAngle;
            if (bd.flying && (moveX * moveX + moveZ * moveZ > 0.0001)) {
                faceAngle = Math.atan2(moveX, moveZ);
            } else {
                faceAngle = Math.atan2(bdx, bdz);
            }
            let da = faceAngle - bd.angle;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            bd.angle += da * Math.min(dt * 5, 1);
            bd.group.rotation.y = bd.angle;

            if (bd.flying) {
                bd.group.position.set(bd.x, bd.flyHeight, bd.z);
            } else {
                const bTerrainY = this.getHeight(bd.x, bd.z);
                bd.group.position.set(bd.x, bTerrainY + bd.footOffset, bd.z);
            }

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
            // Direction: wherever the crosshair is pointing (use camera yaw, not dragon yaw)
            const lookYaw = (player._lookYaw !== undefined) ? player._lookYaw : player.group.rotation.y;
            const lookPitch = (player._lookPitch !== undefined) ? player._lookPitch : 0;
            // Tell the head to track this direction (used by _animateDragon)
            bd._fireDirYaw = lookYaw;
            bd._fireDirPitch = lookPitch;
            // Snap head right now so the mouth position uses the aimed direction
            this._aimDragonHead(bd, true);
            // Actual mouth world position from the head matrix (after head turn)
            const _mouth = _afv;
            this._getMouthWorld(bd, _mouth);
            const mx = _mouth.x, my = _mouth.y, mz = _mouth.z;
            const dx = Math.sin(lookYaw) * Math.cos(lookPitch);
            const dy = -Math.sin(lookPitch);
            const dz = Math.cos(lookYaw) * Math.cos(lookPitch);
            // Emit particles — long-range mode (ice if dragon breathes ice), inherit dragon velocity
            this._emitFire(mx, my, mz, dx, dy, dz, 3, 1, bd._lightningBreath ? 2 : (bd._iceBreath ? 1 : 0), bd._velX || 0, bd._velY || 0, bd._velZ || 0);
            // Damage creatures in cone — every 0.33s for 3 dmg/sec
            if (bd._fireBreathTimer <= 0) {
                bd._fireBreathTimer = 0.33;
                this._damageInFireCone(mx, my, mz, dx, dy, dz, 1, 30, null, bd._lightningBreath ? 2 : (bd._iceBreath ? 1 : 0), bd);
            }
        } else {
            bd._breathingFire = false;
        }

        // ── B key — bite attack ──
        if (keys['KeyB']) {
            if (!bd._biting) {
                // Initial bite — find target
                bd._biting = true;
                bd._biteTarget = null;
                bd._biteDragonTarget = null;
                bd._biteShakeAccum = 0;
                bd._biteShakeDmgAccum = 0;
                bd._lastBiteYaw = (player._lookYaw !== undefined) ? player._lookYaw : player.group.rotation.y;
                const lookYaw = bd._lastBiteYaw;
                const lookPitch = (player._lookPitch !== undefined) ? player._lookPitch : 0;
                bd._fireDirYaw = lookYaw;
                bd._fireDirPitch = lookPitch;
                this._aimDragonHead(bd, true);
                this._getMouthWorld(bd, _afv);
                const mx = _afv.x, my = _afv.y, mz = _afv.z;
                const biteRange = 6 * gs;
                // Check creatures
                let best = null, bestDist = biteRange;
                if (this._creatureMgr) {
                    for (const c of this._creatureMgr.creatures) {
                        if (c.dead) continue;
                        const cdx = c.x - mx, cdz = c.z - mz;
                        const cd = Math.sqrt(cdx * cdx + cdz * cdz);
                        if (cd < bestDist) {
                            // Check direction — must be roughly where we're looking
                            const dirX = Math.sin(lookYaw), dirZ = Math.cos(lookYaw);
                            const dot = (cdx * dirX + cdz * dirZ) / (cd || 1);
                            if (dot > 0.6) { bestDist = cd; best = c; }
                        }
                    }
                }
                if (best) {
                    bd._biteTarget = best;
                    best.hp -= 8;
                    if (best.hp <= 0) { best.hp = 0; best.dead = true; best.deathTimer = 0; best.walking = false; best.speed = 0; }
                }
                // Check other dragons (can bite, can hold if <= 65% size)
                if (!best) {
                    for (const other of this.dragons) {
                        if (other === bd || other.state !== 'alive') continue;
                        if (other._isRemote) continue; // handled via sync
                        const cdx = other.x - mx, cdz = other.z - mz;
                        const cd = Math.sqrt(cdx * cdx + cdz * cdz);
                        if (cd < biteRange) {
                            const dirX = Math.sin(lookYaw), dirZ = Math.cos(lookYaw);
                            const dot = (cdx * dirX + cdz * dirZ) / (cd || 1);
                            if (dot > 0.6) {
                                other.hp -= 8;
                                if (other.hp <= 0) { other.hp = 0; other.state = 'dead'; }
                                if (other.growthScale <= gs * 0.65) {
                                    bd._biteDragonTarget = other;
                                }
                                break;
                            }
                        }
                    }
                }
                // Check remote players
                if (!best && !bd._biteDragonTarget && this._mp && this._mp.remotePlayers) {
                    for (const [pid, rp] of this._mp.remotePlayers) {
                        if (!rp._hasReceived) continue;
                        const rpx = rp.group.position.x, rpz = rp.group.position.z;
                        const cdx = rpx - mx, cdz = rpz - mz;
                        const cd = Math.sqrt(cdx * cdx + cdz * cdz);
                        if (cd < biteRange) {
                            const dirX = Math.sin(lookYaw), dirZ = Math.cos(lookYaw);
                            const dot = (cdx * dirX + cdz * dirZ) / (cd || 1);
                            if (dot > 0.6) {
                                this._mp.sendPvpHit(pid, 8);
                                break;
                            }
                        }
                    }
                }
            }
            // Holding B — aim head at target and shake damage
            if (bd._biteTarget || bd._biteDragonTarget) {
                const target = bd._biteTarget || bd._biteDragonTarget;
                const tx = bd._biteTarget ? target.x : target.x;
                const tz = bd._biteTarget ? target.z : target.z;
                const ty = bd._biteTarget ? (target.group.position.y || 0) : (target.group.position.y || 0);
                const aimDx = tx - bd.x, aimDz = tz - bd.z;
                const aimY = ty - (bd.group.position.y + 1.0 * gs);
                const aimHoriz = Math.sqrt(aimDx * aimDx + aimDz * aimDz) || 1;
                bd._fireDirYaw = Math.atan2(aimDx, aimDz);
                bd._fireDirPitch = -Math.atan2(aimY, aimHoriz);
                bd._breathingFire = true; // reuse neck bend system
                this._aimDragonHead(bd, true);
                // Jaw open for bite
                bd._jawOpenT = 0.8;
                // Hold target in mouth
                this._getMouthWorld(bd, _afv);
                if (bd._biteTarget && !bd._biteTarget.dead) {
                    bd._biteTarget.x = _afv.x;
                    bd._biteTarget.z = _afv.z;
                    bd._biteTarget.group.position.set(_afv.x, _afv.y, _afv.z);
                    bd._biteTarget.walking = false;
                    bd._biteTarget.speed = 0;
                }
                if (bd._biteDragonTarget && bd._biteDragonTarget.state === 'alive') {
                    bd._biteDragonTarget.x = _afv.x;
                    bd._biteDragonTarget.z = _afv.z;
                    bd._biteDragonTarget.group.position.set(_afv.x, _afv.y, _afv.z);
                }
                // Shake damage — track mouse/crosshair yaw changes
                const curYaw = (player._lookYaw !== undefined) ? player._lookYaw : player.group.rotation.y;
                let yawDelta = Math.abs(curYaw - bd._lastBiteYaw);
                if (yawDelta > Math.PI) yawDelta = Math.PI * 2 - yawDelta;
                bd._lastBiteYaw = curYaw;
                bd._biteShakeAccum += yawDelta;
                bd._biteShakeDmgAccum += dt;
                // Deal 1 damage per 0.3 radians of shake, checked every 0.2s
                if (bd._biteShakeDmgAccum >= 0.2) {
                    bd._biteShakeDmgAccum = 0;
                    if (bd._biteShakeAccum > 0.3) {
                        const shakeDmg = Math.floor(bd._biteShakeAccum / 0.3);
                        bd._biteShakeAccum -= shakeDmg * 0.3;
                        if (bd._biteTarget && !bd._biteTarget.dead) {
                            bd._biteTarget.hp -= shakeDmg;
                            if (bd._biteTarget.hp <= 0) { bd._biteTarget.hp = 0; bd._biteTarget.dead = true; bd._biteTarget.deathTimer = 0; bd._biteTarget.walking = false; bd._biteTarget.speed = 0; }
                        }
                        if (bd._biteDragonTarget && bd._biteDragonTarget.state === 'alive') {
                            bd._biteDragonTarget.hp -= shakeDmg;
                            if (bd._biteDragonTarget.hp <= 0) { bd._biteDragonTarget.hp = 0; bd._biteDragonTarget.state = 'dead'; }
                        }
                    }
                }
                bd._breathingFire = false; // don't actually show fire particles
            }
        } else if (bd._biting) {
            // Released B — drop target
            bd._biting = false;
            if (bd._biteTarget && !bd._biteTarget.dead) {
                bd._biteTarget._falling = true;
                bd._biteTarget._fallVel = 0;
                bd._biteTarget._fallStartY = bd._biteTarget.group.position.y;
            }
            if (bd._biteDragonTarget && bd._biteDragonTarget.state === 'alive') {
                // Dragon falls — set a temporary fall state
                const dt2 = bd._biteDragonTarget;
                dt2._dragonFalling = true;
                dt2._dragonFallVel = 0;
                dt2._dragonFallStartY = dt2.group.position.y;
            }
            bd._biteTarget = null;
            bd._biteDragonTarget = null;
        }

        if (keys['KeyA'] || keys['ArrowLeft']) bd.angle += turnRate * dt;
        if (keys['KeyD'] || keys['ArrowRight']) bd.angle -= turnRate * dt;
        let wantDir = 0;
        if (keys['KeyW'] || keys['ArrowUp']) wantDir = 1;
        if (keys['KeyS'] || keys['ArrowDown']) wantDir = -1;

        const canFly = bd.age >= 6200;
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
        const prevX = bd.x, prevZ = bd.z, prevY = bd.group.position.y;
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

        // Track dragon velocity for fire particle inheritance
        if (dt > 0) {
            bd._velX = (bd.x - prevX) / dt;
            bd._velY = (bd.group.position.y - prevY) / dt;
            bd._velZ = (bd.z - prevZ) / dt;
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

        // ── G key — grab creatures with talons ──
        if (keys['KeyG']) {
            bd._grabbing = true;
            // Tilt back and extend rear legs forward
            if (!bd._grabTilt) bd._grabTilt = 0;
            bd._grabTilt += (-0.45 - bd._grabTilt) * 4 * dt;
            bd.group.rotation.x = (bd._flyTilt || 0) + bd._grabTilt;
            // Check for creatures or players near the rear feet to grab
            if (!bd._grabbedCreature && !bd._grabbedPlayer) {
                bd.group.updateMatrixWorld(true);
                const footWorld = new THREE.Vector3();
                const S = 2.55;
                footWorld.set(0, -0.7 * S * gs, -0.7 * S * gs);
                footWorld.applyMatrix4(bd.group.matrixWorld);
                const grabR = 2.5 * gs;
                const grabR2 = grabR * grabR;
                // Check creatures
                let closest = null, closestDist = grabR2;
                if (this._creatureMgr) {
                    for (const c of this._creatureMgr.creatures) {
                        if (c.dead) continue;
                        if (c.type === 'dragon' || c.type === 'babyDragon') continue;
                        const cdx = c.x - footWorld.x, cdz = c.z - footWorld.z;
                        const d2 = cdx * cdx + cdz * cdz;
                        if (d2 < closestDist) { closestDist = d2; closest = c; }
                    }
                }
                if (closest) {
                    bd._grabbedCreature = closest;
                    bd._grabStartY = closest.group.position.y;
                } else if (this._mp && this._mp.remotePlayers) {
                    // Check remote players (not riding their own dragon)
                    for (const [pid, rp] of this._mp.remotePlayers) {
                        if (!rp._hasReceived || rp._riding) continue;
                        const rpx = rp.group.position.x, rpz = rp.group.position.z;
                        const cdx = rpx - footWorld.x, cdz = rpz - footWorld.z;
                        const d2 = cdx * cdx + cdz * cdz;
                        if (d2 < grabR2) {
                            bd._grabbedPlayer = pid;
                            this._mp._send({ t: 'dragon_grab', targetPid: pid });
                            break;
                        }
                    }
                }
            }
            // Hold grabbed creature at foot position
            if (bd._grabbedCreature) {
                const c = bd._grabbedCreature;
                if (c.dead) { bd._grabbedCreature = null; }
                else {
                    bd.group.updateMatrixWorld(true);
                    const S = 2.55;
                    const footWorld = new THREE.Vector3(0, -0.95 * S * gs, -0.5 * S * gs);
                    footWorld.applyMatrix4(bd.group.matrixWorld);
                    c.x = footWorld.x;
                    c.z = footWorld.z;
                    c.group.position.set(footWorld.x, footWorld.y, footWorld.z);
                    c.walking = false;
                    c.speed = 0;
                }
            }
            // Hold grabbed remote player at foot position
            if (bd._grabbedPlayer && this._mp && this._mp.remotePlayers) {
                const rp = this._mp.remotePlayers.get(bd._grabbedPlayer);
                if (rp) {
                    bd.group.updateMatrixWorld(true);
                    const S = 2.55;
                    const footWorld = new THREE.Vector3(0, -0.95 * S * gs, -0.5 * S * gs);
                    footWorld.applyMatrix4(bd.group.matrixWorld);
                    // Send position override to grabbed player
                    this._mp._send({ t: 'dragon_hold', targetPid: bd._grabbedPlayer, x: +footWorld.x.toFixed(2), y: +footWorld.y.toFixed(2), z: +footWorld.z.toFixed(2) });
                }
            }
        } else if (bd._grabbing) {
            // Released G — drop creature/player
            bd._grabbing = false;
            if (bd._grabbedCreature) {
                const c = bd._grabbedCreature;
                if (!c.dead) {
                    c._falling = true;
                    c._fallVel = 0;
                    c._fallStartY = c.group.position.y;
                }
                bd._grabbedCreature = null;
            }
            if (bd._grabbedPlayer && this._mp) {
                this._mp._send({ t: 'dragon_drop', targetPid: bd._grabbedPlayer, y: 0 });
                bd._grabbedPlayer = null;
            }
            bd._grabTilt = 0;
        }
        if (!bd._grabbing && bd._grabTilt) {
            bd._grabTilt *= Math.max(0, 1 - 4 * dt);
            if (bd._grabTilt < 0.01) bd._grabTilt = 0;
        }

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
                // Glue patagium body anchor (p0) to halfway through 2nd body chunk
                if (w._patP0) {
                    const S = 2.55;
                    const tx = 0, ty = 0, tz = -0.3 * S;
                    w.updateMatrix();
                    _afInvMat.copy(w.matrix).invert();
                    _afv.set(tx, ty, tz).applyMatrix4(_afInvMat);
                    w._patP0[0] = _afv.x; w._patP0[1] = _afv.y; w._patP0[2] = _afv.z;
                }
                updateWyvernMembrane(w);
            }
            for (const leg of bd.legs) leg.rotation.x = 0.6;
            // Grabbing: rear legs extend forward/down to grab
            if (bd._grabbing) {
                bd.legs[2].rotation.x = -0.8; // rear left forward
                bd.legs[3].rotation.x = -0.8; // rear right forward
                // Curl inward slightly if holding something
                if (bd._grabbedCreature) {
                    bd.legs[2].rotation.z = 0.15;
                    bd.legs[3].rotation.z = -0.15;
                }
            } else {
                bd.legs[2].rotation.z = 0;
                bd.legs[3].rotation.z = 0;
            }
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
                    const outward = si * 0.1; // sweep back
                    // Push wrist (and fingers) further from body via elbow Y
                    if (wb) {
                        w.rotation.set(wc*0.5, si*(0.54-wc*0.4) + outward, si*(0.35-wc*0.25));
                        w._elbow.rotation.set(1.55-Math.max(0,wc)*0.4, si*-1.95, si*0.74);
                        w._hand.rotation.set(-0.2, si*1.25, si*-0.48);
                    } else {
                        w.rotation.set(0, si*0.54 + outward, si*0.35);
                        w._elbow.rotation.set(1.55, si*-1.95, si*0.74);
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
                // Grounded: hide patagium, glue afMesh body point to halfway through 2nd body chunk
                if (w._patMesh) w._patMesh.visible = false;
                if (w._afBodyPt && w._afGroundedBodyPt) {
                    if (!w._afOrigBodyPt) w._afOrigBodyPt = w._afBodyPt.slice();
                    // Target = center of midBody (2nd body chunk) in dragon-local space
                    const S = 2.55;
                    const tx = 0, ty = 0, tz = -0.3 * S;
                    w.updateMatrix();
                    _afInvMat.copy(w.matrix).invert();
                    _afv.set(tx, ty, tz).applyMatrix4(_afInvMat);
                    w._afBodyPt = [_afv.x, _afv.y, _afv.z];
                }
                updateWyvernMembrane(w);
            }
            for (let ti = 0; ti < bd.tailSegs.length; ti++) {
                bd.tailSegs[ti].rotation.y = Math.sin(bd.walkPhase * 1.5 + ti * 0.4) * 0.15;
            }
            bd.headGrp.rotation.x = Math.sin(bd.walkPhase * 0.8) * 0.1;
        }
        // Smoothly lerp neck bend amount toward target (1 if breathing or biting, 0 otherwise)
        const bendTarget = ((bd._breathingFire || bd._biting) && bd._fireDirYaw !== undefined) ? 1 : 0;
        bd._neckBendT = (bd._neckBendT || 0) + (bendTarget - (bd._neckBendT || 0)) * Math.min(1, 8 * dt);
        if (bd._neckBendT > 0.01) {
            this._aimDragonHead(bd, false);
        } else if (bd.neckSegs) {
            // Fully released — clear all rotations so default head animation reads through
            bd._neckBendT = 0;
            bd._fireDirYaw = undefined;
            bd._fireDirPitch = undefined;
            for (const seg of bd.neckSegs) {
                seg.rotation.y = 0;
                seg.rotation.x = 0;
            }
            bd.headGrp.rotation.y = 0;
        }
        // Jaw open animation — smoothly opens when breathing fire or biting
        if (bd.jawGrp) {
            const target = (bd._breathingFire || (bd._biting && (bd._biteTarget || bd._biteDragonTarget))) ? 1 : 0;
            bd._jawOpenT = (bd._jawOpenT || 0) + (target - (bd._jawOpenT || 0)) * Math.min(1, 12 * dt);
            bd.jawGrp.rotation.x = bd._jawOpenT * 0.65;
        }
    }

    _animateDragonSleep(dt, bd) {
        // Smoothly transition into sleep pose
        const t = Math.min(1, (bd._sleepBlend || 0) + dt * 2);
        bd._sleepBlend = t;
        const lerp = (a, b) => a + (b - a) * t;

        // Breathing — gentle rise/fall
        bd._sleepBreathPhase = (bd._sleepBreathPhase || 0) + dt * 0.8;
        const breath = Math.sin(bd._sleepBreathPhase) * 0.06 * bd.growthScale;
        const bTerrainY = this.getHeight(bd.x, bd.z);
        bd.group.position.y = bTerrainY + bd.footOffset * 0.35 + breath * t;
        // Chest/body expands slightly with breath
        if (bd.chest) {
            const breathScale = 1 + Math.sin(bd._sleepBreathPhase) * 0.03 * t;
            bd.chest.scale.set(1, breathScale, 1);
        }
        if (bd.midBody) {
            const breathScale = 1 + Math.sin(bd._sleepBreathPhase + 0.3) * 0.02 * t;
            bd.midBody.scale.set(1, breathScale, 1);
        }

        // Neck: bend sideways and down so head rests on the ground curving right
        if (bd.neckGrp) {
            bd.neckGrp.rotation.x = lerp(bd.neckGrp.rotation.x, 0.7); // droop down
            bd.neckGrp.rotation.y = lerp(bd.neckGrp.rotation.y, 0.3); // curve right
        }
        if (bd.neckSegs) {
            for (let i = 0; i < bd.neckSegs.length; i++) {
                const seg = bd.neckSegs[i];
                seg.rotation.x = lerp(seg.rotation.x, 0.35); // each seg droops further
                seg.rotation.y = lerp(seg.rotation.y, 0.25);  // curves right
            }
        }
        // Head on its side (roll via z), facing inward/sideways
        bd.headGrp.rotation.order = 'YXZ';
        bd.headGrp.rotation.x = lerp(bd.headGrp.rotation.x, 0);    // no pitch
        bd.headGrp.rotation.y = lerp(bd.headGrp.rotation.y, 0.4);   // facing inward
        bd.headGrp.rotation.z = lerp(bd.headGrp.rotation.z || 0, 0.7); // rolled onto its side

        // Jaw closed
        if (bd.jawGrp) {
            bd._jawOpenT = (bd._jawOpenT || 0) * 0.9;
            bd.jawGrp.rotation.x = bd._jawOpenT * 0.65;
        }

        // Close eyes
        if (bd.eyes) {
            for (const eye of bd.eyes) {
                eye.scale.y = lerp(eye.scale.y, 0.1);
            }
        }

        // Wings flat on the ground — spread out like flying, nearly flat
        for (const w of bd.wings) {
            const si = w._s;
            w.rotation.set(
                lerp(w.rotation.x, 0),
                lerp(w.rotation.y, si * 0.05),
                lerp(w.rotation.z, si * -0.03)  // flat outstretched
            );
            if (w._elbow) w._elbow.rotation.set(
                lerp(w._elbow.rotation.x, 0),
                lerp(w._elbow.rotation.y, si * -0.08),
                lerp(w._elbow.rotation.z, si * -0.02) // flat
            );
            if (w._hand) w._hand.rotation.set(0, 0, 0);
            // Flying membrane setup
            if (w._memOutlineFly) w._memOutline = w._memOutlineFly;
            if (w._flyFRots) applyFingerRots(w, w._flyFRots);
            if (w._patMesh) w._patMesh.visible = true;
            if (w._afOrigBodyPt) w._afBodyPt = w._afOrigBodyPt;
            if (w._patP0) {
                const S = 2.55;
                w.updateMatrix();
                _afInvMat.copy(w.matrix).invert();
                _afv.set(0, 0, -0.3 * S).applyMatrix4(_afInvMat);
                w._patP0[0] = _afv.x; w._patP0[1] = _afv.y; w._patP0[2] = _afv.z;
            }
            updateWyvernMembrane(w);
        }

        // Tail flat on ground, curves more to same side as head
        for (let ti = 0; ti < bd.tailSegs.length; ti++) {
            bd.tailSegs[ti].rotation.x = lerp(bd.tailSegs[ti].rotation.x, 0.1); // flat
            bd.tailSegs[ti].rotation.y = lerp(bd.tailSegs[ti].rotation.y, 0.25 + ti * 0.1); // strong curve
        }

        // Legs splayed flat to the sides
        for (let li = 0; li < bd.legs.length; li++) {
            const leg = bd.legs[li];
            if (bd.isWyvern && li < 2) continue;
            const side = (li % 2 === 0) ? 1 : -1;
            const isFront = li < 2;
            leg.rotation.x = lerp(leg.rotation.x, isFront ? 0.3 : -0.3);
            leg.rotation.z = lerp(leg.rotation.z, side * 1.4); // even more splayed
        }
    }

    // Compute the actual mouth world position from the head matrix
    _getMouthWorld(bd, out) {
        const S = 2.55;
        bd.headGrp.updateMatrixWorld(true);
        out.set(0, -0.1 * S, 0.7 * S);
        out.applyMatrix4(bd.headGrp.matrixWorld);
        return out;
    }

    // Ice dragon AI — sleeps at night, defends nest by day, sometimes flies "with purpose"
    _updateIceDragon(dt, bd, player) {
        // Regen after not being hit for 10s
        bd._lastHitTime = (bd._lastHitTime === undefined ? 1000 : bd._lastHitTime + dt);
        if (bd._lastHitTime > 10 && bd.hp < bd.maxHP) bd.hp = Math.min(bd.maxHP, bd.hp + bd.maxHP * 0.02 * dt);
        if (bd.hp <= 0) { bd.state = 'dead'; return; }
        const tod = (this._timeOfDay !== undefined) ? this._timeOfDay : 0.5;
        const isNight = tod < 0.22 || tod > 0.78;
        const px = player.position.x, pz = player.position.z;
        const dx = px - bd.x, dz = pz - bd.z;
        const distXZ = Math.sqrt(dx*dx + dz*dz);
        const sprinting = (player.sprintBlend || 0) > 0.5;
        if (!bd._iceState) bd._iceState = 'idle';
        if (!bd._iceTimer) bd._iceTimer = 0;
        bd._iceTimer -= dt;
        bd._fireBreathTimer = (bd._fireBreathTimer || 0) - dt;

        // ── State transitions ──
        if (bd._iceState === 'sleeping') {
            // Wakes only if sprinted near or day breaks
            if (sprinting && distXZ < 28 && !this._peacefulMode) {
                bd._iceState = 'defending';
            } else if (!isNight) {
                bd._iceState = 'idle';
            }
        } else if (isNight) {
            // Force return to nest then sleep — ignores player
            const ndx = bd._nestX - bd.x, ndz = bd._nestZ - bd.z;
            const ndist = Math.sqrt(ndx*ndx + ndz*ndz);
            if (ndist < 4) {
                bd._iceState = 'sleeping';
                bd.flying = false;
                bd.walking = false;
            } else {
                bd._iceState = 'returning';
            }
        } else if (bd._iceState === 'idle') {
            bd._pursuitCooldown = Math.max(0, (bd._pursuitCooldown || 0) - dt);
            if (distXZ < 40 && bd._pursuitCooldown <= 0 && !this._peacefulMode) {
                bd._iceState = 'defending';
                bd._pursuitTime = 0;
            } else if (bd._iceTimer <= 0) {
                bd._iceState = 'flying_aimless';
                bd._iceTimer = 6 + Math.random() * 8;
                bd._iceFlyAngle = Math.random() * Math.PI * 2;
                bd.flying = true;
                bd.flyHeight = (this.getHeight ? this.getHeight(bd.x, bd.z) : 0) + 25 + Math.random() * 15;
            }
        } else if (bd._iceState === 'defending') {
            bd._pursuitTime = (bd._pursuitTime || 0) + dt;
            if (distXZ > 60 || bd._pursuitTime > 30) {
                bd._iceState = 'returning';
                bd._pursuitCooldown = 60; // won't re-aggro for 60s
                bd._pursuitTime = 0;
            }
        } else if (bd._iceState === 'flying_aimless' && bd._iceTimer <= 0) {
            bd._iceState = 'returning';
        } else if (bd._iceState === 'returning') {
            const ndx = bd._nestX - bd.x, ndz = bd._nestZ - bd.z;
            if (Math.sqrt(ndx*ndx + ndz*ndz) < 5) {
                bd._iceState = isNight ? 'sleeping' : 'idle';
                bd._iceTimer = 15 + Math.random() * 20; // wait before next aimless flight
                bd.flying = false;
                bd.walking = false;
            }
        }

        // ── Eye open/close based on state (lerped) ──
        if (bd.eyes && bd.eyes.length) {
            const eyeOpenTarget = (bd._iceState === 'sleeping') ? 0.08 : 1.0;
            bd._iceEyeT = (bd._iceEyeT === undefined ? 1.0 : bd._iceEyeT);
            bd._iceEyeT += (eyeOpenTarget - bd._iceEyeT) * Math.min(1, 6 * dt);
            for (const eye of bd.eyes) eye.scale.y = bd._iceEyeT;
        }

        // ── State actions ──
        const gs = bd.growthScale;
        const gy = (this.getHeight ? this.getHeight(bd.x, bd.z) : 0);
        if (bd._iceState === 'sleeping') {
            // Stay at nest, low to ground, head down
            bd.x = bd._nestX;
            bd.z = bd._nestZ;
            bd.flying = false; bd.walking = false;
            bd.group.position.set(bd.x, gy + bd.footOffset, bd.z);
            bd._fireDirYaw = bd.angle;
            bd._fireDirPitch = 0.6; // head tucked down
            bd._breathingFire = false;
            // Force head pose without using breath aim path: just rotate head down softly
            if (bd.headGrp) bd.headGrp.rotation.x = 0.4;
        } else if (bd._iceState === 'idle') {
            bd.x = bd._nestX; bd.z = bd._nestZ;
            bd.flying = false; bd.walking = false;
            bd.group.position.set(bd.x, gy + bd.footOffset, bd.z);
            bd._breathingFire = false;
        } else if (bd._iceState === 'defending') {
            // Face player, breathe ice, walk toward
            bd.angle = Math.atan2(dx, dz);
            bd.group.rotation.y = bd.angle;
            const desired = 12;
            if (distXZ > desired) {
                const spd = Math.min(8 + gs * 4, distXZ * 1.5) * dt * this._speedMult(bd);
                bd.x += Math.sin(bd.angle) * spd;
                bd.z += Math.cos(bd.angle) * spd;
                bd.walking = true;
            } else {
                bd.walking = false;
            }
            bd.group.position.set(bd.x, gy + bd.footOffset, bd.z);
            // Breathe ice if within range
            if (distXZ < 25) {
                bd._breathingFire = true;
                const aimY = (player.position.y || 0) - (bd.group.position.y + 1.0 * gs);
                const aimHoriz = Math.sqrt(dx*dx + dz*dz) || 1;
                bd._fireDirYaw = Math.atan2(dx, dz);
                bd._fireDirPitch = -Math.atan2(aimY, aimHoriz);
                this._aimDragonHead(bd, true);
                this._getMouthWorld(bd, _afv);
                const mx = _afv.x, my = _afv.y, mz = _afv.z;
                const fdx = Math.sin(bd._fireDirYaw) * Math.cos(bd._fireDirPitch);
                const fdy = -Math.sin(bd._fireDirPitch);
                const fdz = Math.cos(bd._fireDirYaw) * Math.cos(bd._fireDirPitch);
                this._emitFire(mx, my, mz, fdx, fdy, fdz, 4, 1, 1);
                if (bd._fireBreathTimer <= 0) {
                    bd._fireBreathTimer = 0.4;
                    this._damageInFireCone(mx, my, mz, fdx, fdy, fdz, 3, 28, player, 1, bd);
                }
            } else {
                bd._breathingFire = false;
            }
        } else if (bd._iceState === 'flying_aimless') {
            // Wander purposefully — fly forward in current direction
            const speed = (18 + gs * 6) * this._speedMult(bd);
            bd._iceFlyAngle += (Math.random() - 0.5) * 0.4 * dt;
            bd.angle = bd._iceFlyAngle;
            bd.x += Math.sin(bd.angle) * speed * dt;
            bd.z += Math.cos(bd.angle) * speed * dt;
            // Stay within ~150 of nest
            const ndx = bd.x - bd._nestX, ndz = bd.z - bd._nestZ;
            if (ndx*ndx + ndz*ndz > 22500) {
                bd._iceFlyAngle = Math.atan2(bd._nestX - bd.x, bd._nestZ - bd.z);
                bd.angle = bd._iceFlyAngle;
            }
            bd.flying = true;
            bd.group.position.set(bd.x, bd.flyHeight, bd.z);
            bd.group.rotation.y = bd.angle;
            bd._breathingFire = false;
        } else if (bd._iceState === 'returning') {
            const ang = Math.atan2(bd._nestX - bd.x, bd._nestZ - bd.z);
            bd.angle = ang;
            bd.group.rotation.y = ang;
            const ndx = bd._nestX - bd.x, ndz = bd._nestZ - bd.z;
            const nDist = Math.sqrt(ndx*ndx + ndz*ndz);
            if (bd.flying) {
                const sp = 22 * dt;
                bd.x += (ndx / nDist) * sp;
                bd.z += (ndz / nDist) * sp;
                // Descend toward terrain as we get close
                const targetH = gy + (nDist > 10 ? 25 : 5);
                bd.flyHeight += (targetH - bd.flyHeight) * 2 * dt;
                if (nDist < 8 && bd.flyHeight < gy + 6) bd.flying = false;
                bd.group.position.set(bd.x, bd.flyHeight, bd.z);
            } else {
                const sp = (10 + gs * 4) * dt;
                bd.x += (ndx / nDist) * sp;
                bd.z += (ndz / nDist) * sp;
                bd.walking = true;
                bd.group.position.set(bd.x, gy + bd.footOffset, bd.z);
            }
            bd._breathingFire = false;
        }
    }

    // Speed multiplier by dragon breath type
    _speedMult(bd) {
        if (!bd) return 1.0;
        if (bd._lightningDragon || bd._isLightning || bd._lightningBreath) return 1.25;
        if (bd._iceDragon || bd._iceBreath) return 0.75;
        return 1.0;
    }

    _toCorpse(bd) {
        bd._isCorpse = true;
        bd.flying = false;
        bd.walking = false;
        bd._breathingFire = false;
        bd._biting = false;
        bd._dragonFalling = false;
        // Lay on ground — lower than standing footOffset since belly touches dirt
        const gy = this.getHeight ? this.getHeight(bd.x, bd.z) : 0;
        bd.group.position.set(bd.x, gy + bd.footOffset * 0.35, bd.z);
        bd.group.rotation.x = 0;
        bd.group.rotation.z = 0;
        // Sleeping-style drooped head + slack neck
        if (bd.neckGrp) bd.neckGrp.rotation.x = 0.5;
        if (bd.neckSegs) for (const s of bd.neckSegs) s.rotation.set(0.12, 0, 0);
        if (bd.headGrp) { bd.headGrp.rotation.x = 0.5; bd.headGrp.rotation.y = 0; bd.headGrp.rotation.z = 0; }
        // Mouth open (corpse detail)
        if (bd.jawGrp) bd.jawGrp.rotation.x = 0.65;
        // Eyes closed
        if (bd.eyes) for (const e of bd.eyes) e.scale.y = 0.08;
        // Tail limp, slight curl
        if (bd.tailSegs) for (let i = 0; i < bd.tailSegs.length; i++) {
            bd.tailSegs[i].rotation.set(0, 0.05 * (i % 2 === 0 ? 1 : -1), 0);
        }
        // Legs splayed outward
        if (bd.legs) {
            for (let i = 0; i < bd.legs.length; i++) {
                const leg = bd.legs[i];
                if (!leg || !leg.visible) continue;
                const side = (i % 2 === 0) ? -1 : 1;
                leg.rotation.set(0.2, 0, side * 0.35);
            }
        }
        // Wings folded flat against body
        if (bd.wings) {
            for (const w of bd.wings) {
                if (w._elbow) w._elbow.rotation.set(0, 0, 0);
                if (w._hand) w._hand.rotation.set(0, 0, 0);
                if (w.rotation) w.rotation.set(0, 0, 0);
            }
        }
        if (this.ridingRef === bd) {
            this.ridingDragon = false;
            this.ridingRef = null;
        }
    }

    _updateLightningDragon(dt, bd, player) {
        bd._lastHitTime = (bd._lastHitTime === undefined ? 1000 : bd._lastHitTime + dt);
        if (bd._lastHitTime > 10 && bd.hp < bd.maxHP) bd.hp = Math.min(bd.maxHP, bd.hp + bd.maxHP * 0.02 * dt);
        if (bd.hp <= 0) { bd.state = 'dead'; return; }
        const tod = (this._timeOfDay !== undefined) ? this._timeOfDay : 0.5;
        const isDay = tod >= 0.22 && tod <= 0.78;
        const px = player.position.x, pz = player.position.z;
        const dx = px - bd.x, dz = pz - bd.z;
        const distXZ = Math.sqrt(dx*dx + dz*dz);
        const sprinting = (player.sprintBlend || 0) > 0.5;
        if (!bd._ltState) bd._ltState = 'sleeping';
        if (!bd._ltTimer) bd._ltTimer = 0;
        bd._ltTimer -= dt;
        bd._fireBreathTimer = (bd._fireBreathTimer || 0) - dt;
        const gs = bd.growthScale;
        const gy = (this.getHeight ? this.getHeight(bd.x, bd.z) : 0);

        // Sleep during DAY, hunt during NIGHT. Sprint near during day wakes it.
        if (bd._ltState === 'sleeping') {
            if (!isDay || (sprinting && distXZ < 32)) {
                bd._ltState = 'circling';
                bd.flying = true;
                bd.flyHeight = gy + 30 + gs * 10;
                bd._ltCircleAngle = Math.random() * Math.PI * 2;
            }
        } else if (isDay && bd._ltState !== 'defending' && bd._ltState !== 'returning' && !(sprinting && distXZ < 50)) {
            bd._ltState = 'returning';
        } else if (bd._ltState === 'circling') {
            bd._pursuitCooldown = Math.max(0, (bd._pursuitCooldown || 0) - dt);
            if (distXZ < 45 && bd._pursuitCooldown <= 0 && !this._peacefulMode) {
                bd._ltState = 'defending';
                bd._pursuitTime = 0;
            }
        } else if (bd._ltState === 'defending') {
            bd._pursuitTime = (bd._pursuitTime || 0) + dt;
            if (distXZ > 70 || bd._pursuitTime > 30) {
                bd._ltState = 'circling';
                bd._pursuitCooldown = 60;
                bd._pursuitTime = 0;
            }
        } else if (bd._ltState === 'returning') {
            const ndx = bd._nestX - bd.x, ndz = bd._nestZ - bd.z;
            if (Math.sqrt(ndx*ndx + ndz*ndz) < 5 && !bd.flying) {
                bd._ltState = 'sleeping';
                bd.walking = false;
            }
        }

        // Eye open/close
        if (bd.eyes && bd.eyes.length) {
            const eyeOpenTarget = (bd._ltState === 'sleeping') ? 0.08 : 1.0;
            bd._ltEyeT = (bd._ltEyeT === undefined ? 0.08 : bd._ltEyeT);
            bd._ltEyeT += (eyeOpenTarget - bd._ltEyeT) * Math.min(1, 6 * dt);
            for (const eye of bd.eyes) eye.scale.y = bd._ltEyeT;
        }

        if (bd._ltState === 'sleeping') {
            bd.x = bd._nestX; bd.z = bd._nestZ;
            bd.flying = false; bd.walking = false;
            bd.group.position.set(bd.x, gy + bd.footOffset, bd.z);
            bd._breathingFire = false;
            if (bd.headGrp) bd.headGrp.rotation.x = 0.4;
        } else if (bd._ltState === 'circling') {
            // Circle the nest at altitude
            bd._ltCircleAngle += dt * 0.35;
            const radius = 28 + gs * 8;
            const targetX = bd._nestX + Math.cos(bd._ltCircleAngle) * radius;
            const targetZ = bd._nestZ + Math.sin(bd._ltCircleAngle) * radius;
            const speed = (20 + gs * 6) * this._speedMult(bd);
            const mvX = targetX - bd.x, mvZ = targetZ - bd.z;
            const mvD = Math.sqrt(mvX*mvX + mvZ*mvZ) || 1;
            bd.x += (mvX / mvD) * speed * dt;
            bd.z += (mvZ / mvD) * speed * dt;
            bd.angle = Math.atan2(mvX, mvZ);
            bd.flying = true;
            bd.flyHeight = gy + 30 + gs * 10;
            bd.group.position.set(bd.x, bd.flyHeight, bd.z);
            bd.group.rotation.y = bd.angle;
            bd._breathingFire = false;
        } else if (bd._ltState === 'defending') {
            // Dive-circle closer, breathe lightning
            bd._ltCircleAngle += dt * 0.6;
            const radius = 16 + gs * 4;
            const targetX = px + Math.cos(bd._ltCircleAngle) * radius;
            const targetZ = pz + Math.sin(bd._ltCircleAngle) * radius;
            const speed = (24 + gs * 6) * this._speedMult(bd);
            const mvX = targetX - bd.x, mvZ = targetZ - bd.z;
            const mvD = Math.sqrt(mvX*mvX + mvZ*mvZ) || 1;
            bd.x += (mvX / mvD) * speed * dt;
            bd.z += (mvZ / mvD) * speed * dt;
            bd.angle = Math.atan2(px - bd.x, pz - bd.z);
            bd.flying = true;
            bd.flyHeight = gy + 18 + gs * 6;
            bd.group.position.set(bd.x, bd.flyHeight, bd.z);
            bd.group.rotation.y = bd.angle;
            bd._breathingFire = true;
            const ddx = px - bd.x, ddz = pz - bd.z;
            const aimY = (player.position.y || 0) - bd.group.position.y;
            const aimHoriz = Math.sqrt(ddx*ddx + ddz*ddz) || 1;
            bd._fireDirYaw = Math.atan2(ddx, ddz);
            bd._fireDirPitch = -Math.atan2(aimY, aimHoriz);
            this._aimDragonHead(bd, true);
            this._getMouthWorld(bd, _afv);
            const mx = _afv.x, my = _afv.y, mz = _afv.z;
            const fdx = Math.sin(bd._fireDirYaw) * Math.cos(bd._fireDirPitch);
            const fdy = -Math.sin(bd._fireDirPitch);
            const fdz = Math.cos(bd._fireDirYaw) * Math.cos(bd._fireDirPitch);
            this._emitFire(mx, my, mz, fdx, fdy, fdz, 6, 1, 2);
            if (bd._fireBreathTimer <= 0) {
                bd._fireBreathTimer = 0.35;
                this._damageInFireCone(mx, my, mz, fdx, fdy, fdz, 8, 45, player, 2, bd);
            }
        } else if (bd._ltState === 'returning') {
            const ndx = bd._nestX - bd.x, ndz = bd._nestZ - bd.z;
            const nDist = Math.sqrt(ndx*ndx + ndz*ndz);
            bd.angle = Math.atan2(ndx, ndz);
            bd.group.rotation.y = bd.angle;
            if (nDist > 5) {
                const sp = 24 * dt;
                bd.x += (ndx / nDist) * sp;
                bd.z += (ndz / nDist) * sp;
                bd.flying = true;
                const targetH = gy + (nDist > 10 ? 25 : 6);
                bd.flyHeight += (targetH - bd.flyHeight) * 2 * dt;
                bd.group.position.set(bd.x, bd.flyHeight, bd.z);
                if (nDist < 6 && bd.flyHeight < gy + 6) bd.flying = false;
            } else {
                bd.flying = false;
                bd.x = bd._nestX; bd.z = bd._nestZ;
                bd.group.position.set(bd.x, gy + bd.footOffset, bd.z);
            }
            bd._breathingFire = false;
        }
    }

    // Aim head/neck so the snout points along bd._fireDirYaw / _fireDirPitch
    // The bend is distributed across all neck segments + head, producing a real curve
    _aimDragonHead(bd, snap) {
        if (bd._fireDirYaw === undefined || !bd.neckSegs || bd.neckSegs.length === 0) return;
        const bodyPitch = bd._flyTilt || 0;
        const baseNeckPitch = bd.neckGrp ? bd.neckGrp.rotation.x : 0;
        // Yaw relative to body, clamped to a sane range
        let yawRel = bd._fireDirYaw - bd.angle;
        while (yawRel > Math.PI) yawRel -= Math.PI * 2;
        while (yawRel < -Math.PI) yawRel += Math.PI * 2;
        yawRel = Math.max(-1.7, Math.min(1.7, yawRel));
        // Pitch — flipped sign so the bend matches the aim direction
        let pitchRel = bd._fireDirPitch - bodyPitch - baseNeckPitch;
        pitchRel = Math.max(-1.2, Math.min(1.2, pitchRel));
        if (snap) bd._neckBendT = 1;
        const bendT = bd._neckBendT || 0;
        const nSegs = bd.neckSegs.length;
        const segShare = 0.65 / nSegs;
        const segYaw = yawRel * segShare * bendT;
        const segPitch = pitchRel * segShare * bendT;
        for (const seg of bd.neckSegs) {
            seg.rotation.y = segYaw;
            seg.rotation.x = segPitch;
        }
        // Head finishes the rotation — yaw default is 0, pitch default already set by anim
        const headYawTarget = yawRel * 0.35;
        const headPitchTarget = pitchRel * 0.35;
        bd.headGrp.rotation.y = headYawTarget * bendT; // decays cleanly to 0
        bd.headGrp.rotation.x = bd.headGrp.rotation.x * (1 - bendT) + headPitchTarget * bendT;
        bd.headGrp.updateMatrixWorld(true);
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

    _makeDragon(x, z, terrainY, eggColor, wingColor, isWyvern, isLightning, isIce, hasTusks) {
        return makeBabyDragon(x, z, terrainY, eggColor, wingColor, isWyvern, isLightning, isIce, hasTusks);
    }

    // Emit fire particles from a position in a direction
    _spawnLightningBolt(ox, oy, oz, dx, dy, dz, length, forkChance) {
        const bolts = this._lightningBolts;
        if (!bolts) return;
        let slot = -1;
        for (let i = 0; i < bolts.length; i++) {
            if (!bolts[i].active) { slot = i; break; }
        }
        if (slot < 0) return;
        const b = bolts[slot];
        // Perpendicular basis
        let ux = -dz, uy = 0, uz = dx;
        const uLen = Math.sqrt(ux*ux + uz*uz) || 1;
        ux /= uLen; uz /= uLen;
        const vx = dy * uz - dz * uy;
        const vy = dz * ux - dx * uz;
        const vz = dx * uy - dy * ux;
        // Zig-zag from origin along direction with lateral noise
        const jitter = 0.9;
        for (let i = 0; i < LIGHTNING_BOLT_SEGS; i++) {
            const t = i / (LIGHTNING_BOLT_SEGS - 1);
            const baseX = ox + dx * length * t;
            const baseY = oy + dy * length * t;
            const baseZ = oz + dz * length * t;
            // Taper jitter toward endpoints (0 at start and end)
            const taper = Math.sin(t * Math.PI);
            const j1 = (Math.random() - 0.5) * 2 * jitter * taper;
            const j2 = (Math.random() - 0.5) * 2 * jitter * taper;
            const pi = i * 3;
            b.positions[pi]     = baseX + ux * j1 + vx * j2;
            b.positions[pi + 1] = baseY + uy * j1 + vy * j2;
            b.positions[pi + 2] = baseZ + uz * j1 + vz * j2;
        }
        b.line.geometry.attributes.position.needsUpdate = true;
        b.line.geometry.computeBoundingSphere();
        b.active = true;
        b.age = 0;
        b.life = 0.08 + Math.random() * 0.07;
        b.line.visible = true;
        b.line.material.opacity = 1.0;
        // Branch forks
        if (forkChance === undefined) forkChance = 0.6;
        if (Math.random() < forkChance) {
            // Fork from a midpoint with deflected direction
            const midT = 0.35 + Math.random() * 0.35;
            const mx = ox + dx * length * midT;
            const my = oy + dy * length * midT;
            const mz = oz + dz * length * midT;
            const defl = 0.7;
            const fdx = dx + ux * (Math.random() - 0.5) * defl + vx * (Math.random() - 0.5) * defl;
            const fdy = dy + uy * (Math.random() - 0.5) * defl + vy * (Math.random() - 0.5) * defl;
            const fdz = dz + uz * (Math.random() - 0.5) * defl + vz * (Math.random() - 0.5) * defl;
            const fLen = Math.sqrt(fdx*fdx + fdy*fdy + fdz*fdz) || 1;
            this._spawnLightningBolt(mx, my, mz, fdx / fLen, fdy / fLen, fdz / fLen, length * (0.3 + Math.random() * 0.3), 0);
        }
    }

    _updateLightningBolts(dt) {
        const bolts = this._lightningBolts;
        if (!bolts) return;
        for (let i = 0; i < bolts.length; i++) {
            const b = bolts[i];
            if (!b.active) continue;
            b.age += dt;
            const t = b.age / b.life;
            if (t >= 1) {
                b.active = false;
                b.line.visible = false;
                continue;
            }
            // Quick bright → fade
            b.line.material.opacity = (1 - t) * (0.6 + Math.random() * 0.4);
        }
    }

    _emitFire(ox, oy, oz, dx, dy, dz, count, longRange, iceMode, dragonVx, dragonVy, dragonVz) {
        const fp = this._fireParticles;
        const _len = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
        dx /= _len; dy /= _len; dz /= _len;
        // Lightning mode — thick, long, visible bolts + sparks
        if (iceMode === 2) {
            const boltLen = longRange ? (45 + Math.random() * 12) : (22 + Math.random() * 6);
            // Multi-strand thick core — 4 parallel bolts with slight lateral offset
            let ux = -dz, uy = 0, uz = dx;
            const uL = Math.sqrt(ux*ux + uz*uz) || 1;
            ux /= uL; uz /= uL;
            const vx = dy * uz - dz * uy;
            const vy = dz * ux - dx * uz;
            const vz = dx * uy - dy * ux;
            for (let k = 0; k < 4; k++) {
                const off = (Math.random() - 0.5) * 0.35;
                const off2 = (Math.random() - 0.5) * 0.35;
                const oxk = ox + ux * off + vx * off2;
                const oyk = oy + uy * off + vy * off2;
                const ozk = oz + uz * off + vz * off2;
                this._spawnLightningBolt(oxk, oyk, ozk, dx, dy, dz, boltLen * (0.9 + Math.random() * 0.2), 0.75);
            }
            // Extra forking branch
            if (Math.random() < 0.8) this._spawnLightningBolt(ox, oy, oz, dx, dy, dz, boltLen * (0.7 + Math.random() * 0.3), 0.4);
            count = Math.min(count, 4);
        }
        const dvx = dragonVx || 0, dvy = dragonVy || 0, dvz = dragonVz || 0;
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
            const isLightning = (iceMode === 2);
            const baseSpeed = longRange ? (32 + Math.random() * 8) : (18 + Math.random() * 6);
            const speed = isLightning ? baseSpeed * 1.7 : baseSpeed;
            const spread = isLightning ? 0.35 : (longRange ? 0.06 : 0.15);
            fp.vx[slot] = dx * speed + (Math.random() - 0.5) * spread * speed + dvx;
            fp.vy[slot] = dy * speed + (Math.random() - 0.5) * spread * speed + dvy;
            fp.vz[slot] = dz * speed + (Math.random() - 0.5) * spread * speed + dvz;
            fp.age[slot] = 0;
            fp.life[slot] = isLightning ? (0.35 + Math.random() * 0.25) : (longRange ? (1.6 + Math.random() * 0.6) : (0.7 + Math.random() * 0.4));
            fp.size[slot] = isLightning ? (0.3 + Math.random() * 0.35) : (0.6 + Math.random() * 0.5);
            fp.damping[slot] = isLightning ? 0.99 : (longRange ? 0.995 : 0.96);
            // Ice has slight DOWNWARD gravity (mist falls); fire has upward drift; lightning ~zero
            fp.gravity[slot] = isLightning ? 0.0 : (iceMode ? -1.5 : (longRange ? 0.5 : 4.0));
            fp.iceMode[slot] = iceMode | 0;
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
            // Slow down (per-particle damping)
            const damp = fp.damping[i] || 0.96;
            fp.vx[i] *= damp;
            fp.vy[i] *= damp;
            fp.vz[i] *= damp;
            // Slight upward drift (per-particle)
            fp.vy[i] += (fp.gravity[i] || 4.0) * dt;
            // Compute color (yellow → orange → red → smoke for fire; white → cyan → blue for ice)
            const t = fp.age[i] / fp.life[i];
            let r, g, b;
            if (fp.iceMode[i] === 2) {
                // Lightning: bright white → electric blue → violet
                if (t < 0.25) { r = 1.0; g = 1.0; b = 1.0; }
                else if (t < 0.65) { const u = (t - 0.25) / 0.4; r = 0.7 - u * 0.3; g = 0.9 - u * 0.5; b = 1.0; }
                else { const u = (t - 0.65) / 0.35; r = 0.4 + u * 0.2; g = 0.4 - u * 0.3; b = 1.0 - u * 0.2; }
            } else if (fp.iceMode[i]) {
                if (t < 0.3) { r = 0.85; g = 0.95; b = 1.0; }
                else if (t < 0.7) { r = 0.55 - (t - 0.3) * 0.3; g = 0.75 - (t - 0.3) * 0.2; b = 1.0; }
                else { const u = (t - 0.7) / 0.3; r = 0.4 - u * 0.2; g = 0.55 - u * 0.3; b = 0.95 - u * 0.3; }
            } else {
                if (t < 0.3) { r = 1.0; g = 0.85 - t * 0.5; b = 0.1; }
                else if (t < 0.7) { r = 1.0; g = 0.4 - (t - 0.3) * 0.6; b = 0.05; }
                else { const u = (t - 0.7) / 0.3; r = 0.5 - u * 0.3; g = 0.15 - u * 0.1; b = 0.1 - u * 0.05; }
            }
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

    // Damage creatures (and optionally the player) in a cone in front of a position
    _damageInFireCone(ox, oy, oz, dx, dy, dz, dmgPerTick, maxRange, hitPlayer, breathMode, srcDragon) {
        const _l = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
        dx /= _l; dy /= _l; dz /= _l;
        const range = maxRange || 12;
        if (this._creatureMgr) {
            for (const c of this._creatureMgr.creatures) {
                if (c.dead) continue;
                if (c._isBoss && (c._isColossus || c._isEmberLord || c._isNecromancer || c._isSWNecromancer)) continue;
                if (c.type === 'dragon' || c.type === 'babyDragon') continue;
                const cdx = c.x - ox, cdy = (c.group.position.y || 0) - oy, cdz = c.z - oz;
                const cd = Math.sqrt(cdx*cdx + cdy*cdy + cdz*cdz);
                if (cd > range || cd < 0.1) continue;
                const dot = (cdx * dx + cdy * dy + cdz * dz) / cd;
                if (dot < 0.85) continue;
                c.hp -= dmgPerTick;
                if (c.hp <= 0) { c.hp = 0; c.dead = true; c.deathTimer = 0; c.walking = false; c.speed = 0; }
            }
        }
        // Dragons can damage other dragons (respecting immunity/resistance)
        for (const other of this.dragons) {
            if (!other || other === srcDragon || other.state !== 'alive' || other._isCorpse) continue;
            const cdx = other.x - ox, cdy = (other.group.position.y || 0) - oy, cdz = other.z - oz;
            const cd = Math.sqrt(cdx*cdx + cdy*cdy + cdz*cdz);
            if (cd > range || cd < 0.1) continue;
            const dot = (cdx * dx + cdy * dy + cdz * dz) / cd;
            if (dot < 0.8) continue;
            this.damageDragon(other, dmgPerTick, 'breath', breathMode);
        }
        if (hitPlayer && typeof window !== 'undefined' && typeof window.playerTakeDamage === 'function') {
            const cdx = hitPlayer.position.x - ox;
            const cdy = (hitPlayer.position.y || 0) - oy;
            const cdz = hitPlayer.position.z - oz;
            const cd = Math.sqrt(cdx*cdx + cdy*cdy + cdz*cdz);
            if (cd > 0.1 && cd <= range) {
                const dot = (cdx * dx + cdy * dy + cdz * dz) / cd;
                if (dot >= 0.7) {
                    window.playerTakeDamage(dmgPerTick);
                }
            }
        }
    }

    // Damage a dragon — respects weapon tier (only steel+ from players) and breath immunity
    // breathMode: undefined = not breath; 0 = fire, 1 = ice, 2 = lightning
    damageDragon(bd, amount, source, breathMode) {
        if (!bd || bd.state !== 'alive' || bd._isCorpse) return false;
        if (breathMode === 0 || breathMode === 1 || breathMode === 2) {
            const isIceDragon = !!(bd._iceDragon || bd._iceBreath);
            const isLightningDragon = !!(bd._lightningDragon || bd._isLightning || bd._lightningBreath);
            const isFireDragon = !isIceDragon && !isLightningDragon;
            if (isFireDragon && breathMode === 0) return false;
            if (isIceDragon && breathMode === 1) return false;
            if (isLightningDragon) amount *= 0.4; // 60% resistant to all breath
        } else if (source === 'player_weapon') {
            const tier = (typeof window !== 'undefined' && window._playerWeaponTier) || 'wood';
            if (tier !== 'steel' && tier !== 'diamond' && tier !== 'dragonsteel') return false;
        }
        bd.hp = Math.max(0, bd.hp - amount);
        bd._lastHitTime = 0;
        if (bd.hp <= 0) bd.state = 'dead';
        return true;
    }

    _wakeFromSleep(bd) {
        if (!bd._sleeping) return;
        bd._sleeping = false;
        bd._sleepBlend = 0;
        if (bd.eyes) for (const eye of bd.eyes) eye.scale.y = 1;
        bd.headGrp.rotation.z = 0;
        bd.headGrp.rotation.order = 'XYZ';
        bd.headGrp.rotation.y = 0;
        bd.headGrp.rotation.x = 0;
        if (bd.neckGrp) { bd.neckGrp.rotation.x = 0; bd.neckGrp.rotation.y = 0; }
        if (bd.neckSegs) for (const seg of bd.neckSegs) { seg.rotation.x = 0; seg.rotation.y = 0; }
        bd._neckBendT = 0;
        bd._fireDirYaw = undefined;
        bd._fireDirPitch = undefined;
        for (const leg of bd.legs) leg.rotation.z = 0;
        for (const seg of bd.tailSegs) seg.rotation.x = 0;
    }

    getOwnedDragons() {
        return this.dragons.filter(d => d.state === 'alive' && !d._fortressGuardian && !d._stationary);
    }

    setFollowMode(bd, mode, playerX, playerZ, playerY) {
        if (!bd || bd._followMode === mode) return;
        bd._followMode = mode;
        if (mode === 'follow') {
            bd._followingPlayer = true;
            const dx = bd.x - playerX, dz = bd.z - playerZ;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const terrainY = this.getHeight(playerX, playerZ);
            const highOff = playerY !== undefined && (playerY - terrainY > 10);
            if (dist > 20 || highOff) {
                bd._flyingBack = true;
                if (!bd.flying) { bd.flying = true; bd.flyHeight = bd.group.position.y + 5; }
            }
        } else if (mode === 'stay') {
            bd._followingPlayer = false;
            bd.flying = false;
            bd.flyHeight = 0;
        } else {
            bd._followingPlayer = false;
            bd._wanderHomeX = bd.x; bd._wanderHomeZ = bd.z;
            bd._wanderTargetX = bd.x; bd._wanderTargetZ = bd.z;
            bd._wanderTimer = 0; bd._wanderGrabTimer = 30 + Math.random() * 60;
        }
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

    toggleFollow(bd, playerX, playerZ, playerY) {
        if (!bd) return 'follow';
        // Cycle: follow → stay → wander → follow
        const mode = bd._followMode || 'wander';
        if (mode === 'wander') {
            bd._followMode = 'follow';
            bd._followingPlayer = true;
            // Only fly back if dragon is far away or player is high off the ground
            const dx = bd.x - playerX, dz = bd.z - playerZ;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const terrainY = this.getHeight(playerX, playerZ);
            const highOff = playerY !== undefined && (playerY - terrainY > 10);
            if (dist > 20 || highOff) {
                bd._flyingBack = true;
                if (!bd.flying) {
                    bd.flying = true;
                    bd.flyHeight = bd.group.position.y + 5;
                }
            }
        } else if (mode === 'follow') {
            bd._followMode = 'stay';
            bd._followingPlayer = false;
        } else {
            bd._followMode = 'wander';
            bd._followingPlayer = false;
            bd._wanderHomeX = bd.x;
            bd._wanderHomeZ = bd.z;
            bd._wanderTargetX = bd.x;
            bd._wanderTargetZ = bd.z;
            bd._wanderTimer = 0;
            bd._wanderGrabTimer = 30 + Math.random() * 60;
        }
        return bd._followMode;
    }

    recallWandering(playerX, playerZ, playerY) {
        let count = 0;
        const terrainY = this.getHeight(playerX, playerZ);
        const highOff = playerY !== undefined && (playerY - terrainY > 10);
        for (const bd of this.dragons) {
            if (bd.state !== 'alive' || bd._fortressGuardian || bd._stationary) continue;
            if (bd._followMode !== 'wander') continue;
            bd._followMode = 'follow';
            bd._followingPlayer = true;
            const dx = bd.x - playerX, dz = bd.z - playerZ;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > 20 || highOff) {
                bd._flyingBack = true;
                if (!bd.flying) {
                    bd.flying = true;
                    bd.flyHeight = bd.group.position.y + 5;
                }
            }
            count++;
        }
        return count;
    }

    putOnShoulder(bd) {
        if (!bd) return false;
        // Only baby dragons (age < 1200)
        if (bd.age >= 9600) return false;
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
            if (bd.state !== 'alive' || bd.age < 7200 || bd._unrideable) continue;
            const dx = px - bd.x, dz = pz - bd.z;
            if (dx*dx + dz*dz < 6 * bd.growthScale + 4) return 'Press E to ride ' + bd.dragonName;
        }
        return null;
    }
}

