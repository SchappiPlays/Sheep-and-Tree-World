// world.js — Terrain generation matching game.html's main continent
// 1 Minecraft block = 3×3×3 of these blocks
// Player is ~1.9 units tall ≈ 6 blocks tall

export const BLOCK_SIZE = 1.9 / 6; // ≈ 0.3167 world units per block
export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 256;
export const SEA_LEVEL = 0; // sea level in block coords = world y=0

export const BLOCK = {
    AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5,
    SNOW: 6, BEDROCK: 7, GRAVEL: 8, CLAY: 9, WOOD: 10, LEAVES: 11, PLANKS: 12, CRAFTING: 13, IRON_ORE: 14,
};

export const BLOCK_COLORS = {
    [BLOCK.GRASS]: 0x5b8c3e, [BLOCK.DIRT]: 0x8b6b3d, [BLOCK.STONE]: 0x888888,
    [BLOCK.SAND]: 0xd4c07a, [BLOCK.WATER]: 0x3a7ab5, [BLOCK.SNOW]: 0xe8e8f0,
    [BLOCK.BEDROCK]: 0x333333, [BLOCK.GRAVEL]: 0x777770, [BLOCK.CLAY]: 0x9a8b7a,
    [BLOCK.WOOD]: 0x6B4226, [BLOCK.LEAVES]: 0x2d7d2d, [BLOCK.PLANKS]: 0x9a7a4a, [BLOCK.CRAFTING]: 0x8a6a3a, [BLOCK.IRON_ORE]: 0x8a8580,
};

// ── Terrain functions ported EXACTLY from game.html ──

function gaussianPeak(angle, center, width) {
    let d = angle - center;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.exp(-(d * d) / (2 * width * width));
}

function getIslandRadius(x, z) {
    const angle = Math.atan2(z, x);
    let r = 1100;
    r += Math.sin(angle * 2.0 + 0.5) * 42;
    r += Math.cos(angle * 3.0 + 1.2) * 30;
    r += Math.sin(angle * 4.0 - 0.3) * 20;
    r += Math.cos(angle * 5.0 + 2.1) * 15;
    r += gaussianPeak(angle, 0.0, 0.28) * 180;
    r += gaussianPeak(angle, Math.PI / 2, 0.26) * 140;
    r += gaussianPeak(angle, Math.PI, 0.30) * 160;
    r += gaussianPeak(angle, -Math.PI / 2, 0.25) * 140;
    r -= gaussianPeak(angle, 0.8, 0.22) * 110;
    r -= gaussianPeak(angle, 1.5, 0.24) * 115;
    r -= gaussianPeak(angle, -1.0, 0.25) * 120;
    return r;
}

function getMountainBlend(x, z) {
    const mx = (x - 602) / 85, mz = (z - (-30)) / 130;
    const d = mx * mx + mz * mz; if (d > 1) return 0;
    const t = 1 - d; return t * t;
}
function getNWMountainBlend(x, z) {
    const mx = (x - 510) / 45, mz = (z - (-130)) / 55;
    const d = mx * mx + mz * mz; if (d > 1) return 0;
    const t = 1 - d; return t * t;
}
function getSWMountainBlend(x, z) {
    const mx = (x - 510) / 40, mz = (z - 80) / 50;
    const d = mx * mx + mz * mz; if (d > 1) return 0;
    const t = 1 - d; return t * t;
}
function getNEMountainBlend(x, z) {
    const mx = (x - 730) / 40, mz = (z - (-95)) / 35;
    const d = mx * mx + mz * mz; if (d > 1) return 0;
    const t = 1 - d; return t * t;
}
function getSEMountainBlend(x, z) {
    const mx = (x - 735) / 38, mz = (z - 40) / 33;
    const d = mx * mx + mz * mz; if (d > 1) return 0;
    const t = 1 - d; return t * t;
}
function getFarEastMountainBlend(x, z) {
    const mx = (x - 820) / 160, mz = (z - (-40)) / 140;
    const d = mx * mx + mz * mz; if (d > 1) return 0;
    const t = 1 - d; return t * t;
}
function getCentralValleyBlend(x, z) {
    const vx = (x - 545) / 35, vz = (z - (-90)) / 40;
    const d = vx * vx + vz * vz; if (d > 1) return 0;
    const t = 1 - d; return t * t;
}
function getWesternValleyBlend(x, z) {
    const vx = (x - 505) / 30, vz = (z - (-25)) / 40;
    const d = vx * vx + vz * vz; if (d > 1) return 0;
    const t = 1 - d; return t * t;
}
function getEnchantedBlend(x, z) {
    const ex = (x - 715) / 40, ez = (z - (-30)) / 55;
    const d = ex * ex + ez * ez; if (d > 1) return 0;
    const t = 1 - d; return t * t;
}
function getAncientForestHillBlend(x, z) {
    const hx = (x - (-30)) / 200, hz = (z - (-190)) / 200;
    const d = Math.sqrt(hx * hx + hz * hz);
    if (d > 0.85 || d < 0.3) return 0;
    const ring = 1 - Math.abs(d - 0.55) / 0.3;
    return Math.max(0, ring * ring);
}
function getSnowBlend(z) {
    if (z > -350) return 0; if (z < -450) return 1;
    return (z - (-350)) / (-450 - (-350));
}
function getDesertBlend(z) {
    if (z < 350) return 0; if (z > 450) return 1;
    return (z - 350) / 100;
}
function getScorchedBlend(x, z) {
    const xSpread = x < -300 ? 340 : 220;
    const sx = (x - (-300)) / xSpread, sz = (z - 280) / 220;
    const d = sx * sx + sz * sz; if (d > 1) return 0;
    const t = 1 - d; return t * t;
}

const riverDefs = [
    { name: 'East River', width: 4, pts: [[650,-50],[700,-30],[760,-10],[830,5],[910,10],[1000,15],[1100,20],[1200,25],[1280,28]] },
    { name: 'South River', width: 3, pts: [[80,150],[65,250],[50,350],[40,450],[30,550],[20,650],[10,780],[5,900],[0,1050]] },
    { name: 'North River', width: 3, pts: [[250,-160],[220,-260],[190,-360],[160,-460],[130,-560],[100,-680],[70,-800],[40,-950],[10,-1080]] },
];
for (const riv of riverDefs) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of riv.pts) {
        if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
        if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1];
    }
    const pad = riv.width + 6;
    riv.bbMinX = minX - pad; riv.bbMaxX = maxX + pad;
    riv.bbMinZ = minZ - pad; riv.bbMaxZ = maxZ + pad;
}

function getRiverBlend(x, z, riv) {
    if (x < riv.bbMinX || x > riv.bbMaxX || z < riv.bbMinZ || z > riv.bbMaxZ) return 0;
    let minDist = Infinity;
    const pts = riv.pts;
    for (let i = 0; i < pts.length - 1; i++) {
        const ax = pts[i][0], az = pts[i][1], bx = pts[i+1][0], bz = pts[i+1][1];
        const dx = bx - ax, dz = bz - az;
        const len2 = dx * dx + dz * dz;
        let t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
        const px = ax + t * dx, pz = az + t * dz;
        const d = Math.sqrt((x - px) * (x - px) + (z - pz) * (z - pz));
        if (d < minDist) minDist = d;
    }
    if (minDist >= riv.width + 3) return 0;
    if (minDist <= riv.width * 0.5) return 1;
    return 1 - (minDist - riv.width * 0.5) / (riv.width * 0.5 + 3);
}

// Path flattening points from game.html (structures removed, terrain-only kept)
const pathFlat = [
    {x:0,z:0},{x:14,z:14},{x:70,z:16},{x:85,z:16},{x:77,z:8},{x:85,z:7},{x:85,z:25},{x:77,z:25},
];

// Pond locations from game.html
const pondLocs = [
    {x:-25,z:15,radius:4},{x:35,z:-20,radius:3},{x:10,z:40,radius:2.5},
    {x:-60,z:-510,radius:5},{x:30,z:-540,radius:3.5},{x:-100,z:-560,radius:4},
    {x:10,z:500,radius:4},{x:505,z:-20,radius:5},
    {x:-250,z:100,radius:14},{x:-150,z:-650,radius:18},{x:150,z:600,radius:12},
];

// ── getTerrainHeight — exact port from game.html ──
// Returns height in game.html world units (player ~1.9 tall)
export { getTerrainHeight, getIslandRadius, getMountainBlend, getSnowBlend, getDesertBlend, getScorchedBlend, getEnchantedBlend };

function getTerrainHeight(x, z) {
    const distFromCenter = Math.sqrt(x * x + z * z);
    const localR = getIslandRadius(x, z);

    if (distFromCenter > localR - 30) return 0;

    const fadeStart = localR - 70;
    let edgeFade = distFromCenter > fadeStart ? 1 - (distFromCenter - fadeStart) / 40 : 1;

    let h = 0;
    h += Math.sin(x * 0.04 + 0.5) * Math.cos(z * 0.035) * 4.0;
    h += Math.sin(x * 0.025 - z * 0.03 + 1.2) * 2.5;
    h += Math.sin(x * 0.08 + z * 0.06) * Math.cos(z * 0.09 - x * 0.04) * 1.5;
    h += Math.cos(x * 0.07 - 0.8) * Math.sin(z * 0.065 + 0.3) * 1.2;
    h += Math.sin(x * 0.15 + z * 0.12) * 0.5;
    h += Math.cos(x * 0.18 - z * 0.14 + 2.0) * 0.4;

    // Path flattening
    for (const p of pathFlat) {
        const d = Math.sqrt((x - p.x) ** 2 + (z - p.z) ** 2);
        if (d < 8) { h *= (1 - (1 - d / 8) * 0.7); }
    }

    // Pond depressions
    for (const p of pondLocs) {
        const d = Math.sqrt((x - p.x) ** 2 + (z - p.z) ** 2);
        if (d < p.radius + 3) { const t = Math.max(0, 1 - d / (p.radius + 3)); h *= (1 - t * 0.9); }
    }

    // East mountains
    const mtn = getMountainBlend(x, z);
    if (mtn > 0) {
        let mh = mtn * 65;
        mh += (Math.sin((x-470)*0.12)*Math.cos((z+10)*0.1)*28 + Math.cos((x-495)*0.09)*Math.sin((z+50)*0.08)*22 + Math.sin((x-460)*0.15+1)*Math.cos((z+40)*0.13)*18 + Math.max(0,Math.cos((x-602)*0.07)*25)) * mtn;
        mh += (Math.sin(x*0.3+z*0.25)*3 + Math.cos(x*0.22-z*0.28)*2.5) * mtn;
        h += mh;
    }

    // NW mountains (snowy)
    const nwMtn = getNWMountainBlend(x, z);
    if (nwMtn > 0) {
        let mh = nwMtn * 50;
        mh += (Math.sin((x-400)*0.11)*Math.cos((z+110)*0.09)*18 + Math.cos((x-380)*0.08)*Math.sin((z+150)*0.07)*14 + Math.sin((x-510)*0.14+0.7)*Math.cos((z+120)*0.12)*10 + Math.max(0,Math.cos((x-510)*0.06+(z+130)*0.04)*16)) * nwMtn;
        mh += (Math.sin(x*0.28+z*0.32)*2.5 + Math.cos(x*0.24-z*0.26)*2) * nwMtn;
        h += mh;
    }

    // SW mountains (grassy)
    const swMtn = getSWMountainBlend(x, z);
    if (swMtn > 0) {
        let mh = swMtn * 55;
        mh += (Math.sin((x-400)*0.1)*Math.cos((z-70)*0.08)*20 + Math.cos((x-380)*0.07)*Math.sin((z-90)*0.09)*16 + Math.sin((x-510)*0.13+1.3)*Math.cos((z-80)*0.11)*12 + Math.max(0,Math.cos((x-510)*0.05-(z-80)*0.03)*18)) * swMtn;
        mh += (Math.sin(x*0.26+z*0.3)*2 + Math.cos(x*0.2-z*0.24)*1.8) * swMtn;
        h += mh;
    }

    // NE mountains
    const neMtn = getNEMountainBlend(x, z);
    if (neMtn > 0) {
        let mh = neMtn * 45;
        mh += (Math.sin((x-820)*0.12)*Math.cos((z+85)*0.1)*16 + Math.cos((x-800)*0.09)*Math.sin((z+105)*0.08)*12 + Math.max(0,Math.cos((x-930)*0.06+(z+95)*0.05)*14)) * neMtn;
        mh += (Math.sin(x*0.3+z*0.27)*2.5 + Math.cos(x*0.23-z*0.3)*2) * neMtn;
        h += mh;
    }

    // SE mountains
    const seMtn = getSEMountainBlend(x, z);
    if (seMtn > 0) {
        let mh = seMtn * 40;
        mh += (Math.sin((x-825)*0.11)*Math.cos((z-30)*0.09)*14 + Math.cos((x-805)*0.08)*Math.sin((z-50)*0.07)*10 + Math.max(0,Math.cos((x-935)*0.07-(z-40)*0.04)*12)) * seMtn;
        mh += (Math.sin(x*0.27+z*0.31)*2 + Math.cos(x*0.21-z*0.25)*1.8) * seMtn;
        h += mh;
    }

    // Far-east peak
    const feMtn = getFarEastMountainBlend(x, z);
    if (feMtn > 0) {
        let mh = feMtn * 75;
        const cpDx=(x-820)/65, cpDz=(z+40)/60, cpD=cpDx*cpDx+cpDz*cpDz;
        if (cpD<1){const t=1-cpD; mh+=t*t*55;}
        const p2Dx=(x-795)/58,p2Dz=(z+65)/55,p2D=p2Dx*p2Dx+p2Dz*p2Dz;
        if(p2D<1){const t=1-p2D;mh+=t*t*35;}
        const p3Dx=(x-850)/55,p3Dz=(z+15)/52,p3D=p3Dx*p3Dx+p3Dz*p3Dz;
        if(p3D<1){const t=1-p3D;mh+=t*t*30;}
        const p4Dx=(x-830)/50,p4Dz=(z-10)/46,p4D=p4Dx*p4Dx+p4Dz*p4Dz;
        if(p4D<1){const t=1-p4D;mh+=t*t*25;}
        mh += Math.max(0,Math.cos((x-818)*0.02)*10)*feMtn + Math.max(0,Math.sin((x-820)*0.018+(z+40)*0.015)*8)*feMtn + Math.max(0,Math.cos((x-z*0.6-845)*0.018)*6)*feMtn;
        mh += (Math.sin((x-810)*0.025)*Math.cos((z+30)*0.022)*6 + Math.cos((x-830)*0.022)*Math.sin((z+50)*0.02)*5) * feMtn;
        mh += (Math.sin(x*0.05+z*0.045)*1.5 + Math.cos(x*0.04-z*0.05)*1) * feMtn;
        h += mh;
    }

    // Valleys
    const cvBlend = getCentralValleyBlend(x, z);
    if (cvBlend > 0) { h -= cvBlend * 4; h += cvBlend * (Math.sin(x*0.1+z*0.07)*0.8 + Math.cos(x*0.08-z*0.09+1)*0.6); }
    const wvBlend = getWesternValleyBlend(x, z);
    if (wvBlend > 0) { h -= wvBlend * 3; h += wvBlend * (Math.sin(x*0.09+z*0.11)*0.7 + Math.cos(x*0.07-z*0.08+0.5)*0.5); }
    const enchBlend = getEnchantedBlend(x, z);
    if (enchBlend > 0) { h -= enchBlend * 6; h += enchBlend * (Math.sin(x*0.12+z*0.08)*1.2 + Math.cos(x*0.09-z*0.11+1.5)*0.8); }
    const afHill = getAncientForestHillBlend(x, z);
    if (afHill > 0) { h += afHill * 22 + afHill * Math.sin(x*0.08+z*0.06)*4 + afHill * Math.cos(x*0.05-z*0.07+1)*3; }

    // Mountain passes
    const npDx=(x-555)/18,npDz=(z-40)/14,npD=npDx*npDx+npDz*npDz;
    if(npD<1){const t=1-npD;h-=t*t*10;h=Math.max(0.5,h);}
    const spDx2=(x-555)/18,spDz2=(z+95)/14,spD2=spDx2*spDx2+spDz2*spDz2;
    if(spD2<1){const t=1-spD2;h-=t*t*10;h=Math.max(0.5,h);}

    // Desert plateau
    const plDx=(x-160)/35,plDz=(z-540)/28,plD=plDx*plDx+plDz*plDz;
    if(plD<1.3){
        const plateauH=22;
        if(plD<0.7){h=plateauH+Math.sin(x*0.2+z*0.15)*0.3;}
        else{const cliff=1-(plD-0.7)/0.6;const cs=cliff*cliff*(3-2*cliff);h=h+(plateauH-h)*cs;}
    }

    // Rivers
    for (const riv of riverDefs) {
        const rb = getRiverBlend(x, z, riv);
        if (rb > 0) h = h * (1 - rb) + 0.1 * rb;
    }

    return Math.max(0, h * edgeFade);
}

// ── World class ──

export class World {
    constructor() {
        this.chunks = new Map();
        this._modifiedBlocks = new Map(); // "bx,by,bz" → blockType (for saving)
        this._modsByChunk = new Map(); // "cx,cz" → [{lx,ly,lz,block},...] (for fast chunk apply)
    }

    _hash(x, z) {
        const d = Math.sin(x * 127.1 + z * 311.7 + 42.0) * 43758.5453;
        return d - Math.floor(d);
    }

    // Convert block coords → world coords → game.html terrain height → block height
    getHeightBlocks(bx, bz) {
        const wx = bx * BLOCK_SIZE;
        const wz = bz * BLOCK_SIZE;
        let h = getTerrainHeight(wx, wz);
        // Large sub-terrain hills: rolling mounds across flat areas
        h += Math.sin(bx * 0.06 + bz * 0.05 + 3.0) * 1.5;
        h += Math.cos(bx * 0.045 - bz * 0.055 + 0.7) * 1.2;
        h += Math.sin(bx * 0.08 + bz * 0.03 - 1.5) * 0.9;
        // Medium bumps
        h += Math.sin(bx * 0.15 + bz * 0.12) * 0.6;
        h += Math.cos(bx * 0.11 - bz * 0.14 + 1.3) * 0.5;
        h += Math.sin(bx * 0.19 - bz * 0.16 + 2.7) * 0.4;
        // Small variation
        h += Math.sin(bx * 0.35 + bz * 0.28 + 2.0) * 0.3;
        h += Math.cos(bx * 0.42 - bz * 0.31) * 0.25;
        h += Math.sin(bx * 0.55 + bz * 0.47 - 0.8) * 0.15;
        // Micro roughness
        h += (this._hash(bx * 0.73, bz * 0.91) - 0.5) * 0.2;
        return Math.floor(h / BLOCK_SIZE);
    }

    getHeight(wx, wz) {
        const h = getTerrainHeight(wx, wz);
        return Math.max(BLOCK_SIZE, h + BLOCK_SIZE);
    }

    // Biome at world coordinates
    _getBiome(wx, wz) {
        const snow = getSnowBlend(wz);
        const desert = getDesertBlend(wz);
        const scorched = getScorchedBlend(wx, wz);
        const mtn = getMountainBlend(wx,wz) + getNWMountainBlend(wx,wz) + getSWMountainBlend(wx,wz) + getNEMountainBlend(wx,wz) + getSEMountainBlend(wx,wz) + getFarEastMountainBlend(wx,wz);
        if (scorched > 0.1) return 'scorched';
        if (snow > 0.5) return 'snow';
        if (desert > 0.5) return 'desert';
        if (mtn > 0.3) return 'mountain';
        if (snow > 0) return 'snow_transition';
        if (desert > 0) return 'desert_transition';
        return 'grass';
    }

    getChunkKey(cx, cz) { return cx + ',' + cz; }

    getOrCreateChunk(cx, cz) {
        const key = this.getChunkKey(cx, cz);
        if (this.chunks.has(key)) return this.chunks.get(key);
        const data = this.generateChunk(cx, cz);
        this.chunks.set(key, data);
        // Apply saved modifications for this chunk only (fast indexed lookup)
        const mods = this._modsByChunk.get(key);
        if (mods) {
            for (const m of mods) {
                data[(m.y * CHUNK_SIZE + m.lz) * CHUNK_SIZE + m.lx] = m.block;
            }
        }
        return data;
    }

    generateChunk(cx, cz) {
        const data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
        const ox = cx * CHUNK_SIZE;
        const oz = cz * CHUNK_SIZE;
        // Y offset: world y=0 maps to block y=WORLD_HEIGHT/2 so we can have underwater
        const yOff = Math.floor(WORLD_HEIGHT / 2);

        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                const bx = ox + lx;
                const bz = oz + lz;
                const wx = bx * BLOCK_SIZE;
                const wz = bz * BLOCK_SIZE;
                const h = getTerrainHeight(wx, wz);
                const surfaceBlock = Math.floor(h / BLOCK_SIZE) + yOff;
                const seaBlock = yOff; // y=0 in world = sea level

                const biome = this._getBiome(wx, wz);
                const dirtDepth = 8 + Math.floor(this._hash(bx * 0.1, bz * 0.1) * 6);

                // Check if inside a pond or river
                let inPond = false, pondWaterLevel = 0;
                for (const p of pondLocs) {
                    const pd = Math.sqrt((wx - p.x) ** 2 + (wz - p.z) ** 2);
                    if (pd < p.radius + 1) {
                        inPond = true;
                        // Water sits at a natural level based on surrounding terrain
                        pondWaterLevel = Math.floor(1.5 / BLOCK_SIZE) + yOff;
                        break;
                    }
                }
                let inRiver = false;
                for (const riv of riverDefs) {
                    if (getRiverBlend(wx, wz, riv) > 0.5) {
                        inRiver = true;
                        break;
                    }
                }
                const riverWaterLevel = Math.floor(0.5 / BLOCK_SIZE) + yOff;

                // Near coast = sand. Inland low areas = grass/water
                const distFC = Math.sqrt(wx * wx + wz * wz);
                const isCoastal = distFC > getIslandRadius(wx, wz) - 80;

                for (let y = 0; y < WORLD_HEIGHT; y++) {
                    let block = BLOCK.AIR;

                    if (y === 0) {
                        block = BLOCK.BEDROCK;
                    } else if (y < 3) {
                        block = this._hash(bx + y * 37, bz + y * 71) < 0.5 ? BLOCK.BEDROCK : BLOCK.STONE;
                    } else if (y < surfaceBlock - dirtDepth) {
                        // Iron ore veins in stone
                        const oreN = this._hash(bx * 0.31 + y * 0.17, bz * 0.23 + y * 0.41);
                        if (oreN > 0.92) block = BLOCK.IRON_ORE;
                        else block = BLOCK.STONE;
                    } else if (y < surfaceBlock) {
                        if (inPond) block = BLOCK.CLAY;
                        else if (inRiver) block = BLOCK.SAND;
                        else if (biome === 'desert' || biome === 'desert_transition') block = BLOCK.SAND;
                        else block = BLOCK.DIRT;
                    } else if (y === surfaceBlock) {
                        if (inPond) block = BLOCK.CLAY;
                        else if (inRiver) block = BLOCK.SAND;
                        else if (biome === 'snow') block = BLOCK.SNOW;
                        else if (biome === 'snow_transition') block = this._hash(bx*3.1,bz*2.7) > 0.5 ? BLOCK.SNOW : BLOCK.GRASS;
                        else if (biome === 'desert') block = BLOCK.SAND;
                        else if (biome === 'desert_transition') block = this._hash(bx*2.1,bz*3.7) > 0.5 ? BLOCK.SAND : BLOCK.GRASS;
                        else if (biome === 'scorched') block = BLOCK.GRAVEL;
                        else if (biome === 'mountain' && h > 50) block = BLOCK.SNOW;
                        else if (biome === 'mountain' && h > 35) block = BLOCK.STONE;
                        else if (isCoastal && h < 1.5) block = BLOCK.SAND;
                        else block = BLOCK.GRASS;
                    } else if (inPond && y > surfaceBlock && y <= pondWaterLevel) {
                        block = BLOCK.WATER;
                    } else if (inRiver && y > surfaceBlock && y <= riverWaterLevel) {
                        block = BLOCK.WATER;
                    } else if (y <= seaBlock && surfaceBlock < seaBlock) {
                        block = BLOCK.WATER;
                    }

                    if (block !== BLOCK.AIR) {
                        data[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] = block;
                    }
                }
            }
        }

        this._placeTreesInChunk(cx, cz, data, ox, oz);
        return data;
    }

    _placeTreesInChunk(cx, cz, data, ox, oz) {
        const yOff = Math.floor(WORLD_HEIGHT / 2);
        for (let lx = 0; lx < CHUNK_SIZE; lx += 2) {
            for (let lz = 0; lz < CHUNK_SIZE; lz += 2) {
                const bx = ox + lx, bz = oz + lz;
                if (this._hash(bx * 0.37 + 7777, bz * 0.53 + 3333) > 0.06) continue;

                const jx = bx + Math.floor(this._hash(bx+11,bz+22)*2);
                const jz = bz + Math.floor(this._hash(bx+33,bz+44)*2);
                const ljx = jx - ox, ljz = jz - oz;
                if (ljx < 0 || ljx >= CHUNK_SIZE || ljz < 0 || ljz >= CHUNK_SIZE) continue;

                const wx = jx * BLOCK_SIZE, wz = jz * BLOCK_SIZE;
                const h = getTerrainHeight(wx, wz);
                const biome = this._getBiome(wx, wz);
                if (biome !== 'grass' && biome !== 'desert_transition') continue;
                if (h < 1 || h > 35) continue;

                const surfaceBlock = Math.floor(h / BLOCK_SIZE) + yOff;
                const trunkH = 4 + Math.floor(this._hash(jx*1.7, jz*2.3) * 4);
                const canopyR = 2 + Math.floor(this._hash(jx*3.1, jz*1.9) * 2);
                const canopyH = canopyR * 2 + 1;
                const canopyBase = surfaceBlock + trunkH - 1;

                for (let ty = 1; ty <= trunkH; ty++) {
                    const y = surfaceBlock + ty;
                    if (y >= WORLD_HEIGHT) break;
                    data[(y * CHUNK_SIZE + ljz) * CHUNK_SIZE + ljx] = BLOCK.WOOD;
                }

                for (let dy = 0; dy < canopyH; dy++) {
                    const y = canopyBase + dy;
                    if (y >= WORLD_HEIGHT) break;
                    const progress = dy / (canopyH - 1);
                    const r = Math.ceil(canopyR * (1 - progress * 0.7));
                    for (let ddx = -r; ddx <= r; ddx++) {
                        for (let ddz = -r; ddz <= r; ddz++) {
                            if (ddx*ddx + ddz*ddz > r*r+1) continue;
                            const tlx = ljx+ddx, tlz = ljz+ddz;
                            if (tlx<0||tlx>=CHUNK_SIZE||tlz<0||tlz>=CHUNK_SIZE) continue;
                            const idx = (y*CHUNK_SIZE+tlz)*CHUNK_SIZE+tlx;
                            if (data[idx] === BLOCK.AIR) data[idx] = BLOCK.LEAVES;
                        }
                    }
                }
            }
        }
    }

    setBlock(bx, by, bz, block) {
        if (by < 0 || by >= WORLD_HEIGHT) return;
        const cx = Math.floor(bx / CHUNK_SIZE);
        const cz = Math.floor(bz / CHUNK_SIZE);
        const lx = ((bx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((bz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const data = this.chunks.get(this.getChunkKey(cx, cz));
        if (!data) return;
        data[(by * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] = block;
        // Track for saving
        this._modifiedBlocks.set(bx + ',' + by + ',' + bz, block);
        // Index by chunk for fast apply on load
        const ck = cx + ',' + cz;
        if (!this._modsByChunk.has(ck)) this._modsByChunk.set(ck, []);
        this._modsByChunk.get(ck).push({ lx, y: by, lz, block });
    }

    getBlockAt(bx, by, bz) {
        if (by < 0 || by >= WORLD_HEIGHT) return BLOCK.AIR;
        const cx = Math.floor(bx / CHUNK_SIZE);
        const cz = Math.floor(bz / CHUNK_SIZE);
        const lx = ((bx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((bz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const data = this.chunks.get(this.getChunkKey(cx, cz));
        if (!data) return BLOCK.AIR;
        return data[(by * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];
    }

    isSolid(wx, wy, wz) {
        const bx = Math.floor(wx / BLOCK_SIZE);
        const by = Math.floor(wy / BLOCK_SIZE) + Math.floor(WORLD_HEIGHT / 2);
        const bz = Math.floor(wz / BLOCK_SIZE);
        const b = this.getBlockAt(bx, by, bz);
        return b !== BLOCK.AIR && b !== BLOCK.WATER && b !== BLOCK.LEAVES;
    }
}
