// world.js — Terrain generation matching game.html's main continent
// 1 Minecraft block = 3×3×3 of these blocks
// Player is ~1.9 units tall ≈ 4 blocks tall. 2x2x2 blocks = 1 Minecraft block

export const BLOCK_SIZE = 1.9 / 4; // ≈ 0.475 world units per block
export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 512;
export const SEA_LEVEL = 0; // sea level in block coords = world y=0

export const BLOCK = {
    AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5,
    SNOW: 6, BEDROCK: 7, GRAVEL: 8, CLAY: 9, WOOD: 10, LEAVES: 11, PLANKS: 12, CRAFTING: 13, IRON_ORE: 14, FURNACE: 15, COAL_ORE: 16, DIAMOND_ORE: 17, GOLD_ORE: 18, ANVIL: 19, BLAST_FURNACE: 20, RUBY_ORE: 21, SAPPHIRE_ORE: 22, EMERALD_ORE: 23, TOPAZ_ORE: 24, DARK_STONE: 25, CAMPFIRE: 26, CHEST: 27, COPPER_ORE: 28, FLOWER_RED: 29, FLOWER_YELLOW: 30, FLOWER_BLUE: 31, FLOWER_WHITE: 32, PATH: 33, PINE_WOOD: 34, PINE_LEAVES: 35, ICE: 36,
};

export const BLOCK_COLORS = {
    [BLOCK.GRASS]: 0x5a9040, [BLOCK.DIRT]: 0x8b6b3d, [BLOCK.STONE]: 0x888888,
    [BLOCK.SAND]: 0xd4c07a, [BLOCK.WATER]: 0x3a7ab5, [BLOCK.SNOW]: 0xe8e8f0,
    [BLOCK.BEDROCK]: 0x333333, [BLOCK.GRAVEL]: 0x777770, [BLOCK.CLAY]: 0x9a8b7a,
    [BLOCK.WOOD]: 0x6B4226, [BLOCK.LEAVES]: 0x3a8a3a, [BLOCK.PLANKS]: 0x9a7a4a, [BLOCK.CRAFTING]: 0x8a6a3a, [BLOCK.IRON_ORE]: 0x8a8580, [BLOCK.FURNACE]: 0x6a6a6a, [BLOCK.COAL_ORE]: 0x3a3a3a, [BLOCK.DIAMOND_ORE]: 0x4ae8e8, [BLOCK.GOLD_ORE]: 0xdaa520, [BLOCK.ANVIL]: 0x555555, [BLOCK.BLAST_FURNACE]: 0x4a4a50, [BLOCK.RUBY_ORE]: 0xcc3344, [BLOCK.DARK_STONE]: 0x3a3a3e, [BLOCK.CAMPFIRE]: 0x8a4a1a, [BLOCK.SAPPHIRE_ORE]: 0x2244cc, [BLOCK.EMERALD_ORE]: 0x22cc44, [BLOCK.TOPAZ_ORE]: 0xddaa22, [BLOCK.CHEST]: 0x8a6535, [BLOCK.COPPER_ORE]: 0xb87333, [BLOCK.PATH]: 0x8a7a5a, [BLOCK.FLOWER_RED]: 0xdd3333, [BLOCK.FLOWER_YELLOW]: 0xddcc33, [BLOCK.FLOWER_BLUE]: 0x4466dd, [BLOCK.FLOWER_WHITE]: 0xeeeeff,
    [BLOCK.PINE_WOOD]: 0x4a3020, [BLOCK.PINE_LEAVES]: 0x1a4a2a,
    [BLOCK.ICE]: 0x8ac8e8,
};

// ── Terrain functions ported EXACTLY from game.html ──

function gaussianPeak(angle, center, width) {
    let d = angle - center;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.exp(-(d * d) / (2 * width * width));
}

// Island is elliptical — stretched on N-S axis (1.4x taller than wide)
const ISLAND_NS_SCALE = 1.4;

function getIslandRadius(x, z) {
    // Scale z to create elliptical shape (wider N-S)
    const sz = z / ISLAND_NS_SCALE;
    const angle = Math.atan2(sz, x);
    let r = 1100;
    r += Math.sin(angle * 2.0 + 0.5) * 42;
    r += Math.cos(angle * 3.0 + 1.2) * 30;
    r += Math.sin(angle * 4.0 - 0.3) * 20;
    r += Math.cos(angle * 5.0 + 2.1) * 15;
    r += gaussianPeak(angle, 0.0, 0.28) * 180;
    r += gaussianPeak(angle, Math.PI / 2, 0.26) * 180;
    r += gaussianPeak(angle, Math.PI, 0.30) * 160;
    r += gaussianPeak(angle, -Math.PI / 2, 0.25) * 180;
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
const FM_CX = -30, FM_CZ = -1050, FM_OUTER = 280, FM_RING_W = 120;
const FM_INNER = FM_OUTER - FM_RING_W;
function getFrozenMountainBlend(x, z) {
    const dx = x - FM_CX, dz = z - FM_CZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > FM_OUTER + 30) return 0;
    const ringCenter = FM_INNER + FM_RING_W / 2;
    const ringDist = Math.abs(dist - ringCenter);
    const halfW = FM_RING_W / 2;
    if (ringDist > halfW + 30) {
        if (dist < FM_INNER) { const t = 1 - dist / FM_INNER; return t * t * 0.2; }
        return 0;
    }
    const t = 1 - Math.min(1, ringDist / (halfW + 30));
    return t * t;
}
function getDeepNorthBlend(x, z) {
    const ranges = [
        [-250, -1350, 150, 55],  // NW ridge
        [200, -1300, 130, 100],  // NE peaks
        [50, -1400, 55, 150],    // Central spine
        [-400, -1200, 100, 70],  // West deep north
        [380, -1180, 90, 65],    // East deep north
    ];
    for (const r of ranges) {
        const dx = (x - r[0]) / r[2], dz = (z - r[1]) / r[3];
        const d = dx*dx + dz*dz;
        if (d < 1) { const t = 1 - d; return t * t; }
    }
    return 0;
}
function getFrozenBasinBlend(x, z) {
    const dx = x - FM_CX, dz = z - FM_CZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist >= FM_INNER) return 0;
    const t = 1 - dist / FM_INNER;
    return t * t;
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
    const hx = (x - (-30)) / 200, hz = (z - (-350)) / 200;
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
// Plains zones — open grasslands with no/few trees
function getPlainsBlend(x, z) {
    let p = 0;
    // Central plains — south of spawn
    const cp1x = (x - 0) / 200, cp1z = (z - 120) / 150;
    const cp1 = cp1x*cp1x + cp1z*cp1z;
    if (cp1 < 1) { const t = 1 - cp1; p = Math.max(p, t*t*(3-2*t)); }
    // Eastern plains — wide open area
    const cp2x = (x - 350) / 180, cp2z = (z - (-50)) / 140;
    const cp2 = cp2x*cp2x + cp2z*cp2z;
    if (cp2 < 1) { const t = 1 - cp2; p = Math.max(p, t*t*(3-2*t)); }
    // Northwest plains — between spawn and snow
    const cp3x = (x - (-180)) / 160, cp3z = (z - (-200)) / 130;
    const cp3 = cp3x*cp3x + cp3z*cp3z;
    if (cp3 < 1) { const t = 1 - cp3; p = Math.max(p, t*t*(3-2*t)); }
    // Southwest open area
    const cp4x = (x - (-250)) / 170, cp4z = (z - 200) / 120;
    const cp4 = cp4x*cp4x + cp4z*cp4z;
    if (cp4 < 1) { const t = 1 - cp4; p = Math.max(p, t*t*(3-2*t)); }
    return p;
}

function getSnowBlend(z) {
    if (z > -500) return 0; if (z < -650) return 1;
    return (z - (-500)) / (-650 - (-500));
}
function getDesertBlend(z) {
    if (z < 500) return 0; if (z > 650) return 1;
    return (z - 500) / 150;
}
function getScorchedBlend(x, z) {
    const xSpread = x < -300 ? 340 : 220;
    const sx = (x - (-300)) / xSpread, sz = (z - 280) / 220;
    const d = sx * sx + sz * sz; if (d > 1) return 0;
    const t = 1 - d; return t * t;
}

const riverDefs = [
    // Winding river from Forest Lake area to the east coast
    { name: 'East River', width: 4, pts: [
        [-250,100],[-220,95],[-190,85],[-160,80],[-130,90],[-100,95],[-70,85],[-40,75],
        [-10,65],[20,55],[55,50],[90,55],[120,65],[150,58],[180,45],[210,38],
        [240,42],[270,55],[300,60],[330,50],[360,35],[390,30],[420,38],[450,50],
        [480,45],[510,32],[540,20],[570,15],[600,10],[640,0],[680,-8],[720,-5],
        [760,5],[800,10],[850,15],[910,18],[980,20],[1060,22],[1150,24]
    ]},
    // Southern river — winds through temperate into desert transition
    { name: 'South River', width: 3, pts: [
        [10,40],[15,70],[25,100],[20,130],[10,160],[15,195],[30,225],[50,250],
        [45,280],[30,310],[20,340],[25,370],[35,395],[30,420],[15,450]
    ]},
    // Western river — from highlands toward the bay
    { name: 'West River', width: 3, pts: [
        [-200,100],[-230,90],[-260,80],[-290,85],[-320,95],[-355,90],[-390,80],
        [-420,70],[-455,60],[-490,50],[-520,45],[-555,40],[-590,35],[-630,30]
    ]},
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
export { getTerrainHeight, getIslandRadius, ISLAND_NS_SCALE, getMountainBlend, getNWMountainBlend, getSWMountainBlend, getNEMountainBlend, getSEMountainBlend, getFarEastMountainBlend, getFrozenMountainBlend, getDeepNorthBlend, getFrozenBasinBlend, FM_CX, FM_CZ, FM_INNER, getSnowBlend, getDesertBlend, getScorchedBlend, getEnchantedBlend, getPlainsBlend, isOnPath, riverDefs, getRiverBlend };

function getTerrainHeight(x, z) {
    // Use scaled z for elliptical island boundary
    const sz = z / ISLAND_NS_SCALE;
    const distFromCenter = Math.sqrt(x * x + sz * sz);
    const localR = getIslandRadius(x, z);

    if (distFromCenter > localR - 30) return 0;

    const fadeStart = localR - 70;
    let edgeFade = distFromCenter > fadeStart ? 1 - (distFromCenter - fadeStart) / 40 : 1;

    let h = 0;
    // Large rolling terrain — gentle hills everywhere
    h += Math.sin(x * 0.04 + 0.5) * Math.cos(z * 0.035) * 5.0;
    h += Math.sin(x * 0.025 - z * 0.03 + 1.2) * 3.5;
    h += Math.cos(x * 0.015 + z * 0.02 + 0.7) * 3.0;
    // Medium undulations
    h += Math.sin(x * 0.08 + z * 0.06) * Math.cos(z * 0.09 - x * 0.04) * 2.0;
    h += Math.cos(x * 0.07 - 0.8) * Math.sin(z * 0.065 + 0.3) * 1.5;
    h += Math.sin(x * 0.055 + z * 0.045 - 1.5) * 1.5;
    // Small detail
    h += Math.sin(x * 0.15 + z * 0.12) * 0.6;
    h += Math.cos(x * 0.18 - z * 0.14 + 2.0) * 0.5;
    h += Math.sin(x * 0.22 + z * 0.19 - 0.5) * 0.3;
    // Clamp so inland terrain is always above sea level
    h = Math.max(h, 1.5);

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

    // Western Bay — single large elliptical inlet at the coast
    const bayDx = (x - (-1174)) / 160, bayDz = (z - 15) / 110;
    const bayD = bayDx * bayDx + bayDz * bayDz;
    if (bayD < 1) { const t = 1 - bayD; const s = t * t; h = h * (1 - s) + (-3) * s; }

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

    // Frozen mountains (north) — large ring with glacial basin
    // Max world height is ~121. Base ring ~55, peaks up to +30, noise ~+10 = ~95 max
    const frDx = x - FM_CX, frDz = z - FM_CZ;
    const frDist = Math.sqrt(frDx * frDx + frDz * frDz);
    const frMtn = getFrozenMountainBlend(x, z);
    if (frMtn > 0) {
        const ringCenter = FM_INNER + FM_RING_W / 2;
        const ringDist = Math.abs(frDist - ringCenter);
        const onRing = ringDist < FM_RING_W / 2 + 20;
        let mh = 0;
        if (onRing) {
            const ringT = 1 - Math.min(1, ringDist / (FM_RING_W / 2 + 20));
            mh = ringT * ringT * 85;
            // 12 peaks around the ring
            const peaks = [
                { a: 0,    h: 50, r: 45 },
                { a: 0.52, h: 65, r: 40 },
                { a: 1.05, h: 45, r: 42 },
                { a: 1.57, h: 60, r: 40 },
                { a: 2.09, h: 40, r: 45 },
                { a: 2.62, h: 55, r: 38 },
                { a: 3.14, h: 45, r: 42 },
                { a: 3.67, h: 60, r: 40 },
                { a: 4.19, h: 35, r: 48 },
                { a: 4.71, h: 50, r: 42 },
                { a: 5.24, h: 40, r: 45 },
                { a: 5.76, h: 55, r: 40 },
            ];
            for (const pk of peaks) {
                const px = FM_CX + Math.cos(pk.a) * ringCenter;
                const pz = FM_CZ + Math.sin(pk.a) * ringCenter;
                const pdx = (x - px) / pk.r, pdz = (z - pz) / pk.r;
                const pd = pdx * pdx + pdz * pdz;
                if (pd < 1) { const t = 1 - pd; mh += t * t * pk.h; }
            }
            // Jagged ridgelines
            mh += Math.abs(Math.sin((x + z * 0.7) * 0.05)) * 18 * ringT;
            mh += (Math.sin((x + 30) * 0.07) * Math.cos((z + 1050) * 0.09) * 12 + Math.cos((x + 20) * 0.11) * Math.sin((z + 1030) * 0.08) * 10) * ringT;
        }
        // Raised glacial basin inside
        if (frDist < FM_INNER) {
            const basinT = 1 - frDist / FM_INNER;
            mh = 30 + basinT * 20;
            mh += Math.sin(x * 0.08 + z * 0.06) * 4 + Math.cos(x * 0.05 - z * 0.07 + 1) * 3;
            mh += Math.abs(Math.sin(x * 0.04 + z * 0.03)) * 7 * basinT;
        }
        mh += (Math.sin(x * 0.22 + z * 0.28) * 2 + Math.cos(x * 0.18 - z * 0.2) * 1.5) * frMtn;
        h += mh;
    }

    // Valleys (removed)
    const enchBlend = getEnchantedBlend(x, z);
    if (enchBlend > 0) { h -= enchBlend * 6; h += enchBlend * (Math.sin(x*0.12+z*0.08)*1.2 + Math.cos(x*0.09-z*0.11+1.5)*0.8); }
    const afHill = getAncientForestHillBlend(x, z);
    if (afHill > 0) { h += afHill * 40 + afHill * Math.sin(x*0.08+z*0.06)*6 + afHill * Math.cos(x*0.05-z*0.07+1)*4; }

    // Mountain passes
    // Frozen mountain pass — south entrance
    const fpDx=(x-(-30))/30,fpDz=(z-(-830))/24,fpD=fpDx*fpDx+fpDz*fpDz;
    if(fpD<1){const t=1-fpD;h-=t*t*50;h=Math.max(3,h);}
    // East pass
    const fp2Dx=(x-200)/24,fp2Dz=(z-(-1050))/30,fp2D=fp2Dx*fp2Dx+fp2Dz*fp2Dz;
    if(fp2D<1){const t=1-fp2D;h-=t*t*45;h=Math.max(3,h);}
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

    // Sand dunes — rolling hills in the desert biome
    const desB = getDesertBlend(z);
    if (desB > 0.1) {
        // Large rolling dunes
        const dune1 = Math.max(0, Math.sin(x * 0.015 + z * 0.008 + 1.2)) * 12 * desB;
        const dune2 = Math.max(0, Math.sin(x * 0.01 - z * 0.012 + 0.5)) * 8 * desB;
        const dune3 = Math.max(0, Math.cos(x * 0.02 + z * 0.018 - 0.8)) * 6 * desB;
        // Sharper ridgelines on dune crests
        const ridge = Math.abs(Math.sin(x * 0.012 + z * 0.006)) * 5 * desB;
        // Fine ripples
        const ripple = Math.sin(x * 0.08 + z * 0.04) * 1.5 * desB;
        h += dune1 + dune2 + dune3 + ridge + ripple;
    }

    // Elevated terrain features — gradual rises
    // Northern coastal bluffs — high cliffs near north coast
    const nbDx = (x - (-200)) / 220, nbDz = (z - (-650)) / 150;
    const nbD = nbDx*nbDx + nbDz*nbDz;
    if (nbD < 1) { const t = 1 - nbD; const s = t*t*(3-2*t); h += s * 16 + s * Math.sin(x*0.06+z*0.05)*3; }

    // Western highlands — large raised region
    const whDx = (x - (-450)) / 250, whDz = (z - 50) / 200;
    const whD = whDx*whDx + whDz*whDz;
    if (whD < 1) { const t = 1 - whD; const s = t*t*(3-2*t); h += s * 14 + s * Math.sin(x*0.04-z*0.05)*2.5; }

    // Eastern rolling hills — undulating terrain
    const ehDx = (x - 300) / 280, ehDz = (z - 200) / 220;
    const ehD = ehDx*ehDx + ehDz*ehDz;
    if (ehD < 1) {
        const t = 1 - ehD; const s = t*t*(3-2*t);
        h += s * (10 + Math.sin(x * 0.03 + z * 0.04) * 4 + Math.cos(x * 0.05 - z * 0.03) * 3);
    }

    // Southern plateau — flat-topped mesa at desert edge
    const spDx3 = (x - (-100)) / 100, spDz3 = (z - 280) / 70;
    const spD3 = spDx3*spDx3 + spDz3*spDz3;
    if (spD3 < 1.2) {
        const plateauH = 18;
        if (spD3 < 0.6) { h = Math.max(h, plateauH + Math.sin(x*0.15+z*0.12)*0.5); }
        else { const cliff = 1-(spD3-0.6)/0.6; const cs=cliff*cliff*(3-2*cliff); h = Math.max(h, h + (plateauH-h)*cs); }
    }

    // Central-south gentle ridge — long low ridge running east-west
    const ridgeDz = (z - 150) / 30;
    const ridgeBlend = Math.exp(-ridgeDz*ridgeDz);
    if (ridgeBlend > 0.01) { h += ridgeBlend * (6 + Math.sin(x * 0.02) * 2); }

    // ── Deep North Highlands — terrain rises sharply past z=-900 ──
    if (z < -900) {
        const nht = Math.min(1, (z - (-900)) / (-1150 - (-900))); // 0 at -900, 1 at -1150
        const highlandH = nht * nht * 45;
        h += highlandH;
        // Rugged highland noise
        h += nht * (Math.sin(x * 0.04 + z * 0.035) * 10 + Math.cos(x * 0.06 - z * 0.05) * 8);
        h += nht * Math.abs(Math.sin(x * 0.03 + z * 0.02)) * 12;
    }

    // ── Deep North Mountain Ranges ──
    // NW frozen ridge — long east-west range
    const nwr_dx = (x - (-250)) / 150, nwr_dz = (z - (-1350)) / 55;
    const nwr_d = nwr_dx*nwr_dx + nwr_dz*nwr_dz;
    if (nwr_d < 1) {
        const t = 1 - nwr_d;
        let mh = t * t * 80;
        mh += Math.abs(Math.sin((x + 250) * 0.07)) * 25 * t;
        mh += Math.sin((x + 250) * 0.1) * Math.cos((z + 1350) * 0.12) * 15 * t;
        const nwrPks = [[-340,-1350,45,40],[-220,-1345,55,35],[-150,-1355,40,38],[-290,-1340,35,32],[-100,-1348,30,30]];
        for (const p of nwrPks) { const pd = ((x-p[0])/p[3])**2+((z-p[1])/p[3])**2; if(pd<1){const pt=1-pd;mh+=pt*pt*p[2];} }
        h += mh;
    }

    // NE frozen peaks — cluster of sharp peaks
    const nep_dx = (x - 200) / 130, nep_dz = (z - (-1300)) / 100;
    const nep_d = nep_dx*nep_dx + nep_dz*nep_dz;
    if (nep_d < 1) {
        const t = 1 - nep_d;
        let mh = t * t * 75;
        mh += Math.abs(Math.sin((x - 200) * 0.08 + (z + 1300) * 0.06)) * 22 * t;
        const nepPks = [[160,-1280,50,35],[240,-1310,55,32],[190,-1350,42,36],[270,-1270,38,30],[130,-1330,45,34],[210,-1260,35,28]];
        for (const p of nepPks) { const pd = ((x-p[0])/p[3])**2+((z-p[1])/p[3])**2; if(pd<1){const pt=1-pd;mh+=pt*pt*p[2];} }
        h += mh;
    }

    // Central north spine — ridge running north-south
    const cns_dx = (x - 50) / 55, cns_dz = (z - (-1400)) / 150;
    const cns_d = cns_dx*cns_dx + cns_dz*cns_dz;
    if (cns_d < 1) {
        const t = 1 - cns_d;
        let mh = t * t * 70;
        mh += Math.abs(Math.cos((z + 1400) * 0.05)) * 28 * t;
        mh += Math.sin((x - 50) * 0.15) * 12 * t;
        const cnsPks = [[50,-1310,45,32],[45,-1420,55,30],[55,-1490,40,34],[40,-1370,48,28],[60,-1450,35,30]];
        for (const p of cnsPks) { const pd = ((x-p[0])/p[3])**2+((z-p[1])/p[3])**2; if(pd<1){const pt=1-pd;mh+=pt*pt*p[2];} }
        h += mh;
    }

    // West deep north range
    const wdn_dx = (x - (-400)) / 100, wdn_dz = (z - (-1200)) / 70;
    const wdn_d = wdn_dx*wdn_dx + wdn_dz*wdn_dz;
    if (wdn_d < 1) {
        const t = 1 - wdn_d;
        let mh = t * t * 65;
        mh += Math.abs(Math.sin((x + 400) * 0.09)) * 20 * t;
        const wdnPks = [[-430,-1200,40,32],[-370,-1210,48,30],[-350,-1180,35,28],[-450,-1230,30,26]];
        for (const p of wdnPks) { const pd = ((x-p[0])/p[3])**2+((z-p[1])/p[3])**2; if(pd<1){const pt=1-pd;mh+=pt*pt*p[2];} }
        h += mh;
    }

    // East deep north range
    const edn_dx = (x - 380) / 90, edn_dz = (z - (-1180)) / 65;
    const edn_d = edn_dx*edn_dx + edn_dz*edn_dz;
    if (edn_d < 1) {
        const t = 1 - edn_d;
        let mh = t * t * 60;
        mh += Math.abs(Math.cos((x - 380) * 0.08)) * 18 * t;
        const ednPks = [[350,-1180,42,30],[400,-1170,38,28],[420,-1200,45,32],[360,-1210,32,26]];
        for (const p of ednPks) { const pd = ((x-p[0])/p[3])**2+((z-p[1])/p[3])**2; if(pd<1){const pt=1-pd;mh+=pt*pt*p[2];} }
        h += mh;
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
        const glacial = getFrozenBasinBlend(wx, wz);
        if (glacial > 0.05) return 'glacial';
        const mtn = getMountainBlend(wx,wz) + getNWMountainBlend(wx,wz) + getSWMountainBlend(wx,wz) + getNEMountainBlend(wx,wz) + getSEMountainBlend(wx,wz) + getFarEastMountainBlend(wx,wz) + getFrozenMountainBlend(wx,wz) + getDeepNorthBlend(wx,wz);
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
                const surfaceBlock = h < 0.01 ? yOff - 3 : Math.floor(h / BLOCK_SIZE) + yOff;
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
                const _sz = wz / ISLAND_NS_SCALE;
                const distFC = Math.sqrt(wx * wx + _sz * _sz);
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
                        else if (_oreCheck(bx,y,bz, 8, 4, 0.22, 777)) block = BLOCK.IRON_ORE;
                        else if (depthBelow > 3 && depthBelow < 25 && _oreCheck(bx,y,bz, 8, 3.5, 0.18, 888)) block = BLOCK.COPPER_ORE;
                        else if (_oreCheck(bx,y,bz, 8, 4, 0.2, 999)) block = BLOCK.COAL_ORE;
                        else block = BLOCK.STONE;
                    } else if (y < surfaceBlock) {
                        if (inPond) block = BLOCK.CLAY;
                        else if (inRiver) block = BLOCK.SAND;
                        else if (biome === 'glacial') block = this._hash(bx*1.7+y*0.3,bz*2.1) > 0.4 ? BLOCK.ICE : BLOCK.STONE;
                        else if (biome === 'desert' || biome === 'desert_transition') block = BLOCK.SAND;
                        else block = BLOCK.DIRT;
                    } else if (y === surfaceBlock) {
                        if (inPond) block = BLOCK.CLAY;
                        else if (inRiver) block = BLOCK.SAND;
                        else if (biome === 'glacial') {
                            // Glacial basin — mostly ice, some snow patches
                            const iceH = this._hash(bx*2.3, bz*1.9);
                            if (iceH > 0.25) block = BLOCK.ICE;
                            else block = BLOCK.SNOW;
                        }
                        else if (biome === 'snow') {
                            const frMtnB = getFrozenMountainBlend(wx, wz);
                            if (frMtnB > 0.2 && h > 25) block = BLOCK.ICE;
                            else if (frMtnB > 0.1 && this._hash(bx*2.3,bz*1.9) > 0.6) block = BLOCK.ICE;
                            else block = BLOCK.SNOW;
                        }
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
        const hillCX = -30, hillCZ = -350, hillR = 170; // inner radius (flat area)
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
                if (h < 1 || h > 50) continue;
                // Skip trees in plains zones
                const plainsB = getPlainsBlend(wx, wz);
                if (plainsB > 0.3 && this._hash(bx * 0.71 + 1234, bz * 0.83 + 5678) < plainsB * 0.9) continue;
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

        // Pine trees — snow biome, conical shape (taller, narrower canopy)
        for (let lx = 0; lx < CHUNK_SIZE; lx += 2) {
            for (let lz = 0; lz < CHUNK_SIZE; lz += 2) {
                const bx = ox + lx, bz = oz + lz;
                const wx = bx * BLOCK_SIZE, wz = bz * BLOCK_SIZE;
                const snowB = getSnowBlend(wz);
                if (snowB < 0.15) continue; // only in snowy areas
                if (this._hash(bx * 0.41 + 4444, bz * 0.57 + 5555) > 0.05) continue; // ~5% density
                const jx = bx + Math.floor(this._hash(bx+55,bz+66)*2);
                const jz = bz + Math.floor(this._hash(bx+77,bz+88)*2);
                const ljx = jx - ox, ljz = jz - oz;
                if (ljx < 0 || ljx >= CHUNK_SIZE || ljz < 0 || ljz >= CHUNK_SIZE) continue;
                const pWx = jx * BLOCK_SIZE, pWz = jz * BLOCK_SIZE;
                const h = getTerrainHeight(pWx, pWz);
                if (h < 1 || h > 60) continue;
                const allMtn = getMountainBlend(pWx,pWz)+getNWMountainBlend(pWx,pWz)+getSWMountainBlend(pWx,pWz)+getNEMountainBlend(pWx,pWz)+getSEMountainBlend(pWx,pWz)+getFarEastMountainBlend(pWx,pWz);
                if (allMtn > 0.5) continue; // not on steep mountains
                if (isOnPath(pWx, pWz)) continue;
                const surfaceBlock = Math.floor(h / BLOCK_SIZE) + yOff;
                // Tall trunk, narrow conical canopy
                const trunkH = 6 + Math.floor(this._hash(jx*1.3, jz*2.1) * 5); // 6-10
                const canopyStartH = 2 + Math.floor(this._hash(jx*0.9, jz*1.7) * 2); // bare trunk before canopy
                // Trunk
                for (let ty = 1; ty <= trunkH; ty++) {
                    const y = surfaceBlock + ty;
                    if (y >= WORLD_HEIGHT) break;
                    data[(y * CHUNK_SIZE + ljz) * CHUNK_SIZE + ljx] = BLOCK.PINE_WOOD;
                }
                // Conical canopy — widest at bottom, tapers to point
                const coneH = trunkH - canopyStartH + 2;
                const maxR = 2 + Math.floor(this._hash(jx*2.7, jz*0.8));
                for (let dy = 0; dy < coneH; dy++) {
                    const y = surfaceBlock + canopyStartH + dy;
                    if (y >= WORLD_HEIGHT) break;
                    const progress = dy / (coneH - 1);
                    const r = Math.max(1, Math.ceil(maxR * (1 - progress * 0.9)));
                    for (let ddx = -r; ddx <= r; ddx++) {
                        for (let ddz = -r; ddz <= r; ddz++) {
                            if (ddx*ddx + ddz*ddz > r*r) continue;
                            const tlx = ljx+ddx, tlz = ljz+ddz;
                            if (tlx<0||tlx>=CHUNK_SIZE||tlz<0||tlz>=CHUNK_SIZE) continue;
                            const idx = (y*CHUNK_SIZE+tlz)*CHUNK_SIZE+tlx;
                            if (data[idx] === BLOCK.AIR) data[idx] = BLOCK.PINE_LEAVES;
                        }
                    }
                }
                // Snow cap on top — a few snow blocks on the canopy top
                const topY = surfaceBlock + trunkH + 2;
                if (topY < WORLD_HEIGHT && snowB > 0.4) {
                    data[(topY * CHUNK_SIZE + ljz) * CHUNK_SIZE + ljx] = BLOCK.SNOW;
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
                if (h < 1 || h > 50) continue;
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
        const hillCX = -30, hillCZ = -350, hillR = 200;

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
        // Invalidate slope cache for this position and the block below (which might need to slope now)
        if (this._slopeCache) {
            this._slopeCache.delete(bx + ',' + by + ',' + bz);
            this._slopeCache.delete(bx + ',' + (by - 1) + ',' + bz);
        }
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
        return b !== BLOCK.AIR && b !== BLOCK.WATER && b !== BLOCK.LEAVES && b !== BLOCK.PINE_LEAVES && b !== BLOCK.FLOWER_RED && b !== BLOCK.FLOWER_YELLOW && b !== BLOCK.FLOWER_BLUE && b !== BLOCK.FLOWER_WHITE;
    }
}
