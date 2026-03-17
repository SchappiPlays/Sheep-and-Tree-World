// villages.js — Villages with block-built houses and villagers using player model

import { BLOCK_SIZE, BLOCK, WORLD_HEIGHT } from './world.js';

// Village definitions — deterministic positions on the main island
const VILLAGE_DEFS = [
    { x: 80, z: 16, houses: 5, name: 'Meadow Village' },
    { x: -100, z: -50, houses: 4, name: 'Forest Edge' },
    { x: 200, z: 60, houses: 6, name: 'Hillside Town' },
    { x: -200, z: 100, houses: 3, name: 'Western Hamlet' },
    { x: 50, z: -150, houses: 4, name: 'Northwatch' },
    { x: -150, z: 200, houses: 3, name: 'Southmoor' },
];

// House templates — defined as block offsets from base corner
// All coords are (dx, dy, dz) relative to house origin
function getHouseBlocks(seed, sizeIdx) {
    const blocks = [];
    // Player is 6 blocks tall — houses need ~10 block walls, doors 7 tall
    const sizes = [
        { w: 12, d: 10, wallH: 10, roofH: 4 }, // small cottage
        { w: 15, d: 12, wallH: 10, roofH: 5 }, // medium house
        { w: 18, d: 14, wallH: 12, roofH: 6 }, // large house
    ];
    const s = sizes[sizeIdx % 3];
    const wallMat = seed > 0.7 ? BLOCK.PLANKS : BLOCK.STONE;
    const floorMat = BLOCK.PLANKS;
    const roofMat = BLOCK.PLANKS;
    const foundationMat = BLOCK.STONE;

    // Foundation — fill deep underneath to handle any slope (20 blocks down)
    for (let x = -1; x <= s.w; x++)
        for (let z = -1; z <= s.d; z++)
            for (let fy = -20; fy <= 0; fy++)
                blocks.push({ x, y: fy, z, b: foundationMat });

    // Floor
    for (let x = 0; x < s.w; x++)
        for (let z = 0; z < s.d; z++)
            blocks.push({ x, y: 0, z, b: floorMat });

    // Walls
    const doorW = 3, doorH = 7; // door 3 wide, 7 tall (player is 6)
    const doorStart = Math.floor(s.w / 2) - 1;
    const winH1 = 4, winH2 = 7; // window from y=4 to y=7
    for (let y = 1; y <= s.wallH; y++) {
        for (let x = 0; x < s.w; x++) {
            for (let z = 0; z < s.d; z++) {
                const isEdge = x === 0 || x === s.w - 1 || z === 0 || z === s.d - 1;
                if (!isEdge) continue;
                // Door opening — front wall center
                const isDoor = z === 0 && x >= doorStart && x < doorStart + doorW && y <= doorH;
                // Windows — 2 wide, 3 tall, on side and back walls
                const isWindow = y >= winH1 && y <= winH2 && (
                    (x === 0 && z >= Math.floor(s.d / 2) - 1 && z <= Math.floor(s.d / 2) + 1) ||
                    (x === s.w - 1 && z >= Math.floor(s.d / 2) - 1 && z <= Math.floor(s.d / 2) + 1) ||
                    (z === s.d - 1 && x >= Math.floor(s.w / 2) - 1 && x <= Math.floor(s.w / 2) + 1)
                );
                if (isDoor || isWindow) continue;
                // Corner pillars are logs
                const isCorner = (x === 0 || x === s.w - 1) && (z === 0 || z === s.d - 1);
                blocks.push({ x, y, z, b: isCorner ? BLOCK.WOOD : wallMat });
            }
        }
    }

    // Roof — peaked along X axis with overhang
    for (let ry = 0; ry < s.roofH; ry++) {
        for (let x = ry - 1; x < s.w - ry + 1; x++) {
            for (let z = -2; z <= s.d + 1; z++) {
                blocks.push({ x, y: s.wallH + 1 + ry, z, b: roofMat });
            }
        }
    }
    // Roof peak cap
    const peakX = Math.floor(s.w / 2);
    for (let z = -2; z <= s.d + 1; z++) {
        blocks.push({ x: peakX, y: s.wallH + 1 + s.roofH, z, b: roofMat });
    }

    return blocks;
}

// Place village structures into world chunk data
export function placeVillageInChunk(world, cx, cz, chunkData) {
    const yOff = Math.floor(WORLD_HEIGHT / 2);
    const ox = cx * 16, oz = cz * 16; // chunk origin in block coords

    for (const vd of VILLAGE_DEFS) {
        // Convert village world coords to block coords
        const vbx = Math.floor(vd.x / BLOCK_SIZE);
        const vbz = Math.floor(vd.z / BLOCK_SIZE);

        // Check if any houses from this village fall in this chunk
        for (let hi = 0; hi < vd.houses; hi++) {
            // Deterministic house position around village center
            const angle = (hi / vd.houses) * Math.PI * 2 + vd.x * 0.01;
            const dist = 20 + (hi * 17) % 30; // blocks from center (wider spacing)
            const hx = vbx + Math.round(Math.cos(angle) * dist);
            const hz = vbz + Math.round(Math.sin(angle) * dist);

            // House footprint check — is any part in this chunk?
            const houseW = 22, houseD = 18; // max house extent with overhang
            if (hx + houseW < ox || hx - 2 > ox + 15) continue;
            if (hz + houseD < oz || hz - 2 > oz + 15) continue;

            // Seed for house variation
            const seed = world._hash(hx * 0.37, hz * 0.53);
            const sizeIdx = hi % 3;

            // Get smooth terrain height — sample corners and center without detail noise
            const sizeRef = [{ w: 12, d: 10 }, { w: 15, d: 12 }, { w: 18, d: 14 }][sizeIdx % 3];
            const pts = [
                [hx, hz], [hx + sizeRef.w, hz], [hx, hz + sizeRef.d], [hx + sizeRef.w, hz + sizeRef.d],
                [hx + Math.floor(sizeRef.w/2), hz + Math.floor(sizeRef.d/2)]
            ];
            let maxH = -Infinity;
            for (const [px, pz] of pts) {
                const th = world.getBaseHeightBlocks(px, pz);
                if (th > maxH) maxH = th;
            }
            const baseY = maxH + yOff;
            const houseBlocks = getHouseBlocks(seed, sizeIdx);

            // FIRST: Clear everything in the house area (terrain, trees, etc)
            const hs = [{ w: 12, d: 10, h: 10, rh: 4 }, { w: 15, d: 12, h: 10, rh: 5 }, { w: 18, d: 14, h: 12, rh: 6 }][sizeIdx % 3];
            const totalH = hs.h + hs.rh + 4; // walls + roof + clearance
            for (let ix = -3; ix < hs.w + 3; ix++) {
                for (let iz = -3; iz < hs.d + 3; iz++) {
                    for (let iy = 1; iy <= totalH; iy++) {
                        const bx = hx + ix, bz = hz + iz, by = baseY + iy;
                        const lx = bx - ox, lz = bz - oz;
                        if (lx < 0 || lx >= 16 || lz < 0 || lz >= 16) continue;
                        if (by < 0 || by >= WORLD_HEIGHT) continue;
                        chunkData[(by * 16 + lz) * 16 + lx] = BLOCK.AIR;
                    }
                }
            }

            // THEN: Place house blocks on top of the cleared area
            for (const hb of houseBlocks) {
                const bx = hx + hb.x;
                const bz = hz + hb.z;
                const by = baseY + hb.y;
                const lx = bx - ox, lz = bz - oz;
                if (lx < 0 || lx >= 16 || lz < 0 || lz >= 16) continue;
                if (by < 0 || by >= WORLD_HEIGHT) continue;
                chunkData[(by * 16 + lz) * 16 + lx] = hb.b;
            }
        }
    }
}

// Villager NPC — uses same model as player with different colors
function makeVillager(scene, x, z, terrainY, seed) {
    const g = new THREE.Group();

    // Random outfit colors based on seed
    const shirtColors = [0x8844aa, 0x44aa66, 0xaa6633, 0x3366aa, 0xaa3344, 0x66aa44, 0x884422, 0x446688];
    const pantsColors = [0x334455, 0x443322, 0x223344, 0x554433, 0x333344, 0x443344];
    const hairColors = [0x3B2507, 0x1a1008, 0x8B6B3D, 0x222222, 0xaa6633, 0x553320];

    const si = Math.floor(seed * 1000);
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xE8B49D });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColors[si % shirtColors.length] });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColors[si % pantsColors.length] });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x332211 });
    const hairMat = new THREE.MeshStandardMaterial({ color: hairColors[si % hairColors.length] });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

    // Exact same skeleton as player
    const hipHeight = 0.95;
    const body = new THREE.Group();
    body.position.y = hipHeight;
    g.add(body);

    const spine = new THREE.Group();
    body.add(spine);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.55, 0.22), shirtMat);
    torso.position.y = 0.3; torso.castShadow = true; spine.add(torso);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), skinMat);
    neck.position.y = 0.62; spine.add(neck);

    const headGroup = new THREE.Group();
    headGroup.position.y = 0.76; spine.add(headGroup);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.22), skinMat);
    head.castShadow = true; headGroup.add(head);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.24), hairMat);
    hair.position.y = 0.13; headGroup.add(hair);
    const lEye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), eyeMat);
    lEye.position.set(-0.06, 0.03, 0.11); headGroup.add(lEye);
    const rEye = lEye.clone(); rEye.position.x = 0.06; headGroup.add(rEye);

    // Arms
    function makeArm(sign) {
        const shoulder = new THREE.Group();
        shoulder.position.set(sign * 0.28, 0.5, 0); spine.add(shoulder);
        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.28, 0.10), shirtMat);
        upper.position.y = -0.14; shoulder.add(upper);
        const elbow = new THREE.Group();
        elbow.position.y = -0.28; shoulder.add(elbow);
        const fore = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.26, 0.085), skinMat);
        fore.position.y = -0.13; elbow.add(fore);
        return { shoulder, elbow };
    }
    const leftArm = makeArm(-1);
    const rightArm = makeArm(1);

    // Legs
    function makeLeg(sign) {
        const hip = new THREE.Group();
        hip.position.set(sign * 0.11, 0, 0); body.add(hip);
        const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.14), pantsMat);
        thigh.position.y = -0.21; hip.add(thigh);
        const knee = new THREE.Group();
        knee.position.y = -0.42; hip.add(knee);
        const shin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.40, 0.12), pantsMat);
        shin.position.y = -0.20; knee.add(shin);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.24), shoeMat);
        foot.position.set(0, -0.43, 0.04); knee.add(foot);
        return { hip, knee };
    }
    const leftLeg = makeLeg(-1);
    const rightLeg = makeLeg(1);

    g.position.set(x, terrainY, z);
    g.rotation.y = seed * Math.PI * 2;
    scene.add(g);

    return {
        group: g, body, spine, headGroup, leftArm, rightArm, leftLeg, rightLeg,
        x, z, angle: g.rotation.y, speed: 0,
        walkPhase: seed * Math.PI * 2,
        wanderTimer: 1 + seed * 3,
        walking: false,
        homeX: x, homeZ: z, // stays near home
        idleTimer: 0,
    };
}

export class VillageManager {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.villagers = [];
        this.spawnedVillages = new Set();
    }

    update(dt, playerX, playerZ) {
        // Spawn villagers for nearby villages
        for (const vd of VILLAGE_DEFS) {
            const dx = vd.x - playerX, dz = vd.z - playerZ;
            if (dx * dx + dz * dz > 50 * 50) continue;
            const key = vd.x + ',' + vd.z;
            if (this.spawnedVillages.has(key)) continue;
            this.spawnedVillages.add(key);

            // Spawn 3-5 villagers per village
            const count = 3 + Math.floor(this.world._hash(vd.x + 777, vd.z + 888) * 3);
            for (let i = 0; i < count; i++) {
                const seed = this.world._hash(vd.x + i * 31, vd.z + i * 47);
                const angle = seed * Math.PI * 2;
                const dist = 2 + seed * 8;
                const vx = vd.x + Math.cos(angle) * dist;
                const vz = vd.z + Math.sin(angle) * dist;
                const vy = this.world.getHeight(vx, vz);
                const v = makeVillager(this.scene, vx, vz, vy, seed);
                this.villagers.push(v);
            }
        }

        // Despawn far villagers
        for (let i = this.villagers.length - 1; i >= 0; i--) {
            const v = this.villagers[i];
            const dx = v.x - playerX, dz = v.z - playerZ;
            if (dx * dx + dz * dz > 80 * 80) {
                this.scene.remove(v.group);
                this.villagers.splice(i, 1);
                // Allow re-spawn
                for (const vd of VILLAGE_DEFS) {
                    const vdx = vd.x - v.homeX, vdz = vd.z - v.homeZ;
                    if (vdx * vdx + vdz * vdz < 30 * 30) {
                        this.spawnedVillages.delete(vd.x + ',' + vd.z);
                    }
                }
            }
        }

        // Update villager AI and animation
        for (const v of this.villagers) {
            const dx = v.x - playerX, dz = v.z - playerZ;
            if (dx * dx + dz * dz > 40 * 40) continue;

            // Wander AI — stay near home
            v.wanderTimer -= dt;
            if (v.wanderTimer <= 0) {
                if (!v.walking) {
                    v.walking = true;
                    // Walk toward home if too far
                    const hdx = v.homeX - v.x, hdz = v.homeZ - v.z;
                    const homeDist = Math.sqrt(hdx * hdx + hdz * hdz);
                    if (homeDist > 10) {
                        v.angle = Math.atan2(hdx, hdz) + (Math.random() - 0.5) * 0.5;
                    } else {
                        v.angle += (Math.random() - 0.5) * 2.2;
                    }
                    v.wanderTimer = 2 + Math.random() * 4;
                } else {
                    v.walking = false;
                    v.wanderTimer = 1.5 + Math.random() * 3;
                }
            }

            // Movement
            const tgtSpd = v.walking ? 1.2 : 0;
            v.speed += (tgtSpd - v.speed) * 4 * dt;

            let da = v.angle - v.group.rotation.y;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            v.group.rotation.y += da * 3 * dt;

            if (v.speed > 0.01) {
                v.x += Math.sin(v.group.rotation.y) * v.speed * dt;
                v.z += Math.cos(v.group.rotation.y) * v.speed * dt;
            }

            const terrainY = this.world.getHeight(v.x, v.z);
            v.group.position.set(v.x, terrainY, v.z);

            // Walk animation — same as player
            const wb = Math.min(1, v.speed / 0.5);
            if (wb > 0.01) v.walkPhase += v.speed * dt * 4.2;
            const p = v.walkPhase;

            // Body bob
            v.body.position.y = 0.95 + Math.cos(p * 2) * 0.025 * wb;

            // Legs
            const legSwing = Math.sin(p) * 0.5 * wb;
            v.leftLeg.hip.rotation.x = legSwing;
            v.rightLeg.hip.rotation.x = -legSwing;
            v.leftLeg.knee.rotation.x = Math.max(0, -Math.sin(p)) * 0.7 * wb;
            v.rightLeg.knee.rotation.x = Math.max(0, Math.sin(p)) * 0.7 * wb;

            // Arms counter-swing
            v.leftArm.shoulder.rotation.x = -legSwing * 0.7;
            v.rightArm.shoulder.rotation.x = legSwing * 0.7;
            v.leftArm.elbow.rotation.x = wb * (-0.15 - Math.max(0, Math.sin(p)) * 0.3);
            v.rightArm.elbow.rotation.x = wb * (-0.15 - Math.max(0, -Math.sin(p)) * 0.3);

            // Spine lean
            v.spine.rotation.x = 0.04 * wb;

            // Head
            v.headGroup.rotation.x = -v.spine.rotation.x * 0.45;

            // Idle head look
            if (!v.walking) {
                v.idleTimer += dt;
                v.headGroup.rotation.y += (Math.sin(v.idleTimer * 0.5) * 0.3 - v.headGroup.rotation.y) * 2 * dt;
            } else {
                v.headGroup.rotation.y *= 0.9;
            }
        }
    }
}
