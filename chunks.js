// chunks.js — Chunk meshing and loading/unloading

import { CHUNK_SIZE, WORLD_HEIGHT, BLOCK_SIZE, BLOCK, BLOCK_COLORS } from './world.js';

let RENDER_DIST = 12; // default, updated by settings
const LOD0_DIST = 8;    // full detail — every block, all faces
const LOD1_DIST = 25;   // surface only — skip underground
const LOD2_DIST = 60;   // surface only + skip every 2nd XZ
// beyond LOD2: surface only + skip every 4th XZ
let UNLOAD_DIST = RENDER_DIST + 3;
const BS = BLOCK_SIZE;
const Y_OFF = 128; // block y offset: block Y_OFF = world y=0

// Face definitions: normal direction + quad vertices (in 0-1 block-local space)
const FACES = [
    { dir: [ 1, 0, 0], verts: [[1,0,1],[1,0,0],[1,1,1],[1,1,0]] }, // +X
    { dir: [-1, 0, 0], verts: [[0,0,0],[0,0,1],[0,1,0],[0,1,1]] }, // -X
    { dir: [ 0, 1, 0], verts: [[0,1,0],[0,1,1],[1,1,0],[1,1,1]] }, // +Y (top)
    { dir: [ 0,-1, 0], verts: [[0,0,1],[0,0,0],[1,0,1],[1,0,0]] }, // -Y (bottom)
    { dir: [ 0, 0, 1], verts: [[0,0,1],[1,0,1],[0,1,1],[1,1,1]] }, // +Z
    { dir: [ 0, 0,-1], verts: [[1,0,0],[0,0,0],[1,1,0],[0,1,0]] }, // -Z
];

const FACE_SHADE = [0.85, 0.85, 1.0, 0.65, 0.9, 0.9];

// Grass palette — varies by height and noise
const GRASS_TOP_LOW  = new THREE.Color(0x2a8a28); // dark lush green
const GRASS_TOP_MID  = new THREE.Color(0x359930); // darker mid green
const GRASS_TOP_HIGH = new THREE.Color(0x508a35); // dark upland green
const GRASS_SIDE = new THREE.Color(0x357a25);
const DIRT_DARK = new THREE.Color(0x6b5030);
const DIRT_LIGHT = new THREE.Color(0xa08050);
const STONE_DARK = new THREE.Color(0x686868);
const STONE_LIGHT = new THREE.Color(0xa0a0a0);
const LEAVES_DARK = new THREE.Color(0x1a7a1a);
const LEAVES_LIGHT = new THREE.Color(0x35b535);
const WOOD_DARK = new THREE.Color(0x5a3518);
const WOOD_LIGHT = new THREE.Color(0x7d4f30);
const PLANK_DARK = new THREE.Color(0x8a6a3a);
const PLANK_LIGHT = new THREE.Color(0xaa8a55);
const _tmpA = new THREE.Color();

// Simple hash for per-block color variation
function colorHash(x, y, z) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 45.164) * 43758.5453;
    return n - Math.floor(n);
}

const waterMat = new THREE.MeshStandardMaterial({
    color: 0x3a7ab5,
    transparent: true,
    opacity: 0.6,
    roughness: 0.3,
    metalness: 0.1,
    side: THREE.DoubleSide,
});

export class ChunkManager {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.loaded = new Map();
        this.loadedCount = 0;
        this.buildQueue = [];
        this._lastPCX = null;
        this._lastPCZ = null;
    }

    setRenderDist(d) {
        RENDER_DIST = d;
        UNLOAD_DIST = d + 3;
        this._lastPCX = null; // force re-scan
    }

    update(px, pz, facingAngle) {
        // Convert world position to chunk coordinates
        const pcx = Math.floor(px / (CHUNK_SIZE * BS));
        const pcz = Math.floor(pz / (CHUNK_SIZE * BS));
        const faceDX = Math.sin(facingAngle || 0);
        const faceDZ = Math.cos(facingAngle || 0);

        if (pcx === this._lastPCX && pcz === this._lastPCZ) {
            this._processQueue(4);
            return;
        }
        this._lastPCX = pcx;
        this._lastPCZ = pcz;

        // Use a Set for fast queue lookup
        const queued = new Set(this.buildQueue.map(q => q.key));

        // Only scan nearby chunks first, expand outward in rings
        for (let ring = 0; ring <= RENDER_DIST; ring++) {
            if (ring > RENDER_DIST) break;
            const lod = ring <= LOD0_DIST ? 1 : ring <= LOD1_DIST ? 2 : ring <= LOD2_DIST ? 3 : 4;
            for (let dx = -ring; dx <= ring; dx++) {
                for (let dz = -ring; dz <= ring; dz++) {
                    if (Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue; // ring perimeter only
                    const d2 = dx * dx + dz * dz;
                    if (d2 > RENDER_DIST * RENDER_DIST) continue;
                    const cx = pcx + dx, cz = pcz + dz;
                    const key = cx + ',' + cz;
                    if (queued.has(key)) continue;
                    const existing = this.loaded.get(key);
                    if (existing) {
                        // Rebuild if LOD should be better (player moved closer)
                        if (existing.lod > lod) {
                            if (existing.terrain) { this.scene.remove(existing.terrain); existing.terrain.geometry.dispose(); }
                            if (existing.water) { this.scene.remove(existing.water); existing.water.geometry.dispose(); }
                            if (existing.leaves) { this.scene.remove(existing.leaves); existing.leaves.geometry.dispose(); }
                            this.loaded.delete(key);
                        } else {
                            continue;
                        }
                    }
                    // Priority: bias toward the same side of the world as the player
                    // If player is left of center, left-side chunks load first
                    const sameX = (pcx > 0 && cx > 0) || (pcx < 0 && cx < 0) || pcx === 0;
                    const sameZ = (pcz > 0 && cz > 0) || (pcz < 0 && cz < 0) || pcz === 0;
                    const sameSide = (sameX && sameZ) ? 0.5 : 1.5; // half priority if same side
                    const priority = d2 * sameSide;
                    this.buildQueue.push({ cx, cz, key, dist: d2, lod, priority });
                    queued.add(key);
                }
            }
        }
        this.buildQueue.sort((a, b) => a.priority - b.priority);

        // Unload distant chunks
        const toDelete = [];
        for (const [key, entry] of this.loaded) {
            const [cx, cz] = key.split(',').map(Number);
            const dx = cx - pcx, dz = cz - pcz;
            if (dx * dx + dz * dz > UNLOAD_DIST * UNLOAD_DIST) toDelete.push(key);
        }
        for (const key of toDelete) {
            const entry = this.loaded.get(key);
            if (entry.terrain) { this.scene.remove(entry.terrain); entry.terrain.geometry.dispose(); }
            if (entry.water) { this.scene.remove(entry.water); entry.water.geometry.dispose(); }
            if (entry.leaves) { this.scene.remove(entry.leaves); entry.leaves.geometry.dispose(); }
            this.loaded.delete(key);
        }
        this.loadedCount = this.loaded.size;
        this._processQueue(4);
    }

    rebuildChunkAt(bx, bz) {
        const cx = Math.floor(bx / CHUNK_SIZE);
        const cz = Math.floor(bz / CHUNK_SIZE);
        const key = cx + ',' + cz;
        const old = this.loaded.get(key);
        if (old) {
            if (old.terrain) { this.scene.remove(old.terrain); old.terrain.geometry.dispose(); }
            if (old.water) { this.scene.remove(old.water); old.water.geometry.dispose(); }
            if (old.leaves) { this.scene.remove(old.leaves); old.leaves.geometry.dispose(); }
        }
        const entry = this._buildChunkMeshes(cx, cz, 1);
        entry.lod = 1;
        if (entry.terrain) this.scene.add(entry.terrain);
        if (entry.water) this.scene.add(entry.water);
        if (entry.leaves) this.scene.add(entry.leaves);
        this.loaded.set(key, entry);
    }

    _processQueue(maxPerFrame) {
        let built = 0;
        while (this.buildQueue.length > 0 && built < maxPerFrame) {
            const { cx, cz, key, lod } = this.buildQueue.shift();
            if (this.loaded.has(key)) continue;

            for (let dx = -1; dx <= 1; dx++)
                for (let dz = -1; dz <= 1; dz++)
                    this.world.getOrCreateChunk(cx + dx, cz + dz);

            const entry = this._buildChunkMeshes(cx, cz, lod || 1);
            entry.lod = lod || 1;
            if (entry.terrain) this.scene.add(entry.terrain);
            if (entry.water) this.scene.add(entry.water);
            if (entry.leaves) this.scene.add(entry.leaves);
            this.loaded.set(key, entry);
            built++;
        }
        this.loadedCount = this.loaded.size;
    }

    _buildChunkMeshes(cx, cz, lod) {
        lod = lod || 1;
        const ox = cx * CHUNK_SIZE;
        const oz = cz * CHUNK_SIZE;
        // LOD 1: full detail. LOD 2: full Y, skip 2 XZ. LOD 3: surface only + skip 2. LOD 4: surface only + skip 4
        const xzStep = lod >= 4 ? 4 : lod >= 2 ? 2 : 1;
        const S = xzStep;
        const surfaceOnly = lod >= 3; // only skip underground for very distant chunks

        const tPos = [], tNrm = [], tCol = [], tIdx = [];
        let tVert = 0;
        const wPos = [], wNrm = [], wIdx = [];
        let wVert = 0;
        const lPos = [], lNrm = [], lCol = [], lIdx = [];
        let lVert = 0;

        const tmpColor = new THREE.Color();

        const scanMaxY = Math.min(WORLD_HEIGHT, Y_OFF + 200);
        for (let lx = 0; lx < CHUNK_SIZE; lx += xzStep) {
            for (let lz = 0; lz < CHUNK_SIZE; lz += xzStep) {
                const bx = ox + lx, bz = oz + lz;
                // Find surface for ALL LODs to avoid scanning empty air
                let surfY = Y_OFF;
                for (let sy = scanMaxY - 1; sy >= 0; sy--) {
                    if (this.world.getBlockAt(bx, sy, bz) !== BLOCK.AIR) { surfY = sy; break; }
                }
                let yStart, yEnd;
                if (surfaceOnly) {
                    yStart = Math.max(0, surfY - 20);
                    yEnd = Math.min(scanMaxY, surfY + 1);
                } else {
                    // Scan from bedrock to just above surface — covers caves and dug-out areas
                    yStart = 0;
                    yEnd = Math.min(scanMaxY, surfY + 2);
                }
                for (let y = yStart; y < yEnd; y++) {
                    const block = this.world.getBlockAt(bx, y, bz);

                    if (block === BLOCK.WATER) {
                        const above = this.world.getBlockAt(bx, y + S, bz);
                        if (above === BLOCK.AIR) {
                            const face = FACES[2];
                            const verts = face.verts;
                            for (let vi = 0; vi < 4; vi++) {
                                wPos.push(
                                    (lx + verts[vi][0] * S) * BS,
                                    (y - Y_OFF + 0.85 * S) * BS,
                                    (lz + verts[vi][2] * S) * BS
                                );
                                wNrm.push(0, 1, 0);
                            }
                            wIdx.push(wVert, wVert+1, wVert+2, wVert+2, wVert+1, wVert+3);
                            wVert += 4;
                        }
                        continue;
                    }

                    if (block === BLOCK.AIR) continue;

                    // Leaves go to separate transparent mesh
                    if (block === BLOCK.LEAVES) {
                        for (let fi = 0; fi < 6; fi++) {
                            const face = FACES[fi];
                            const nbx = bx + face.dir[0] * S, nby = y + face.dir[1] * S, nbz = bz + face.dir[2] * S;
                            const neighbor = this.world.getBlockAt(nbx, nby, nbz);
                            if (neighbor !== BLOCK.AIR && neighbor !== BLOCK.WATER) continue;
                            const ch = colorHash(bx, y, bz);
                            const ch2 = colorHash(bx + 100, y + 50, bz + 200);
                            tmpColor.copy(LEAVES_DARK).lerp(LEAVES_LIGHT, ch * 0.7 + ch2 * 0.3);
                            tmpColor.r += (ch2 - 0.5) * 0.04;
                            tmpColor.g += (ch - 0.5) * 0.06;
                            tmpColor.multiplyScalar(FACE_SHADE[fi] * (0.93 + ch * 0.14));
                            const verts = face.verts;
                            for (let vi = 0; vi < 4; vi++) {
                                lPos.push((lx + verts[vi][0] * S) * BS, (y - Y_OFF + verts[vi][1] * S) * BS, (lz + verts[vi][2] * S) * BS);
                                lNrm.push(face.dir[0], face.dir[1], face.dir[2]);
                                lCol.push(tmpColor.r, tmpColor.g, tmpColor.b);
                            }
                            lIdx.push(lVert, lVert+1, lVert+2, lVert+2, lVert+1, lVert+3);
                            lVert += 4;
                        }
                        continue;
                    }

                    for (let fi = 0; fi < 6; fi++) {
                        const face = FACES[fi];
                        const nbx = bx + face.dir[0] * S;
                        const nby = y + face.dir[1] * S;
                        const nbz = bz + face.dir[2] * S;
                        const neighbor = this.world.getBlockAt(nbx, nby, nbz);
                        if (neighbor !== BLOCK.AIR && neighbor !== BLOCK.WATER) continue;

                        // Per-block noise for color variation
                        const ch = colorHash(bx, y, bz);
                        const ch2 = colorHash(bx + 100, y + 50, bz + 200);

                        if (block === BLOCK.GRASS && fi === 2) {
                            // Grass top — blend between lush/standard/dry based on height + noise
                            const heightFactor = Math.min(1, Math.max(0, (y - 40) / 30));
                            if (heightFactor < 0.4) {
                                tmpColor.copy(GRASS_TOP_LOW).lerp(GRASS_TOP_MID, heightFactor / 0.4);
                            } else {
                                tmpColor.copy(GRASS_TOP_MID).lerp(GRASS_TOP_HIGH, (heightFactor - 0.4) / 0.6);
                            }
                            // Add warm/cool tint variation
                            tmpColor.r += (ch - 0.5) * 0.06;
                            tmpColor.g += (ch2 - 0.5) * 0.08;
                        } else if (block === BLOCK.GRASS && fi !== 3) {
                            // Grass side — blend between dirt and green
                            tmpColor.copy(GRASS_SIDE);
                            _tmpA.copy(DIRT_DARK);
                            tmpColor.lerp(_tmpA, 0.15 + ch * 0.2);
                        } else if (block === BLOCK.DIRT) {
                            tmpColor.copy(DIRT_DARK).lerp(DIRT_LIGHT, ch * 0.6);
                        } else if (block === BLOCK.STONE) {
                            tmpColor.copy(STONE_DARK).lerp(STONE_LIGHT, ch * 0.5 + ch2 * 0.2);
                        } else if (block === BLOCK.SAND) {
                            tmpColor.setHex(BLOCK_COLORS[BLOCK.SAND]);
                            tmpColor.r += (ch - 0.5) * 0.06;
                            tmpColor.g += (ch - 0.5) * 0.04;
                        } else if (block === BLOCK.LEAVES) {
                            tmpColor.copy(LEAVES_DARK).lerp(LEAVES_LIGHT, ch * 0.7 + ch2 * 0.3);
                            // Subtle warm/cool tint
                            tmpColor.r += (ch2 - 0.5) * 0.04;
                            tmpColor.g += (ch - 0.5) * 0.06;
                        } else if (block === BLOCK.WOOD) {
                            tmpColor.copy(WOOD_DARK).lerp(WOOD_LIGHT, ch * 0.5);
                        } else if (block === BLOCK.PLANKS) {
                            tmpColor.copy(PLANK_DARK).lerp(PLANK_LIGHT, ch * 0.6);
                        } else if (block === BLOCK.CRAFTING) {
                            // Crafting table — detailed per-face texturing
                            // Find position within the 3x3x3 table
                            // Use world-space block coords for consistent pattern
                            const cbx = ((bx % 3) + 3) % 3; // 0-2 local x within table
                            const cbz = ((bz % 3) + 3) % 3; // 0-2 local z within table
                            const cby = y % 3;

                            if (fi === 2) {
                                // ── Top face ──
                                const isEdge = cbx === 0 || cbx === 2 || cbz === 0 || cbz === 2;
                                const isCorner = (cbx === 0 || cbx === 2) && (cbz === 0 || cbz === 2);
                                if (isCorner) {
                                    // Dark corner trim
                                    tmpColor.setRGB(0.28, 0.18, 0.10);
                                } else if (isEdge) {
                                    // Edge trim — darker wood frame
                                    tmpColor.setRGB(0.35, 0.24, 0.13);
                                    tmpColor.r += ch * 0.03;
                                } else {
                                    // Center grid — lighter work surface with tool marks
                                    const grid = ((bx + bz) % 2 === 0);
                                    if (grid) {
                                        tmpColor.setRGB(0.58, 0.42, 0.24); // light plank
                                    } else {
                                        tmpColor.setRGB(0.48, 0.35, 0.20); // darker plank
                                    }
                                    // Subtle scratches/wear
                                    tmpColor.r += (ch - 0.5) * 0.06;
                                    tmpColor.g += (ch2 - 0.5) * 0.04;
                                }
                            } else if (fi === 3) {
                                // ── Bottom face — plain dark wood ──
                                tmpColor.setRGB(0.30, 0.20, 0.12);
                            } else {
                                // ── Side faces — plank pattern with cross-brace detail ──
                                const isVertEdge = cby === 0 || cby === 2;
                                const isHorizEdge = (fi <= 1) ? (cbz === 0 || cbz === 2) : (cbx === 0 || cbx === 2);

                                if (isVertEdge && isHorizEdge) {
                                    // Corner post — darkest
                                    tmpColor.setRGB(0.25, 0.16, 0.09);
                                } else if (isVertEdge) {
                                    // Top/bottom rail
                                    tmpColor.setRGB(0.32, 0.22, 0.12);
                                } else if (isHorizEdge) {
                                    // Side post
                                    tmpColor.setRGB(0.34, 0.23, 0.13);
                                } else {
                                    // Inner side panel — warm wood with grain variation
                                    const grain = Math.sin(cby * 5.0 + ch * 3.0) * 0.04;
                                    tmpColor.setRGB(0.48 + grain, 0.34 + grain * 0.7, 0.20 + grain * 0.4);
                                    // Tool silhouette on middle row of front/back face
                                    if (cby === 1 && fi >= 4) {
                                        // Darker inset — looks like a carved tool shape
                                        tmpColor.multiplyScalar(0.75);
                                    }
                                }
                                tmpColor.r += (ch - 0.5) * 0.03;
                                tmpColor.g += (ch2 - 0.5) * 0.02;
                            }
                        } else if (block === 16 || block === BLOCK.COAL_ORE) {
                            tmpColor.copy(STONE_DARK).lerp(STONE_LIGHT, ch * 0.2);
                            const coalFleck = ((bx * 13 + y * 29 + bz * 17) % 4) < 2;
                            if (coalFleck) { tmpColor.r -= 0.1; tmpColor.g -= 0.1; tmpColor.b -= 0.1; }
                        } else if (block === 15 || block === BLOCK.FURNACE) {
                            // Furnace — subdivide each face into 3x3 sub-quads for higher detail
                            const cbx = ((bx % 3) + 3) % 3;
                            const cbz = ((bz % 3) + 3) % 3;
                            const cby = y % 3;
                            const face = FACES[fi];
                            const sub = 3; // 3x3 subdivisions per face
                            for (let su = 0; su < sub; su++) {
                                for (let sv = 0; sv < sub; sv++) {
                                    const u0 = su / sub, u1 = (su + 1) / sub;
                                    const v0 = sv / sub, v1 = (sv + 1) / sub;
                                    // Pixel position within the whole furnace face (0-8)
                                    const px = cbx * sub + su;
                                    const py = (fi === 2 || fi === 3) ? (cbz * sub + sv) : (cby * sub + sv);
                                    const pz = (fi <= 1) ? (cbz * sub + sv) : (fi >= 4 ? (cbx * sub + su) : 0);
                                    // Color based on face and pixel position
                                    let cr, cg, cb;
                                    const isFront = fi === 4;
                                    const pixHash = colorHash(bx * 9 + su, y * 9 + sv, bz + fi * 7);

                                    if (fi === 2) {
                                        // TOP — chimney with ring of stones
                                        const cx = cbx * 3 + su, cz = cbz * 3 + sv;
                                        const dist = Math.max(Math.abs(cx - 4), Math.abs(cz - 4));
                                        if (dist <= 1) { cr = 0.06 + pixHash * 0.06; cg = 0.02; cb = 0.01; } // chimney hole
                                        else if (dist === 2) { cr = 0.32; cg = 0.30; cb = 0.28; cr += pixHash * 0.04; } // inner ring
                                        else { cr = 0.38; cg = 0.36; cb = 0.34; cr -= pixHash * 0.03; cg -= pixHash * 0.03; } // outer edge
                                    } else if (fi === 3) {
                                        cr = 0.22 + pixHash * 0.06; cg = 0.20 + pixHash * 0.04; cb = 0.18 + pixHash * 0.03;
                                    } else if (isFront) {
                                        // FRONT — furnace opening with arch
                                        const fx = cbx * 3 + su, fy = cby * 3 + sv;
                                        // Arch opening: center-bottom area
                                        const inMouth = fx >= 2 && fx <= 6 && fy <= 4;
                                        const isArch = fx >= 2 && fx <= 6 && fy === 5 && fx >= 3 && fx <= 5;
                                        const isFrame = (fx === 1 || fx === 7) && fy <= 5;
                                        const isKeystone = fx === 4 && fy === 6;
                                        if (inMouth || isArch) {
                                            // Dark interior with embers
                                            cr = 0.04 + pixHash * 0.08; cg = 0.01 + pixHash * 0.02; cb = 0.005;
                                            if (fy <= 1) { cr += 0.15 * pixHash; cg += 0.05 * pixHash; } // embers at bottom
                                        } else if (isFrame) {
                                            cr = 0.35 + pixHash * 0.04; cg = 0.20; cb = 0.10; // warm stone frame
                                        } else if (isKeystone) {
                                            cr = 0.28; cg = 0.26; cb = 0.24; // keystone
                                        } else {
                                            // Stone bricks
                                            const brick = ((fx + fy) % 2 === 0);
                                            cr = brick ? 0.42 : 0.35; cg = brick ? 0.40 : 0.33; cb = brick ? 0.38 : 0.31;
                                            cr += (pixHash - 0.5) * 0.06;
                                            if (fy <= 3) { cr += 0.02; cb -= 0.01; } // heat staining near mouth
                                        }
                                    } else {
                                        // OTHER SIDES + BACK
                                        const sx = (fi <= 1) ? (cbz * 3 + su) : (cbx * 3 + su);
                                        const sy = cby * 3 + sv;
                                        const isBackVent = fi === 5 && sx >= 3 && sx <= 5 && sy >= 2 && sy <= 4;
                                        if (isBackVent) {
                                            cr = 0.12 + pixHash * 0.05; cg = 0.08; cb = 0.06;
                                        } else {
                                            // Stone brick pattern with mortar
                                            const brickW = 3, brickH = 2;
                                            const row = Math.floor(sy / brickH);
                                            const offset = (row % 2) * 1;
                                            const bx2 = (sx + offset) % brickW;
                                            const by2 = sy % brickH;
                                            const isMortar = bx2 === 0 || by2 === 0;
                                            if (isMortar) {
                                                cr = 0.48; cg = 0.46; cb = 0.44; // light mortar
                                            } else {
                                                cr = 0.36 + pixHash * 0.06; cg = 0.34 + pixHash * 0.04; cb = 0.32 + pixHash * 0.03;
                                            }
                                            // Soot on upper rows
                                            if (sy >= 7) { cr -= 0.06; cg -= 0.06; cb -= 0.05; }
                                            // Heat near bottom
                                            if (sy <= 2) { cr += 0.03; cb -= 0.02; }
                                        }
                                    }
                                    tmpColor.setRGB(Math.max(0, Math.min(1, cr)), Math.max(0, Math.min(1, cg)), Math.max(0, Math.min(1, cb)));
                                    tmpColor.multiplyScalar(FACE_SHADE[fi] * (0.93 + ch * 0.14));
                                    // Build sub-quad vertices
                                    const v = face.verts;
                                    // Interpolate corners for this sub-quad
                                    const x0 = v[0], x1 = v[1], x2 = v[2], x3 = v[3];
                                    // v[0]=BL v[1]=BR v[2]=TL v[3]=TR
                                    for (const [cu, cv] of [[u0,v0],[u1,v0],[u0,v1],[u1,v0],[u1,v1],[u0,v1]]) {
                                        const ix = x0[0]*(1-cu)*(1-cv) + x1[0]*cu*(1-cv) + x2[0]*(1-cu)*cv + x3[0]*cu*cv;
                                        const iy = x0[1]*(1-cu)*(1-cv) + x1[1]*cu*(1-cv) + x2[1]*(1-cu)*cv + x3[1]*cu*cv;
                                        const iz = x0[2]*(1-cu)*(1-cv) + x1[2]*cu*(1-cv) + x2[2]*(1-cu)*cv + x3[2]*cu*cv;
                                        tPos.push((lx + ix * S) * BS, (y - Y_OFF + iy * S) * BS, (lz + iz * S) * BS);
                                        tNrm.push(face.dir[0], face.dir[1], face.dir[2]);
                                        tCol.push(tmpColor.r, tmpColor.g, tmpColor.b);
                                    }
                                    tIdx.push(tVert, tVert+1, tVert+2, tVert+3, tVert+4, tVert+5);
                                    tVert += 6;
                                }
                            }
                            continue; // skip the normal quad push below
                        } else if (block === BLOCK.IRON_ORE) {
                            // Stone base with orange-brown ore flecks
                            tmpColor.copy(STONE_DARK).lerp(STONE_LIGHT, ch * 0.3);
                            const oreFleck = ((bx * 17 + y * 31 + bz * 13) % 5) < 2;
                            if (oreFleck) {
                                tmpColor.r += 0.15; tmpColor.g += 0.06; tmpColor.b -= 0.05;
                            }
                        } else if (block === BLOCK.SNOW) {
                            tmpColor.setHex(BLOCK_COLORS[BLOCK.SNOW]);
                            tmpColor.r -= ch * 0.04;
                            tmpColor.b += ch2 * 0.03;
                        } else if (block === BLOCK.ANVIL) {
                            // Skip rendering — anvil uses a separate 3D model above ground
                            continue;
                        } else if (block === BLOCK.CHEST) {
                            // Chest: darker sides, lighter top (lid), golden front latch hint
                            if (fi === 2) tmpColor.setHex(0x9a7540); // top = lighter lid
                            else if (fi === 3) tmpColor.setHex(0x5a3a18); // bottom = dark
                            else tmpColor.setHex(0x6b4a20); // sides = medium brown
                        } else if (block === BLOCK.CAMPFIRE) {
                            // Render as grass so ground shows beneath campfire model
                            tmpColor.setHex(BLOCK_COLORS[BLOCK.GRASS]);
                        } else {
                            tmpColor.setHex(BLOCK_COLORS[block] || 0xff00ff);
                        }

                        // Face shading
                        tmpColor.multiplyScalar(FACE_SHADE[fi]);
                        // Per-block brightness variation (subtle)
                        tmpColor.multiplyScalar(0.93 + ch * 0.14);

                        const verts = face.verts;
                        for (let vi = 0; vi < 4; vi++) {
                            tPos.push(
                                (lx + verts[vi][0] * S) * BS,
                                (y - Y_OFF + verts[vi][1] * S) * BS,
                                (lz + verts[vi][2] * S) * BS
                            );
                            tNrm.push(face.dir[0], face.dir[1], face.dir[2]);
                            tCol.push(tmpColor.r, tmpColor.g, tmpColor.b);
                        }
                        tIdx.push(tVert, tVert+1, tVert+2, tVert+2, tVert+1, tVert+3);
                        tVert += 4;
                    }
                }
            }
        }

        const entry = { terrain: null, water: null, leaves: null };

        // World-space offset for this chunk
        const worldOX = ox * BS;
        const worldOZ = oz * BS;

        if (tVert > 0) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(tPos, 3));
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(tNrm, 3));
            geo.setAttribute('color', new THREE.Float32BufferAttribute(tCol, 3));
            geo.setIndex(tIdx);
            const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(worldOX, 0, worldOZ);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            entry.terrain = mesh;
        }

        if (wVert > 0) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(wNrm, 3));
            geo.setIndex(wIdx);
            const mesh = new THREE.Mesh(geo, waterMat);
            mesh.position.set(worldOX, 0, worldOZ);
            mesh.receiveShadow = true;
            entry.water = mesh;
        }

        if (lVert > 0) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(lPos, 3));
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(lNrm, 3));
            geo.setAttribute('color', new THREE.Float32BufferAttribute(lCol, 3));
            geo.setIndex(lIdx);
            const mat = new THREE.MeshStandardMaterial({
                vertexColors: true, roughness: 0.8, metalness: 0,
                transparent: true, opacity: 0.75, side: THREE.DoubleSide,
                depthWrite: false,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(worldOX, 0, worldOZ);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.renderOrder = 1;
            entry.leaves = mesh;
        }

        return entry;
    }
}
