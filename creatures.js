// creatures.js — Sheep (exact model from game.html) with wandering AI

import { BLOCK_SIZE, CHUNK_SIZE } from './world.js';

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// Materials — exact colors from game.html
const woolMat = new THREE.MeshStandardMaterial({ color: 0xF0EAD6 });
const hoofMat = new THREE.MeshStandardMaterial({ color: 0x3A3A3A });
const noseMat = new THREE.MeshStandardMaterial({ color: 0xD4A08A });
const eyeMatS = new THREE.MeshStandardMaterial({ color: 0x222222 });

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
        walking: false,
    };
}

export class CreatureManager {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.sheep = [];
        this.spawnedChunks = new Set();
    }

    update(dt, playerX, playerZ) {
        // Spawn sheep in nearby chunks that haven't been populated yet
        const pcx = Math.floor(playerX / (CHUNK_SIZE * BLOCK_SIZE));
        const pcz = Math.floor(playerZ / (CHUNK_SIZE * BLOCK_SIZE));
        const spawnDist = 5;

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

        // Despawn far sheep
        for (let i = this.sheep.length - 1; i >= 0; i--) {
            const sh = this.sheep[i];
            const dx = sh.x - playerX, dz = sh.z - playerZ;
            if (dx * dx + dz * dz > 60 * 60) {
                this.scene.remove(sh.group);
                this.sheep.splice(i, 1);
            }
        }

        // Update AI + animation
        for (const sh of this.sheep) {
            const dx = sh.x - playerX, dz = sh.z - playerZ;
            const dist2 = dx * dx + dz * dz;
            // Skip AI for very far sheep
            if (dist2 > 40 * 40) continue;

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

        // Deterministic sheep placement — ~0-2 per chunk on grass
        for (let i = 0; i < 3; i++) {
            const hash = this.world._hash(cx * 100 + i * 7 + 9999, cz * 100 + i * 13 + 8888);
            if (hash > 0.15) continue; // ~15% chance per slot

            const sx = chunkWorldX + hash * chunkWorldSize * 3.7 % chunkWorldSize;
            const sz = chunkWorldZ + this.world._hash(cx + i * 31, cz + i * 47) * chunkWorldSize;

            // Check biome — only spawn on grass
            const biome = this.world._getBiome(sx, sz);
            if (biome !== 'grass') continue;
            const terrainY = this.world.getHeight(sx, sz);
            if (terrainY < 0.5 || terrainY > 35) continue;
            const sh = makeSheep(sx, sz, terrainY);
            this.scene.add(sh.group);
            this.sheep.push(sh);
        }
    }
}

