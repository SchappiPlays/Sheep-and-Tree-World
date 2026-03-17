// player.js — Exact player model + controls from game.html, adapted for voxel world

import { BLOCK_SIZE } from './world.js';

function mix(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

export class Player {
    constructor(scene, world) {
        this.world = world;
        this.position = new THREE.Vector3(0, 40, 0);
        this.speed = 0; // scalar speed along facing direction (same as game.html)
        this.jumpVel = 0;
        this.isGrounded = false;
        this.walkPhase = 0;
        this.walkBlend = 0;
        this.sprintBlend = 0;

        // Movement constants — exact from game.html
        this.walkSpeed = 3.0;
        this.sprintSpeed = 7.0;
        this.turnRate = 2.8;
        this.accel = 8.0;
        this.decel = 6.0;
        this.blendRate = 8.0;
        this.GRAVITY = 18.0;
        this.JUMP_VEL = 6.0;
        this.HEIGHT = 1.9;
        this.WIDTH = 0.3;      // collision radius (same as resolvePos r=0.3)
        this.EYE_HEIGHT = 1.7;

        // ── Build character — EXACT copy from game.html ──
        this.group = new THREE.Group();
        scene.add(this.group);

        // Materials — exact colors
        const skinMat  = new THREE.MeshStandardMaterial({ color: 0xE8B49D });
        const shirtMat = new THREE.MeshStandardMaterial({ color: 0x4477BB });
        const pantsMat = new THREE.MeshStandardMaterial({ color: 0x334466 });
        const shoeMat  = new THREE.MeshStandardMaterial({ color: 0x332211 });
        const hairMat  = new THREE.MeshStandardMaterial({ color: 0x3B2507 });
        const eyeMat   = new THREE.MeshStandardMaterial({ color: 0x222222 });

        // character (world position + Y rotation)
        //  └─ body (hip-level pivot)
        //      ├─ spine (upper body pivot)
        //      │   ├─ torso, neck, headGroup
        //      │   ├─ leftArm.shoulder
        //      │   └─ rightArm.shoulder
        //      ├─ leftLeg.hip
        //      └─ rightLeg.hip

        this.hipHeight = 0.95;

        this.body = new THREE.Group();
        this.body.position.y = this.hipHeight;
        this.group.add(this.body);

        // Spine
        this.spine = new THREE.Group();
        this.body.add(this.spine);

        // Torso — 0.44 × 0.55 × 0.22
        this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.55, 0.22), shirtMat);
        this.torso.position.y = 0.3; this.torso.castShadow = true;
        this.spine.add(this.torso);

        // Neck
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), skinMat);
        neck.position.y = 0.62;
        this.spine.add(neck);

        // Head
        this.headGroup = new THREE.Group();
        this.headGroup.position.y = 0.76;
        this.spine.add(this.headGroup);

        const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.22), skinMat);
        head.castShadow = true;
        this.headGroup.add(head);

        const hair = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.24), hairMat);
        hair.position.y = 0.13;
        this.headGroup.add(hair);

        const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), eyeMat);
        leftEye.position.set(-0.06, 0.03, 0.11);
        this.headGroup.add(leftEye);
        const rightEye = leftEye.clone();
        rightEye.position.x = 0.06;
        this.headGroup.add(rightEye);

        // Arms — exact dimensions
        this.leftArm = this._makeArm('left', shirtMat, skinMat);
        this.rightArm = this._makeArm('right', shirtMat, skinMat);

        // Legs — exact dimensions
        this.leftLeg = this._makeLeg('left', pantsMat, shoeMat);
        this.rightLeg = this._makeLeg('right', pantsMat, shoeMat);

        // Tools held in left hand
        this.pickaxeHeld = this._makePickaxe();
        this.pickaxeHeld.visible = false;
        this.pickaxeHeld.rotation.x = Math.PI;
        this.pickaxeHeld.position.y = 0.02;
        this.leftArm.handGrp.add(this.pickaxeHeld);

        this.swordHeld = this._makeSword();
        this.swordHeld.visible = false;
        this.swordHeld.rotation.x = Math.PI;
        this.swordHeld.position.y = 0.02;
        this.leftArm.handGrp.add(this.swordHeld);

        this.axeHeld = this._makeAxe();
        this.axeHeld.visible = false;
        this.axeHeld.rotation.x = Math.PI;
        this.axeHeld.position.y = 0.02;
        this.leftArm.handGrp.add(this.axeHeld);

        // Swing state
        this.swingTimer = -1;
    }

    _makePickaxe() {
        const g = new THREE.Group();
        const handleMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e });
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.55, 0.03), handleMat);
        shaft.position.y = 0.3; shaft.castShadow = true; g.add(shaft);
        // Wood pickaxe head — plank-coloured
        const headMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.7, metalness: 0.0 });
        const pickHead = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.04), headMat);
        pickHead.position.y = 0.58; pickHead.castShadow = true; g.add(pickHead);
        const tipL = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 4), headMat);
        tipL.position.set(-0.17, 0.58, 0); tipL.rotation.z = Math.PI / 2; g.add(tipL);
        const tipR = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 4), headMat);
        tipR.position.set(0.17, 0.58, 0); tipR.rotation.z = -Math.PI / 2; g.add(tipR);
        return g;
    }

    _makeSword() {
        const g = new THREE.Group();
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe8ecf4, metalness: 0.95, roughness: 0.08 });
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.6, 0.012), bladeMat);
        blade.position.y = 0.4; blade.castShadow = true; g.add(blade);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.019, 0.09, 4), bladeMat);
        tip.position.y = 0.745; g.add(tip);
        const guardMat = new THREE.MeshStandardMaterial({ color: 0x997733, metalness: 0.5 });
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.04), guardMat);
        guard.position.y = 0.09; g.add(guard);
        const handleMat = new THREE.MeshStandardMaterial({ color: 0x44220a });
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), handleMat);
        g.add(handle);
        const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), guardMat);
        pommel.position.y = -0.08; g.add(pommel);
        return g;
    }

    _makeAxe() {
        const g = new THREE.Group();
        const handleMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e });
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.55, 0.03), handleMat);
        shaft.position.y = 0.3; shaft.castShadow = true; g.add(shaft);
        const headMat = new THREE.MeshStandardMaterial({ color: 0x889988, metalness: 0.7, roughness: 0.25 });
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.025), headMat);
        blade.position.set(-0.1, 0.58, 0); blade.castShadow = true; g.add(blade);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.02), headMat);
        edge.position.set(-0.21, 0.58, 0); edge.castShadow = true; g.add(edge);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.035), headMat);
        back.position.set(0.04, 0.58, 0); back.castShadow = true; g.add(back);
        return g;
    }

    triggerSwing() {
        this.swingTimer = 0;
    }

    _makeArm(side, shirtMat, skinMat) {
        const sign = side === 'left' ? -1 : 1;
        const shoulder = new THREE.Group();
        shoulder.position.set(sign * 0.28, 0.5, 0);
        this.spine.add(shoulder);

        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.28, 0.10), shirtMat);
        upper.position.y = -0.14; upper.castShadow = false;
        shoulder.add(upper);

        const elbow = new THREE.Group();
        elbow.position.y = -0.28;
        shoulder.add(elbow);

        const fore = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.26, 0.085), skinMat);
        fore.position.y = -0.13; fore.castShadow = false;
        elbow.add(fore);

        const handGrp = new THREE.Group();
        handGrp.position.y = -0.28;
        elbow.add(handGrp);

        const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.05), skinMat);
        handGrp.add(hand);

        return { shoulder, elbow, handGrp };
    }

    _makeLeg(side, pantsMat, shoeMat) {
        const sign = side === 'left' ? -1 : 1;
        const hip = new THREE.Group();
        hip.position.set(sign * 0.11, 0, 0);
        this.body.add(hip);

        const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.14), pantsMat);
        thigh.position.y = -0.21; thigh.castShadow = false;
        hip.add(thigh);

        const knee = new THREE.Group();
        knee.position.y = -0.42;
        hip.add(knee);

        const shin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.40, 0.12), pantsMat);
        shin.position.y = -0.20; shin.castShadow = false;
        knee.add(shin);

        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.24), shoeMat);
        foot.position.set(0, -0.43, 0.04); foot.castShadow = false;
        knee.add(foot);

        return { hip, knee };
    }

    update(dt, keys) {
        // ── Movement — exact same as game.html ──
        // W/S = forward/backward along facing direction
        // A/D = rotate character
        let wantDir = 0;
        if (keys['KeyW'] || keys['ArrowUp']) wantDir += 1;
        if (keys['KeyS'] || keys['ArrowDown']) wantDir -= 1;
        if (keys['KeyA'] || keys['ArrowLeft']) this.group.rotation.y += this.turnRate * dt;
        if (keys['KeyD'] || keys['ArrowRight']) this.group.rotation.y -= this.turnRate * dt;

        const wantSprint = !!(keys['ShiftLeft'] && wantDir > 0);
        const maxSpeed = wantSprint ? this.sprintSpeed : this.walkSpeed;

        // Speed accumulation — exact same as game.html
        if (wantDir !== 0) {
            this.speed += (maxSpeed * wantDir - this.speed) * this.accel * dt;
        } else {
            this.speed -= this.speed * this.decel * dt;
            if (Math.abs(this.speed) < 0.02) this.speed = 0;
        }

        // Move along facing direction
        const facingY = this.group.rotation.y;
        const moveX = Math.sin(facingY) * this.speed * dt;
        const moveZ = Math.cos(facingY) * this.speed * dt;

        // Jump — exact same as game.html
        if ((keys['Space'] || keys['ArrowUp']) && this.isGrounded && keys['Space']) {
            this.jumpVel = this.JUMP_VEL;
            this.isGrounded = false;
        }

        // Gravity
        this.jumpVel -= this.GRAVITY * dt;

        // ── Collision ──
        const newX = this.position.x + moveX;
        const newY = this.position.y + this.jumpVel * dt;
        const newZ = this.position.z + moveZ;

        // Y collision
        this.position.y = newY;
        this.isGrounded = false;
        if (this.jumpVel <= 0) {
            // Check slightly inside the feet (not exactly at boundary)
            const feetProbe = this.position.y - 0.001;
            if (this._checkFeet(this.position.x, feetProbe, this.position.z)) {
                // Snap to top of the block we're colliding with
                const blockY = Math.floor(feetProbe / BLOCK_SIZE);
                this.position.y = (blockY + 1) * BLOCK_SIZE + 0.001;
                this.jumpVel = 0;
                this.isGrounded = true;
            }
        } else {
            if (this._checkHead(this.position.x, this.position.y, this.position.z)) {
                this.jumpVel = 0;
            }
        }

        // X collision with step-up (up to 2 blocks)
        this.position.x = newX;
        if (this._checkBody()) {
            this.position.x -= moveX;
            if (this.isGrounded) {
                let stepped = false;
                const savedX = this.position.x;
                const savedY = this.position.y;
                for (let step = 1; step <= 2; step++) {
                    this.position.x = newX;
                    this.position.y = savedY + BLOCK_SIZE * step + 0.002;
                    if (!this._checkBody()) {
                        const blockY = Math.floor((savedY + BLOCK_SIZE * step) / BLOCK_SIZE);
                        this.position.y = blockY * BLOCK_SIZE + 0.001;
                        stepped = true;
                        break;
                    }
                }
                if (!stepped) {
                    this.position.x = savedX;
                    this.position.y = savedY;
                    this.speed *= 0.5;
                }
            } else {
                this.speed *= 0.5;
            }
        }

        // Z collision with step-up (up to 2 blocks)
        this.position.z = newZ;
        if (this._checkBody()) {
            this.position.z -= moveZ;
            if (this.isGrounded) {
                let stepped = false;
                const savedZ = this.position.z;
                const savedY = this.position.y;
                for (let step = 1; step <= 2; step++) {
                    this.position.z = newZ;
                    this.position.y = savedY + BLOCK_SIZE * step + 0.002;
                    if (!this._checkBody()) {
                        const blockY = Math.floor((savedY + BLOCK_SIZE * step) / BLOCK_SIZE);
                        this.position.y = blockY * BLOCK_SIZE + 0.001;
                        stepped = true;
                        break;
                    }
                }
                if (!stepped) {
                    this.position.z = savedZ;
                    this.position.y = savedY;
                    this.speed *= 0.5;
                }
            } else {
                this.speed *= 0.5;
            }
        }

        // Prevent falling through world
        if (this.position.y < -5) {
            this.position.y = 40;
            this.jumpVel = 0;
        }

        // ── Animation — exact copy from game.html ──
        const speed = Math.abs(this.speed);
        const isMoving = speed > 0.15;
        const s = this.sprintBlend;
        const cr = 0; // no crouch

        // Walk blend (smooth)
        this.walkBlend += ((isMoving ? 1 : 0) - this.walkBlend) * this.blendRate * dt;
        this.walkBlend = clamp01(this.walkBlend);

        // Sprint blend
        const sprintTarget = (speed > this.walkSpeed + 0.3 && wantSprint) ? 1 : 0;
        this.sprintBlend += (sprintTarget - this.sprintBlend) * 6 * dt;
        this.sprintBlend = clamp01(this.sprintBlend);

        const b = this.walkBlend;
        const freq = mix(mix(4.2, 2.9, s), 5.5, cr);
        this.walkPhase += speed * dt * freq;
        const p = this.walkPhase;

        // ── Body (hip) ──
        const bobAmp = mix(mix(0.025, 0.055, s), 0.012, cr);
        const baseY = this.hipHeight;
        this.body.position.y = baseY + Math.cos(p * 2) * bobAmp * b;

        // Lateral sway
        const swayAmp = mix(mix(0.018, 0.008, s), 0.028, cr);
        this.body.position.x = Math.sin(p) * swayAmp * b;

        // ── Legs ──
        const legAmp = mix(mix(0.5, 0.85, s), 0.25, cr);
        const legSwing = Math.sin(p) * legAmp * b;
        this.leftLeg.hip.rotation.x = legSwing;
        this.rightLeg.hip.rotation.x = -legSwing;

        const kneeAmp = mix(mix(0.7, 1.25, s), 0.3, cr);
        this.leftLeg.knee.rotation.x = Math.max(0, -Math.sin(p)) * kneeAmp * b;
        this.rightLeg.knee.rotation.x = Math.max(0, Math.sin(p)) * kneeAmp * b;

        // ── Spine ──
        const walkLean = mix(0.04, 0.16, s) * b;
        this.spine.rotation.x = walkLean;
        this.spine.rotation.y = 0;
        this.spine.rotation.z = 0;

        // Torso twist
        const twistAmp = mix(mix(0.04, 0.07, s), 0.05, cr);
        this.torso.rotation.y = Math.sin(p) * twistAmp * b;

        // Head counter-tilt
        this.headGroup.rotation.x = -this.spine.rotation.x * 0.45;

        // ── Arms ──
        const armSwingMul = mix(mix(0.7, 1.1, s), 0.3, cr);
        this.leftArm.shoulder.rotation.x = -legSwing * armSwingMul;
        this.leftArm.shoulder.rotation.z = 0;
        this.rightArm.shoulder.rotation.x = legSwing * armSwingMul;
        this.rightArm.shoulder.rotation.z = 0;

        // Elbows
        const elbowBase = mix(mix(-0.15, -1.4, s), -0.35, cr);
        const elbowDynamic = mix(mix(0.3, 0.45, s), 0.15, cr);
        this.leftArm.elbow.rotation.x = b * (elbowBase - Math.max(0, Math.sin(p)) * elbowDynamic);
        this.rightArm.elbow.rotation.x = b * (elbowBase - Math.max(0, -Math.sin(p)) * elbowDynamic);

        if (b < 0.5) {
            const idleElbow = cr * -0.35 * (1 - b);
            this.leftArm.elbow.rotation.x += idleElbow;
            this.rightArm.elbow.rotation.x += idleElbow;
        }

        // ── Swing animation overlay (exact from game.html) ──
        if (this.swingTimer >= 0) {
            this.swingTimer += dt / 0.5; // 0.5s swing duration
            const t = this.swingTimer;
            let swShX, swShZ, swElX, swSpineX, swSpineY;

            const ss = (e0, e1, x) => { const u = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };

            if (t < 0.2) {
                // Wind up — raise arm to horizontal, torso coils back
                const u = ss(0, 0.2, t);
                swShX    = u * (-1.1);
                swShZ    = u * 0.3;
                swElX    = u * (-0.25);
                swSpineY = u * (-0.45);
                swSpineX = u * 0.03;
            } else if (t < 0.45) {
                // Sweep — torso drives a big twist, arm stays horizontal
                const u = ss(0.2, 0.45, t);
                swShX    = -1.1;
                swShZ    = 0.3 + (-0.15 - 0.3) * u;
                swElX    = -0.25 + (-0.1 - (-0.25)) * u;
                swSpineY = -0.45 + (0.55 - (-0.45)) * u;
                swSpineX = 0.03 + (0.06 - 0.03) * u;
            } else {
                // Recovery — everything returns to rest
                const u = ss(0.45, 1.0, t);
                swShX    = -1.1 * (1 - u);
                swShZ    = -0.15 * (1 - u);
                swElX    = -0.1 * (1 - u);
                swSpineY = 0.55 * (1 - u);
                swSpineX = 0.06 * (1 - u);
            }

            this.leftArm.shoulder.rotation.x += swShX;
            this.leftArm.shoulder.rotation.z += swShZ;
            this.leftArm.elbow.rotation.x    += swElX;
            this.spine.rotation.x += swSpineX;
            this.spine.rotation.y += swSpineY;

            if (this.swingTimer >= 1) this.swingTimer = -1;
        }

        // Update group position
        this.group.position.copy(this.position);
    }

    // Collision helpers
    _checkFeet(x, y, z) {
        const r = this.WIDTH;
        // Check all 4 corners plus center at foot level
        if (this.world.isSolid(x, y, z)) return true;
        for (let dx = -1; dx <= 1; dx += 2) {
            for (let dz = -1; dz <= 1; dz += 2) {
                if (this.world.isSolid(x + dx * r, y, z + dz * r)) return true;
            }
        }
        return false;
    }

    _checkHead(x, y, z) {
        const r = this.WIDTH;
        const headY = y + this.HEIGHT;
        for (let dx = -1; dx <= 1; dx += 2) {
            for (let dz = -1; dz <= 1; dz += 2) {
                if (this.world.isSolid(x + dx * r, headY, z + dz * r)) return true;
            }
        }
        return false;
    }

    _checkBody() {
        const r = this.WIDTH;
        const x = this.position.x, z = this.position.z;
        for (let h = 0.05; h < this.HEIGHT - 0.05; h += BLOCK_SIZE * 0.9) {
            const y = this.position.y + h;
            for (let dx = -1; dx <= 1; dx += 2) {
                for (let dz = -1; dz <= 1; dz += 2) {
                    if (this.world.isSolid(x + dx * r, y, z + dz * r)) return true;
                }
            }
        }
        return false;
    }
}
