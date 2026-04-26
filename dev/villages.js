// villages.js — Villages with block-built houses and villagers using player model

import { BLOCK_SIZE, BLOCK, WORLD_HEIGHT, isOnPath } from './world.js';

// Village definitions — deterministic positions on the main island
// Skill levels: 1=Apprentice, 2=Novice, 3=Journeyman, 4=Skilled, 5=Expert, 6=Master, 7=Veteran, 8=Grandmaster, 9=Legendary
const VILLAGE_DEFS = [
    { x: 160, z: 32, houses: 5, name: 'Meadow Village', smiths: [1] },
    { x: -200, z: -100, houses: 4, name: 'Forest Edge', smiths: [3] },
    { x: 400, z: 120, houses: 6, name: 'Hillside Town', smiths: [5, 5, 2] },
    { x: -400, z: 200, houses: 3, name: 'Western Hamlet', smiths: [4] },
    { x: 100, z: -300, houses: 4, name: 'Northwatch', smiths: [6] },
    { x: -300, z: 400, houses: 3, name: 'Southmoor', smiths: [2] },
    { x: 200, z: 1100, houses: 5, name: 'Desert Crossing', biome: 'desert', smiths: [9, 6, 6] },
    { x: -240, z: 1240, houses: 4, name: 'Sunstone', biome: 'desert', smiths: [8, 5] },
    { x: 500, z: 1360, houses: 3, name: 'Dune\'s End', biome: 'desert', smiths: [7] },
    { x: 2040, z: 60, houses: 8, name: 'Farwatch', smiths: [2, 1] },
    { x: -2100, z: -120, houses: 5, name: 'Bay Watch', smiths: [4, 2] },
    { x: -2150, z: 200, houses: 4, name: 'Tidecrest', smiths: [3] },
    { x: 80, z: -1200, houses: 4, name: 'Frostpine', biome: 'taiga', smiths: [6, 4] },
];
const SMITH_SKILL_NAMES = { 1:'Apprentice', 2:'Novice', 3:'Journeyman', 4:'Skilled', 5:'Expert', 6:'Master', 7:'Veteran', 8:'Grandmaster', 9:'Legendary' };

// House templates — defined as block offsets from base corner
// All coords are (dx, dy, dz) relative to house origin
function getHouseBlocks(seed, sizeIdx, biome) {
    const blocks = [];
    // Player is 6 blocks tall — houses need ~10 block walls, doors 7 tall
    const sizes = [
        { w: 12, d: 10, wallH: 10, roofH: 4 }, // small cottage
        { w: 15, d: 12, wallH: 10, roofH: 5 }, // medium house
        { w: 18, d: 14, wallH: 12, roofH: 6 }, // large house
    ];
    const s = sizes[sizeIdx % 3];
    const isDesert = biome === 'desert';
    const isTaiga = biome === 'taiga';
    const wallMat = isDesert ? BLOCK.SAND : isTaiga ? BLOCK.PINE_WOOD : (seed > 0.7 ? BLOCK.PLANKS : BLOCK.STONE);
    const floorMat = isDesert ? BLOCK.SAND : BLOCK.PLANKS;
    const roofMat = isDesert ? BLOCK.SAND : isTaiga ? BLOCK.PINE_WOOD : BLOCK.PLANKS;
    const foundationMat = isDesert ? BLOCK.SAND : BLOCK.STONE;

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
                // Corner pillars are logs (stone in desert)
                const isCorner = (x === 0 || x === s.w - 1) && (z === 0 || z === s.d - 1);
                blocks.push({ x, y, z, b: isCorner ? (isDesert ? BLOCK.STONE : BLOCK.WOOD) : wallMat });
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
const CASTLE = { wx: -800, wz: 40 }; // world coords

function getCastleBlocks() {
    const blocks = [];
    const S = BLOCK.STONE, P = BLOCK.PLANKS, W = BLOCK.WOOD, DS = BLOCK.DARK_STONE, A = BLOCK.AIR, PATH = BLOCK.PATH, TORCH = BLOCK.TORCH;
    // Castle dimensions in blocks — MUCH larger than before
    const wallW = 160, wallD = 130, wallH = 14, crenH = 2;
    const towerR = 6, towerH = 30;
    // Inner wall
    const innerOffX = 40, innerOffZ = 40;
    const innerW = 80, innerD = 60, innerH = 16;
    const innerTowerR = 5, innerTowerH = 24;
    // Central keep
    const keepW = 24, keepD = 24, keepH = 40;
    const gateW = 6, gateH = 12;

    // ── Foundation (flatten ground) ──
    for (let x = -5; x <= wallW + 5; x++)
        for (let z = -5; z <= wallD + 5; z++)
            for (let fy = -25; fy <= 0; fy++)
                blocks.push({ x, y: fy, z, b: S });

    // ── Outer curtain walls (thick: 2 blocks) ──
    for (let y = 1; y <= wallH; y++) {
        for (let x = 0; x <= wallW; x++) {
            blocks.push({ x, y, z: 0, b: S });
            blocks.push({ x, y, z: 1, b: S });
            blocks.push({ x, y, z: wallD - 1, b: S });
            blocks.push({ x, y, z: wallD, b: S });
        }
        for (let z = 0; z <= wallD; z++) {
            blocks.push({ x: 0, y, z, b: S });
            blocks.push({ x: 1, y, z, b: S });
            blocks.push({ x: wallW - 1, y, z, b: S });
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
    // Wall-walk path on top of walls
    for (let x = 1; x < wallW; x++) {
        blocks.push({ x, y: wallH, z: 2, b: PATH });
        blocks.push({ x, y: wallH, z: wallD - 2, b: PATH });
    }
    for (let z = 1; z < wallD; z++) {
        blocks.push({ x: 2, y: wallH, z, b: PATH });
        blocks.push({ x: wallW - 2, y: wallH, z, b: PATH });
    }
    // Torches along the outer wall tops (every 8 blocks)
    for (let x = 6; x < wallW; x += 8) {
        blocks.push({ x, y: wallH + 1, z: 2, b: TORCH });
        blocks.push({ x, y: wallH + 1, z: wallD - 2, b: TORCH });
    }
    for (let z = 6; z < wallD; z += 8) {
        blocks.push({ x: 2, y: wallH + 1, z, b: TORCH });
        blocks.push({ x: wallW - 2, y: wallH + 1, z, b: TORCH });
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

    // ── Corner + mid-wall towers ──
    const towerCenters = [
        [0, 0], [wallW, 0], [0, wallD], [wallW, wallD],                 // 4 corners
        [Math.floor(wallW/2), 0], [Math.floor(wallW/2), wallD],          // front/back mid
        [0, Math.floor(wallD/2)], [wallW, Math.floor(wallD/2)],          // left/right mid
        [Math.floor(wallW/4), 0], [Math.floor(3*wallW/4), 0],           // front quarters
        [Math.floor(wallW/4), wallD], [Math.floor(3*wallW/4), wallD],   // back quarters
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

    // ── Back gate (sally port) ──
    const bgStart = Math.floor(wallW / 2) - 2;
    for (let y = 1; y <= 8; y++) {
        for (let x = bgStart; x < bgStart + 4; x++) {
            blocks.push({ x, y, z: wallD - 1, b: A });
            blocks.push({ x, y, z: wallD, b: A });
        }
    }

    // ── Inner curtain wall ──
    const iwX1 = innerOffX, iwX2 = innerOffX + innerW;
    const iwZ1 = innerOffZ, iwZ2 = innerOffZ + innerD;
    for (let y = 1; y <= innerH; y++) {
        for (let x = iwX1; x <= iwX2; x++) {
            blocks.push({ x, y, z: iwZ1, b: DS });
            blocks.push({ x, y, z: iwZ2, b: DS });
        }
        for (let z = iwZ1; z <= iwZ2; z++) {
            blocks.push({ x: iwX1, y, z, b: DS });
            blocks.push({ x: iwX2, y, z, b: DS });
        }
    }
    // Inner wall crenellations
    for (let x = iwX1; x <= iwX2; x += 2) {
        blocks.push({ x, y: innerH + 1, z: iwZ1, b: DS });
        blocks.push({ x, y: innerH + 1, z: iwZ2, b: DS });
    }
    for (let z = iwZ1; z <= iwZ2; z += 2) {
        blocks.push({ x: iwX1, y: innerH + 1, z, b: DS });
        blocks.push({ x: iwX2, y: innerH + 1, z, b: DS });
    }
    // Inner wall 4 corner towers
    for (const [tcx, tcz] of [[iwX1, iwZ1], [iwX2, iwZ1], [iwX1, iwZ2], [iwX2, iwZ2]]) {
        for (let y = 1; y <= innerTowerH; y++) {
            for (let dx = -innerTowerR; dx <= innerTowerR; dx++) {
                for (let dz = -innerTowerR; dz <= innerTowerR; dz++) {
                    const dist = Math.sqrt(dx*dx + dz*dz);
                    if (dist <= innerTowerR && dist > innerTowerR - 1.5) {
                        blocks.push({ x: tcx + dx, y, z: tcz + dz, b: DS });
                    }
                }
            }
        }
    }
    // Inner wall gate (front of inner wall)
    const igStart = Math.floor((iwX1 + iwX2) / 2) - 2;
    for (let y = 1; y <= 10; y++) {
        for (let x = igStart; x < igStart + 4; x++) {
            blocks.push({ x, y, z: iwZ1, b: A });
        }
    }

    // ── Path from outer gate to inner gate ──
    const gateCenter = Math.floor(wallW / 2);
    for (let z = 1; z < iwZ1; z++) {
        for (let x = gateCenter - 2; x <= gateCenter + 2; x++) {
            blocks.push({ x, y: 1, z, b: PATH });
        }
    }

    // ── Central Keep — positioned in center of inner ward ──
    const kx = Math.floor((iwX1 + iwX2) / 2) - Math.floor(keepW / 2);
    const kz = Math.floor((iwZ1 + iwZ2) / 2) - Math.floor(keepD / 2);
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

// ── Taiga Castle — Nordic fortress deep in the pine biome ──
const TAIGA_CASTLE = { wx: 140, wz: -1300 };

function getTaigaCastleBlocks() {
    const blocks = [];
    const S = BLOCK.STONE, DS = BLOCK.DARK_STONE, PW = BLOCK.PINE_WOOD, P = BLOCK.PLANKS;
    const W = BLOCK.WOOD, A = BLOCK.AIR, PATH = BLOCK.PATH, TORCH = BLOCK.TORCH;
    // Smaller but sturdy — 80x60 blocks, thick walls
    const wallW = 80, wallD = 60, wallH = 12, crenH = 2;
    const towerR = 4, towerH = 22;

    // Foundation
    for (let x = -3; x <= wallW + 3; x++)
        for (let z = -3; z <= wallD + 3; z++)
            for (let fy = -20; fy <= 0; fy++)
                blocks.push({ x, y: fy, z, b: S });

    // Outer walls (2 thick, stone)
    for (let y = 1; y <= wallH; y++) {
        for (let x = 0; x <= wallW; x++) {
            blocks.push({ x, y, z: 0, b: S }); blocks.push({ x, y, z: 1, b: S });
            blocks.push({ x, y, z: wallD - 1, b: S }); blocks.push({ x, y, z: wallD, b: S });
        }
        for (let z = 0; z <= wallD; z++) {
            blocks.push({ x: 0, y, z, b: S }); blocks.push({ x: 1, y, z, b: S });
            blocks.push({ x: wallW - 1, y, z, b: S }); blocks.push({ x: wallW, y, z, b: S });
        }
    }
    // Crenellations
    for (let x = 0; x <= wallW; x += 2)
        for (let cy = 1; cy <= crenH; cy++) {
            blocks.push({ x, y: wallH + cy, z: 0, b: S });
            blocks.push({ x, y: wallH + cy, z: wallD, b: S });
        }
    for (let z = 0; z <= wallD; z += 2)
        for (let cy = 1; cy <= crenH; cy++) {
            blocks.push({ x: 0, y: wallH + cy, z, b: S });
            blocks.push({ x: wallW, y: wallH + cy, z, b: S });
        }
    // Wall-walk paths and torches
    for (let x = 1; x < wallW; x++) {
        blocks.push({ x, y: wallH, z: 2, b: PATH });
        blocks.push({ x, y: wallH, z: wallD - 2, b: PATH });
    }
    for (let z = 1; z < wallD; z++) {
        blocks.push({ x: 2, y: wallH, z, b: PATH });
        blocks.push({ x: wallW - 2, y: wallH, z, b: PATH });
    }
    for (let x = 5; x < wallW; x += 8) {
        blocks.push({ x, y: wallH + 1, z: 2, b: TORCH });
        blocks.push({ x, y: wallH + 1, z: wallD - 2, b: TORCH });
    }
    for (let z = 5; z < wallD; z += 8) {
        blocks.push({ x: 2, y: wallH + 1, z, b: TORCH });
        blocks.push({ x: wallW - 2, y: wallH + 1, z, b: TORCH });
    }

    // Gate (front wall center) — 5 wide, 10 tall
    const gateW2 = 5, gateH2 = 10;
    const gs = Math.floor(wallW / 2) - Math.floor(gateW2 / 2);
    for (let y = 1; y <= gateH2 + 1; y++) {
        blocks.push({ x: gs - 1, y, z: 0, b: PW }); blocks.push({ x: gs - 1, y, z: 1, b: PW });
        blocks.push({ x: gs + gateW2, y, z: 0, b: PW }); blocks.push({ x: gs + gateW2, y, z: 1, b: PW });
    }
    for (let x = gs; x < gs + gateW2; x++) {
        blocks.push({ x, y: gateH2 + 1, z: 0, b: S }); blocks.push({ x, y: gateH2 + 1, z: 1, b: S });
    }
    // Clear gate opening
    for (let y = 1; y <= gateH2; y++)
        for (let x = gs; x < gs + gateW2; x++) {
            blocks.push({ x, y, z: 0, b: A }); blocks.push({ x, y, z: 1, b: A });
        }

    // Corner towers (4)
    const tcList = [[0, 0], [wallW, 0], [0, wallD], [wallW, wallD]];
    for (const [tcx, tcz] of tcList) {
        for (let y = 1; y <= towerH; y++) {
            for (let dx = -towerR; dx <= towerR; dx++)
                for (let dz = -towerR; dz <= towerR; dz++) {
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    if (dist <= towerR && dist > towerR - 1.5)
                        blocks.push({ x: tcx + dx, y, z: tcz + dz, b: S });
                }
        }
        // Tower top + crenellations
        for (let dx = -towerR; dx <= towerR; dx++)
            for (let dz = -towerR; dz <= towerR; dz++) {
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist <= towerR) {
                    blocks.push({ x: tcx + dx, y: towerH, z: tcz + dz, b: S });
                    if ((dx + dz) % 2 === 0 && dist > towerR - 2)
                        blocks.push({ x: tcx + dx, y: towerH + 1, z: tcz + dz, b: S });
                }
            }
    }

    // Courtyard floor
    for (let x = 2; x < wallW - 1; x++)
        for (let z = 2; z < wallD - 1; z++)
            blocks.push({ x, y: 0, z, b: S });

    // Path from gate to great hall
    const gateCenter = Math.floor(wallW / 2);
    for (let z = 2; z < 20; z++)
        for (let x = gateCenter - 2; x <= gateCenter + 2; x++)
            blocks.push({ x, y: 1, z, b: PATH });

    // ── Great Hall (Jarl's Hall) — large pine-wood longhouse ──
    const ghX = 15, ghZ = 20, ghW = 50, ghD = 30, ghH = 14, roofH = 8;
    // Floor
    for (let x = ghX; x <= ghX + ghW; x++)
        for (let z = ghZ; z <= ghZ + ghD; z++)
            blocks.push({ x, y: 1, z, b: P });
    // Walls (pine wood)
    for (let y = 2; y <= ghH; y++) {
        for (let x = ghX; x <= ghX + ghW; x++) {
            blocks.push({ x, y, z: ghZ, b: PW }); blocks.push({ x, y, z: ghZ + ghD, b: PW });
        }
        for (let z = ghZ; z <= ghZ + ghD; z++) {
            blocks.push({ x: ghX, y, z, b: PW }); blocks.push({ x: ghX + ghW, y, z, b: PW });
        }
    }
    // Great hall door (front, facing courtyard)
    const doorX = ghX + Math.floor(ghW / 2) - 2;
    for (let y = 2; y <= 8; y++)
        for (let x = doorX; x < doorX + 5; x++)
            blocks.push({ x, y, z: ghZ, b: A });
    // Windows (slots in walls)
    for (let wx2 = ghX + 6; wx2 < ghX + ghW; wx2 += 8) {
        for (let wy = 6; wy <= 8; wy++) {
            blocks.push({ x: wx2, y: wy, z: ghZ, b: A });
            blocks.push({ x: wx2, y: wy, z: ghZ + ghD, b: A });
        }
    }
    // Peaked roof (planks) — fill each stepped layer fully
    for (let rz = ghZ - 1; rz <= ghZ + ghD + 1; rz++) {
        for (let ry = 0; ry < roofH; ry++) {
            const rx1 = ghX + ry - 1, rx2 = ghX + ghW - ry + 1;
            if (rx1 >= rx2) break;
            for (let rx = rx1; rx <= rx2; rx++)
                blocks.push({ x: rx, y: ghH + ry + 1, z: rz, b: P });
        }
        // Ridge
        const ridgeX = ghX + Math.floor(ghW / 2);
        blocks.push({ x: ridgeX, y: ghH + roofH, z: rz, b: PW });
    }
    // Interior — throne at back, long tables, torches
    // Throne platform
    for (let x = ghX + 22; x <= ghX + 28; x++)
        for (let z = ghZ + ghD - 4; z <= ghZ + ghD - 2; z++)
            blocks.push({ x, y: 2, z, b: DS });
    // Torches inside
    for (let tx = ghX + 4; tx < ghX + ghW; tx += 8) {
        blocks.push({ x: tx, y: 6, z: ghZ + 3, b: TORCH });
        blocks.push({ x: tx, y: 6, z: ghZ + ghD - 3, b: TORCH });
    }
    // Dividing wall for back rooms (armory + storage)
    for (let y = 2; y <= ghH; y++) {
        for (let z = ghZ + ghD - 8; z <= ghZ + ghD; z++) {
            blocks.push({ x: ghX + 10, y, z, b: PW });
            blocks.push({ x: ghX + ghW - 10, y, z, b: PW });
        }
    }
    // Doorways in dividers
    for (let y = 2; y <= 8; y++) {
        blocks.push({ x: ghX + 10, y, z: ghZ + ghD - 6, b: A });
        blocks.push({ x: ghX + ghW - 10, y, z: ghZ + ghD - 6, b: A });
    }

    // ── Barracks (left side of courtyard) ──
    const bkX = 4, bkZ = 4, bkW = 18, bkD = 12, bkH = 10;
    for (let x = bkX; x <= bkX + bkW; x++)
        for (let z = bkZ; z <= bkZ + bkD; z++)
            blocks.push({ x, y: 1, z, b: P });
    for (let y = 2; y <= bkH; y++) {
        for (let x = bkX; x <= bkX + bkW; x++) {
            blocks.push({ x, y, z: bkZ, b: S }); blocks.push({ x, y, z: bkZ + bkD, b: S });
        }
        for (let z = bkZ; z <= bkZ + bkD; z++) {
            blocks.push({ x: bkX, y, z, b: S }); blocks.push({ x: bkX + bkW, y, z, b: S });
        }
    }
    // Barracks door
    for (let y = 2; y <= 8; y++)
        for (let x = bkX + 7; x <= bkX + 10; x++)
            blocks.push({ x, y, z: bkZ, b: A });
    // Barracks flat roof
    for (let x = bkX; x <= bkX + bkW; x++)
        for (let z = bkZ; z <= bkZ + bkD; z++)
            blocks.push({ x, y: bkH + 1, z, b: P });

    // ── Stable (right side) ──
    const stX = wallW - 22, stZ = 4, stW = 18, stD = 10, stH = 8;
    for (let x = stX; x <= stX + stW; x++)
        for (let z = stZ; z <= stZ + stD; z++)
            blocks.push({ x, y: 1, z, b: P });
    for (let y = 2; y <= stH; y++) {
        for (let x = stX; x <= stX + stW; x++) {
            blocks.push({ x, y, z: stZ, b: PW }); blocks.push({ x, y, z: stZ + stD, b: PW });
        }
        for (let z = stZ; z <= stZ + stD; z++) {
            blocks.push({ x: stX, y, z, b: PW }); blocks.push({ x: stX + stW, y, z, b: PW });
        }
    }
    for (let y = 2; y <= 7; y++)
        for (let x = stX + 6; x <= stX + 10; x++)
            blocks.push({ x, y, z: stZ, b: A });
    for (let x = stX; x <= stX + stW; x++)
        for (let z = stZ; z <= stZ + stD; z++)
            blocks.push({ x, y: stH + 1, z, b: P });

    // Well in courtyard
    const wellX = gateCenter, wellZ = 12;
    for (let y = 1; y <= 3; y++) {
        blocks.push({ x: wellX - 1, y, z: wellZ - 1, b: S }); blocks.push({ x: wellX + 1, y, z: wellZ - 1, b: S });
        blocks.push({ x: wellX - 1, y, z: wellZ + 1, b: S }); blocks.push({ x: wellX + 1, y, z: wellZ + 1, b: S });
    }

    return blocks;
}

// Lightweight LOD-only preplace — fills world._structureBlocks with village
// house blocks and castle blocks so they appear in the distant terrain LOD
// without running full chunk generation. Fast.
export function preplaceVillagesAndCastle(world) {
    const yOff = 128;
    if (!world._structureBlocks) world._structureBlocks = new Map();
    const add = (bx, by, bz, b) => {
        if (b === BLOCK.AIR || b === 0) return;
        world._structureBlocks.set(bx + ',' + by + ',' + bz, b);
    };
    // Villages
    for (const vd of VILLAGE_DEFS) {
        const vbx = Math.floor(vd.x / BLOCK_SIZE);
        const vbz = Math.floor(vd.z / BLOCK_SIZE);
        for (let hi = 0; hi < vd.houses; hi++) {
            const angle = (hi / vd.houses) * Math.PI * 2 + vd.x * 0.01;
            const dist = 20 + (hi * 17) % 30;
            const hx = vbx + Math.round(Math.cos(angle) * dist);
            const hz = vbz + Math.round(Math.sin(angle) * dist);
            const seed = world._hash(hx * 0.37, hz * 0.53);
            const sizeIdx = hi % 3;
            const sizeRef = [{ w: 12, d: 10 }, { w: 15, d: 12 }, { w: 18, d: 14 }][sizeIdx % 3];
            const pts = [[hx, hz], [hx + sizeRef.w, hz], [hx, hz + sizeRef.d], [hx + sizeRef.w, hz + sizeRef.d], [hx + (sizeRef.w >> 1), hz + (sizeRef.d >> 1)]];
            let maxH = -Infinity;
            for (const [px, pz] of pts) { const th = world.getBaseHeightBlocks(px, pz); if (th > maxH) maxH = th; }
            const baseY = maxH + yOff;
            const houseBlocks = getHouseBlocks(seed, sizeIdx, vd.biome);
            for (const hb of houseBlocks) add(hx + hb.x, baseY + hb.y, hz + hb.z, hb.b);
        }
    }
    // Castle
    const cbx = Math.floor(CASTLE.wx / BLOCK_SIZE);
    const cbz = Math.floor(CASTLE.wz / BLOCK_SIZE);
    const castleBaseY = world.getBaseHeightBlocks(cbx + 80, cbz + 65) + yOff;
    const castleBlocks = world._castleBlocks || getCastleBlocks();
    world._castleBlocks = castleBlocks;
    for (const hb of castleBlocks) add(cbx + hb.x, castleBaseY + hb.y, cbz + hb.z, hb.b);
    // Taiga Castle
    const tcbx = Math.floor(TAIGA_CASTLE.wx / BLOCK_SIZE);
    const tcbz = Math.floor(TAIGA_CASTLE.wz / BLOCK_SIZE);
    const tcBaseY = world.getBaseHeightBlocks(tcbx + 40, tcbz + 30) + yOff;
    const tcBlocks = world._taigaCastleBlocks || getTaigaCastleBlocks();
    world._taigaCastleBlocks = tcBlocks;
    for (const hb of tcBlocks) add(tcbx + hb.x, tcBaseY + hb.y, tcbz + hb.z, hb.b);
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
            const houseBlocks = getHouseBlocks(seed, sizeIdx, vd.biome);

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
                // Register in structureBlocks (separate from player mods — not saved)
                if (hb.b !== BLOCK.AIR) {
                    if (!world._structureBlocks) world._structureBlocks = new Map();
                    world._structureBlocks.set(bx + ',' + by + ',' + bz, hb.b);
                }
            }
        }
    }

    // ── Western Castle ──
    const cbx = Math.floor(CASTLE.wx / BLOCK_SIZE);
    const cbz = Math.floor(CASTLE.wz / BLOCK_SIZE);
    // Check if castle overlaps this chunk (castle is now 160x130 blocks)
    if (cbx + 170 >= ox && cbx - 10 <= ox + 15 && cbz + 140 >= oz && cbz - 10 <= oz + 15) {
        // Get base height from center of castle
        const castleBaseY = world.getBaseHeightBlocks(cbx + 80, cbz + 65) + yOff;
        // Get or generate castle blocks (cache for performance)
        if (!world._castleBlocks) world._castleBlocks = getCastleBlocks();
        const castleBlocks = world._castleBlocks;

        // Clear area first
        for (let ix = -5; ix < 165; ix++) {
            for (let iz = -5; iz < 135; iz++) {
                for (let iy = 1; iy <= 45; iy++) {
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
            if (hb.b !== BLOCK.AIR) {
                if (!world._structureBlocks) world._structureBlocks = new Map();
                world._structureBlocks.set(bx2 + ',' + by2 + ',' + bz2, hb.b);
            }
        }
    }

    // ── Taiga Castle ──
    const tcbx = Math.floor(TAIGA_CASTLE.wx / BLOCK_SIZE);
    const tcbz = Math.floor(TAIGA_CASTLE.wz / BLOCK_SIZE);
    if (tcbx + 90 >= ox && tcbx - 10 <= ox + 15 && tcbz + 70 >= oz && tcbz - 10 <= oz + 15) {
        const tcBaseY = world.getBaseHeightBlocks(tcbx + 40, tcbz + 30) + yOff;
        if (!world._taigaCastleBlocks) world._taigaCastleBlocks = getTaigaCastleBlocks();
        const tcBlocks = world._taigaCastleBlocks;
        // Clear area
        for (let ix = -3; ix < 85; ix++) {
            for (let iz = -3; iz < 65; iz++) {
                for (let iy = 1; iy <= 30; iy++) {
                    const bx2 = tcbx + ix, bz2 = tcbz + iz, by2 = tcBaseY + iy;
                    const lx2 = bx2 - ox, lz2 = bz2 - oz;
                    if (lx2 < 0 || lx2 >= 16 || lz2 < 0 || lz2 >= 16) continue;
                    if (by2 < 0 || by2 >= WORLD_HEIGHT) continue;
                    chunkData[(by2 * 16 + lz2) * 16 + lx2] = BLOCK.AIR;
                }
            }
        }
        // Place blocks
        for (const hb of tcBlocks) {
            const bx2 = tcbx + hb.x;
            const bz2 = tcbz + hb.z;
            const by2 = tcBaseY + hb.y;
            const lx2 = bx2 - ox, lz2 = bz2 - oz;
            if (lx2 < 0 || lx2 >= 16 || lz2 < 0 || lz2 >= 16) continue;
            if (by2 < 0 || by2 >= WORLD_HEIGHT) continue;
            chunkData[(by2 * 16 + lz2) * 16 + lx2] = hb.b;
            if (hb.b !== BLOCK.AIR) {
                if (!world._structureBlocks) world._structureBlocks = new Map();
                world._structureBlocks.set(bx2 + ',' + by2 + ',' + bz2, hb.b);
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
        _skinMat: skinMat, _shirtMat: shirtMat, _pantsMat: pantsMat, _shoeMat: shoeMat, _hairMat: hairMat,
        x, z, angle: g.rotation.y, speed: 0,
        walkPhase: seed * Math.PI * 2,
        wanderTimer: 1 + seed * 3,
        walking: false,
        homeX: x, homeZ: z,
        idleTimer: 0,
        hp: 8, dead: false, deathTimer: 0,
        fleeing: false, fleeTimer: 0,
    };
}

export { makeVillager };
export class VillageManager {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.villagers = [];
        this.spawnedVillages = new Set();
        // Pre-compute house interiors (world coords + floor Y) so villagers walk inside at floor level
        this._houseRects = [];
        const sizes = [{ w: 12, d: 10 }, { w: 15, d: 12 }, { w: 18, d: 14 }];
        for (const vd of VILLAGE_DEFS) {
            const vbx = Math.floor(vd.x / BLOCK_SIZE);
            const vbz = Math.floor(vd.z / BLOCK_SIZE);
            for (let hi = 0; hi < vd.houses; hi++) {
                const angle = (hi / vd.houses) * Math.PI * 2 + vd.x * 0.01;
                const dist = 20 + (hi * 17) % 30;
                const hx = vbx + Math.round(Math.cos(angle) * dist);
                const hz = vbz + Math.round(Math.sin(angle) * dist);
                const s = sizes[hi % 3];
                // Sample terrain to get house floor height (same logic as chunk builder)
                const pts = [[hx,hz],[hx+s.w,hz],[hx,hz+s.d],[hx+s.w,hz+s.d],[hx+Math.floor(s.w/2),hz+Math.floor(s.d/2)]];
                let maxH = -Infinity;
                for (const [px,pz] of pts) {
                    const th = world.getBaseHeightBlocks(px, pz);
                    if (th > maxH) maxH = th;
                }
                // Floor world Y = (maxH + 1) * BLOCK_SIZE (baseY block + 1 for floor surface)
                const floorY = (maxH + 1) * BLOCK_SIZE;
                this._houseRects.push({
                    x1: hx * BLOCK_SIZE,
                    z1: hz * BLOCK_SIZE,
                    x2: (hx + s.w) * BLOCK_SIZE,
                    z2: (hz + s.d) * BLOCK_SIZE,
                    floorY,
                });
            }
        }
    }

    _getHouseFloorY(wx, wz) {
        for (const r of this._houseRects) {
            if (wx >= r.x1 && wx <= r.x2 && wz >= r.z1 && wz <= r.z2) return r.floorY;
        }
        return -1;
    }

    update(dt, playerX, playerZ, timeOfDay) {
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

            // Build shop building — proper building with walls, door, windows, peaked roof
            const buildShopBuilding = (sx, sz, wallBlock, roofBlock, floorBlock) => {
                const BS2 = BLOCK_SIZE;
                const bx = Math.round(sx / BS2), bz = Math.round(sz / BS2);
                const by = Math.floor(this.world.getHeight(sx, sz) / BS2) + 128;
                const W = wallBlock, R = roofBlock, F = floorBlock || BLOCK.PLANKS;
                const _set = (dx, dy, dz, b) => {
                    const abx = bx+dx, aby = by+dy, abz = bz+dz;
                    // setBlock handles _modifiedBlocks and _modsByChunk internally
                    this.world.setBlock(abx, aby, abz, b);
                };
                const _rebuildChunks = new Set();
                const hw = 5, hd = 4, wallH = 7, roofH = 4;
                // Clear area above
                for (let dx = -hw-1; dx <= hw+1; dx++) for (let dz = -hd-1; dz <= hd+1; dz++)
                    for (let dy = 0; dy <= wallH+roofH+1; dy++) _set(dx, dy, dz, 0);
                // Floor
                for (let dx = -hw; dx <= hw; dx++) for (let dz = -hd; dz <= hd; dz++) _set(dx, 0, dz, F);
                // Walls
                for (let dy = 1; dy <= wallH; dy++) {
                    for (let dx = -hw; dx <= hw; dx++) { _set(dx, dy, -hd, W); _set(dx, dy, hd, W); }
                    for (let dz = -hd; dz <= hd; dz++) { _set(-hw, dy, dz, W); _set(hw, dy, dz, W); }
                }
                // Clear interior
                for (let dx = -hw+1; dx < hw; dx++) for (let dz = -hd+1; dz < hd; dz++)
                    for (let dy = 1; dy <= wallH; dy++) _set(dx, dy, dz, 0);
                // Door (front, 3 wide × 5 tall)
                for (let dx = -1; dx <= 1; dx++) for (let dy = 1; dy <= 5; dy++) _set(dx, dy, hd, 0);
                // Windows (2 on each side wall, 1 on back)
                for (const dz of [-2, 2]) { _set(-hw, 3, dz, 0); _set(-hw, 4, dz, 0); _set(hw, 3, dz, 0); _set(hw, 4, dz, 0); }
                _set(3, 3, -hd, 0); _set(3, 4, -hd, 0); _set(-3, 3, -hd, 0); _set(-3, 4, -hd, 0);
                // Peaked roof
                for (let ry = 0; ry < roofH; ry++) {
                    const rw = hw + 1 - ry;
                    if (rw < 1) break;
                    for (let dx = -rw; dx <= rw; dx++) for (let dz = -hd-1; dz <= hd+1; dz++)
                        _set(dx, wallH + ry + 1, dz, R);
                }
                // Counter/table inside
                for (let dx = -2; dx <= 2; dx++) _set(dx, 1, 0, W);
                // Corner posts (wood)
                for (const cx of [-hw, hw]) for (const cz of [-hd, hd])
                    for (let dy = 1; dy <= wallH; dy++) _set(cx, dy, cz, BLOCK.WOOD);
                // Rebuild all affected chunks (including neighbors that straddle the shop)
                const minCx = Math.floor((bx-hw-1)/16), maxCx = Math.floor((bx+hw+1)/16);
                const minCz = Math.floor((bz-hd-1)/16), maxCz = Math.floor((bz+hd+1)/16);
                for (let cx2 = minCx; cx2 <= maxCx; cx2++) {
                    for (let cz2 = minCz; cz2 <= maxCz; cz2++) {
                        _rebuildChunks.add(cx2 + ',' + cz2);
                    }
                }
                if (this._chunkRebuild) {
                    for (const ck of _rebuildChunks) {
                        const [cx2, cz2] = ck.split(',').map(Number);
                        this._chunkRebuild(cx2 * 16, cz2 * 16);
                    }
                }
            };

            // Spawn blacksmith shopkeepers — one per skill in vd.smiths (defaults to [3])
            const smithSkills = vd.smiths || [3];
            const shopDist = 28;
            const firstSmithAngle = this.world._hash(vd.x + 555, vd.z + 666) * Math.PI * 2;
            // Total shops: smiths + magic + armor + stable — evenly space around circle
            const totalShops = smithSkills.length + 3; // +3 for magic, armor, stable
            for (let si = 0; si < smithSkills.length; si++) {
                const skill = smithSkills[si];
                const skillName = SMITH_SKILL_NAMES[skill] || 'Smith';
                const bsAngle = firstSmithAngle + (si / totalShops) * Math.PI * 2;
                const bsX = vd.x + Math.cos(bsAngle) * shopDist;
                const bsZ = vd.z + Math.sin(bsAngle) * shopDist;
                const bsY = this.world.getHeight(bsX, bsZ);
                const bsV = makeVillager(this.scene, bsX, bsZ, bsY, 0.8 + si * 0.13);
                bsV._shopType = 'blacksmith';
                bsV._smithSkill = skill;
                bsV._smithSkillName = skillName;
                bsV._stayHome = true;
                bsV.homeX = bsX; bsV.homeZ = bsZ;
                bsV._shirtMat.color.setHex(0x3a2a1a);
                this.villagers.push(bsV);
                buildShopBuilding(bsX, bsZ, BLOCK.STONE, BLOCK.STONE, BLOCK.STONE);
                // Label
                const bsCanvas = document.createElement('canvas');
                bsCanvas.width = 200; bsCanvas.height = 32;
                const bsCtx = bsCanvas.getContext('2d');
                bsCtx.fillStyle = '#ccaa66'; bsCtx.font = 'bold 13px monospace'; bsCtx.textAlign = 'center';
                bsCtx.fillText(skillName + ' Blacksmith', 100, 20);
                const bsTex = new THREE.CanvasTexture(bsCanvas);
                const bsLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: bsTex, transparent: true, depthWrite: false }));
                bsLabel.position.y = 2.2; bsLabel.scale.set(1.6, 0.25, 1);
                bsV.group.add(bsLabel);
            }

            // Spawn magic shop keeper
            const msAngle = firstSmithAngle + (smithSkills.length / totalShops) * Math.PI * 2;
            const msX = vd.x + Math.cos(msAngle) * shopDist;
            const msZ = vd.z + Math.sin(msAngle) * shopDist;
            const msY = this.world.getHeight(msX, msZ);
            const msV = makeVillager(this.scene, msX, msZ, msY, 0.3);
            msV._shopType = 'magic';
            msV._stayHome = true;
            msV.homeX = msX; msV.homeZ = msZ;
            // Make magic shop visually distinct — purple robes
            msV._shirtMat.color.setHex(0x5522aa);
            this.villagers.push(msV);
            buildShopBuilding(msX, msZ, BLOCK.PLANKS, BLOCK.LEAVES, BLOCK.PLANKS);

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
            const asAngle = firstSmithAngle + ((smithSkills.length + 1) / totalShops) * Math.PI * 2;
            const asX = vd.x + Math.cos(asAngle) * shopDist;
            const asZ = vd.z + Math.sin(asAngle) * shopDist;
            const asY = this.world.getHeight(asX, asZ);
            const asV = makeVillager(this.scene, asX, asZ, asY, 0.55);
            asV._shopType = 'armor';
            asV._stayHome = true;
            asV.homeX = asX; asV.homeZ = asZ;
            // Red/brown leather look
            asV._shirtMat.color.setHex(0x8b4513);
            this.villagers.push(asV);
            buildShopBuilding(asX, asZ, BLOCK.PLANKS, BLOCK.PLANKS, BLOCK.PLANKS);

            const asCanvas = document.createElement('canvas');
            asCanvas.width = 128; asCanvas.height = 32;
            const asCtx = asCanvas.getContext('2d');
            asCtx.fillStyle = '#cc9966'; asCtx.font = 'bold 14px monospace'; asCtx.textAlign = 'center';
            asCtx.fillText('Armour Shop', 64, 20);
            const asTex = new THREE.CanvasTexture(asCanvas);
            const asLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: asTex, transparent: true, depthWrite: false }));
            asLabel.position.y = 2.2; asLabel.scale.set(1.0, 0.25, 1);
            asV.group.add(asLabel);

            // Spawn stablemaster
            const stAngle = firstSmithAngle + ((smithSkills.length + 2) / totalShops) * Math.PI * 2;
            const stX = vd.x + Math.cos(stAngle) * shopDist;
            const stZ = vd.z + Math.sin(stAngle) * shopDist;
            const stY = this.world.getHeight(stX, stZ);
            const stV = makeVillager(this.scene, stX, stZ, stY, 0.15);
            stV._shopType = 'stable';
            stV._stayHome = true;
            stV.homeX = stX; stV.homeZ = stZ;
            stV._shirtMat.color.setHex(0x886644);
            stV._pantsMat.color.setHex(0x554422);
            this.villagers.push(stV);
            const stCanvas = document.createElement('canvas');
            stCanvas.width = 128; stCanvas.height = 32;
            const stCtx = stCanvas.getContext('2d');
            stCtx.fillStyle = '#bb9966'; stCtx.font = 'bold 14px monospace'; stCtx.textAlign = 'center';
            stCtx.fillText('Stable', 64, 20);
            const stTex = new THREE.CanvasTexture(stCanvas);
            const stLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: stTex, transparent: true, depthWrite: false }));
            stLabel.position.y = 2.2; stLabel.scale.set(1.0, 0.25, 1);
            stV.group.add(stLabel);
            buildShopBuilding(stX, stZ, BLOCK.WOOD, BLOCK.PLANKS, BLOCK.DIRT);
        }

        // ── Spawn castle NPCs when player approaches the castle ──
        {
            const ccx = CASTLE.wx + 40; // castle block bounds 0..160 → world 0..80 → center at 40
            const ccz = CASTLE.wz + 32.5;
            const cdx = ccx - playerX, cdz = ccz - playerZ;
            if (cdx * cdx + cdz * cdz < 70 * 70 && !this.spawnedVillages.has('__castle__')) {
                this.spawnedVillages.add('__castle__');
                // Layout positions relative to castle origin (CASTLE.wx, CASTLE.wz)
                // Castle courtyard is roughly the central area; place NPCs there and a few guards at walls/gate
                const npcs = [
                    { dx: 40, dz: 32, role: 'king',     name: 'King',          shirt: 0x882233, pants: 0x2a2a3a },
                    { dx: 44, dz: 30, role: 'queen',    name: 'Queen',         shirt: 0x8844aa, pants: 0x2a2a3a },
                    { dx: 38, dz: 35, role: 'advisor',  name: 'Royal Advisor', shirt: 0x2a4488, pants: 0x1a1a2a },
                    { dx: 30, dz: 40, role: 'knight',   name: 'Knight',        shirt: 0x556677, pants: 0x334455 },
                    { dx: 50, dz: 40, role: 'knight',   name: 'Knight',        shirt: 0x556677, pants: 0x334455 },
                    { dx: 20, dz: 30, role: 'guard',    name: 'Guard',         shirt: 0x3a3a3a, pants: 0x2a2a2a },
                    { dx: 60, dz: 30, role: 'guard',    name: 'Guard',         shirt: 0x3a3a3a, pants: 0x2a2a2a },
                    { dx: 40, dz: 12, role: 'guard',    name: 'Gate Guard',    shirt: 0x3a3a3a, pants: 0x2a2a2a },
                    { dx: 40, dz: 53, role: 'guard',    name: 'Rear Guard',    shirt: 0x3a3a3a, pants: 0x2a2a2a },
                    { dx: 35, dz: 25, role: 'servant',  name: 'Servant',       shirt: 0xaa9966, pants: 0x553322 },
                    { dx: 45, dz: 25, role: 'servant',  name: 'Servant',       shirt: 0xaa9966, pants: 0x553322 },
                    { dx: 42, dz: 38, role: 'noble',    name: 'Noble',         shirt: 0x884466, pants: 0x2a1a2a },
                    { dx: 48, dz: 35, role: 'scholar',  name: 'Scholar',       shirt: 0x445522, pants: 0x2a2a1a },
                    { dx: 32, dz: 38, role: 'cook',     name: 'Cook',          shirt: 0xbbaa88, pants: 0x664433 },
                    { dx: 55, dz: 45, role: 'stablehand', name: 'Stablehand',  shirt: 0x886644, pants: 0x443322 },
                ];
                // Castle floor Y — use center terrain + one block so NPCs stand on the floor
                const castleFloorY = this.world.getHeight(ccx, ccz) + BLOCK_SIZE;
                for (let i = 0; i < npcs.length; i++) {
                    const n = npcs[i];
                    const wx = CASTLE.wx + n.dx;
                    const wz = CASTLE.wz + n.dz;
                    const wy = castleFloorY;
                    const seed = this.world._hash(wx + 11, wz + 13);
                    const v = makeVillager(this.scene, wx, wz, wy, seed);
                    v._floorY = castleFloorY;
                    v._shirtMat.color.setHex(n.shirt);
                    v._pantsMat.color.setHex(n.pants);
                    v._castleRole = n.role;
                    v._stayHome = true;
                    v.homeX = wx; v.homeZ = wz;
                    // Label
                    const nc = document.createElement('canvas');
                    nc.width = 128; nc.height = 32;
                    const nctx = nc.getContext('2d');
                    const nameColor = (n.role === 'king' || n.role === 'queen') ? '#ffcc44' :
                                      (n.role === 'knight' || n.role === 'guard') ? '#cccccc' :
                                      (n.role === 'noble') ? '#cc99cc' : '#e8c89a';
                    nctx.fillStyle = nameColor;
                    nctx.font = 'bold 12px monospace';
                    nctx.textAlign = 'center';
                    nctx.fillText(n.name, 64, 20);
                    const nt = new THREE.CanvasTexture(nc);
                    const nl = new THREE.Sprite(new THREE.SpriteMaterial({ map: nt, transparent: true, depthWrite: false }));
                    nl.position.y = 2.2; nl.scale.set(1.0, 0.25, 1);
                    v.group.add(nl);
                    this.villagers.push(v);
                }
            }
        }

        // ── Spawn taiga castle NPCs ──
        {
            const tccx = TAIGA_CASTLE.wx + 20; // center of 80-wide castle in world coords
            const tccz = TAIGA_CASTLE.wz + 15;
            const tcdx = tccx - playerX, tcdz = tccz - playerZ;
            if (tcdx * tcdx + tcdz * tcdz < 60 * 60 && !this.spawnedVillages.has('__taiga_castle__')) {
                this.spawnedVillages.add('__taiga_castle__');
                // dx/dz in world coords (castle is ~38 wide, ~28.5 deep in world units)
                const tcNpcs = [
                    { dx: 16, dz: 18, role: 'jarl',       name: 'Jarl Thorne',    shirt: 0x664422, pants: 0x332211 },
                    { dx: 18, dz: 17, role: 'advisor',     name: 'Elder Sage',     shirt: 0x445566, pants: 0x223344 },
                    { dx: 12, dz: 14, role: 'guard',       name: 'Pine Guard',     shirt: 0x3a4a3a, pants: 0x2a3a2a },
                    { dx: 26, dz: 14, role: 'guard',       name: 'Pine Guard',     shirt: 0x3a4a3a, pants: 0x2a3a2a },
                    { dx: 19, dz: 2,  role: 'guard',       name: 'Gate Warden',    shirt: 0x3a4a3a, pants: 0x2a3a2a },
                    { dx: 19, dz: 25, role: 'guard',       name: 'Rear Warden',    shirt: 0x3a4a3a, pants: 0x2a3a2a },
                    { dx: 5,  dz: 4,  role: 'guard',       name: 'Barracks Guard', shirt: 0x3a4a3a, pants: 0x2a3a2a },
                    { dx: 14, dz: 12, role: 'huntsman',    name: 'Huntsman',       shirt: 0x556633, pants: 0x443322 },
                    { dx: 22, dz: 12, role: 'huntsman',    name: 'Tracker',        shirt: 0x556633, pants: 0x443322 },
                    { dx: 30, dz: 4,  role: 'stablehand',  name: 'Stablehand',     shirt: 0x886644, pants: 0x443322 },
                    { dx: 18, dz: 15, role: 'servant',     name: 'Servant',        shirt: 0x998866, pants: 0x554433 },
                    { dx: 10, dz: 17, role: 'blacksmith',  name: 'Forge-master',   shirt: 0x4a4a4a, pants: 0x2a2a2a },
                ];
                const tcFloorY = this.world.getHeight(tccx, tccz) + BLOCK_SIZE;
                for (const n of tcNpcs) {
                    const wx = TAIGA_CASTLE.wx + n.dx;
                    const wz = TAIGA_CASTLE.wz + n.dz;
                    const wy = tcFloorY;
                    const seed = this.world._hash(wx + 17, wz + 19);
                    const v = makeVillager(this.scene, wx, wz, wy, seed);
                    v._floorY = tcFloorY;
                    v._shirtMat.color.setHex(n.shirt);
                    v._pantsMat.color.setHex(n.pants);
                    v._castleRole = n.role;
                    v._taigaCastle = true;
                    v.homeX = wx; v.homeZ = wz;
                    const nc = document.createElement('canvas');
                    nc.width = 128; nc.height = 32;
                    const nctx = nc.getContext('2d');
                    const nameColor = n.role === 'jarl' ? '#ffcc44' :
                                      (n.role === 'guard') ? '#cccccc' :
                                      (n.role === 'huntsman') ? '#88aa66' : '#e8c89a';
                    nctx.fillStyle = nameColor;
                    nctx.font = 'bold 12px monospace';
                    nctx.textAlign = 'center';
                    nctx.fillText(n.name, 64, 20);
                    const nt = new THREE.CanvasTexture(nc);
                    const nl = new THREE.Sprite(new THREE.SpriteMaterial({ map: nt, transparent: true, depthWrite: false }));
                    nl.position.y = 2.2; nl.scale.set(1.0, 0.25, 1);
                    v.group.add(nl);
                    this.villagers.push(v);
                }
            }
        }

        // Spawn wandering merchants on paths near player
        if (!this._merchantTimer) this._merchantTimer = 0;
        this._merchantTimer -= dt;
        if (this._merchantTimer <= 0) {
            this._merchantTimer = 10 + Math.random() * 15; // check every 10-25s
            const merchantCount = this.villagers.filter(v => v._isMerchant).length;
            if (merchantCount < 3) {
                // Try to spawn a merchant on a path near the player
                const angle = Math.random() * Math.PI * 2;
                const dist = 20 + Math.random() * 30;
                const mx = playerX + Math.cos(angle) * dist;
                const mz = playerZ + Math.sin(angle) * dist;
                if (isOnPath(mx, mz)) {
                    const my = this.world.getHeight(mx, mz);
                    if (my > 0) {
                        const seed = Math.random();
                        const mv = makeVillager(this.scene, mx, mz, my, seed);
                        mv._isMerchant = true;
                        mv.homeX = mx; mv.homeZ = mz;
                        // Distinct look — travelling cloak
                        mv._shirtMat.color.setHex(0x556644);
                        mv._pantsMat.color.setHex(0x3a3a2a);
                        // Random shop type
                        const shopTypes = ['blacksmith', 'magic', 'armor'];
                        mv._shopType = shopTypes[Math.floor(Math.random() * 3)];
                        const typeNames = { blacksmith: 'Trader (Weapons)', magic: 'Trader (Magic)', armor: 'Trader (Armour)' };
                        // Label
                        const mCanvas = document.createElement('canvas');
                        mCanvas.width = 128; mCanvas.height = 32;
                        const mCtx = mCanvas.getContext('2d');
                        mCtx.fillStyle = '#aabb88'; mCtx.font = 'bold 12px monospace'; mCtx.textAlign = 'center';
                        mCtx.fillText(typeNames[mv._shopType], 64, 20);
                        const mTex = new THREE.CanvasTexture(mCanvas);
                        const mLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: mTex, transparent: true, depthWrite: false }));
                        mLabel.position.y = 2.2; mLabel.scale.set(1.0, 0.25, 1);
                        mv.group.add(mLabel);
                        this.villagers.push(mv);
                    }
                }
            }
        }

        // Despawn far villagers
        // Castle NPCs: despawn ALL at once when player is far from castle center
        if (this.spawnedVillages.has('__castle__')) {
            const ccx = CASTLE.wx + 40, ccz = CASTLE.wz + 32.5;
            const cdx = ccx - playerX, cdz = ccz - playerZ;
            if (cdx * cdx + cdz * cdz > 90 * 90) {
                for (let i = this.villagers.length - 1; i >= 0; i--) {
                    if (this.villagers[i]._castleRole && !this.villagers[i]._taigaCastle) {
                        this.scene.remove(this.villagers[i].group);
                        this.villagers.splice(i, 1);
                    }
                }
                this.spawnedVillages.delete('__castle__');
            }
        }
        // Taiga castle NPCs: same pattern
        if (this.spawnedVillages.has('__taiga_castle__')) {
            const tccx = TAIGA_CASTLE.wx + 20, tccz = TAIGA_CASTLE.wz + 15;
            const tcdx = tccx - playerX, tcdz = tccz - playerZ;
            if (tcdx * tcdx + tcdz * tcdz > 80 * 80) {
                for (let i = this.villagers.length - 1; i >= 0; i--) {
                    if (this.villagers[i]._taigaCastle) {
                        this.scene.remove(this.villagers[i].group);
                        this.villagers.splice(i, 1);
                    }
                }
                this.spawnedVillages.delete('__taiga_castle__');
            }
        }
        for (let i = this.villagers.length - 1; i >= 0; i--) {
            const v = this.villagers[i];
            if (v._castleRole) continue; // handled above
            const dx = v.x - playerX, dz = v.z - playerZ;
            if (dx * dx + dz * dz > 80 * 80) {
                this.scene.remove(v.group);
                this.villagers.splice(i, 1);
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
            const distToPlayer = Math.sqrt(dx * dx + dz * dz);
            if (distToPlayer > 40) continue;

            // Dead villagers — fall backward animation then stay on ground
            if (v.dead) {
                v.deathTimer += dt;
                const terrainY = v._floorY !== undefined ? v._floorY : this.world.getHeight(v.x, v.z);
                if (v.deathTimer < 0.6) {
                    // Falling backward
                    const t = v.deathTimer / 0.6;
                    v.group.rotation.x = t * (Math.PI / 2);
                    v.group.position.y = terrainY + 0.3; // stay above ground
                    // Arms and legs splay out
                    v.leftArm.shoulder.rotation.x = -t * 1.5;
                    v.leftArm.shoulder.rotation.z = -t * 0.8;
                    v.rightArm.shoulder.rotation.x = -t * 1.5;
                    v.rightArm.shoulder.rotation.z = t * 0.8;
                    v.leftLeg.hip.rotation.x = t * 0.3;
                    v.leftLeg.hip.rotation.z = -t * 0.3;
                    v.rightLeg.hip.rotation.x = t * 0.3;
                    v.rightLeg.hip.rotation.z = t * 0.3;
                }
                // Despawn after 30 seconds
                if (v.deathTimer > 30) {
                    v._despawn = true;
                }
                continue;
            }

            // Castle NPCs — wander within the castle
            if (v._castleRole && !v.fleeing) {
                const role = v._castleRole;
                v.wanderTimer = (v.wanderTimer === undefined ? Math.random() * 3 : v.wanderTimer) - dt;
                if (v.wanderTimer <= 0) {
                    if (!v.walking) {
                        v.walking = true;
                        const hdx = v.homeX - v.x, hdz = v.homeZ - v.z;
                        const homeDist = Math.sqrt(hdx * hdx + hdz * hdz);
                        // Guards patrol further, royalty stays closer to home
                        const wanderRange = (role === 'guard' || role === 'knight') ? 25 : (role === 'king' || role === 'queen') ? 6 : 15;
                        if (homeDist > wanderRange) {
                            v.angle = Math.atan2(hdx, hdz) + (Math.random() - 0.5) * 0.5;
                        } else {
                            v.angle += (Math.random() - 0.5) * 2.2;
                        }
                        v.wanderTimer = (role === 'guard' || role === 'knight') ? 3 + Math.random() * 4 : 2 + Math.random() * 5;
                    } else {
                        v.walking = false;
                        v.wanderTimer = (role === 'king' || role === 'queen') ? 3 + Math.random() * 5 : 1.5 + Math.random() * 3;
                    }
                }
            }
            // Shop keepers stay put (but can still be killed)
            else if (v._stayHome && !v.fleeing) {
                v.walking = false; v.speed = 0;
                v.x = v.homeX; v.z = v.homeZ;
                const fy = v._floorY !== undefined ? v._floorY : this.world.getHeight(v.x, v.z);
                v.group.position.set(v.x, fy, v.z);
                // Idle animation still runs below
            }

            // Flee AI — run away from player
            if (v.fleeing) {
                v.fleeTimer -= dt;
                if (v.fleeTimer <= 0) { v.fleeing = false; v.walking = false; }
                else {
                    // Run directly away from player every frame
                    const fleeAngle = Math.atan2(dx, dz);
                    v.angle = fleeAngle;
                    v.group.rotation.y = fleeAngle; // snap rotation instantly
                    v.walking = true;
                    v.speed += (4.0 - v.speed) * 5 * dt;
                }
            }
            // Dragon's Reach scholars — study the corpse half the day, wander the other half
            else if (v._dragonReach) {
                const studying = timeOfDay >= 0.25 && timeOfDay < 0.55;
                if (studying) {
                    // Walk to study position, then hold pose
                    const sdx = v._studyX - v.x, sdz = v._studyZ - v.z;
                    const sDist = Math.sqrt(sdx * sdx + sdz * sdz);
                    if (sDist > 0.5) {
                        v.walking = true;
                        v.angle = Math.atan2(sdx, sdz);
                    } else {
                        v.walking = false; v.speed = 0;
                        v.x = v._studyX; v.z = v._studyZ;
                        v.group.rotation.y = v._studyPoseAngle;
                        // Apply study pose
                        if (v._studyLookDown) {
                            v.headGroup.rotation.x = -0.45;
                            v.leftArm.shoulder.rotation.x = 0.6;
                        }
                        if (v._studyPose) {
                            if (v._studyPose.crouch) {
                                v.body.position.y = 0.65;
                                v.spine.rotation.x = v._studyPose.spineX || 0.5;
                            }
                            if (v._studyPose.leader) {
                                v.rightArm.shoulder.rotation.x = -0.5;
                                v.rightArm.shoulder.rotation.z = -0.3;
                            }
                        }
                    }
                } else {
                    // Reset pose and wander normally
                    if (v._studyPose && v._studyPose.crouch) {
                        v.body.position.y = 0; v.spine.rotation.x = 0;
                    }
                    v.headGroup.rotation.x = 0;
                    v.leftArm.shoulder.rotation.x = 0;
                    v.rightArm.shoulder.rotation.x = 0;
                    v.rightArm.shoulder.rotation.z = 0;
                    v.wanderTimer -= dt;
                    if (v.wanderTimer <= 0) {
                        if (!v.walking) {
                            v.walking = true;
                            const hdx = v.homeX - v.x, hdz = v.homeZ - v.z;
                            const homeDist = Math.sqrt(hdx * hdx + hdz * hdz);
                            if (homeDist > 20) {
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
                }
            }
            // Normal wander AI
            else if (!v._stayHome) {
                v.wanderTimer -= dt;
                if (v.wanderTimer <= 0) {
                    if (!v.walking) {
                        v.walking = true;
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
            }

            // Movement
            const tgtSpd = v.fleeing ? 4.0 : (v.walking ? 1.2 : 0);
            v.speed += (tgtSpd - v.speed) * 4 * dt;

            let da = v.angle - v.group.rotation.y;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            v.group.rotation.y += da * 3 * dt;

            if (v.speed > 0.01) {
                v.x += Math.sin(v.group.rotation.y) * v.speed * dt;
                v.z += Math.cos(v.group.rotation.y) * v.speed * dt;
            }
            // Keep castle NPCs inside castle walls
            if (v._castleRole) {
                let cMinX, cMaxX, cMinZ, cMaxZ;
                if (v._taigaCastle) {
                    // 80 blocks wide = 38 world units, 60 blocks deep = 28.5 world units
                    cMinX = TAIGA_CASTLE.wx + 2; cMaxX = TAIGA_CASTLE.wx + 36;
                    cMinZ = TAIGA_CASTLE.wz + 2; cMaxZ = TAIGA_CASTLE.wz + 26;
                } else {
                    cMinX = CASTLE.wx + 5; cMaxX = CASTLE.wx + 75;
                    cMinZ = CASTLE.wz + 5; cMaxZ = CASTLE.wz + 60;
                }
                if (v.x < cMinX || v.x > cMaxX || v.z < cMinZ || v.z > cMaxZ) {
                    v.x = Math.max(cMinX, Math.min(cMaxX, v.x));
                    v.z = Math.max(cMinZ, Math.min(cMaxZ, v.z));
                    v.walking = false; v.wanderTimer = 0.5;
                    v.angle = Math.atan2(v.homeX - v.x, v.homeZ - v.z);
                }
            }

            // Use house floor Y when inside a house, otherwise normal terrain height
            const houseFloorY = (!v._castleRole && !v._floorY) ? this._getHouseFloorY(v.x, v.z) : -1;
            const terrainY = v._floorY !== undefined ? v._floorY : (houseFloorY >= 0 ? houseFloorY : this.world.getHeight(v.x, v.z));
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

        // Clean up despawned dead villagers
        for (let i = this.villagers.length - 1; i >= 0; i--) {
            if (this.villagers[i]._despawn) {
                this.scene.remove(this.villagers[i].group);
                this.villagers.splice(i, 1);
            }
        }
    }

    // Damage a villager — called from player attack system
    damageVillagerAt(px, pz, angle, damage, range) {
        const sinA = Math.sin(angle), cosA = Math.cos(angle);
        for (const v of this.villagers) {
            if (v.dead) continue;
            const dx = v.x - px, dz = v.z - pz;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > range || dist < 0.1) continue;
            // Check facing
            const dot = (dx * sinA + dz * cosA) / dist;
            if (dot < 0.2) continue;
            v.hp -= damage;
            // Knockback
            v.x += (dx / dist) * 0.5;
            v.z += (dz / dist) * 0.5;
            if (v.hp <= 0) {
                v.hp = 0;
                v.dead = true;
                v.deathTimer = 0;
                v.walking = false;
                v.speed = 0;
            } else {
                // Flee!
                v.fleeing = true;
                v.fleeTimer = 5 + Math.random() * 3;
            }
            // Make nearby villagers flee too
            for (const other of this.villagers) {
                if (other === v || other.dead || other.fleeing) continue;
                const odx = other.x - v.x, odz = other.z - v.z;
                if (odx * odx + odz * odz < 15 * 15) {
                    other.fleeing = true;
                    other.fleeTimer = 4 + Math.random() * 3;
                }
            }
            return true;
        }
        return false;
    }
}
