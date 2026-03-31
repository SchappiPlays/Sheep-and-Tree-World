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
// ── Western Castle ──
const CASTLE = { wx: -400, wz: 20 }; // world coords

function getCastleBlocks() {
    const blocks = [];
    const S = BLOCK.STONE, P = BLOCK.PLANKS, W = BLOCK.WOOD;
    // Castle dimensions in blocks
    const wallW = 60, wallD = 50, wallH = 18, crenH = 2;
    const towerR = 5, towerH = 26;
    const keepW = 24, keepD = 20, keepH = 28;
    const gateW = 6, gateH = 12;

    // ── Foundation (flatten ground) ──
    for (let x = -3; x <= wallW + 3; x++)
        for (let z = -3; z <= wallD + 3; z++)
            for (let fy = -25; fy <= 0; fy++)
                blocks.push({ x, y: fy, z, b: S });

    // ── Outer walls ──
    for (let y = 1; y <= wallH; y++) {
        for (let x = 0; x <= wallW; x++) {
            // Front and back walls
            blocks.push({ x, y, z: 0, b: S });
            blocks.push({ x, y, z: wallD, b: S });
        }
        for (let z = 0; z <= wallD; z++) {
            // Left and right walls
            blocks.push({ x: 0, y, z, b: S });
            blocks.push({ x: wallW, y, z, b: S });
        }
    }

    // ── Crenellations on walls ──
    for (let x = 0; x <= wallW; x += 2) {
        for (let cy = 1; cy <= crenH; cy++) {
            blocks.push({ x, y: wallH + cy, z: 0, b: S });
            blocks.push({ x, y: wallH + cy, z: wallD, b: S });
        }
    }
    for (let z = 0; z <= wallD; z += 2) {
        for (let cy = 1; cy <= crenH; cy++) {
            blocks.push({ x: 0, y: wallH + cy, z, b: S });
            blocks.push({ x: wallW, y: wallH + cy, z, b: S });
        }
    }

    // ── Gate (front wall center) ──
    const gateStart = Math.floor(wallW / 2) - Math.floor(gateW / 2);
    // Gate is already open because we just don't place wall blocks there
    // Add gate frame pillars
    for (let y = 1; y <= gateH + 2; y++) {
        blocks.push({ x: gateStart - 1, y, z: 0, b: W });
        blocks.push({ x: gateStart + gateW, y, z: 0, b: W });
    }
    // Gate arch
    for (let x = gateStart; x < gateStart + gateW; x++) {
        blocks.push({ x, y: gateH + 1, z: 0, b: S });
        blocks.push({ x, y: gateH + 2, z: 0, b: S });
    }
    // Remove wall blocks where gate opening is
    // (we'll handle this by not placing them — done by checking in wall loop)

    // ── 4 Corner towers ──
    const towerCenters = [
        [0, 0], [wallW, 0], [0, wallD], [wallW, wallD]
    ];
    for (const [tcx, tcz] of towerCenters) {
        for (let y = 1; y <= towerH; y++) {
            for (let dx = -towerR; dx <= towerR; dx++) {
                for (let dz = -towerR; dz <= towerR; dz++) {
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    if (dist <= towerR && dist > towerR - 1.5) {
                        blocks.push({ x: tcx + dx, y, z: tcz + dz, b: S });
                    }
                }
            }
        }
        // Tower top crenellations
        for (let dx = -towerR; dx <= towerR; dx++) {
            for (let dz = -towerR; dz <= towerR; dz++) {
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist <= towerR) {
                    blocks.push({ x: tcx + dx, y: towerH, z: tcz + dz, b: S });
                    if ((dx + dz) % 2 === 0 && dist > towerR - 2) {
                        blocks.push({ x: tcx + dx, y: towerH + 1, z: tcz + dz, b: S });
                    }
                }
            }
        }
    }

    // ── Courtyard floor ──
    for (let x = 1; x < wallW; x++)
        for (let z = 1; z < wallD; z++)
            blocks.push({ x, y: 0, z, b: S });

    // ── Central Keep ──
    const kx = Math.floor(wallW / 2) - Math.floor(keepW / 2);
    const kz = Math.floor(wallD / 2) - Math.floor(keepD / 2) + 5;
    // Keep walls
    for (let y = 1; y <= keepH; y++) {
        for (let x = kx; x <= kx + keepW; x++) {
            blocks.push({ x, y, z: kz, b: S });
            blocks.push({ x, y, z: kz + keepD, b: S });
        }
        for (let z = kz; z <= kz + keepD; z++) {
            blocks.push({ x: kx, y, z, b: S });
            blocks.push({ x: kx + keepW, y, z, b: S });
        }
        // Internal dividing walls for rooms — 2 floors
        if (y <= 12) {
            // Ground floor: 3 rooms side by side
            for (let z = kz; z <= kz + keepD; z++) {
                blocks.push({ x: kx + 8, y, z, b: S });
                blocks.push({ x: kx + 16, y, z, b: S });
            }
        }
    }

    // Keep floor between levels (y=13)
    for (let x = kx + 1; x < kx + keepW; x++)
        for (let z = kz + 1; z < kz + keepD; z++)
            blocks.push({ x, y: 13, z, b: P });

    // Keep roof
    for (let x = kx; x <= kx + keepW; x++)
        for (let z = kz; z <= kz + keepD; z++)
            blocks.push({ x, y: keepH + 1, z, b: S });
    // Keep crenellations
    for (let x = kx; x <= kx + keepW; x += 2) {
        blocks.push({ x, y: keepH + 2, z: kz, b: S });
        blocks.push({ x, y: keepH + 2, z: kz + keepD, b: S });
    }
    for (let z = kz; z <= kz + keepD; z += 2) {
        blocks.push({ x: kx, y: keepH + 2, z, b: S });
        blocks.push({ x: kx + keepW, y: keepH + 2, z, b: S });
    }

    // ── Keep doors (ground floor) ──
    // Front entrance to keep
    const keepDoor = Math.floor(keepW / 2) + kx;
    // Doors are gaps — remove wall blocks at door positions
    // We handle by not placing them — mark for removal after

    // ── Room features ──
    // Ground floor left room: Throne room
    // Throne (stone platform at back)
    for (let dx = 0; dx < 4; dx++)
        for (let dz = 0; dz < 3; dz++) {
            blocks.push({ x: kx + 2 + dx, y: 1, z: kz + keepD - 3 + dz, b: S });
            blocks.push({ x: kx + 2 + dx, y: 2, z: kz + keepD - 3 + dz, b: P });
        }
    // Throne chair
    blocks.push({ x: kx + 4, y: 3, z: kz + keepD - 2, b: P });
    blocks.push({ x: kx + 4, y: 4, z: kz + keepD - 2, b: P });

    // Ground floor middle room: Great hall
    // Long table
    for (let dz = 2; dz < keepD - 2; dz++) {
        blocks.push({ x: kx + 12, y: 1, z: kz + dz, b: W });
    }

    // Ground floor right room: Armory
    // Weapon racks (wood along walls)
    for (let y2 = 1; y2 <= 3; y2++) {
        blocks.push({ x: kx + keepW - 2, y: y2, z: kz + 2, b: W });
        blocks.push({ x: kx + keepW - 2, y: y2, z: kz + 5, b: W });
        blocks.push({ x: kx + keepW - 2, y: y2, z: kz + 8, b: W });
    }

    // Upper floor: open hall with pillars
    for (let px = 0; px < 3; px++) {
        for (let pz = 0; pz < 2; pz++) {
            const pillarX = kx + 5 + px * 7;
            const pillarZ = kz + 5 + pz * 10;
            for (let y = 14; y <= keepH; y++) {
                blocks.push({ x: pillarX, y, z: pillarZ, b: S });
            }
        }
    }

    // ── Staircase in keep (connects ground to upper floor) ──
    for (let step = 0; step < 13; step++) {
        const sx = kx + 1 + step;
        blocks.push({ x: sx, y: 1 + step, z: kz + 1, b: S });
        blocks.push({ x: sx, y: 1 + step, z: kz + 2, b: S });
    }

    // ── Courtyard buildings ──
    // Barracks (left side)
    const bx = 3, bz2 = 3;
    for (let y = 1; y <= 8; y++) {
        for (let x = bx; x <= bx + 12; x++) {
            blocks.push({ x, y, z: bz2, b: S });
            blocks.push({ x, y, z: bz2 + 8, b: S });
        }
        for (let z = bz2; z <= bz2 + 8; z++) {
            blocks.push({ x: bx, y, z, b: S });
            blocks.push({ x: bx + 12, y, z, b: S });
        }
    }
    // Barracks roof
    for (let x = bx; x <= bx + 12; x++)
        for (let z = bz2; z <= bz2 + 8; z++)
            blocks.push({ x, y: 9, z, b: P });

    // Stable (right side)
    const stx = wallW - 15, stz = 3;
    for (let y = 1; y <= 6; y++) {
        for (let x = stx; x <= stx + 12; x++) {
            blocks.push({ x, y, z: stz, b: W });
            blocks.push({ x, y, z: stz + 8, b: W });
        }
        for (let z = stz; z <= stz + 8; z++) {
            blocks.push({ x: stx, y, z, b: W });
            blocks.push({ x: stx + 12, y, z, b: W });
        }
    }
    // Stable roof
    for (let x = stx; x <= stx + 12; x++)
        for (let z = stz; z <= stz + 8; z++)
            blocks.push({ x, y: 7, z, b: P });

    // ── Well in courtyard ──
    const wellX = Math.floor(wallW / 2), wellZ = 10;
    for (let y = 1; y <= 3; y++) {
        blocks.push({ x: wellX - 1, y, z: wellZ - 1, b: S });
        blocks.push({ x: wellX + 1, y, z: wellZ - 1, b: S });
        blocks.push({ x: wellX - 1, y, z: wellZ + 1, b: S });
        blocks.push({ x: wellX + 1, y, z: wellZ + 1, b: S });
    }

    // ── Wall walkway (inner ledge along wall top) ──
    for (let x = 1; x < wallW; x++) {
        blocks.push({ x, y: wallH - 1, z: 1, b: S });
        blocks.push({ x, y: wallH - 1, z: wallD - 1, b: S });
    }
    for (let z = 1; z < wallD; z++) {
        blocks.push({ x: 1, y: wallH - 1, z, b: S });
        blocks.push({ x: wallW - 1, y: wallH - 1, z, b: S });
    }

    // Now remove gate opening blocks
    for (let y = 1; y <= gateH; y++) {
        for (let x = gateStart; x < gateStart + gateW; x++) {
            // Mark these positions to be cleared
            blocks.push({ x, y, z: 0, b: BLOCK.AIR });
        }
    }
    // Keep doors
    for (let y = 1; y <= 8; y++) {
        blocks.push({ x: keepDoor, y, z: kz, b: BLOCK.AIR });
        blocks.push({ x: keepDoor + 1, y, z: kz, b: BLOCK.AIR });
        blocks.push({ x: keepDoor + 2, y, z: kz, b: BLOCK.AIR });
    }
    // Barracks door
    for (let y = 1; y <= 7; y++) {
        blocks.push({ x: bx + 6, y, z: bz2, b: BLOCK.AIR });
        blocks.push({ x: bx + 7, y, z: bz2, b: BLOCK.AIR });
    }
    // Stable door
    for (let y = 1; y <= 5; y++) {
        blocks.push({ x: stx + 6, y, z: stz, b: BLOCK.AIR });
        blocks.push({ x: stx + 7, y, z: stz, b: BLOCK.AIR });
    }
    // Keep internal doors (gaps in dividing walls)
    for (let y = 1; y <= 7; y++) {
        blocks.push({ x: kx + 8, y, z: kz + Math.floor(keepD / 2), b: BLOCK.AIR });
        blocks.push({ x: kx + 8, y, z: kz + Math.floor(keepD / 2) + 1, b: BLOCK.AIR });
        blocks.push({ x: kx + 16, y, z: kz + Math.floor(keepD / 2), b: BLOCK.AIR });
        blocks.push({ x: kx + 16, y, z: kz + Math.floor(keepD / 2) + 1, b: BLOCK.AIR });
    }
    // Windows in keep walls
    for (let room = 0; room < 3; room++) {
        const wx2 = kx + 4 + room * 8;
        for (let wy = 4; wy <= 6; wy++) {
            blocks.push({ x: wx2, y: wy, z: kz, b: BLOCK.AIR });
            blocks.push({ x: wx2, y: wy, z: kz + keepD, b: BLOCK.AIR });
        }
        for (let wy = 16; wy <= 18; wy++) {
            blocks.push({ x: wx2, y: wy, z: kz, b: BLOCK.AIR });
            blocks.push({ x: wx2, y: wy, z: kz + keepD, b: BLOCK.AIR });
        }
    }
    // Windows in outer walls
    for (let wx2 = 8; wx2 < wallW; wx2 += 10) {
        for (let wy = 10; wy <= 12; wy++) {
            blocks.push({ x: wx2, y: wy, z: 0, b: BLOCK.AIR });
            blocks.push({ x: wx2, y: wy, z: wallD, b: BLOCK.AIR });
        }
    }

    return blocks;
}

export function placeVillageInChunk(world, cx, cz, chunkData) {
    const yOff = 128; // must match hardcoded yOff in world.js/chunks.js
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

    // ── Western Castle ──
    const cbx = Math.floor(CASTLE.wx / BLOCK_SIZE);
    const cbz = Math.floor(CASTLE.wz / BLOCK_SIZE);
    // Check if castle overlaps this chunk (castle is ~60x50 blocks)
    if (cbx + 70 >= ox && cbx - 10 <= ox + 15 && cbz + 60 >= oz && cbz - 10 <= oz + 15) {
        // Get base height
        const castleBaseY = world.getBaseHeightBlocks(cbx + 30, cbz + 25) + yOff;
        // Get or generate castle blocks (cache for performance)
        if (!world._castleBlocks) world._castleBlocks = getCastleBlocks();
        const castleBlocks = world._castleBlocks;

        // Clear area first
        for (let ix = -5; ix < 65; ix++) {
            for (let iz = -5; iz < 55; iz++) {
                for (let iy = 1; iy <= 35; iy++) {
                    const bx2 = cbx + ix, bz2 = cbz + iz, by2 = castleBaseY + iy;
                    const lx2 = bx2 - ox, lz2 = bz2 - oz;
                    if (lx2 < 0 || lx2 >= 16 || lz2 < 0 || lz2 >= 16) continue;
                    if (by2 < 0 || by2 >= WORLD_HEIGHT) continue;
                    chunkData[(by2 * 16 + lz2) * 16 + lx2] = BLOCK.AIR;
                }
            }
        }

        // Place castle blocks
        for (const hb of castleBlocks) {
            const bx2 = cbx + hb.x;
            const bz2 = cbz + hb.z;
            const by2 = castleBaseY + hb.y;
            const lx2 = bx2 - ox, lz2 = bz2 - oz;
            if (lx2 < 0 || lx2 >= 16 || lz2 < 0 || lz2 >= 16) continue;
            if (by2 < 0 || by2 >= WORLD_HEIGHT) continue;
            chunkData[(by2 * 16 + lz2) * 16 + lx2] = hb.b;
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

            // Spawn blacksmith shopkeeper (fixed position near village)
            const bsAngle = this.world._hash(vd.x + 555, vd.z + 666) * Math.PI * 2;
            const bsX = vd.x + Math.cos(bsAngle) * 6;
            const bsZ = vd.z + Math.sin(bsAngle) * 6;
            const bsY = this.world.getHeight(bsX, bsZ);
            const bsV = makeVillager(this.scene, bsX, bsZ, bsY, 0.8);
            bsV._shopType = 'blacksmith';
            bsV._stayHome = true; // don't wander
            bsV.homeX = bsX; bsV.homeZ = bsZ;
            // Make blacksmith visually distinct — dark apron
            bsV._shirtMat.color.setHex(0x3a2a1a);
            this.villagers.push(bsV);

            // Add blacksmith label
            const bsCanvas = document.createElement('canvas');
            bsCanvas.width = 128; bsCanvas.height = 32;
            const bsCtx = bsCanvas.getContext('2d');
            bsCtx.fillStyle = '#ccaa66'; bsCtx.font = 'bold 14px monospace'; bsCtx.textAlign = 'center';
            bsCtx.fillText('Blacksmith', 64, 20);
            const bsTex = new THREE.CanvasTexture(bsCanvas);
            const bsLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: bsTex, transparent: true, depthWrite: false }));
            bsLabel.position.y = 2.2; bsLabel.scale.set(1.0, 0.25, 1);
            bsV.group.add(bsLabel);

            // Spawn magic shop keeper
            const msAngle = bsAngle + Math.PI; // opposite side of village
            const msX = vd.x + Math.cos(msAngle) * 6;
            const msZ = vd.z + Math.sin(msAngle) * 6;
            const msY = this.world.getHeight(msX, msZ);
            const msV = makeVillager(this.scene, msX, msZ, msY, 0.3);
            msV._shopType = 'magic';
            msV._stayHome = true;
            msV.homeX = msX; msV.homeZ = msZ;
            // Make magic shop visually distinct — purple robes
            msV._shirtMat.color.setHex(0x5522aa);
            this.villagers.push(msV);

            // Add magic shop label
            const msCanvas = document.createElement('canvas');
            msCanvas.width = 128; msCanvas.height = 32;
            const msCtx = msCanvas.getContext('2d');
            msCtx.fillStyle = '#aa88ff'; msCtx.font = 'bold 14px monospace'; msCtx.textAlign = 'center';
            msCtx.fillText('Magic Shop', 64, 20);
            const msTex = new THREE.CanvasTexture(msCanvas);
            const msLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: msTex, transparent: true, depthWrite: false }));
            msLabel.position.y = 2.2; msLabel.scale.set(1.0, 0.25, 1);
            msV.group.add(msLabel);

            // Spawn armor shopkeeper
            const asAngle = bsAngle + Math.PI * 0.5; // 90 degrees from blacksmith
            const asX = vd.x + Math.cos(asAngle) * 7;
            const asZ = vd.z + Math.sin(asAngle) * 7;
            const asY = this.world.getHeight(asX, asZ);
            const asV = makeVillager(this.scene, asX, asZ, asY, 0.55);
            asV._shopType = 'armor';
            asV._stayHome = true;
            asV.homeX = asX; asV.homeZ = asZ;
            // Red/brown leather look
            asV._shirtMat.color.setHex(0x8b4513);
            this.villagers.push(asV);

            const asCanvas = document.createElement('canvas');
            asCanvas.width = 128; asCanvas.height = 32;
            const asCtx = asCanvas.getContext('2d');
            asCtx.fillStyle = '#cc9966'; asCtx.font = 'bold 14px monospace'; asCtx.textAlign = 'center';
            asCtx.fillText('Armour Shop', 64, 20);
            const asTex = new THREE.CanvasTexture(asCanvas);
            const asLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: asTex, transparent: true, depthWrite: false }));
            asLabel.position.y = 2.2; asLabel.scale.set(1.0, 0.25, 1);
            asV.group.add(asLabel);
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

            // Shop keepers stay put
            if (v._stayHome) {
                v.walking = false; v.speed = 0;
                v.x = v.homeX; v.z = v.homeZ;
                v.group.position.set(v.x, this.world.getHeight(v.x, v.z), v.z);
                continue;
            }

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
