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

        // Materials — stored on instance for color customization
        const skinMat  = this._skinMat  = new THREE.MeshStandardMaterial({ color: 0xE8B49D });
        const shirtMat = this._shirtMat = new THREE.MeshStandardMaterial({ color: 0x4477BB });
        const pantsMat = this._pantsMat = new THREE.MeshStandardMaterial({ color: 0x334466 });
        const shoeMat  = this._shoeMat  = new THREE.MeshStandardMaterial({ color: 0x332211 });
        const hairMat  = this._hairMat  = new THREE.MeshStandardMaterial({ color: 0x3B2507 });
        const eyeMat   = new THREE.MeshStandardMaterial({ color: 0x222222 });

        // character (world position + Y rotation)
        //  └─ body (hip-level pivot)
        //      ├─ spine (upper body pivot)
        //      │   ├─ torso, neck, headGroup
        //      │   ├─ leftArm.shoulder
        //      │   └─ rightArm.shoulder
        //      ├─ leftLeg.hip
        //      └─ rightLeg.hip

        this.hipHeight = 0.90;

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

        this._hairGroup = new THREE.Group();
        this.headGroup.add(this._hairGroup);
        this.setHairStyle('short');

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

        this.staffHeld = this._makeStaff();
        this.staffHeld.visible = false;
        this.staffHeld.position.y = 0.02;
        this.leftArm.handGrp.add(this.staffHeld);

        // Swing state
        this.swingTimer = -1;
    }

    _makePickaxe() {
        const g = new THREE.Group();
        const handleMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e });
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.55, 0.03), handleMat);
        shaft.position.y = 0.3; shaft.castShadow = true; g.add(shaft);
        const headMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.7, metalness: 0.0 });
        const pickHead = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.04), headMat);
        pickHead.position.y = 0.58; pickHead.castShadow = true; g.add(pickHead);
        const tipL = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 4), headMat);
        tipL.position.set(-0.17, 0.58, 0); tipL.rotation.z = Math.PI / 2; g.add(tipL);
        const tipR = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 4), headMat);
        tipR.position.set(0.17, 0.58, 0); tipR.rotation.z = -Math.PI / 2; g.add(tipR);
        g._headMat = headMat;
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
        g._bladeMat = bladeMat;
        g._guardMat = guardMat;
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
        g._headMat = headMat;
        return g;
    }

    setToolColor(tool, itemName) {
        // Material tiers: wood, stone, iron, gold, diamond
        const TIER_COLORS = {
            pickaxe:        { head: 0x8a6a3a, metal: 0.0, rough: 0.7 }, // wood
            stone_pickaxe:  { head: 0x888888, metal: 0.3, rough: 0.5 },
            iron_pickaxe:   { head: 0xb0b8c0, metal: 0.8, rough: 0.15 },
            gold_pickaxe:   { head: 0xf0d060, metal: 0.9, rough: 0.1 },
            diamond_pickaxe:{ head: 0x4ae8e8, metal: 0.7, rough: 0.08 },
            wood_sword:     { blade: 0x8a6a3a, guard: 0x5c3a1e, metal: 0.0, rough: 0.7 },
            stone_sword:    { blade: 0x999999, guard: 0x666666, metal: 0.3, rough: 0.4 },
            iron_sword:     { blade: 0xe8ecf4, guard: 0x997733, metal: 0.95, rough: 0.08 },
            gold_sword:     { blade: 0xf8e860, guard: 0xc8a020, metal: 0.9, rough: 0.1 },
            diamond_sword:  { blade: 0x6af8f8, guard: 0x2ab0c0, metal: 0.7, rough: 0.05 },
            wood_axe:       { head: 0x8a6a3a, metal: 0.0, rough: 0.7 },
            stone_axe:      { head: 0x888888, metal: 0.3, rough: 0.5 },
            iron_axe:       { head: 0xb0b8c0, metal: 0.8, rough: 0.15 },
            gold_axe:       { head: 0xf0d060, metal: 0.9, rough: 0.1 },
            diamond_axe:    { head: 0x4ae8e8, metal: 0.7, rough: 0.08 },
        };
        const t = TIER_COLORS[itemName];
        if (!t) return;
        if (tool._headMat) {
            tool._headMat.color.setHex(t.head);
            tool._headMat.metalness = t.metal;
            tool._headMat.roughness = t.rough;
        }
        if (tool._bladeMat) {
            tool._bladeMat.color.setHex(t.blade);
            tool._bladeMat.metalness = t.metal;
            tool._bladeMat.roughness = t.rough;
        }
        if (tool._guardMat && t.guard) {
            tool._guardMat.color.setHex(t.guard);
        }
    }

    _makeStaff() {
        const g = new THREE.Group();
        const shaftMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e });
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.0, 0.03), shaftMat);
        shaft.position.y = 0.15; shaft.castShadow = true; g.add(shaft);
        // Orb at top — color will be set dynamically
        const orbMat = new THREE.MeshStandardMaterial({ color: 0xff6622, emissive: 0xff4400, emissiveIntensity: 0.5 });
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), orbMat);
        orb.position.y = 1.18; orb.castShadow = true; g.add(orb);
        g._orbMat = orbMat;
        return g;
    }

    setHairStyle(style, tipColor) {
        const g = this._hairGroup;
        while (g.children.length) g.remove(g.children[0]);
        const rc = '#' + this._hairMat.color.getHexString();
        const tc = tipColor || rc;
        const m = this._hairMat; // flat color fallback

        if (style === 'short') {
            g.add(this._hmGrad(0.24, 0.08, 0.24, rc, tc, 0, 0.13, 0));
        } else if (style === 'flat') {
            g.add(this._hmGrad(0.26, 0.12, 0.26, rc, tc, 0, 0.10, 0));
            g.add(this._hmGrad(0.24, 0.04, 0.24, rc, tc, 0, 0.16, 0));
        } else if (style === 'long') {
            g.add(this._hmGrad(0.24, 0.08, 0.24, rc, tc, 0, 0.13, 0));
            g.add(this._hmGrad(0.24, 0.28, 0.06, rc, tc, 0, -0.02, -0.12));
            g.add(this._hmGrad(0.06, 0.20, 0.18, rc, tc, -0.13, 0, 0));
            g.add(this._hmGrad(0.06, 0.20, 0.18, rc, tc, 0.13, 0, 0));
        } else if (style === 'mohawk') {
            g.add(this._hmGrad(0.06, 0.16, 0.22, rc, tc, 0, 0.18, 0));
        } else if (style === 'messy') {
            g.add(this._hmGrad(0.26, 0.10, 0.26, rc, tc, 0, 0.14, 0, 0, 0.15, 0));
            g.add(this._hmGrad(0.08, 0.08, 0.08, rc, tc, -0.10, 0.18, 0.08, 0, 0, 0.3));
            g.add(this._hmGrad(0.07, 0.09, 0.07, rc, tc, 0.08, 0.19, -0.06, 0, 0, -0.4));
            g.add(this._hmGrad(0.06, 0.07, 0.06, rc, tc, 0, 0.20, 0.10, 0.3, 0, 0));
        } else if (style === 'curly') {
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                g.add(this._hmGrad(0.07, 0.07, 0.07, rc, tc, Math.cos(a)*0.10, 0.13+Math.sin(i*1.5)*0.03, Math.sin(a)*0.10));
            }
            g.add(this._hmGrad(0.18, 0.06, 0.18, rc, rc, 0, 0.12, 0));
        } else if (style === 'ponytail') {
            g.add(this._hmGrad(0.24, 0.08, 0.24, rc, rc, 0, 0.13, 0));
            g.add(this._hmGrad(0.06, 0.06, 0.06, rc, rc, 0, 0.08, -0.13));
            g.add(this._hmGrad(0.05, 0.18, 0.05, rc, tc, 0, -0.04, -0.16));
            g.add(this._hmGrad(0.06, 0.06, 0.06, tc, tc, 0, -0.14, -0.18));
        } else if (style === 'spiky') {
            g.add(this._hmGrad(0.22, 0.05, 0.22, rc, rc, 0, 0.12, 0));
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2 + 0.3;
                const spike = this._hmGrad(0.04, 0.12, 0.04, rc, tc, Math.cos(a)*0.06, 0.20, Math.sin(a)*0.06);
                spike.rotation.set(Math.sin(a)*0.4, 0, Math.cos(a)*0.4);
                g.add(spike);
            }
        } else if (style === 'bowl') {
            g.add(this._hmGrad(0.26, 0.10, 0.26, rc, tc, 0, 0.10, 0));
            g.add(this._hmGrad(0.24, 0.04, 0.24, tc, tc, 0, 0.04, 0));
            g.add(this._hmGrad(0.26, 0.03, 0.08, tc, tc, 0, 0.02, 0.12));
        }
    }

    // Create a hair mesh with vertical color gradient (root→tip)
    _hm(w, h, d, mat, x, y, z, rx, ry, rz) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(x || 0, y || 0, z || 0);
        if (rx || ry || rz) mesh.rotation.set(rx || 0, ry || 0, rz || 0);
        return mesh;
    }

    _hmGrad(w, h, d, rootColor, tipColor, x, y, z, rx, ry, rz) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({ vertexColors: true });
        // Color each vertex based on Y position (bottom=root, top=tip)
        const pos = geo.attributes.position;
        const colors = new Float32Array(pos.count * 3);
        const rc = new THREE.Color(rootColor);
        const tc = new THREE.Color(tipColor);
        const tmp = new THREE.Color();
        for (let i = 0; i < pos.count; i++) {
            const vy = pos.getY(i);
            const t = 0.5 - (vy / h); // 0 at top (root), 1 at bottom (tip)
            tmp.copy(rc).lerp(tc, Math.max(0, Math.min(1, t)));
            colors[i * 3] = tmp.r;
            colors[i * 3 + 1] = tmp.g;
            colors[i * 3 + 2] = tmp.b;
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x || 0, y || 0, z || 0);
        if (rx || ry || rz) mesh.rotation.set(rx || 0, ry || 0, rz || 0);
        return mesh;
    }

    setBody(h) {
        h = h || 1;
        this.body.scale.set(1, h, 1);
        if (this.headGroup) this.headGroup.scale.set(1, 1/h, 1);
        this.HEIGHT = 1.9 * h;
        this.EYE_HEIGHT = 1.7 * h;
        this.hipHeight = 0.90 * h;
        this.body.position.y = this.hipHeight;
    }

    setHeight(h) { this.setBody(h); }

    setStaffColor(color, emissive) {
        if (this.staffHeld._orbMat) {
            this.staffHeld._orbMat.color.setHex(color);
            this.staffHeld._orbMat.emissive.setHex(emissive);
        }
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

    update(dt, keys, fpMode, fpYaw, kb) {
        // kb = keybinds map (optional, falls back to defaults)
        const kf = kb ? kb.forward : 'KeyW';
        const kk = kb ? kb.back : 'KeyS';
        const kl = kb ? kb.left : 'KeyA';
        const kr = kb ? kb.right : 'KeyD';
        const kj = kb ? kb.jump : 'Space';
        const ks = kb ? kb.sprint : 'ShiftLeft';

        let wantDir = 0;
        let strafeDir = 0;
        if (keys[kf] || keys['ArrowUp']) wantDir += 1;
        if (keys[kk] || keys['ArrowDown']) wantDir -= 1;

        if (fpMode) {
            if (keys[kl] || keys['ArrowLeft']) strafeDir += 1;
            if (keys[kr] || keys['ArrowRight']) strafeDir -= 1;
            // Only turn player model when moving
            const isMoving = wantDir !== 0 || strafeDir !== 0;
            if (isMoving) this.group.rotation.y = fpYaw;
        } else {
            // Third person: A/D rotate
            if (keys[kl] || keys['ArrowLeft']) this.group.rotation.y += this.turnRate * dt;
            if (keys[kr] || keys['ArrowRight']) this.group.rotation.y -= this.turnRate * dt;
        }

        const wantSprint = !!(keys[ks] && (wantDir > 0 || strafeDir !== 0));
        const maxSpeed = wantSprint ? this.sprintSpeed : this.walkSpeed;

        // Speed — combine forward and strafe
        const hasInput = wantDir !== 0 || strafeDir !== 0;
        if (hasInput) {
            this.speed += (maxSpeed - Math.abs(this.speed)) * this.accel * dt;
            if (this.speed > maxSpeed) this.speed = maxSpeed;
        } else {
            this.speed -= this.speed * this.decel * dt;
            if (Math.abs(this.speed) < 0.02) this.speed = 0;
        }

        // Move along facing direction + strafe
        const facingY = this.group.rotation.y;
        const fwd = wantDir !== 0 || strafeDir !== 0 ? 1 : 0;
        const moveAngle = Math.atan2(
            wantDir * Math.sin(facingY) + strafeDir * Math.cos(facingY),
            wantDir * Math.cos(facingY) - strafeDir * Math.sin(facingY)
        );
        const moveX = hasInput ? Math.sin(moveAngle) * this.speed * dt : 0;
        const moveZ = hasInput ? Math.cos(moveAngle) * this.speed * dt : 0;

        // Jump — exact same as game.html
        if (keys[kj] && this.isGrounded) {
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

        // Prevent falling through world — teleport back to surface
        if (this.position.y < -20) {
            const safeY = this.world.getHeight(this.position.x, this.position.z);
            this.position.y = safeY + 2;
            this.jumpVel = 0;
            this.isGrounded = false;
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

        // ── Staff holding pose — arm out at angle, staff stays vertical ──
        if (this.staffHeld.visible) {
            const staffSwing = -legSwing * armSwingMul * 0.3;
            this.leftArm.shoulder.rotation.x = -0.15 + staffSwing;
            this.leftArm.shoulder.rotation.z = -0.35;
            this.leftArm.elbow.rotation.x = -0.4;
            // Counter-rotate staff to cancel arm tilt so it stays upright
            this.staffHeld.rotation.x = -(-0.15 + staffSwing + -0.4);
            this.staffHeld.rotation.z = 0.35;
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
