// world.js — Terrain generation matching game.html's main continent
// 1 Minecraft block = 3×3×3 of these blocks
// Player is ~1.9 units tall ≈ 4 blocks tall. 2x2x2 blocks = 1 Minecraft block

export const BLOCK_SIZE = 1.9 / 4; // ≈ 0.475 world units per block
export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 384;
export const SEA_LEVEL = 0; // sea level in block coords = world y=0

export const BLOCK = {
    AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5,
    SNOW: 6, BEDROCK: 7, GRAVEL: 8, CLAY: 9, WOOD: 10, LEAVES: 11, PLANKS: 12, CRAFTING: 13, IRON_ORE: 14, FURNACE: 15, COAL_ORE: 16, DIAMOND_ORE: 17, GOLD_ORE: 18, ANVIL: 19, BLAST_FURNACE: 20, RUBY_ORE: 21, SAPPHIRE_ORE: 22, EMERALD_ORE: 23, TOPAZ_ORE: 24, DARK_STONE: 25, CAMPFIRE: 26, CHEST: 27, COPPER_ORE: 28, FLOWER_RED: 29, FLOWER_YELLOW: 30, FLOWER_BLUE: 31, FLOWER_WHITE: 32, PATH: 33,
};

export const BLOCK_COLORS = {
    [BLOCK.GRASS]: 0x3d6b2e, [BLOCK.DIRT]: 0x8b6b3d, [BLOCK.STONE]: 0x888888,
    [BLOCK.SAND]: 0xd4c07a, [BLOCK.WATER]: 0x3a7ab5, [BLOCK.SNOW]: 0xe8e8f0,
    [BLOCK.BEDROCK]: 0x333333, [BLOCK.GRAVEL]: 0x777770, [BLOCK.CLAY]: 0x9a8b7a,
    [BLOCK.WOOD]: 0x6B4226, [BLOCK.LEAVES]: 0x2d7d2d, [BLOCK.PLANKS]: 0x9a7a4a, [BLOCK.CRAFTING]: 0x8a6a3a, [BLOCK.IRON_ORE]: 0x8a8580, [BLOCK.FURNACE]: 0x6a6a6a, [BLOCK.COAL_ORE]: 0x3a3a3a, [BLOCK.DIAMOND_ORE]: 0x4ae8e8, [BLOCK.GOLD_ORE]: 0xdaa520, [BLOCK.ANVIL]: 0x555555, [BLOCK.BLAST_FURNACE]: 0x4a4a50, [BLOCK.RUBY_ORE]: 0xcc3344, [BLOCK.DARK_STONE]: 0x3a3a3e, [BLOCK.CAMPFIRE]: 0x8a4a1a, [BLOCK.SAPPHIRE_ORE]: 0x2244cc, [BLOCK.EMERALD_ORE]: 0x22cc44, [BLOCK.TOPAZ_ORE]: 0xddaa22, [BLOCK.CHEST]: 0x8a6535, [BLOCK.COPPER_ORE]: 0xb87333, [BLOCK.PATH]: 0x8a7a5a, [BLOCK.FLOWER_RED]: 0xdd3333, [BLOCK.FLOWER_YELLOW]: 0xddcc33, [BLOCK.FLOWER_BLUE]: 0x4466dd, [BLOCK.FLOWER_WHITE]: 0xeeeeff,
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
    // Gate gaps — suppress hills at cardinal directions
    const angle = Math.atan2(hz, hx);
    const gateAngles = [Math.PI, 0, Math.PI/2, -Math.PI/2]; // west, east, south, north
    const gateWidth = 0.12;
    for (const ga of gateAngles) {
        let diff = Math.abs(angle - ga);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff < gateWidth) return 0;
        if (diff < gateWidth * 2) {
            const fade = (diff - gateWidth) / gateWidth;
            const ring = 1 - Math.abs(d - 0.55) / 0.3;
            return Math.max(0, ring * ring) * fade;
        }
    }
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

// ── Path system — connects villages, fortress, castle ──
const PATH_HALF_WIDTH = 3; // 6 blocks wide (3 each side)
// Path routes: arrays of [x, z] waypoints in world coords
// Paths wind using intermediate waypoints offset from straight lines
const PATH_ROUTES = [
    // Meadow Village (80,16) → Hillside Town (200,60)
    [[80,16],[110,25],[140,30],[170,45],[200,60]],
    // Meadow Village → Forest Edge (-100,-50)
    [[80,16],[50,10],[20,0],[-10,-10],[-40,-20],[-70,-35],[-100,-50]],
    // Meadow Village → Northwatch (50,-150)
    [[80,16],[75,-10],[70,-40],[65,-70],[58,-100],[52,-130],[50,-150]],
    // Forest Edge (-100,-50) → Western Hamlet (-200,100)
    [[-100,-50],[-120,-30],[-140,-10],[-160,20],[-175,50],[-190,75],[-200,100]],
    // Forest Edge → Northwatch (50,-150)
    [[-100,-50],[-80,-70],[-55,-90],[-30,-110],[-5,-130],[20,-140],[50,-150]],
    // Western Hamlet (-200,100) → Southmoor (-150,200)
    [[-200,100],[-195,120],[-185,140],[-175,160],[-165,180],[-150,200]],
    // Southmoor → Meadow Village (loop back via south)
    [[-150,200],[-110,190],[-70,170],[-30,140],[10,110],[40,80],[60,50],[80,16]],
    // Branch: Forest Edge → Castle (-400,20)
    [[-100,-50],[-150,-45],[-200,-40],[-260,-30],[-320,-15],[-370,0],[-400,20]],
    // Branch: Castle → Ruined Fortress (-505,-175)
    [[-400,20],[-420,-10],[-440,-40],[-460,-70],[-475,-100],[-490,-140],[-505,-175]],
    // Branch: Hillside Town → east
    [[200,60],[230,50],[260,70],[280,90]],
    // Branch: Northwatch → north toward ancient forest
    [[50,-150],[40,-170],[30,-190],[20,-210]],
];

function isOnPath(wx, wz) {
    const pw = PATH_HALF_WIDTH * BLOCK_SIZE;
    for (const route of PATH_ROUTES) {
        for (let i = 0; i < route.length - 1; i++) {
            const [ax, az] = route[i], [bx, bz] = route[i+1];
            // Distance from point to line segment
            const dx = bx - ax, dz = bz - az;
            const len2 = dx*dx + dz*dz;
            if (len2 < 0.01) continue;
            let t = ((wx - ax)*dx + (wz - az)*dz) / len2;
            t = Math.max(0, Math.min(1, t));
            const px = ax + t * dx, pz = az + t * dz;
            const dist2 = (wx-px)*(wx-px) + (wz-pz)*(wz-pz);
            if (dist2 < pw * pw) return true;
        }
    }
    return false;
}

// ── getTerrainHeight — exact port from game.html ──
// Returns height in game.html world units (player ~1.9 tall)
export { getTerrainHeight, getIslandRadius, getMountainBlend, getNWMountainBlend, getSWMountainBlend, getNEMountainBlend, getSEMountainBlend, getFarEastMountainBlend, getSnowBlend, getDesertBlend, getScorchedBlend, getEnchantedBlend, isOnPath };

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

    // Valleys (removed)
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

    // Raw terrain height without detail noise — for structure placement
    getBaseHeightBlocks(bx, bz) {
        const wx = bx * BLOCK_SIZE;
        const wz = bz * BLOCK_SIZE;
        return Math.floor(getTerrainHeight(wx, wz) / BLOCK_SIZE);
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
        const yOff = 128;

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
                        // Ore clusters — hash-based, no infinite veins
                        // Only check the cell this block is in (no neighbor search = much faster)
                        const _oreCheck = (bx, y, bz, gridSize, clusterR, density, seed) => {
                            const gx = Math.floor(bx / gridSize), gy = Math.floor(y / gridSize), gz = Math.floor(bz / gridSize);
                            const cellHash = this._hash(gx * 73.1 + gy * 37.9 + seed, gz * 51.3 + seed);
                            if (cellHash > density) return false;
                            const ccx = (gx + this._hash(gx*17+seed, gz*31+seed)) * gridSize;
                            const ccy = (gy + this._hash(gy*23+seed, gx*41+seed)) * gridSize;
                            const ccz = (gz + this._hash(gz*29+seed, gy*47+seed)) * gridSize;
                            const ddx = bx-ccx, ddy = y-ccy, ddz = bz-ccz;
                            return ddx*ddx + ddy*ddy + ddz*ddz < clusterR*clusterR;
                        };
                        const depthBelow = surfaceBlock - y;
                        // gridSize = spacing between potential clusters
                        // clusterR = radius of each cluster
                        // density = chance each grid cell has a cluster (lower = rarer)
                        if (depthBelow > 35 && _oreCheck(bx,y,bz, 16, 2.5, 0.08, 111)) block = BLOCK.DIAMOND_ORE;
                        else if (depthBelow > 25 && _oreCheck(bx,y,bz, 18, 2, 0.06, 222)) block = BLOCK.RUBY_ORE;
                        else if (depthBelow > 25 && _oreCheck(bx,y,bz, 18, 2, 0.06, 333)) block = BLOCK.SAPPHIRE_ORE;
                        else if (depthBelow > 20 && _oreCheck(bx,y,bz, 16, 2.5, 0.07, 444)) block = BLOCK.EMERALD_ORE;
                        else if (depthBelow > 20 && _oreCheck(bx,y,bz, 16, 2.5, 0.07, 555)) block = BLOCK.TOPAZ_ORE;
                        else if (depthBelow > 15 && _oreCheck(bx,y,bz, 12, 3, 0.1, 666)) block = BLOCK.GOLD_ORE;
                        else if (_oreCheck(bx,y,bz, 10, 3.5, 0.15, 777)) block = BLOCK.IRON_ORE;
                        else if (depthBelow > 3 && depthBelow < 25 && _oreCheck(bx,y,bz, 8, 3.5, 0.18, 888)) block = BLOCK.COPPER_ORE;
                        else if (_oreCheck(bx,y,bz, 8, 4, 0.2, 999)) block = BLOCK.COAL_ORE;
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
                        else if (isOnPath(wx, wz)) block = BLOCK.PATH;
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

        this._carveCaves(cx, cz, data, ox, oz);
        this._placeTreesInChunk(cx, cz, data, ox, oz);
        // Villages placed after trees so houses override trees
        if (this._placeVillages) this._placeVillages(this, cx, cz, data);
        return data;
    }

    _placeTreesInChunk(cx, cz, data, ox, oz) {
        const yOff = 128;
        // Hill ring ancient forest — dense tall trees inside the ring
        const hillCX = -30, hillCZ = -190, hillR = 170; // inner radius (flat area)
        const chunkWX = ox * BLOCK_SIZE, chunkWZ = oz * BLOCK_SIZE;
        const dxH = chunkWX + 8*BLOCK_SIZE - hillCX, dzH = chunkWZ + 8*BLOCK_SIZE - hillCZ;
        const chunkDistToHill = Math.sqrt(dxH*dxH + dzH*dzH);
        if (chunkDistToHill < hillR) {
            // Dense ancient forest
            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                    const bx = ox + lx, bz = oz + lz;
                    const wx = bx * BLOCK_SIZE, wz = bz * BLOCK_SIZE;
                    const distToCenter = Math.sqrt((wx-hillCX)*(wx-hillCX) + (wz-hillCZ)*(wz-hillCZ));
                    if (distToCenter > hillR - 10) continue; // fade at edges
                    // Moderate density — ~10% chance, spaced out
                    if (this._hash(bx * 0.37 + 1111, bz * 0.53 + 2222) > 0.10) continue;
                    if (lx % 3 !== 0 || lz % 3 !== 0) continue;
                    const h = getTerrainHeight(wx, wz);
                    if (h < 0 || h > 40) continue;
                    const surfaceBlock = Math.floor(h / BLOCK_SIZE) + yOff;
                    // Tall ancient trees — 8-14 blocks trunk, big canopy
                    const trunkH = 8 + Math.floor(this._hash(bx*1.7, bz*2.3) * 6);
                    const canopyR = 3 + Math.floor(this._hash(bx*3.1, bz*1.9) * 2);
                    const canopyH = canopyR * 2 + 2;
                    const canopyBase = surfaceBlock + trunkH - 2;
                    for (let ty = 1; ty <= trunkH; ty++) {
                        const y = surfaceBlock + ty;
                        if (y >= WORLD_HEIGHT) break;
                        data[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] = BLOCK.WOOD;
                    }
                    for (let dy = 0; dy < canopyH; dy++) {
                        const y = canopyBase + dy;
                        if (y >= WORLD_HEIGHT) break;
                        const progress = dy / (canopyH - 1);
                        const r = Math.ceil(canopyR * (1 - progress * 0.6));
                        for (let ddx = -r; ddx <= r; ddx++) {
                            for (let ddz = -r; ddz <= r; ddz++) {
                                if (ddx*ddx + ddz*ddz > r*r+1) continue;
                                const tlx = lx+ddx, tlz = lz+ddz;
                                if (tlx<0||tlx>=CHUNK_SIZE||tlz<0||tlz>=CHUNK_SIZE) continue;
                                const idx = (y*CHUNK_SIZE+tlz)*CHUNK_SIZE+tlx;
                                if (data[idx] === BLOCK.AIR) data[idx] = BLOCK.LEAVES;
                            }
                        }
                    }
                }
            }
        }

        // Normal trees
        for (let lx = 0; lx < CHUNK_SIZE; lx += 2) {
            for (let lz = 0; lz < CHUNK_SIZE; lz += 2) {
                const bx = ox + lx, bz = oz + lz;
                // Skip normal trees inside hill ring (ancient forest handles it)
                const twx = bx * BLOCK_SIZE, twz = bz * BLOCK_SIZE;
                const tdh = Math.sqrt((twx-hillCX)*(twx-hillCX) + (twz-hillCZ)*(twz-hillCZ));
                if (tdh < hillR - 5) continue;
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
                if (isOnPath(wx, wz)) continue; // no trees on paths

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

        // Flowers — spawn on grass surfaces, some in bunches
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                const bx = ox + lx, bz = oz + lz;
                const wx = bx * BLOCK_SIZE, wz = bz * BLOCK_SIZE;
                const biome = this._getBiome(wx, wz);
                if (biome !== 'grass') continue;
                const h = getTerrainHeight(wx, wz);
                if (h < 1 || h > 30) continue;
                if (isOnPath(wx, wz)) continue; // no flowers on paths
                // ~1% chance per block for flower patches (but bunches make them dense locally)
                const fHash = this._hash(bx * 0.61 + 4444, bz * 0.47 + 5555);
                if (fHash > 0.01) continue;
                // Pick flower color — bunches share a color
                const colorHash = this._hash(bx * 1.3 + 111, bz * 1.7 + 222);
                let flower;
                if (colorHash < 0.3) flower = BLOCK.FLOWER_RED;
                else if (colorHash < 0.55) flower = BLOCK.FLOWER_YELLOW;
                else if (colorHash < 0.8) flower = BLOCK.FLOWER_BLUE;
                else flower = BLOCK.FLOWER_WHITE;
                // Place this flower
                const surfaceBlock = Math.floor(h / BLOCK_SIZE) + yOff;
                const flowerY = surfaceBlock + 1;
                if (flowerY >= WORLD_HEIGHT) continue;
                const idx = (flowerY * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
                if (data[idx] !== BLOCK.AIR) continue;
                data[idx] = flower;
                // 70% chance to spawn a bunch (3-6 extra nearby)
                if (this._hash(bx * 0.83 + 6666, bz * 0.71 + 7777) < 0.7) {
                    const bunchSize = 3 + Math.floor(this._hash(bx * 2.1, bz * 3.3) * 4);
                    for (let bi = 0; bi < bunchSize; bi++) {
                        const bdx = Math.floor(this._hash(bi*17+bx, bi*31+bz) * 3) - 1;
                        const bdz = Math.floor(this._hash(bi*23+bx, bi*43+bz) * 3) - 1;
                        const nlx = lx + bdx, nlz = lz + bdz;
                        if (nlx < 0 || nlx >= CHUNK_SIZE || nlz < 0 || nlz >= CHUNK_SIZE) continue;
                        const nbx = ox + nlx, nbz = oz + nlz;
                        const nh = getTerrainHeight(nbx * BLOCK_SIZE, nbz * BLOCK_SIZE);
                        const nsb = Math.floor(nh / BLOCK_SIZE) + yOff;
                        const nfy = nsb + 1;
                        if (nfy >= WORLD_HEIGHT) continue;
                        const nIdx = (nfy * CHUNK_SIZE + nlz) * CHUNK_SIZE + nlx;
                        if (data[nIdx] === BLOCK.AIR) data[nIdx] = flower; // same color as parent
                    }
                }
            }
        }
    }

    _carveCaves(cx, cz, data, ox, oz) {
        const yOff = 128;
        const hillCX = -30, hillCZ = -190, hillR = 200;

        // Quick check — skip entirely if chunk is far from the hill ring
        const chunkCenterWX = (ox + 8) * BLOCK_SIZE;
        const chunkCenterWZ = (oz + 8) * BLOCK_SIZE;
        const dxH = chunkCenterWX - hillCX, dzH = chunkCenterWZ - hillCZ;
        const distToHill = Math.sqrt(dxH * dxH + dzH * dzH);
        if (distToHill > hillR + 20) return;

        // Underground cavern system — large connected chambers, no surface openings
        // Dig down to find them
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                const bx = ox + lx, bz = oz + lz;
                const wx = bx * BLOCK_SIZE, wz = bz * BLOCK_SIZE;

                const dxC = wx - hillCX, dzC = wz - hillCZ;
                const distC = Math.sqrt(dxC * dxC + dzC * dzC);
                if (distC < 40 || distC > 185) continue;

                const surfaceH = this.getHeightBlocks(bx, bz);
                const surfaceY = surfaceH + yOff;
                // Start 25 blocks below surface — deep underground
                const caveTop = surfaceY - 25;

                for (let y = Math.max(5, yOff - 50); y < caveTop; y++) {
                    const wy = (y - yOff) * BLOCK_SIZE;

                    // Higher frequency noise for smaller, tighter caves
                    const n1 = Math.sin(wx * 0.04 + wy * 0.05 + wz * 0.042 + 5.3) *
                               Math.cos(wx * 0.035 - wy * 0.04 + wz * 0.038 + 2.1);
                    const n2 = Math.sin(wx * 0.06 + wy * 0.04 - wz * 0.055 + 8.7) *
                               Math.cos(wx * 0.05 + wy * 0.035 + wz * 0.045 + 3.4);

                    const caveNoise = Math.max(n1, n2);
                    const ringFactor = 1 - Math.abs(distC - 110) / 80;
                    if (ringFactor <= 0) continue;

                    // Higher threshold = smaller caves
                    if (caveNoise > 0.35 + (1 - ringFactor) * 0.15) {
                        const idx = (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
                        const block = data[idx];
                        if (block !== BLOCK.AIR && block !== BLOCK.WATER && block !== BLOCK.BEDROCK) {
                            data[idx] = BLOCK.AIR;
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
        // Track for saving + deferred apply (even if chunk not loaded yet)
        this._modifiedBlocks.set(bx + ',' + by + ',' + bz, block);
        const ck = cx + ',' + cz;
        if (!this._modsByChunk.has(ck)) this._modsByChunk.set(ck, []);
        this._modsByChunk.get(ck).push({ lx, y: by, lz, block });
        // Apply to loaded chunk immediately
        const data = this.chunks.get(this.getChunkKey(cx, cz));
        if (!data) return;
        data[(by * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] = block;
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
        const by = Math.floor(wy / BLOCK_SIZE) + 128;
        const bz = Math.floor(wz / BLOCK_SIZE);
        const b = this.getBlockAt(bx, by, bz);
        return b !== BLOCK.AIR && b !== BLOCK.WATER && b !== BLOCK.LEAVES && b !== BLOCK.FLOWER_RED && b !== BLOCK.FLOWER_YELLOW && b !== BLOCK.FLOWER_BLUE && b !== BLOCK.FLOWER_WHITE;
    }
}
