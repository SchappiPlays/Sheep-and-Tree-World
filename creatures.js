// creatures.js — Sheep (exact model from game.html) with wandering AI

import { BLOCK_SIZE, CHUNK_SIZE } from './world.js';

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// Materials — exact colors from game.html
const woolMat = new THREE.MeshStandardMaterial({ color: 0xF0EAD6 });
const hoofMat = new THREE.MeshStandardMaterial({ color: 0x3A3A3A });
const noseMat = new THREE.MeshStandardMaterial({ color: 0xD4A08A });
const eyeMatS = new THREE.MeshStandardMaterial({ color: 0x222222 });
// Cow materials
const cowBodyMat = new THREE.MeshStandardMaterial({ color: 0x8B5E3C });
const cowSpotMat = new THREE.MeshStandardMaterial({ color: 0xF5F0E0 });
const cowNoseMat = new THREE.MeshStandardMaterial({ color: 0xD4A08A });
// Pig materials
const pigBodyMat = new THREE.MeshStandardMaterial({ color: 0xE8A0A0 });
const pigNoseMat = new THREE.MeshStandardMaterial({ color: 0xD4807A });

// Shared geometries
const bodyGeo  = new THREE.BoxGeometry(0.45, 0.38, 0.7);
const headGeo  = new THREE.BoxGeometry(0.2, 0.2, 0.24);
const noseGeo  = new THREE.BoxGeometry(0.12, 0.1, 0.06);
const eyeGeo   = new THREE.SphereGeometry(0.025, 6, 6);
const earGeo   = new THREE.BoxGeometry(0.07, 0.04, 0.12);
const legGeo   = new THREE.BoxGeometry(0.08, 0.3, 0.08);
const tailGeo  = new THREE.SphereGeometry(0.07, 6, 6);

function makeSheep(x, z, terrainY) {
    const g = new THREE.Group();

    // Body
    const bodyMesh = new THREE.Mesh(bodyGeo, woolMat);
    bodyMesh.position.y = 0.48;
    bodyMesh.castShadow = true;
    g.add(bodyMesh);

    // Head pivot
    const headGrp = new THREE.Group();
    headGrp.position.set(0, 0.5, 0.38);
    g.add(headGrp);

    const headMesh = new THREE.Mesh(headGeo, woolMat);
    headGrp.add(headMesh);

    // Nose
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, -0.04, 0.13);
    headGrp.add(nose);

    // Eyes
    const lEye = new THREE.Mesh(eyeGeo, eyeMatS);
    lEye.position.set(-0.08, 0.03, 0.1);
    headGrp.add(lEye);
    const rEye = new THREE.Mesh(eyeGeo, eyeMatS);
    rEye.position.set(0.08, 0.03, 0.1);
    headGrp.add(rEye);

    // Ears
    const lEar = new THREE.Mesh(earGeo, noseMat);
    lEar.position.set(-0.14, 0.04, -0.02);
    lEar.rotation.z = -0.3;
    headGrp.add(lEar);
    const rEar = new THREE.Mesh(earGeo, noseMat);
    rEar.position.set(0.14, 0.04, -0.02);
    rEar.rotation.z = 0.3;
    headGrp.add(rEar);

    // Legs — 4 hip pivots at body corners
    const legs = [];
    const legPos = [
        [-0.15, 0.3, 0.22],
        [ 0.15, 0.3, 0.22],
        [-0.15, 0.3, -0.22],
        [ 0.15, 0.3, -0.22],
    ];
    for (const [lx, ly, lz] of legPos) {
        const hip = new THREE.Group();
        hip.position.set(lx, ly, lz);
        g.add(hip);
        const legMesh = new THREE.Mesh(legGeo, hoofMat);
        legMesh.position.y = -0.15;
        hip.add(legMesh);
        legs.push(hip);
    }

    // Tail
    const tail = new THREE.Mesh(tailGeo, woolMat);
    tail.position.set(0, 0.52, -0.38);
    g.add(tail);

    g.position.set(x, terrainY, z);
    g.rotation.y = Math.random() * Math.PI * 2;

    return {
        group: g, legs, headGrp,
        x, z,
        angle: g.rotation.y,
        speed: 0,
        walkPhase: Math.random() * Math.PI * 2,
        wanderTimer: Math.random() * 3 + 1,
        idleHeadTimer: 0,
        idleHeadTarget: 0,
        walking: false, type: 'sheep',
        hp: 8, maxHP: 8, dead: false,
    };
}

function makeCow(x, z, terrainY) {
    const g = new THREE.Group();
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 1.0), cowBodyMat);
    bodyMesh.position.y = 0.65; bodyMesh.castShadow = true; g.add(bodyMesh);
    // Spots
    const spot1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.3), cowSpotMat);
    spot1.position.set(-0.18, 0.75, 0.1); g.add(spot1);
    const spot2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.25), cowSpotMat);
    spot2.position.set(0.15, 0.6, -0.2); g.add(spot2);
    // Head
    const headGrp = new THREE.Group();
    headGrp.position.set(0, 0.7, 0.55); g.add(headGrp);
    headGrp.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.3), cowBodyMat));
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.1), cowNoseMat);
    muzzle.position.set(0, -0.06, 0.18); headGrp.add(muzzle);
    const eyeGeo = new THREE.SphereGeometry(0.03, 6, 6);
    const lEye = new THREE.Mesh(eyeGeo, eyeMatS); lEye.position.set(-0.12, 0.04, 0.13); headGrp.add(lEye);
    const rEye = new THREE.Mesh(eyeGeo, eyeMatS); rEye.position.set(0.12, 0.04, 0.13); headGrp.add(rEye);
    // Horns
    const hornMat = new THREE.MeshStandardMaterial({ color: 0xCCBB99 });
    const hornGeo = new THREE.ConeGeometry(0.025, 0.14, 5);
    const lH = new THREE.Mesh(hornGeo, hornMat); lH.position.set(-0.12, 0.16, 0.02); lH.rotation.z = 0.5; headGrp.add(lH);
    const rH = new THREE.Mesh(hornGeo, hornMat); rH.position.set(0.12, 0.16, 0.02); rH.rotation.z = -0.5; headGrp.add(rH);
    // Ears
    const earGeo = new THREE.BoxGeometry(0.1, 0.04, 0.08);
    const lEar = new THREE.Mesh(earGeo, cowBodyMat); lEar.position.set(-0.18, 0.06, 0); lEar.rotation.z = -0.4; headGrp.add(lEar);
    const rEar = new THREE.Mesh(earGeo, cowBodyMat); rEar.position.set(0.18, 0.06, 0); rEar.rotation.z = 0.4; headGrp.add(rEar);
    // Legs
    const legs = [];
    for (const [lx, ly, lz] of [[-0.2,0.4,0.35],[0.2,0.4,0.35],[-0.2,0.4,-0.35],[0.2,0.4,-0.35]]) {
        const hip = new THREE.Group(); hip.position.set(lx, ly, lz); g.add(hip);
        const legM = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), cowBodyMat); legM.position.y = -0.2; hip.add(legM);
        const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.12), hoofMat); hoof.position.set(0, -0.42, 0.01); hip.add(hoof);
        legs.push(hip);
    }
    // Tail
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.04), cowBodyMat);
    tail.position.set(0, 0.55, -0.52); tail.rotation.x = 0.3; g.add(tail);
    const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), cowBodyMat);
    tailTip.position.set(0, 0.4, -0.56); g.add(tailTip);

    g.position.set(x, terrainY, z);
    g.rotation.y = Math.random() * Math.PI * 2;
    return {
        group: g, legs, headGrp, x, z, angle: g.rotation.y, speed: 0,
        walkPhase: Math.random() * Math.PI * 2, wanderTimer: Math.random() * 3 + 1,
        idleHeadTimer: 0, idleHeadTarget: 0, walking: false, type: 'cow',
        hp: 10, maxHP: 10, dead: false,
    };
}

function makePig(x, z, terrainY) {
    const g = new THREE.Group();
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.32, 0.55), pigBodyMat);
    bodyMesh.position.y = 0.38; bodyMesh.castShadow = true; g.add(bodyMesh);
    // Head
    const headGrp = new THREE.Group();
    headGrp.position.set(0, 0.38, 0.3); g.add(headGrp);
    headGrp.add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.22), pigBodyMat));
    // Snout
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.06, 8), pigNoseMat);
    snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.02, 0.13); headGrp.add(snout);
    // Nostrils
    const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x993333 });
    const nostrilGeo = new THREE.SphereGeometry(0.015, 4, 4);
    const lN = new THREE.Mesh(nostrilGeo, nostrilMat); lN.position.set(-0.025, -0.02, 0.16); headGrp.add(lN);
    const rN = new THREE.Mesh(nostrilGeo, nostrilMat); rN.position.set(0.025, -0.02, 0.16); headGrp.add(rN);
    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.02, 6, 6);
    const lEye = new THREE.Mesh(eyeGeo, eyeMatS); lEye.position.set(-0.09, 0.04, 0.08); headGrp.add(lEye);
    const rEye = new THREE.Mesh(eyeGeo, eyeMatS); rEye.position.set(0.09, 0.04, 0.08); headGrp.add(rEye);
    // Ears
    const earGeo = new THREE.BoxGeometry(0.1, 0.06, 0.08);
    const lEar = new THREE.Mesh(earGeo, pigBodyMat); lEar.position.set(-0.12, 0.1, 0.04); lEar.rotation.set(-0.3, 0, -0.6); headGrp.add(lEar);
    const rEar = new THREE.Mesh(earGeo, pigBodyMat); rEar.position.set(0.12, 0.1, 0.04); rEar.rotation.set(-0.3, 0, 0.6); headGrp.add(rEar);
    // Legs
    const legs = [];
    for (const [lx, ly, lz] of [[-0.13,0.22,0.18],[0.13,0.22,0.18],[-0.13,0.22,-0.18],[0.13,0.22,-0.18]]) {
        const hip = new THREE.Group(); hip.position.set(lx, ly, lz); g.add(hip);
        const legM = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), pigBodyMat); legM.position.y = -0.11; hip.add(legM);
        const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.09), hoofMat); hoof.position.set(0, -0.24, 0.01); hip.add(hoof);
        legs.push(hip);
    }
    // Curly tail
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.015, 6, 8, Math.PI * 1.5), pigBodyMat);
    tail.position.set(0, 0.4, -0.3); tail.rotation.y = Math.PI / 2; g.add(tail);

    g.position.set(x, terrainY, z);
    g.rotation.y = Math.random() * Math.PI * 2;
    return {
        group: g, legs, headGrp, x, z, angle: g.rotation.y, speed: 0,
        walkPhase: Math.random() * Math.PI * 2, wanderTimer: Math.random() * 3 + 1,
        idleHeadTimer: 0, idleHeadTarget: 0, walking: false, type: 'pig',
        hp: 10, maxHP: 10, dead: false,
    };
}

// ── Enemy materials ──
const goblinSkinMat = new THREE.MeshStandardMaterial({ color: 0x4a6a2a });
const goblinEyeMat = new THREE.MeshStandardMaterial({ color: 0xcc2200, emissive: 0x661100, emissiveIntensity: 0.3 });
const goblinClothMat = new THREE.MeshStandardMaterial({ color: 0x3a3022 });
const skelBoneMat = new THREE.MeshStandardMaterial({ color: 0xd8d0c0 });
const skelEyeMat = new THREE.MeshStandardMaterial({ color: 0x44ff44, emissive: 0x22aa22, emissiveIntensity: 0.5 });

function makeGoblin(x, z, terrainY) {
    const g = new THREE.Group();
    // Body — short and hunched
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.18), goblinClothMat);
    body.position.y = 0.55; g.add(body);
    // Head — big for body
    const headGrp = new THREE.Group();
    headGrp.position.set(0, 0.78, 0); g.add(headGrp);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.2), goblinSkinMat);
    headGrp.add(head);
    // Pointy ears
    const earGeo = new THREE.ConeGeometry(0.04, 0.12, 4);
    const lEar = new THREE.Mesh(earGeo, goblinSkinMat); lEar.position.set(-0.14, 0.02, 0); lEar.rotation.z = Math.PI/2 + 0.3; headGrp.add(lEar);
    const rEar = new THREE.Mesh(earGeo, goblinSkinMat); rEar.position.set(0.14, 0.02, 0); rEar.rotation.z = -(Math.PI/2 + 0.3); headGrp.add(rEar);
    // Red eyes
    const eyeG = new THREE.SphereGeometry(0.025, 6, 6);
    const lEye = new THREE.Mesh(eyeG, goblinEyeMat); lEye.position.set(-0.06, 0.02, 0.1); headGrp.add(lEye);
    const rEye = new THREE.Mesh(eyeG, goblinEyeMat); rEye.position.set(0.06, 0.02, 0.1); headGrp.add(rEye);
    // Nose — pointy
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 4), goblinSkinMat);
    nose.position.set(0, -0.02, 0.12); nose.rotation.x = -Math.PI/2; headGrp.add(nose);
    // Arms
    const armGeo = new THREE.BoxGeometry(0.07, 0.25, 0.07);
    const lArm = new THREE.Mesh(armGeo, goblinSkinMat); lArm.position.set(-0.2, 0.48, 0); g.add(lArm);
    const rArm = new THREE.Mesh(armGeo, goblinSkinMat); rArm.position.set(0.2, 0.48, 0); g.add(rArm);
    // Weapon — small club in right hand
    const club = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.04), new THREE.MeshStandardMaterial({ color: 0x5c3a1e }));
    club.position.set(0.2, 0.32, 0.08); g.add(club);
    // Legs
    const legs = [];
    const legGeo = new THREE.BoxGeometry(0.08, 0.2, 0.08);
    for (const lx of [-0.08, 0.08]) {
        const hip = new THREE.Group(); hip.position.set(lx, 0.38, 0); g.add(hip);
        const leg = new THREE.Mesh(legGeo, goblinClothMat); leg.position.y = -0.1; hip.add(leg);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.12), goblinSkinMat); foot.position.set(0, -0.22, 0.02); hip.add(foot);
        legs.push(hip);
    }
    g.position.set(x, terrainY, z);
    g.rotation.y = Math.random() * Math.PI * 2;
    return {
        group: g, legs, headGrp, x, z, angle: g.rotation.y, speed: 0,
        walkPhase: Math.random() * Math.PI * 2, wanderTimer: Math.random() * 3,
        idleHeadTimer: 0, idleHeadTarget: 0, walking: false,
        type: 'goblin', hostile: true, aggroRange: 8, attackRange: 1.2, attackDmg: 3, attackCD: 1.2, attackTimer: 0,
        hp: 15, maxHP: 15, dead: false, chaseSpeed: 1.8,
    };
}

function makeSkeleton(x, z, terrainY) {
    const g = new THREE.Group();
    // Ribcage body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.35, 0.14), skelBoneMat);
    body.position.y = 0.7; g.add(body);
    // Spine detail
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.06), skelBoneMat);
    spine.position.set(0, 0.7, -0.06); g.add(spine);
    // Head — skull
    const headGrp = new THREE.Group();
    headGrp.position.set(0, 1.0, 0); g.add(headGrp);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), skelBoneMat);
    headGrp.add(skull);
    // Jaw
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.14), skelBoneMat);
    jaw.position.set(0, -0.1, 0.02); headGrp.add(jaw);
    // Glowing eyes
    const eyeG = new THREE.SphereGeometry(0.03, 6, 6);
    const lEye = new THREE.Mesh(eyeG, skelEyeMat); lEye.position.set(-0.05, 0.02, 0.1); headGrp.add(lEye);
    const rEye = new THREE.Mesh(eyeG, skelEyeMat); rEye.position.set(0.05, 0.02, 0.1); headGrp.add(rEye);
    // Arms — bony
    const armGeo = new THREE.BoxGeometry(0.05, 0.3, 0.05);
    const lArm = new THREE.Mesh(armGeo, skelBoneMat); lArm.position.set(-0.17, 0.6, 0); g.add(lArm);
    const rArm = new THREE.Mesh(armGeo, skelBoneMat); rArm.position.set(0.17, 0.6, 0); g.add(rArm);
    // Legs — bony
    const legs = [];
    const legGeo = new THREE.BoxGeometry(0.05, 0.35, 0.05);
    for (const lx of [-0.07, 0.07]) {
        const hip = new THREE.Group(); hip.position.set(lx, 0.5, 0); g.add(hip);
        const leg = new THREE.Mesh(legGeo, skelBoneMat); leg.position.y = -0.175; hip.add(leg);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.12), skelBoneMat); foot.position.set(0, -0.37, 0.03); hip.add(foot);
        legs.push(hip);
    }
    g.position.set(x, terrainY, z);
    g.rotation.y = Math.random() * Math.PI * 2;
    return {
        group: g, legs, headGrp, x, z, angle: g.rotation.y, speed: 0,
        walkPhase: Math.random() * Math.PI * 2, wanderTimer: Math.random() * 3,
        idleHeadTimer: 0, idleHeadTarget: 0, walking: false,
        type: 'skeleton', hostile: true, aggroRange: 12, attackRange: 1.5, attackDmg: 4, attackCD: 1.5, attackTimer: 0,
        hp: 12, maxHP: 12, dead: false, chaseSpeed: 2.2,
    };
}

export class CreatureManager {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.creatures = [];
        this.sheep = this.creatures;
        this.spawnedChunks = new Set();
        this.skipAI = false;
        this._nextId = 0;
    }

    update(dt, playerX, playerZ) {
        // Spawn sheep in nearby chunks that haven't been populated yet
        const pcx = Math.floor(playerX / (CHUNK_SIZE * BLOCK_SIZE));
        const pcz = Math.floor(playerZ / (CHUNK_SIZE * BLOCK_SIZE));
        const spawnDist = 4;

        for (let dx = -spawnDist; dx <= spawnDist; dx++) {
            for (let dz = -spawnDist; dz <= spawnDist; dz++) {
                if (dx * dx + dz * dz > spawnDist * spawnDist) continue;
                const cx = pcx + dx, cz = pcz + dz;
                const key = cx + ',' + cz;
                if (this.spawnedChunks.has(key)) continue;
                this.spawnedChunks.add(key);
                this._spawnInChunk(cx, cz);
            }
        }

        // Despawn far creatures (but never bosses)
        for (let i = this.creatures.length - 1; i >= 0; i--) {
            const sh = this.creatures[i];
            if (sh._isBoss) continue;
            const dx = sh.x - playerX, dz = sh.z - playerZ;
            if (dx * dx + dz * dz > 30 * 30) {
                this.scene.remove(sh.group);
                this.creatures.splice(i, 1);
            }
        }

        // Update AI + animation
        for (const sh of this.creatures) {
            // Dead creature — just stay fallen
            if (sh.dead) {
                sh.deathTimer = (sh.deathTimer || 0) + dt;
                if (sh.group.rotation.z < Math.PI / 2) {
                    sh.group.rotation.z += dt * 4;
                    if (sh.group.rotation.z > Math.PI / 2) sh.group.rotation.z = Math.PI / 2;
                }
                if (sh.deathTimer > 10) sh.group.visible = false;
                continue;
            }

            // Client in multiplayer — just update visual position from synced data, skip AI
            if (this.skipAI) {
                sh.group.position.set(sh.x, this.world.getHeight(sh.x, sh.z), sh.z);
                // Still animate legs
                const wb = clamp01(sh.speed / 0.25);
                if (sh.walking) { sh.speed += (0.55 - sh.speed) * 4 * dt; } else { sh.speed *= 0.9; }
                if (wb > 0.01) sh.walkPhase += sh.speed * dt * 8;
                const wp = sh.walkPhase;
                const legSwAmp = 0.35 * wb;
                for (let li = 0; li < sh.legs.length; li++)
                    sh.legs[li].rotation.x = ((li % 2 === 0) ? 1 : -1) * Math.sin(wp) * legSwAmp;
                if (sh.walking) { sh.headGrp.rotation.x = Math.sin(wp * 2) * 0.06 * wb; }
                continue;
            }

            const dx = sh.x - playerX, dz = sh.z - playerZ;
            const dist2 = dx * dx + dz * dz;
            if (dist2 > 25 * 25) continue;

            // ── Hostile AI — chase and attack player ──
            if (sh.hostile) {
                const dist = Math.sqrt(dist2);
                sh.attackTimer = Math.max(0, (sh.attackTimer || 0) - dt);

                if (dist < sh.aggroRange) {
                    // Boss pause — back off after attacking
                    if (sh._isBoss && sh._pauseTimer > 0) {
                        sh._pauseTimer -= dt;
                        sh.walking = false;
                        sh.speed *= 0.9;
                    } else {
                    // Chase player
                    sh.angle = Math.atan2(-dx, -dz);
                    sh.walking = true;
                    const tgtSpd = dist > sh.attackRange ? sh.chaseSpeed : 0;
                    sh.speed += (tgtSpd - sh.speed) * 5 * dt;

                    // Attack when in range
                    if (dist < sh.attackRange && sh.attackTimer <= 0) {
                        sh.attackTimer = sh.attackCD;
                        if (this._onPlayerHit) this._onPlayerHit(sh.attackDmg, sh.type, sh.x, sh.z);
                        // Boss pauses after hitting
                        if (sh._isBoss) sh._pauseTimer = 1.0 + Math.random() * 1.0;
                    }
                    }
                } else {
                    // Wander when not aggro'd
                    sh.wanderTimer -= dt;
                    if (sh.wanderTimer <= 0) {
                        sh.walking = !sh.walking;
                        if (sh.walking) sh.angle += (Math.random() - 0.5) * 2.2;
                        sh.wanderTimer = 1.5 + Math.random() * 3;
                    }
                    sh.speed += ((sh.walking ? 0.5 : 0) - sh.speed) * 4 * dt;
                }

                // Rotation smoothing
                let da = sh.angle - sh.group.rotation.y;
                while (da > Math.PI) da -= Math.PI * 2;
                while (da < -Math.PI) da += Math.PI * 2;
                sh.group.rotation.y += da * (sh._turnSpeed || 5) * dt;

                // Movement
                if (sh.speed > 0.01) {
                    sh.x += Math.sin(sh.group.rotation.y) * sh.speed * dt;
                    sh.z += Math.cos(sh.group.rotation.y) * sh.speed * dt;
                }

                // Terrain + animation
                const terrainY = this.world.getHeight(sh.x, sh.z);
                sh.group.position.set(sh.x, terrainY, sh.z);
                const wb = clamp01(sh.speed / 0.5);
                if (wb > 0.01) sh.walkPhase += sh.speed * dt * 10;
                const wp = sh.walkPhase;
                for (let li = 0; li < sh.legs.length; li++)
                    sh.legs[li].rotation.x = ((li % 2 === 0) ? 1 : -1) * Math.sin(wp) * 0.5 * wb;
                sh.headGrp.rotation.x = sh.walking ? Math.sin(wp * 2) * 0.08 * wb : 0;
                continue;
            }

            // ── Wandering AI — exact from game.html ──
            sh.wanderTimer -= dt;
            if (sh.wanderTimer <= 0) {
                if (!sh.walking) {
                    sh.walking = true;
                    sh.angle += (Math.random() - 0.5) * 2.2;
                    sh.wanderTimer = 2 + Math.random() * 5;
                } else {
                    sh.walking = false;
                    sh.wanderTimer = 1.5 + Math.random() * 4;
                    sh.idleHeadTarget = (Math.random() - 0.5) * 0.8;
                }
            }

            // Speed
            const baseSpd = 0.55;
            const tgtSpd = sh.walking ? baseSpd : 0;
            sh.speed += (tgtSpd - sh.speed) * 4 * dt;

            // Rotation smoothing
            let da = sh.angle - sh.group.rotation.y;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            sh.group.rotation.y += da * 3 * dt;

            // Movement
            if (sh.speed > 0.01) {
                sh.x += Math.sin(sh.group.rotation.y) * sh.speed * dt;
                sh.z += Math.cos(sh.group.rotation.y) * sh.speed * dt;
            }

            // Terrain following
            const terrainY = this.world.getHeight(sh.x, sh.z);
            sh.group.position.x = sh.x;
            sh.group.position.z = sh.z;
            sh.group.position.y = terrainY;

            // ── Animation — exact from game.html ──
            const wb = clamp01(sh.speed / 0.25);
            if (wb > 0.01) sh.walkPhase += sh.speed * dt * 8;
            const wp = sh.walkPhase;
            const legSwAmp = 0.35 * wb;

            // 4-leg walk: alternating pairs
            for (let li = 0; li < sh.legs.length; li++) {
                sh.legs[li].rotation.x = ((li % 2 === 0) ? 1 : -1) * Math.sin(wp) * legSwAmp;
            }

            // Head animation
            if (sh.walking) {
                sh.headGrp.rotation.x = Math.sin(wp * 2) * 0.06 * wb;
                sh.headGrp.rotation.y *= 0.9;
            } else {
                sh.idleHeadTimer += dt;
                const ht = sh.idleHeadTarget;
                sh.headGrp.rotation.y += (ht - sh.headGrp.rotation.y) * 2 * dt;
                const graze = Math.sin(sh.idleHeadTimer * 1.2) * 0.15;
                sh.headGrp.rotation.x += (graze - sh.headGrp.rotation.x) * 3 * dt;
            }
        }
    }

    _spawnInChunk(cx, cz) {
        const chunkWorldX = cx * CHUNK_SIZE * BLOCK_SIZE;
        const chunkWorldZ = cz * CHUNK_SIZE * BLOCK_SIZE;
        const chunkWorldSize = CHUNK_SIZE * BLOCK_SIZE;

        // Deterministic creature placement — ~1 per 3-4 chunks
        for (let i = 0; i < 2; i++) {
            const hash = this.world._hash(cx * 100 + i * 7 + 9999, cz * 100 + i * 13 + 8888);
            if (hash > 0.12) continue;

            const sx = chunkWorldX + hash * chunkWorldSize * 3.7 % chunkWorldSize;
            const sz = chunkWorldZ + this.world._hash(cx + i * 31, cz + i * 47) * chunkWorldSize;

            const biome = this.world._getBiome(sx, sz);
            const terrainY = this.world.getHeight(sx, sz);
            if (terrainY < 0.5 || terrainY > 80) continue;
            // Skip desert (no creatures there)
            if (biome === 'desert') continue;

            // Pick creature type based on biome
            const typeHash = this.world._hash(cx + i * 73 + 5555, cz + i * 97 + 6666);
            let creature;
            if (biome === 'mountain' || biome === 'scorched') {
                // Hostile territory — goblins
                if (typeHash < 0.5) {
                    creature = makeGoblin(sx, sz, terrainY);
                } else {
                    continue; // sparser spawns in hostile areas
                }
            } else if (biome === 'snow' || biome === 'snow_transition') {
                // Frozen lands — skeletons and occasional animals
                if (typeHash < 0.6) {
                    creature = makeSkeleton(sx, sz, terrainY);
                } else if (typeHash < 0.75) {
                    creature = makeSheep(sx, sz, terrainY);
                } else {
                    continue;
                }
            } else {
                // Peaceful grasslands
                if (typeHash < 0.45) {
                    creature = makeSheep(sx, sz, terrainY);
                } else if (typeHash < 0.75) {
                    creature = makeCow(sx, sz, terrainY);
                } else {
                    creature = makePig(sx, sz, terrainY);
                }
            }
            creature.cid = this._nextId++;
            this.scene.add(creature.group);
            this.creatures.push(creature);
        }
    }

    // Hit creatures near a point with damage
    attackAt(wx, wz, facingAngle, damage, range) {
        const sinA = Math.sin(facingAngle), cosA = Math.cos(facingAngle);
        for (const sh of this.creatures) {
            if (sh.dead) continue;
            const dx = sh.x - wx, dz = sh.z - wz;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > range || dist < 0.1) continue;
            // Check facing — creature must be roughly in front
            const dot = (dx * sinA + dz * cosA) / dist;
            if (dot < 0.2) continue;
            if (sh._mineOnly) continue; // can only be damaged by mining
            sh.hp -= damage;
            // Knockback
            sh.x += (dx / dist) * 0.5;
            sh.z += (dz / dist) * 0.5;
            if (sh.hp <= 0) {
                sh.hp = 0;
                sh.dead = true;
                sh.deathTimer = 0;
                sh.walking = false;
                sh.speed = 0;
                // Boss death
                if (sh._isBoss) {
                    if (sh._isDarkKnight && this._onDarkKnightDeath) this._onDarkKnightDeath(sh);
                    else if (sh._isHobgoblin && this._onHobgoblinDeath) this._onHobgoblinDeath(sh);
                    else if (sh._isGateBoss && this._onGateBossDeath) this._onGateBossDeath(sh);
                    else if (this._onBossDeath) this._onBossDeath(sh);
                }
                // Enemy drops
                if (this._onCreatureDrop) {
                    if (sh.type === 'goblin') {
                        this._onCreatureDrop('stick', 1 + Math.floor(Math.random() * 3));
                        if (Math.random() < 0.3) this._onCreatureDrop('iron_bar', 1);
                    } else if (sh.type === 'skeleton') {
                        this._onCreatureDrop('bone', 1 + Math.floor(Math.random() * 2));
                        if (Math.random() < 0.4) this._onCreatureDrop('stick', 2);
                    }
                }
            }
        }
    }
}

