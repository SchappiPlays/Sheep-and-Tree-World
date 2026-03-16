// chunks.js — Chunk meshing and loading/unloading

import { CHUNK_SIZE, WORLD_HEIGHT, BLOCK_SIZE, BLOCK, BLOCK_COLORS } from './world.js';

const RENDER_DIST = 20;
const UNLOAD_DIST = RENDER_DIST + 2;
const BS = BLOCK_SIZE;
const Y_OFF = Math.floor(WORLD_HEIGHT / 2); // block y offset: block Y_OFF = world y=0

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
const GRASS_TOP_LOW  = new THREE.Color(0x3ab535); // rich lush green
const GRASS_TOP_MID  = new THREE.Color(0x4cc238); // vibrant mid green
const GRASS_TOP_HIGH = new THREE.Color(0x6aad40); // upland green
const GRASS_SIDE = new THREE.Color(0x4a9a30);
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

    update(px, pz) {
        // Convert world position to chunk coordinates
        const pcx = Math.floor(px / (CHUNK_SIZE * BS));
        const pcz = Math.floor(pz / (CHUNK_SIZE * BS));

        if (pcx === this._lastPCX && pcz === this._lastPCZ) {
            this._processQueue(4);
            return;
        }
        this._lastPCX = pcx;
        this._lastPCZ = pcz;

        for (let dx = -RENDER_DIST; dx <= RENDER_DIST; dx++) {
            for (let dz = -RENDER_DIST; dz <= RENDER_DIST; dz++) {
                if (dx * dx + dz * dz > RENDER_DIST * RENDER_DIST) continue;
                const cx = pcx + dx, cz = pcz + dz;
                const key = cx + ',' + cz;
                if (!this.loaded.has(key) && !this.buildQueue.find(q => q.key === key)) {
                    this.buildQueue.push({ cx, cz, key, dist: dx * dx + dz * dz });
                }
            }
        }
        this.buildQueue.sort((a, b) => a.dist - b.dist);

        for (const [key, entry] of this.loaded) {
            const [cx, cz] = key.split(',').map(Number);
            const dx = cx - pcx, dz = cz - pcz;
            if (dx * dx + dz * dz > UNLOAD_DIST * UNLOAD_DIST) {
                if (entry.terrain) { this.scene.remove(entry.terrain); entry.terrain.geometry.dispose(); }
                if (entry.water) { this.scene.remove(entry.water); entry.water.geometry.dispose(); }
                if (entry.leaves) { this.scene.remove(entry.leaves); entry.leaves.geometry.dispose(); }
                this.loaded.delete(key);
            }
        }
        this.loadedCount = this.loaded.size;
        this._processQueue(8);
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
        const entry = this._buildChunkMeshes(cx, cz);
        if (entry.terrain) this.scene.add(entry.terrain);
        if (entry.water) this.scene.add(entry.water);
        if (entry.leaves) this.scene.add(entry.leaves);
        this.loaded.set(key, entry);
    }

    _processQueue(maxPerFrame) {
        let built = 0;
        while (this.buildQueue.length > 0 && built < maxPerFrame) {
            const { cx, cz, key } = this.buildQueue.shift();
            if (this.loaded.has(key)) continue;

            for (let dx = -1; dx <= 1; dx++)
                for (let dz = -1; dz <= 1; dz++)
                    this.world.getOrCreateChunk(cx + dx, cz + dz);

            const entry = this._buildChunkMeshes(cx, cz);
            if (entry.terrain) this.scene.add(entry.terrain);
            if (entry.water) this.scene.add(entry.water);
            if (entry.leaves) this.scene.add(entry.leaves);
            this.loaded.set(key, entry);
            built++;
        }
        this.loadedCount = this.loaded.size;
    }

    _buildChunkMeshes(cx, cz) {
        const ox = cx * CHUNK_SIZE; // block-space origin
        const oz = cz * CHUNK_SIZE;

        const tPos = [], tNrm = [], tCol = [], tIdx = [];
        let tVert = 0;
        const wPos = [], wNrm = [], wIdx = [];
        let wVert = 0;
        const lPos = [], lNrm = [], lCol = [], lIdx = []; // leaves
        let lVert = 0;

        const tmpColor = new THREE.Color();

        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                for (let y = 0; y < WORLD_HEIGHT; y++) {
                    const bx = ox + lx, bz = oz + lz;
                    const block = this.world.getBlockAt(bx, y, bz);

                    if (block === BLOCK.WATER) {
                        const above = this.world.getBlockAt(bx, y + 1, bz);
                        if (above === BLOCK.AIR) {
                            const face = FACES[2];
                            const verts = face.verts;
                            for (let vi = 0; vi < 4; vi++) {
                                wPos.push(
                                    (lx + verts[vi][0]) * BS,
                                    (y - Y_OFF + 0.85) * BS,
                                    (lz + verts[vi][2]) * BS
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
                            const nbx = bx + face.dir[0], nby = y + face.dir[1], nbz = bz + face.dir[2];
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
                                lPos.push((lx + verts[vi][0]) * BS, (y - Y_OFF + verts[vi][1]) * BS, (lz + verts[vi][2]) * BS);
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
                        const nbx = bx + face.dir[0];
                        const nby = y + face.dir[1];
                        const nbz = bz + face.dir[2];
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
                            // Crafting table: darker plank base with grid-line pattern on top
                            if (fi === 2) {
                                // Top face — alternating dark/light for grid look
                                const gx = (bx + bz) % 2 === 0;
                                tmpColor.setRGB(gx ? 0.45 : 0.55, gx ? 0.32 : 0.38, gx ? 0.18 : 0.22);
                            } else {
                                tmpColor.copy(PLANK_DARK).lerp(PLANK_LIGHT, 0.3);
                            }
                        } else if (block === BLOCK.SNOW) {
                            tmpColor.setHex(BLOCK_COLORS[BLOCK.SNOW]);
                            tmpColor.r -= ch * 0.04;
                            tmpColor.b += ch2 * 0.03;
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
                                (lx + verts[vi][0]) * BS,
                                (y - Y_OFF + verts[vi][1]) * BS,
                                (lz + verts[vi][2]) * BS
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
