// horses.js — Horse system: spawning, riding, stabling
import { BLOCK_SIZE } from './world.js';

const horseCoats = [
    { body: 0x8B4513, dark: 0x5C2E0A, mane: 0x1a1008, name: 'Bay' },
    { body: 0x2a2a2a, dark: 0x111111, mane: 0x0a0a0a, name: 'Black' },
    { body: 0xd4c4a8, dark: 0xa89878, mane: 0xf0e8d8, name: 'Palomino' },
    { body: 0xc8b090, dark: 0x908060, mane: 0x3a2a1a, name: 'Buckskin' },
    { body: 0x6a3a1a, dark: 0x3a1a0a, mane: 0x1a0a00, name: 'Chestnut' },
    { body: 0xf0f0f0, dark: 0xc0c0c0, mane: 0xe0e0e0, name: 'White' },
];
const hoofMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.5 });

export function makeHorse(scene, x, z, terrainHeight) {
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    g.scale.set(1.6, 1.6, 1.6);

    const coat = horseCoats[Math.floor(Math.random() * horseCoats.length)];
    const hMat = new THREE.MeshStandardMaterial({ color: coat.body, roughness: 0.7 });
    const hDarkMat = new THREE.MeshStandardMaterial({ color: coat.dark, roughness: 0.65 });
    const hManeMat = new THREE.MeshStandardMaterial({ color: coat.mane, roughness: 0.8 });

    // Body
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 1.1), hMat);
    bodyMesh.position.y = 0.75; bodyMesh.castShadow = true; g.add(bodyMesh);

    // Belly
    const belly = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.8), hDarkMat);
    belly.position.set(0, 0.52, 0); g.add(belly);

    // Neck
    const neckGrp = new THREE.Group();
    neckGrp.position.set(0, 0.85, 0.5);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.22), hMat);
    neck.position.set(0, 0.2, 0.08); neck.rotation.x = -0.35; neckGrp.add(neck);

    // Mane — offset to right side of neck, thicker, hanging down
    for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.06), hManeMat);
        m.position.set(-0.1, 0.08 + i * 0.09, 0.12);
        m.rotation.z = -0.4;
        m.rotation.x = 0;
        neckGrp.add(m);
    }
    g.add(neckGrp);

    // Head
    const headGrp = new THREE.Group();
    headGrp.position.set(0, 0.45, 0.15);
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.4), hMat);
    headGrp.add(headMesh);
    // Muzzle
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.13, 0.12), hDarkMat);
    muzzle.position.set(0, -0.05, 0.24); headGrp.add(muzzle);
    // Nostrils
    const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    for (let s = -1; s <= 1; s += 2) {
        const n = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 4), nostrilMat);
        n.position.set(s * 0.04, -0.08, 0.29); headGrp.add(n);
    }
    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1008 });
    for (let s = -1; s <= 1; s += 2) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), eyeMat);
        eye.position.set(s * 0.08, 0.03, 0.12); headGrp.add(eye);
    }
    // Ears
    for (let s = -1; s <= 1; s += 2) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), hMat);
        ear.position.set(s * 0.06, 0.13, 0.0); ear.rotation.z = s * 0.2;
        headGrp.add(ear);
    }
    neckGrp.add(headGrp);

    // Legs
    const legs = [];
    const legPos = [[-0.15,0.52,0.35],[0.15,0.52,0.35],[-0.15,0.52,-0.38],[0.15,0.52,-0.38]];
    for (const [lx, ly, lz] of legPos) {
        const hip = new THREE.Group();
        hip.position.set(lx, ly, lz);
        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.08), hMat);
        upper.position.y = -0.13; hip.add(upper);
        const knee = new THREE.Group();
        knee.position.y = -0.26; hip.add(knee);
        const lower = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.24, 0.065), hMat);
        lower.position.y = -0.12; knee.add(lower);
        const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.1), hoofMat);
        hoof.position.set(0, -0.26, 0.01); knee.add(hoof);
        g.add(hip);
        legs.push({ hip, knee });
    }

    // Tail — exact from game.html
    const tailGrp = new THREE.Group();
    tailGrp.position.set(0, 0.8, -0.55);
    for (let i = 0; i < 4; i++) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.04), hManeMat);
        t.position.set(0, -i * 0.12, -i * 0.03); tailGrp.add(t);
    }
    g.add(tailGrp);

    g.position.set(x, terrainHeight, z);
    g.rotation.y = Math.random() * Math.PI * 2;
    scene.add(g);

    return {
        group: g, legs, headGrp, neckGrp, tailGrp,
        x, z, angle: g.rotation.y, speed: 0,
        walkPhase: Math.random() * Math.PI * 2,
        wanderTimer: Math.random() * 3 + 1,
        walking: false, type: 'horse',
        hp: 15, coat,
        _bodyMat: hMat, _darkMat: hDarkMat, _maneMat: hManeMat,
        _name: null, _registered: false, _stabled: false,
    };
}

export class HorseManager {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.horses = [];
        this.registeredHorses = []; // { name, coat, stabled, horseRef }
        this.ridingHorse = false;
        this.ridingHorseRef = null;
        this.nearHorse = null;
        this.horseGear = 0; // 0=stop 1=walk 2=trot 3=canter 4=gallop
        this.horseSpeeds = [0, 3, 6, 10, 15];
        this._spawnedAreas = new Set();
    }

    spawnNear(px, pz) {
        // Spawn horses in nearby grassy areas
        const gridX = Math.floor(px / 40), gridZ = Math.floor(pz / 40);
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                const key = (gridX+dx) + ',' + (gridZ+dz);
                if (this._spawnedAreas.has(key)) continue;
                this._spawnedAreas.add(key);
                const cx = (gridX+dx) * 40 + 20, cz = (gridZ+dz) * 40 + 20;
                // Hash to decide if horses spawn here (~30% of areas)
                const h = Math.sin(cx * 127.1 + cz * 311.7) * 43758.5453;
                if ((h - Math.floor(h)) > 0.30) continue;
                const hy = this.world.getHeight(cx, cz);
                if (hy < 1 || hy > 30) continue;
                const horse = makeHorse(this.scene, cx, cz, hy);
                this.horses.push(horse);
                // 40% chance for a second horse nearby
                if ((h * 7 - Math.floor(h * 7)) < 0.4) {
                    const ox = cx + (Math.sin(h * 99) * 6);
                    const oz = cz + (Math.cos(h * 77) * 6);
                    const ohy = this.world.getHeight(ox, oz);
                    if (ohy > 1 && ohy < 30) {
                        this.horses.push(makeHorse(this.scene, ox, oz, ohy));
                    }
                }
            }
        }
        // Despawn far horses (not ridden, not stabled)
        for (let i = this.horses.length - 1; i >= 0; i--) {
            const h = this.horses[i];
            if (h === this.ridingHorseRef) continue;
            if (h._stabled) continue;
            const ddx = h.x - px, ddz = h.z - pz;
            if (ddx*ddx + ddz*ddz > 100*100) {
                this.scene.remove(h.group);
                this.horses.splice(i, 1);
                // Allow respawn in that area
            }
        }
    }

    update(dt, px, pz, playerAngle, keys) {
        this.nearHorse = null;

        // Update horse AI + find nearest
        for (const h of this.horses) {
            if (h === this.ridingHorseRef) continue;
            if (h._stabled) { h.group.visible = false; continue; }
            h.group.visible = true;

            const dx = h.x - px, dz = h.z - pz;
            const dist = Math.sqrt(dx*dx + dz*dz);
            if (dist < 3 && (!this.nearHorse || dist < this._nearDist)) {
                this.nearHorse = h;
                this._nearDist = dist;
            }

            // Wander AI
            if (dist > 50) continue;
            h.wanderTimer -= dt;
            if (h.wanderTimer <= 0) {
                h.walking = !h.walking;
                if (h.walking) h.angle += (Math.random() - 0.5) * 1.5;
                h.wanderTimer = 2 + Math.random() * 4;
            }
            const tgtSpd = h.walking ? 1.5 : 0;
            h.speed += (tgtSpd - h.speed) * 3 * dt;
            h.x += Math.sin(h.angle) * h.speed * dt;
            h.z += Math.cos(h.angle) * h.speed * dt;
            const hy = this.world.getHeight(h.x, h.z);
            h.group.position.set(h.x, hy, h.z);
            h.group.rotation.y = h.angle;

            // Animate legs
            if (Math.abs(h.speed) > 0.1) {
                h.walkPhase += h.speed * dt * 6;
                const p = h.walkPhase;
                h.legs[0].hip.rotation.x = Math.sin(p) * 0.4;
                h.legs[1].hip.rotation.x = Math.sin(p + Math.PI) * 0.4;
                h.legs[2].hip.rotation.x = Math.sin(p + Math.PI) * 0.35;
                h.legs[3].hip.rotation.x = Math.sin(p) * 0.35;
                h.legs[0].knee.rotation.x = Math.max(0, Math.sin(p + 0.5)) * 0.3;
                h.legs[1].knee.rotation.x = Math.max(0, Math.sin(p + Math.PI + 0.5)) * 0.3;
                h.legs[2].knee.rotation.x = Math.max(0, Math.sin(p + Math.PI + 0.5)) * 0.3;
                h.legs[3].knee.rotation.x = Math.max(0, Math.sin(p + 0.5)) * 0.3;
            }
            // Head bob
            h.neckGrp.rotation.x = Math.sin(h.walkPhase * 0.5) * 0.05 * (h.walking ? 1 : 0);
            // Tail sway
            h.tailGrp.rotation.x = -0.3 + Math.sin(h.walkPhase * 0.7) * 0.1;
        }

        // Riding update
        if (this.ridingHorse && this.ridingHorseRef) {
            const horse = this.ridingHorseRef;
            // Gear control
            let targetSpeed = this.horseSpeeds[this.horseGear];
            horse.speed += (targetSpeed - horse.speed) * 3 * dt;

            // Steering
            const turnRate = 2.5;
            if (keys['a'] || keys['ArrowLeft']) horse.angle += turnRate * dt;
            if (keys['d'] || keys['ArrowRight']) horse.angle -= turnRate * dt;

            // Move
            horse.x += Math.sin(horse.angle) * horse.speed * dt;
            horse.z += Math.cos(horse.angle) * horse.speed * dt;
            const hy = this.world.getHeight(horse.x, horse.z);
            horse.group.position.set(horse.x, hy, horse.z);
            horse.group.rotation.y = horse.angle;

            // Animate legs based on speed
            const absSpd = Math.abs(horse.speed);
            if (absSpd > 0.1) {
                const freq = this.horseGear >= 3 ? 12 : this.horseGear >= 2 ? 8 : 5;
                const amp = this.horseGear >= 3 ? 0.7 : this.horseGear >= 2 ? 0.5 : 0.35;
                horse.walkPhase += absSpd * dt * freq;
                const p = horse.walkPhase;
                horse.legs[0].hip.rotation.x = Math.sin(p) * amp;
                horse.legs[1].hip.rotation.x = Math.sin(p + Math.PI) * amp;
                horse.legs[2].hip.rotation.x = Math.sin(p + Math.PI) * amp * 0.9;
                horse.legs[3].hip.rotation.x = Math.sin(p) * amp * 0.9;
                horse.legs[0].knee.rotation.x = Math.max(0, Math.sin(p + 0.5)) * amp * 0.6;
                horse.legs[1].knee.rotation.x = Math.max(0, Math.sin(p + Math.PI + 0.5)) * amp * 0.6;
                horse.legs[2].knee.rotation.x = Math.max(0, Math.sin(p + Math.PI + 0.5)) * amp * 0.5;
                horse.legs[3].knee.rotation.x = Math.max(0, Math.sin(p + 0.5)) * amp * 0.5;
            } else {
                for (const l of horse.legs) { l.hip.rotation.x *= 0.9; l.knee.rotation.x *= 0.9; }
            }
            horse.neckGrp.rotation.x = absSpd > 5 ? -0.15 : 0;
            horse.tailGrp.rotation.x = -0.3 + (absSpd > 5 ? 0.4 : 0) + Math.sin(horse.walkPhase * 0.7) * 0.1;
        }
    }

    mount(horse) {
        this.ridingHorse = true;
        this.ridingHorseRef = horse;
        this.horseGear = 0;
    }

    dismount() {
        this.ridingHorse = false;
        this.ridingHorseRef = null;
        this.horseGear = 0;
    }

    gearUp() { this.horseGear = Math.min(4, this.horseGear + 1); }
    gearDown() { this.horseGear = Math.max(0, this.horseGear - 1); }

    registerHorse(horse, name) {
        horse._name = name;
        horse._registered = true;
        this.registeredHorses.push({
            name, coat: horse.coat, stabled: false, horseRef: horse,
        });
    }

    stableHorse(horse) {
        horse._stabled = true;
        horse.group.visible = false;
        const reg = this.registeredHorses.find(r => r.horseRef === horse);
        if (reg) reg.stabled = true;
    }

    retrieveHorse(regEntry, px, pz) {
        // Despawn old instance if it exists
        if (regEntry.horseRef) {
            this.scene.remove(regEntry.horseRef.group);
            const idx = this.horses.indexOf(regEntry.horseRef);
            if (idx >= 0) this.horses.splice(idx, 1);
        }
        // Spawn fresh at player position
        const hy = this.world.getHeight(px + 2, pz + 2);
        const h = makeHorse(this.scene, px + 2, pz + 2, hy);
        h._name = regEntry.name;
        h._registered = true;
        h._stabled = false;
        h._bodyMat.color.setHex(regEntry.coat.body);
        h._darkMat.color.setHex(regEntry.coat.dark);
        h._maneMat.color.setHex(regEntry.coat.mane);
        h.coat = regEntry.coat;
        regEntry.horseRef = h;
        regEntry.stabled = false;
        this.horses.push(h);
        return h;
    }

    getSaveData() {
        return this.registeredHorses.map(r => ({
            name: r.name, coat: r.coat, stabled: r.stabled,
            x: r.horseRef ? r.horseRef.x : 0, z: r.horseRef ? r.horseRef.z : 0,
        }));
    }

    loadSaveData(data, px, pz) {
        for (const d of data) {
            const hy = this.world.getHeight(d.x || px, d.z || pz);
            const h = makeHorse(this.scene, d.x || px, d.z || pz, hy);
            h._name = d.name;
            h._registered = true;
            h._stabled = d.stabled;
            h._bodyMat.color.setHex(d.coat.body);
            h._darkMat.color.setHex(d.coat.dark);
            h._maneMat.color.setHex(d.coat.mane);
            h.coat = d.coat;
            if (d.stabled) h.group.visible = false;
            this.horses.push(h);
            this.registeredHorses.push({ name: d.name, coat: d.coat, stabled: d.stabled, horseRef: h });
        }
    }
}
