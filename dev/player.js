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
        this.stamina = 200;
        this.maxStamina = 200;
        this.staminaDrain = 20; // per second while sprinting
        this.staminaRegen = 18; // per second while not sprinting
        this._crouching = false;
        this.creative = false;

        // Movement constants — exact from game.html
        this.walkSpeed = 3.6;
        this.sprintSpeed = 8.0;
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
        this.swordHeld.rotation.x = Math.PI - 0.4;  // tilted forward
        this.swordHeld.rotation.z = -0.15;           // slight side angle
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

        // Bow goes in the RIGHT hand (non-sword). Arm extends forward when holding.
        // Bow's local Y is vertical (limbs up/down). Hand points down when arm is extended
        // forward (hand_grp has its +Y axis pointing down from the elbow). So we rotate the
        // bow +90° around Z to make its limbs align with world vertical when the arm is level.
        this.bowHeld = this._makeBow();
        this.bowHeld.visible = false;
        this.bowHeld.rotation.set(Math.PI / 2, 0, Math.PI);
        // Offset bow forward from the hand so the string isn't inside the arm
        this.bowHeld.position.set(0, -0.25, 0);
        this.rightArm.handGrp.add(this.bowHeld);

        // Sheathed sword — on hip (one-handed) or back (two-handed)
        this.sheathedSword = this._makeSword();
        this.sheathedSword.visible = false;
        // Default: hip position (blade pointing down)
        this.sheathedSword.rotation.set(Math.PI, 0, 0.15); // flipped so blade points down
        this.sheathedSword.scale.set(0.9, 0.9, 0.9);
        this.sheathedSword.position.set(0.25, 0.2, -0.05); // right hip
        this.spine.add(this.sheathedSword);

        // Sheathed staff (on back when not held)
        this.sheathedStaff = this._makeSheathedStaff();
        this.sheathedStaff.visible = false;
        this.spine.add(this.sheathedStaff);

        // Shield mesh on right arm
        this._shieldMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5, roughness: 0.3 });
        this._shieldMesh = new THREE.Group();
        const shieldFace = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.38, 0.03), this._shieldMat);
        this._shieldMesh.add(shieldFace);
        const shieldRim = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.40, 0.01), new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6 }));
        shieldRim.position.z = 0.02; this._shieldMesh.add(shieldRim);
        const shieldBoss = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), this._shieldMat);
        shieldBoss.position.z = 0.03; this._shieldMesh.add(shieldBoss);
        // Cross detail
        const shieldCrossH = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.015), new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5 }));
        shieldCrossH.position.z = 0.025; this._shieldMesh.add(shieldCrossH);
        const shieldCrossV = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.28, 0.015), new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5 }));
        shieldCrossV.position.z = 0.025; this._shieldMesh.add(shieldCrossV);
        // Default: hanging on outer side of arm, facing outward
        this._shieldMesh.position.set(0.08, -0.12, 0);
        this._shieldMesh.rotation.set(0, Math.PI / 2, 0);
        this._shieldMesh.visible = false;
        this.rightArm.elbow.add(this._shieldMesh);

        // Swing state
        this.swingTimer = -1;

        // Armor overlays — shaped pieces that look like actual armor
        const _aMat = () => new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.25 });

        // Helmet — cap with brim and nose guard
        this._armorHelmetGrp = new THREE.Group();
        this._armorHelmetGrp.visible = false;
        const helmetTop = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.24), _aMat());
        helmetTop.position.y = 0.1; this._armorHelmetGrp.add(helmetTop);
        const helmetBrim = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.28), _aMat());
        helmetBrim.position.y = 0.02; this._armorHelmetGrp.add(helmetBrim);
        const helmetNose = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.03), _aMat());
        helmetNose.position.set(0, -0.02, 0.13); this._armorHelmetGrp.add(helmetNose);
        const helmetSides = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.22), _aMat());
        helmetSides.position.y = -0.03; this._armorHelmetGrp.add(helmetSides);
        this._armorHelmetGrp._mats = [helmetTop.material, helmetBrim.material, helmetNose.material, helmetSides.material];
        this._armorHelmetGrp._normalParts = [helmetTop, helmetBrim, helmetNose, helmetSides];
        this._armorHelmetGrp.scale.setScalar(1.15);
        this.headGroup.add(this._armorHelmetGrp);

        // Wizard hat — pointy cone + wide brim, hidden by default
        const wizHatMat = _aMat();
        const wizCone = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.45, 6), wizHatMat);
        wizCone.position.y = 0.35;
        const wizBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 8), wizHatMat);
        wizBrim.position.y = 0.15;
        const wizBrimTip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 4), wizHatMat);
        wizBrimTip.position.set(0, 0.58, 0);
        this._wizHat = new THREE.Group();
        this._wizHat.add(wizCone); this._wizHat.add(wizBrim); this._wizHat.add(wizBrimTip);
        this._wizHat._mats = [wizHatMat];
        this._wizHat.visible = false;
        this.headGroup.add(this._wizHat);

        // Chestplate — torso plate + shoulder pauldrons
        this._armorChestGrp = new THREE.Group();
        this._armorChestGrp.visible = false;
        const chestFront = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.04), _aMat());
        chestFront.position.set(0, 0.3, 0.12); this._armorChestGrp.add(chestFront);
        const chestBack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.04), _aMat());
        chestBack.position.set(0, 0.3, -0.12); this._armorChestGrp.add(chestBack);
        const chestSideL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.2), _aMat());
        chestSideL.position.set(-0.22, 0.32, 0); this._armorChestGrp.add(chestSideL);
        const chestSideR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.2), _aMat());
        chestSideR.position.set(0.22, 0.32, 0); this._armorChestGrp.add(chestSideR);
        // Shoulder pauldrons
        const pauldronL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.14), _aMat());
        pauldronL.position.set(-0.3, 0.53, 0); this._armorChestGrp.add(pauldronL);
        const pauldronR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.14), _aMat());
        pauldronR.position.set(0.3, 0.53, 0); this._armorChestGrp.add(pauldronR);
        // Belt
        const belt = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.24), _aMat());
        belt.position.set(0, 0.05, 0); this._armorChestGrp.add(belt);
        this._armorChestGrp._mats = [chestFront.material, chestBack.material, chestSideL.material, chestSideR.material, pauldronL.material, pauldronR.material, belt.material];
        this._armorChestGrp.scale.setScalar(1.12);
        this.spine.add(this._armorChestGrp);

        // Leggings — thigh guards
        this._armorLegL = new THREE.Group();
        this._armorLegL.visible = false;
        const legPlateLF = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.4, 0.03), _aMat());
        legPlateLF.position.set(0, -0.2, 0.07); this._armorLegL.add(legPlateLF);
        const legPlateLB = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.35, 0.03), _aMat());
        legPlateLB.position.set(0, -0.18, -0.07); this._armorLegL.add(legPlateLB);
        const legKneeL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), _aMat());
        legKneeL.position.set(0, -0.38, 0.04); this._armorLegL.add(legKneeL);
        this._armorLegL._mats = [legPlateLF.material, legPlateLB.material, legKneeL.material];
        this._armorLegL.scale.setScalar(1.15);
        this.leftLeg.hip.add(this._armorLegL);

        this._armorLegR = new THREE.Group();
        this._armorLegR.visible = false;
        const legPlateRF = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.4, 0.03), _aMat());
        legPlateRF.position.set(0, -0.2, 0.07); this._armorLegR.add(legPlateRF);
        const legPlateRB = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.35, 0.03), _aMat());
        legPlateRB.position.set(0, -0.18, -0.07); this._armorLegR.add(legPlateRB);
        const legKneeR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), _aMat());
        legKneeR.position.set(0, -0.38, 0.04); this._armorLegR.add(legKneeR);
        this._armorLegR._mats = [legPlateRF.material, legPlateRB.material, legKneeR.material];
        this._armorLegR.scale.setScalar(1.15);
        this.rightLeg.hip.add(this._armorLegR);

        // Boots — armored shin guards + foot plates
        this._armorBootL = new THREE.Group();
        this._armorBootL.visible = false;
        const bootShinL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.38, 0.04), _aMat());
        bootShinL.position.set(0, -0.18, 0.07); this._armorBootL.add(bootShinL);
        const bootFootL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.26), _aMat());
        bootFootL.position.set(0, -0.44, 0.04); this._armorBootL.add(bootFootL);
        this._armorBootL._mats = [bootShinL.material, bootFootL.material];
        this._armorBootL.scale.setScalar(1.15);
        this.leftLeg.knee.add(this._armorBootL);

        this._armorBootR = new THREE.Group();
        this._armorBootR.visible = false;
        const bootShinR = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.38, 0.04), _aMat());
        bootShinR.position.set(0, -0.18, 0.07); this._armorBootR.add(bootShinR);
        const bootFootR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.26), _aMat());
        bootFootR.position.set(0, -0.44, 0.04); this._armorBootR.add(bootFootR);
        this._armorBootR._mats = [bootShinR.material, bootFootR.material];
        this._armorBootR.scale.setScalar(1.15);
        this.rightLeg.knee.add(this._armorBootR);
    }

    setArmorVisuals(slots) {
        const ARMOR_COLORS = {
            wood: { c: 0x8a6a3a, m: 0.1, r: 0.7 },
            stone: { c: 0x888888, m: 0.3, r: 0.5 },
            iron: { c: 0xc0c8d0, m: 0.7, r: 0.2 },
            gold: { c: 0xffee44, m: 0.4, r: 0.2 },
            steel: { c: 0xe8eef5, m: 0.6, r: 0.15 },
            diamond: { c: 0x88ffff, m: 0.3, r: 0.15 },
            dragonsteel: { c: 0x1a1a28, m: 0.85, r: 0.05 },
            ember: { c: 0xff4400, m: 0.7, r: 0.3 },
        };
        const WIZARD_COLORS = {
            blue: 0x3355bb, purple: 0x7733aa, red: 0xaa3333, green: 0x338844,
            black: 0x222233, white: 0xddddee, gold: 0xbb9933,
        };
        const _setGrp = (grp, item, isHelmetSlot) => {
            if (!item) { grp.visible = false; if (isHelmetSlot && this._wizHat) this._wizHat.visible = false; return; }
            // Reset wizard hat only when processing helmet slot
            if (isHelmetSlot) {
                if (this._wizHat) this._wizHat.visible = false;
                if (grp._normalParts) for (const p of grp._normalParts) p.visible = true;
            }

            // Handle wizard robes — extract color from item key
            if (typeof item === 'string' && item.startsWith('wizard_')) {
                const parts = item.split('_');
                const wizColor = WIZARD_COLORS[parts[2]] || 0x3355bb;
                // For helmet slot — show wizard hat instead of normal helmet
                if (parts[1] === 'helmet' && this._wizHat) {
                    grp.visible = false; // hide normal helmet entirely
                    this._wizHat.visible = true;
                    if (this._wizHat._mats) for (const m of this._wizHat._mats) {
                        m.color.setHex(wizColor); m.metalness = 0.0; m.roughness = 0.85;
                    }
                    return;
                }
                grp.visible = true;
                if (grp._mats) for (const m of grp._mats) {
                    m.color.setHex(wizColor); m.metalness = 0.0; m.roughness = 0.85;
                }
                return;
            }
            const tier = item.replace(/_helmet|_chestplate|_leggings|_boots/, '');
            const col = ARMOR_COLORS[tier] || ARMOR_COLORS.iron;
            grp.visible = true;
            if (grp._mats) for (const m of grp._mats) {
                m.color.setHex(col.c); m.metalness = col.m; m.roughness = col.r;
            }
        };
        _setGrp(this._armorHelmetGrp, slots.helmet, true);
        _setGrp(this._armorChestGrp, slots.chestplate, false);
        _setGrp(this._armorLegL, slots.leggings, false);
        _setGrp(this._armorLegR, slots.leggings, false);
        _setGrp(this._armorBootL, slots.boots, false);
        _setGrp(this._armorBootR, slots.boots, false);
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
        // Blade
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe8ecf4, metalness: 0.95, roughness: 0.08 });
        const bladeGrp = new THREE.Group(); g.add(bladeGrp);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.6, 0.012), bladeMat);
        blade.position.y = 0.4; blade.castShadow = true; bladeGrp.add(blade);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.08, 4), bladeMat);
        tip.position.y = 0.74; bladeGrp.add(tip);
        // Trim stripe on blade
        const trimMat = new THREE.MeshStandardMaterial({ color: 0x997733, metalness: 0.6 });
        const trimStripe = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.5, 0.004), trimMat);
        trimStripe.position.set(0, 0.38, 0.008); trimStripe.visible = false; bladeGrp.add(trimStripe);
        const trimStripe2 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.5, 0.004), trimMat);
        trimStripe2.position.set(0, 0.38, -0.008); trimStripe2.visible = false; bladeGrp.add(trimStripe2);
        // Guard
        const guardMat = new THREE.MeshStandardMaterial({ color: 0x997733, metalness: 0.5 });
        const guardGrp = new THREE.Group(); guardGrp.position.y = 0.09; g.add(guardGrp);
        const guardMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.04), guardMat);
        guardGrp.add(guardMesh);
        // Guard extras (for different styles)
        const guardExtra1 = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 4), guardMat);
        guardExtra1.position.set(-0.1, 0, 0); guardExtra1.rotation.z = Math.PI/2; guardExtra1.visible = false; guardGrp.add(guardExtra1);
        const guardExtra2 = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 4), guardMat);
        guardExtra2.position.set(0.1, 0, 0); guardExtra2.rotation.z = -Math.PI/2; guardExtra2.visible = false; guardGrp.add(guardExtra2);
        // Handle
        const handleMat = new THREE.MeshStandardMaterial({ color: 0x44220a });
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), handleMat);
        g.add(handle);
        // Pommel
        const pommelMat = new THREE.MeshStandardMaterial({ color: 0x997733, metalness: 0.5 });
        const pommelGrp = new THREE.Group(); pommelGrp.position.y = -0.08; g.add(pommelGrp);
        const pommelMesh = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), pommelMat);
        pommelGrp.add(pommelMesh);
        // Store refs
        g._bladeMat = bladeMat;
        g._bladeGrp = bladeGrp;
        g._guardMat = guardMat;
        g._guardMesh = guardMesh;
        g._guardGrp = guardGrp;
        g._guardExtra1 = guardExtra1;
        g._guardExtra2 = guardExtra2;
        g._handleMat = handleMat;
        g._pommelMat = pommelMat;
        g._pommelGrp = pommelGrp;
        g._pommelMesh = pommelMesh;
        g._trimMat = trimMat;
        g._trimStripe = trimStripe;
        g._trimStripe2 = trimStripe2;
        return g;
    }

    // Apply custom sword visuals
    applyCustomSword(swordData) {
        const tool = this.swordHeld;
        if (!tool || !swordData) return;
        const MAT_COLORS = {
            'stick': { color: 0x8a6a3a, metal: 0.0, rough: 0.7 },
            '3': { color: 0x888888, metal: 0.3, rough: 0.5 },
            [3]: { color: 0x888888, metal: 0.3, rough: 0.5 },
            'iron_ingot': { color: 0xc0c8d0, metal: 0.8, rough: 0.15 },
            'steel_ingot': { color: 0xe8eef5, metal: 0.5, rough: 0.1 },
            'gold_ingot': { color: 0xffee44, metal: 0.4, rough: 0.2 },
            'diamond': { color: 0x88ffff, metal: 0.3, rough: 0.15 },
            'dragonsteel_ingot': { color: 0x1a1a28, metal: 0.85, rough: 0.05 },
            'ruby': { color: 0xff3355, metal: 0.4, rough: 0.12 },
            'sapphire': { color: 0x4466ff, metal: 0.4, rough: 0.12 },
            'emerald': { color: 0x44ff66, metal: 0.4, rough: 0.12 },
            'topaz': { color: 0xffcc33, metal: 0.4, rough: 0.12 },
        };
        const _applyMat = (mat, key) => {
            const m = MAT_COLORS[key] || MAT_COLORS['iron_ingot'];
            mat.color.setHex(m.color);
            mat.metalness = m.metal;
            mat.roughness = m.rough;
        };
        // Two-handed if blade is big enough (length >= 3 or length + thickness >= 5)
        const bLen = swordData.bladeLength || 2;
        const bThick = swordData.bladeThickness || 1;
        this._twoHanded = (bLen >= 3 || bLen + bThick >= 5 || (swordData.isWarhammer && bLen >= 2.5));
        // Blade — scale by length and thickness
        _applyMat(tool._bladeMat, swordData.bladeMat);
        const bLenScale = bLen / 2;   // normalize: 2 = default (1.0x)
        if (swordData.isBattleaxe || swordData.isWarhammer) {
            // Keep the blade group at its natural size so our axe/hammer mesh isn't distorted
            tool._bladeGrp.scale.set(1, 1, 1);
            tool._bladeGrp.position.y = 0;
        } else {
            tool._bladeGrp.scale.set(bThick, bLenScale, bThick);
            // Offset blade group so the base stays at the guard (y≈0.1)
            tool._bladeGrp.position.y = 0.1 * (1 - bLenScale);
        }
        // Battleaxe / War hammer heads — built lazily, toggled with the default blade/tip.
        const defaultBlade = tool._bladeGrp.children[0];
        const defaultTip = tool._bladeGrp.children[1];
        const trim1 = tool._trimStripe, trim2 = tool._trimStripe2;
        if (swordData.isBattleaxe) {
            if (!tool._axeHead && typeof window !== 'undefined' && window.buildAxeHead) {
                tool._axeHead = window.buildAxeHead(tool._bladeMat, tool._handleMat);
                tool._bladeGrp.add(tool._axeHead);
            }
            if (tool._axeHead) tool._axeHead.visible = true;
            if (tool._hammerHead) tool._hammerHead.visible = false;
            if (defaultBlade) defaultBlade.visible = false;
            if (defaultTip) defaultTip.visible = false;
            if (trim1) trim1.visible = false;
            if (trim2) trim2.visible = false;
            // Hide crossguard too — axes don't have one
            if (tool._guardMesh) tool._guardMesh.visible = false;
            if (tool._guardExtra1) tool._guardExtra1.visible = false;
            if (tool._guardExtra2) tool._guardExtra2.visible = false;
            this._isBattleaxe = true;
            this._isWarhammer = false;
        } else if (swordData.isWarhammer) {
            if (!tool._hammerHead && typeof window !== 'undefined' && window.buildHammerHead) {
                tool._hammerHead = window.buildHammerHead(tool._bladeMat, tool._handleMat);
                tool._bladeGrp.add(tool._hammerHead);
            }
            if (tool._hammerHead) tool._hammerHead.visible = true;
            if (tool._axeHead) tool._axeHead.visible = false;
            if (defaultBlade) defaultBlade.visible = false;
            if (defaultTip) defaultTip.visible = false;
            if (trim1) trim1.visible = false;
            if (trim2) trim2.visible = false;
            if (tool._guardMesh) tool._guardMesh.visible = false;
            if (tool._guardExtra1) tool._guardExtra1.visible = false;
            if (tool._guardExtra2) tool._guardExtra2.visible = false;
            this._isWarhammer = true;
            this._isBattleaxe = false;
        } else {
            if (tool._axeHead) tool._axeHead.visible = false;
            if (tool._hammerHead) tool._hammerHead.visible = false;
            if (defaultBlade) defaultBlade.visible = true;
            if (defaultTip) defaultTip.visible = true;
            if (tool._guardMesh) tool._guardMesh.visible = true;
            this._isBattleaxe = false;
            this._isWarhammer = false;
            // Blade style — only for normal swords (not axes/hammers)
            const bladeStyle = swordData.bladeStyle || 'straight';
            if (tool._currentBladeStyle !== bladeStyle) {
                tool._currentBladeStyle = bladeStyle;
                // Remove old serration teeth if switching away
                if (tool._serrationTeeth) {
                    for (const t of tool._serrationTeeth) {
                        t.geometry.dispose();
                        tool._bladeGrp.remove(t);
                    }
                    tool._serrationTeeth = null;
                }
                if (defaultBlade) {
                    defaultBlade.geometry.dispose();
                    defaultBlade.rotation.z = 0;
                }
                if (defaultTip) {
                    defaultTip.geometry.dispose();
                    defaultTip.position.x = 0;
                }
                if (bladeStyle === 'curved') {
                    // Build a curved blade from segments that arc to one side
                    const segs = 8, w = 0.035, d = 0.012, h = 0.6;
                    const verts = [], indices = [];
                    for (let i = 0; i <= segs; i++) {
                        const t = i / segs;
                        // Y centered like BoxGeometry (spans -h/2 to +h/2)
                        const y = -h/2 + t * h;
                        // Quadratic curve: 0 at base, peaks at tip
                        const xOff = t * t * 0.04;
                        verts.push(xOff - w/2, y, -d/2);
                        verts.push(xOff + w/2, y, -d/2);
                        verts.push(xOff + w/2, y,  d/2);
                        verts.push(xOff - w/2, y,  d/2);
                    }
                    for (let i = 0; i < segs; i++) {
                        const b = i * 4, t = (i + 1) * 4;
                        indices.push(b, t, t+1, b, t+1, b+1);     // -z face
                        indices.push(b+3, b+2, t+2, b+3, t+2, t+3); // +z face
                        indices.push(b+1, t+1, t+2, b+1, t+2, b+2); // +x face
                        indices.push(b+3, t+3, t, b+3, t, b);       // -x face
                    }
                    const top = segs * 4;
                    indices.push(top, top+1, top+2, top, top+2, top+3);
                    indices.push(0, 2, 1, 0, 3, 2);
                    const geo = new THREE.BufferGeometry();
                    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
                    geo.setIndex(indices);
                    geo.computeVertexNormals();
                    defaultBlade.geometry = geo;
                    defaultBlade.position.y = 0.4; // same as default
                    defaultTip.geometry = new THREE.ConeGeometry(0.012, 0.08, 4);
                    defaultTip.position.set(0.04, 0.74, 0); // tip follows curve end
                } else if (bladeStyle === 'falchion') {
                    defaultBlade.geometry = new THREE.BoxGeometry(0.055, 0.6, 0.014);
                    defaultTip.geometry = new THREE.ConeGeometry(0.02, 0.08, 4);
                } else if (bladeStyle === 'serrated') {
                    defaultBlade.geometry = new THREE.BoxGeometry(0.035, 0.6, 0.012);
                    defaultTip.geometry = new THREE.ConeGeometry(0.012, 0.08, 4);
                    // Add small teeth along one edge
                    tool._serrationTeeth = [];
                    for (let i = 0; i < 5; i++) {
                        const tooth = new THREE.Mesh(
                            new THREE.ConeGeometry(0.008, 0.03, 3),
                            tool._bladeMat
                        );
                        tooth.position.set(0.02, 0.18 + i * 0.1, 0);
                        tooth.rotation.z = -Math.PI / 2;
                        tool._bladeGrp.add(tooth);
                        tool._serrationTeeth.push(tooth);
                    }
                } else if (bladeStyle === 'leaf') {
                    defaultBlade.geometry = new THREE.BoxGeometry(0.05, 0.6, 0.014);
                    defaultTip.geometry = new THREE.ConeGeometry(0.018, 0.08, 4);
                } else {
                    // straight (default)
                    defaultBlade.geometry = new THREE.BoxGeometry(0.035, 0.6, 0.012);
                    defaultTip.geometry = new THREE.ConeGeometry(0.012, 0.08, 4);
                }
            }
        }
        // Handle
        _applyMat(tool._handleMat, swordData.handleMat);
        // Guard
        _applyMat(tool._guardMat, swordData.guardMat);
        // Guard style
        const gs = swordData.guardStyle || 'straight';
        tool._guardMesh.scale.set(1, 1, 1);
        tool._guardMesh.geometry.dispose();
        tool._guardExtra1.visible = false;
        tool._guardExtra2.visible = false;
        if (gs === 'curved') {
            // Center bar + two ends that go up (toward blade)
            tool._guardMesh.geometry = new THREE.BoxGeometry(0.16, 0.03, 0.04);
            tool._guardMesh.rotation.set(0, 0, 0);
            tool._guardExtra1.visible = true;
            tool._guardExtra1.geometry.dispose();
            tool._guardExtra1.geometry = new THREE.BoxGeometry(0.03, 0.08, 0.04);
            tool._guardExtra1.position.set(-0.09, 0.05, 0);
            tool._guardExtra1.rotation.set(0, 0, 0);
            tool._guardExtra2.visible = true;
            tool._guardExtra2.geometry.dispose();
            tool._guardExtra2.geometry = new THREE.BoxGeometry(0.03, 0.08, 0.04);
            tool._guardExtra2.position.set(0.09, 0.05, 0);
            tool._guardExtra2.rotation.set(0, 0, 0);
        } else if (gs === 'wide') {
            tool._guardMesh.geometry = new THREE.BoxGeometry(0.26, 0.03, 0.04);
            tool._guardMesh.rotation.set(0, 0, 0);
        } else if (gs === 'spiked') {
            tool._guardMesh.geometry = new THREE.BoxGeometry(0.16, 0.03, 0.04);
            tool._guardMesh.rotation.set(0, 0, 0);
            tool._guardExtra1.visible = true;
            tool._guardExtra1.geometry.dispose();
            tool._guardExtra1.geometry = new THREE.ConeGeometry(0.025, 0.1, 4);
            tool._guardExtra1.position.set(-0.1, 0, 0);
            tool._guardExtra1.rotation.set(0, 0, Math.PI/2);
            tool._guardExtra2.visible = true;
            tool._guardExtra2.geometry.dispose();
            tool._guardExtra2.geometry = new THREE.ConeGeometry(0.025, 0.1, 4);
            tool._guardExtra2.position.set(0.1, 0, 0);
            tool._guardExtra2.rotation.set(0, 0, -Math.PI/2);
        } else if (gs === 'ring') {
            tool._guardMesh.geometry = new THREE.TorusGeometry(0.06, 0.015, 6, 8);
            tool._guardMesh.rotation.set(Math.PI/2, 0, 0);
        } else {
            // straight
            tool._guardMesh.geometry = new THREE.BoxGeometry(0.16, 0.03, 0.04);
            tool._guardMesh.rotation.set(0, 0, 0);
        }
        // Handle
        _applyMat(tool._handleMat, swordData.handleMat);
        // Pommel
        _applyMat(tool._pommelMat, swordData.pommelMat);
        // Pommel style
        const ps = swordData.pommelStyle || 'round';
        tool._pommelMesh.geometry.dispose();
        if (ps === 'gem') tool._pommelMesh.geometry = new THREE.OctahedronGeometry(0.025);
        else if (ps === 'skull') tool._pommelMesh.geometry = new THREE.BoxGeometry(0.04, 0.04, 0.04);
        else if (ps === 'wolf') tool._pommelMesh.geometry = new THREE.ConeGeometry(0.025, 0.05, 5);
        else if (ps === 'claw') tool._pommelMesh.geometry = new THREE.TetrahedronGeometry(0.03);
        else tool._pommelMesh.geometry = new THREE.SphereGeometry(0.025, 8, 8);
        // Trim
        const trimKey = swordData.trimMat;
        if (trimKey && trimKey !== '' && (MAT_COLORS[trimKey] || MAT_COLORS[String(trimKey)])) {
            _applyMat(tool._trimMat, trimKey);
            tool._trimStripe.visible = true;
            tool._trimStripe2.visible = true;
        } else {
            tool._trimStripe.visible = false;
            tool._trimStripe2.visible = false;
        }
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
            copper_pickaxe: { head: 0xcc8844, metal: 0.5, rough: 0.3 },
            iron_pickaxe:   { head: 0xb0b8c0, metal: 0.8, rough: 0.15 },
            gold_pickaxe:   { head: 0xffee44, metal: 0.4, rough: 0.2 },
            steel_pickaxe:  { head: 0xe8eef5, metal: 0.5, rough: 0.1 },
            dragonsteel_pickaxe:{ head: 0x1a1a28, metal: 0.85, rough: 0.05 },
            diamond_pickaxe:{ head: 0x88ffff, metal: 0.3, rough: 0.15 },
            wood_sword:     { blade: 0x8a6a3a, guard: 0x5c3a1e, metal: 0.0, rough: 0.7 },
            stone_sword:    { blade: 0x999999, guard: 0x666666, metal: 0.3, rough: 0.4 },
            copper_sword:   { blade: 0xcc8844, guard: 0xaa6630, metal: 0.5, rough: 0.3 },
            iron_sword:     { blade: 0xe8ecf4, guard: 0x997733, metal: 0.95, rough: 0.08 },
            gold_sword:     { blade: 0xffee44, guard: 0xeedd22, metal: 0.4, rough: 0.2 },
            steel_sword:    { blade: 0xe8eef5, guard: 0xd0d8e8, metal: 0.5, rough: 0.1 },
            dragonsteel_sword: { blade: 0x1a1a28, guard: 0x101018, metal: 0.85, rough: 0.05 },
            diamond_sword:  { blade: 0x88ffff, guard: 0x55eeff, metal: 0.3, rough: 0.15 },
            wood_axe:       { head: 0x8a6a3a, metal: 0.0, rough: 0.7 },
            stone_axe:      { head: 0x888888, metal: 0.3, rough: 0.5 },
            copper_axe:     { head: 0xcc8844, metal: 0.5, rough: 0.3 },
            iron_axe:       { head: 0xb0b8c0, metal: 0.8, rough: 0.15 },
            gold_axe:       { head: 0xffee44, metal: 0.4, rough: 0.2 },
            steel_axe:      { head: 0xe8eef5, metal: 0.5, rough: 0.1 },
            dragonsteel_axe: { head: 0x1a1a28, metal: 0.85, rough: 0.05 },
            diamond_axe:    { head: 0x88ffff, metal: 0.3, rough: 0.15 },
        };
        let t = TIER_COLORS[itemName];
        // Handle custom swords (csword_xxx) — look up tier from global custom sword data
        if (!t && itemName.startsWith('csword_') && window._customSwords && window._customSwords[itemName]) {
            const tier = window._customSwords[itemName].tier;
            t = TIER_COLORS[tier + '_sword'];
        }
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
        g._shaftMat = shaftMat;
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.0, 0.03), shaftMat);
        shaft.position.y = 0.15; shaft.castShadow = true; g.add(shaft);
        // Orb at top — color will be set dynamically
        const orbMat = new THREE.MeshStandardMaterial({ color: 0xff6622, emissive: 0xff4400, emissiveIntensity: 0.5 });
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), orbMat);
        orb.position.y = 1.26; orb.castShadow = true; g.add(orb);
        g._orbMat = orbMat;
        g._orbMesh = orb;
        g._shaft = shaft;

        // Custom staff holder group — rebuilt dynamically for custom staffs
        const customGrp = new THREE.Group();
        customGrp.visible = false;
        g._customGrp = customGrp;
        g.add(customGrp);

        // Fire staff extras — hidden by default, shown when fire_staff equipped
        const fireGrp = new THREE.Group();
        fireGrp.visible = false;
        g._fireExtras = fireGrp;

        // Charred dark shaft
        const fireShaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.2, 0.04),
            new THREE.MeshStandardMaterial({ color: 0x2a1008, roughness: 0.9 }));
        fireShaft.position.y = 0.15; fireGrp.add(fireShaft);

        // Ember cracks along the shaft (glowing orange lines)
        const emberMat = new THREE.MeshBasicMaterial({ color: 0xff4400 });
        for (let i = 0; i < 5; i++) {
            const ember = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.02, 0.045), emberMat);
            ember.position.y = -0.2 + i * 0.45;
            ember.rotation.y = i * 1.2;
            fireGrp.add(ember);
        }

        // Iron cage/crown at top holding the flame
        const cageMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.7, roughness: 0.4 });
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2;
            // Vertical bars
            const bar = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.18, 0.015), cageMat);
            bar.position.set(Math.cos(a) * 0.055, 1.28, Math.sin(a) * 0.055);
            fireGrp.add(bar);
            // Curved tips
            const tip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.04, 0.012), cageMat);
            tip.position.set(Math.cos(a) * 0.035, 1.39, Math.sin(a) * 0.035);
            tip.rotation.x = Math.sin(a) * 0.5;
            tip.rotation.z = -Math.cos(a) * 0.5;
            fireGrp.add(tip);
        }
        // Iron ring around cage base
        const cageRing = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 4, 12), cageMat);
        cageRing.position.y = 1.19; cageRing.rotation.x = Math.PI / 2; fireGrp.add(cageRing);

        // Fire core — layered flame shapes
        const flameMat1 = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.85 });
        const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xffaa22, transparent: true, opacity: 0.7 });
        const flameMat3 = new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.6 });
        // Outer flame
        const flame1 = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 4), flameMat1);
        flame1.position.y = 1.30; flame1.scale.set(1, 1.4, 1); fireGrp.add(flame1);
        // Middle flame
        const flame2 = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), flameMat2);
        flame2.position.y = 1.33; flame2.scale.set(0.8, 1.6, 0.8); fireGrp.add(flame2);
        // Inner bright core
        const flame3 = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), flameMat3);
        flame3.position.y = 1.32; fireGrp.add(flame3);

        // Floating ember particles
        const fireEmbers = [];
        for (let i = 0; i < 6; i++) {
            const e = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.015),
                new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.8 }));
            e.position.y = 1.3;
            e._phase = Math.random() * Math.PI * 2;
            fireGrp.add(e);
            fireEmbers.push(e);
        }
        g._fireEmbers = fireEmbers;
        g._fireFlames = [flame1, flame2, flame3];

        // Fire light
        const fireLight = new THREE.PointLight(0xff4400, 1.5, 3);
        fireLight.position.y = 1.30; fireGrp.add(fireLight);
        g._fireLight = fireLight;

        g.add(fireGrp);

        // Ice staff extras — frozen crystal staff
        const iceGrp = new THREE.Group();
        iceGrp.visible = false;
        g._iceExtras = iceGrp;

        // Pale blue-white frozen shaft
        const iceShaftMat = new THREE.MeshStandardMaterial({ color: 0xc8dde8, roughness: 0.3, metalness: 0.2 });
        const iceShaft = new THREE.Mesh(new THREE.BoxGeometry(0.035, 2.1, 0.035), iceShaftMat);
        iceShaft.position.y = 0.15; iceGrp.add(iceShaft);

        // Frost patches on shaft
        const frostMat = new THREE.MeshBasicMaterial({ color: 0xeef8ff, transparent: true, opacity: 0.5 });
        for (let i = 0; i < 4; i++) {
            const frost = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.05), frostMat);
            frost.position.set((i%2-0.5)*0.01, -0.1 + i * 0.5, 0);
            frost.rotation.y = i * 1.1;
            iceGrp.add(frost);
        }

        // Crystal cluster at top — 5 angular shards
        const crystalMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.8 });
        const crystalGlowMat = new THREE.MeshBasicMaterial({ color: 0xaaeeff, transparent: true, opacity: 0.4 });
        // Main crystal (tall, center)
        const mainCrystal = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.04), crystalMat);
        mainCrystal.position.y = 1.32; iceGrp.add(mainCrystal);
        // Side crystals (angled outward)
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + 0.4;
            const h = 0.12 + Math.random() * 0.08;
            const shard = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, 0.03), crystalMat);
            shard.position.set(Math.cos(a) * 0.04, 1.24 + h * 0.3, Math.sin(a) * 0.04);
            shard.rotation.x = Math.sin(a) * 0.3;
            shard.rotation.z = -Math.cos(a) * 0.4;
            iceGrp.add(shard);
        }
        // Inner glow orb inside crystals
        const iceCore = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), crystalGlowMat);
        iceCore.position.y = 1.28; iceGrp.add(iceCore);

        // Floating ice particles (tiny cubes that orbit slowly)
        const iceParticles = [];
        for (let i = 0; i < 5; i++) {
            const p = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02),
                new THREE.MeshBasicMaterial({ color: 0xcceeFF, transparent: true, opacity: 0.6 }));
            p._phase = (i / 5) * Math.PI * 2;
            p.position.y = 1.3;
            iceGrp.add(p);
            iceParticles.push(p);
        }
        g._iceParticles = iceParticles;
        g._iceCore = iceCore;

        // Cold light
        const iceLight = new THREE.PointLight(0x66ccff, 1.2, 3);
        iceLight.position.y = 1.30; iceGrp.add(iceLight);
        g._iceLight = iceLight;

        g.add(iceGrp);

        // Lightning staff extras — crackling energy rod
        const lightGrp = new THREE.Group();
        lightGrp.visible = false;
        g._lightningExtras = lightGrp;

        // Metallic copper shaft
        const lightShaftMat = new THREE.MeshStandardMaterial({ color: 0x8a7040, metalness: 0.6, roughness: 0.3 });
        const lightShaft = new THREE.Mesh(new THREE.BoxGeometry(0.035, 2.0, 0.035), lightShaftMat);
        lightShaft.position.y = 0.15; lightGrp.add(lightShaft);

        // Copper coil wraps around shaft
        const coilMat = new THREE.MeshStandardMaterial({ color: 0xcc9944, metalness: 0.7, roughness: 0.2 });
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 * 3; // 3 full wraps
            const coil = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.03, 0.015), coilMat);
            coil.position.set(Math.cos(a) * 0.03, 0.2 + i * 0.22, Math.sin(a) * 0.03);
            lightGrp.add(coil);
        }

        // Fork prongs at top (like a lightning rod split into 3)
        const prongMat2 = new THREE.MeshStandardMaterial({ color: 0x9a8050, metalness: 0.7, roughness: 0.2 });
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2;
            const prong = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.02), prongMat2);
            prong.position.set(Math.cos(a) * 0.03, 1.32, Math.sin(a) * 0.03);
            prong.rotation.x = Math.sin(a) * 0.25;
            prong.rotation.z = -Math.cos(a) * 0.25;
            lightGrp.add(prong);
            // Pointed tip
            const tip = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.06, 0.01), prongMat2);
            tip.position.set(Math.cos(a) * 0.045, 1.44, Math.sin(a) * 0.045);
            tip.rotation.x = Math.sin(a) * 0.4;
            tip.rotation.z = -Math.cos(a) * 0.4;
            lightGrp.add(tip);
        }

        // Electric arc ball between prongs
        const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffee44, transparent: true, opacity: 0.8 });
        const sparkCore = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), sparkMat);
        sparkCore.position.y = 1.36; lightGrp.add(sparkCore);
        g._sparkCore = sparkCore;

        // Crackling mini-arcs (small lines that flash)
        const arcs = [];
        for (let i = 0; i < 4; i++) {
            const arcMat = new THREE.MeshBasicMaterial({ color: 0xffff88, transparent: true, opacity: 0.7 });
            const arc = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.1, 0.006), arcMat);
            arc._phase = (i / 4) * Math.PI * 2;
            arc.position.y = 1.36;
            lightGrp.add(arc);
            arcs.push(arc);
        }
        g._lightningArcs = arcs;

        // Electric light
        const lightLight = new THREE.PointLight(0xffee44, 1.5, 3);
        lightLight.position.y = 1.36; lightGrp.add(lightLight);
        g._lightningLight = lightLight;

        g.add(lightGrp);

        // Void staff extras — hidden by default, shown when void_staff equipped
        const voidGrp = new THREE.Group();
        voidGrp.visible = false;
        g._voidExtras = voidGrp;

        // Dark shaft overlay
        const darkShaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.2, 0.04),
            new THREE.MeshStandardMaterial({ color: 0x1a1018, roughness: 0.9 }));
        darkShaft.position.y = 0.15; voidGrp.add(darkShaft);

        // Gnarled knots
        const knotMat = new THREE.MeshStandardMaterial({ color: 0x2a1a2a });
        for (let i = 0; i < 4; i++) {
            const knot = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.055), knotMat);
            knot.position.set((i%2)*0.01, -0.3 + i*0.4, 0);
            knot.rotation.y = i * 0.8;
            voidGrp.add(knot);
        }

        // Skull headpiece
        const skullMat = new THREE.MeshStandardMaterial({ color: 0xc0b8a0, roughness: 0.7 });
        const skull = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.07), skullMat);
        skull.position.y = 1.26; voidGrp.add(skull);
        const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, 0.05), skullMat);
        jaw.position.set(0, 1.20, 0.01); voidGrp.add(jaw);
        // Eye sockets
        const socketMat = new THREE.MeshBasicMaterial({ color: 0x6622aa });
        for (const sx of [-0.022, 0.022]) {
            const s = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.015), socketMat);
            s.position.set(sx, 1.28, 0.035); voidGrp.add(s);
        }

        // Prongs
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2;
            const prong = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.13, 0.018),
                new THREE.MeshStandardMaterial({ color: 0x1a1018 }));
            prong.position.set(Math.cos(a)*0.05, 1.38, Math.sin(a)*0.05);
            prong.rotation.x = Math.sin(a) * 0.3;
            prong.rotation.z = -Math.cos(a) * 0.3;
            voidGrp.add(prong);
        }

        // Inner bright orb
        const innerOrb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4),
            new THREE.MeshBasicMaterial({ color: 0xdd88ff }));
        innerOrb.position.y = 1.44; voidGrp.add(innerOrb);

        // Energy rings
        const ringGeo = new THREE.TorusGeometry(0.09, 0.006, 4, 16);
        const ring1 = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x8833cc, transparent: true, opacity: 0.5 }));
        ring1.position.y = 1.44; ring1.rotation.x = Math.PI * 0.3; voidGrp.add(ring1);
        const ring2 = new THREE.Mesh(ringGeo.clone(), new THREE.MeshBasicMaterial({ color: 0x8833cc, transparent: true, opacity: 0.5 }));
        ring2.position.y = 1.44; ring2.rotation.x = Math.PI * 0.7; ring2.rotation.z = 0.5; voidGrp.add(ring2);
        g._voidRings = [ring1, ring2];

        // Orb light
        const voidLight = new THREE.PointLight(0x8833cc, 1.5, 3);
        voidLight.position.y = 1.44; voidGrp.add(voidLight);
        g._voidLight = voidLight;

        g.add(voidGrp);
        return g;
    }

    _makeBow() {
        // Longbow — limbs along local Y (vertical). Arrow fires along local +Z.
        const g = new THREE.Group();
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1f, roughness: 0.8 });
        const stringMat = new THREE.MeshStandardMaterial({ color: 0xeee8d0, roughness: 0.9 });
        const bowH = 1.6;
        // Curved limbs — upper and lower each made of several short segments forming an arc
        const buildLimb = (sign) => {
            // sign = +1 for upper, -1 for lower
            const parent = new THREE.Group();
            const steps = 6;
            const limbLen = bowH * 0.5;
            for (let i = 0; i < steps; i++) {
                const t = (i + 0.5) / steps; // 0..1 along limb
                const y = sign * t * limbLen;
                const curveZ = -Math.sin(t * Math.PI * 0.5) * 0.14; // curve backward (−Z) so bow is recurved
                const seg = new THREE.Mesh(new THREE.BoxGeometry(0.04, limbLen / steps + 0.015, 0.05), woodMat);
                seg.position.set(0, y, curveZ);
                // Tilt each segment tangent to the arc
                const tangentAngle = Math.cos(t * Math.PI * 0.5) * 0.25; // small tilt
                seg.rotation.x = sign * tangentAngle;
                seg.castShadow = true;
                parent.add(seg);
            }
            return parent;
        };
        g.add(buildLimb(1));
        g.add(buildLimb(-1));
        // Upper/lower tips (where string attaches) — record their positions for string curve
        const tipY = bowH * 0.5;
        const tipZ = -Math.sin(Math.PI * 0.5) * 0.14; // at t=1 of the curve
        const upTip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.08, 0.03), woodMat);
        upTip.position.set(0, tipY, tipZ);
        g.add(upTip);
        const loTip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.08, 0.03), woodMat);
        loTip.position.set(0, -tipY, tipZ);
        g.add(loTip);
        g._tipY = tipY;
        g._tipZ = tipZ;
        // Grip (leather wrapped, in the middle)
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.08), new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.7 }));
        g.add(grip);
        // Bowstring — two segments (upper tip → nock point, nock point → lower tip)
        // Built as two oriented boxes so they always connect tip to nock
        const stringGrp = new THREE.Group();
        const upperStr = new THREE.Mesh(new THREE.BoxGeometry(0.01, 1, 0.01), stringMat);
        const lowerStr = new THREE.Mesh(new THREE.BoxGeometry(0.01, 1, 0.01), stringMat);
        stringGrp.add(upperStr);
        stringGrp.add(lowerStr);
        stringGrp._upper = upperStr;
        stringGrp._lower = lowerStr;
        g.add(stringGrp);
        g._bowstring = stringGrp;
        // Nocked arrow — shaft along +Z, head at front (+Z end), fletching at back (−Z end)
        const arrowShaftMat = new THREE.MeshStandardMaterial({ color: 0x9a7a4a, roughness: 0.8 });
        const arrowHeadMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.6 });
        const nockedArrow = new THREE.Group();
        const arrowShaft = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.9), arrowShaftMat);
        nockedArrow.add(arrowShaft);
        const arrowHead = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 4), arrowHeadMat);
        arrowHead.rotation.x = Math.PI / 2; // cone default +Y → +Z
        arrowHead.position.z = 0.52;
        nockedArrow.add(arrowHead);
        const fletching = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.12), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
        fletching.position.z = -0.4;
        nockedArrow.add(fletching);
        nockedArrow.visible = false;
        g.add(nockedArrow);
        g._nockedArrow = nockedArrow;
        g._bowH = bowH;
        return g;
    }

    _makeSheathedStaff() {
        // Full staff model — exact same as held staff with all extras
        const g = this._makeStaff();
        g.visible = false;
        // Position on back: vertical, flat against spine
        g.position.set(0.08, -0.15, -0.16);
        g.rotation.set(0, 0, -0.1);
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

    applyCustomStaff(config) {
        const s = this.staffHeld;
        if (!s._customGrp) return;

        // Material color map
        const matCol = { 'stick': 0x5c3a1e, '3': 0x999999, [3]: 0x999999, 'copper_ingot': 0xcc8844, 'iron_ingot': 0xc0c8d0, 'gold_ingot': 0xddcc44, 'steel_ingot': 0xd0d8e0, 'diamond': 0x88ffff, 'dragonsteel_ingot': 0x2a2a40, 'ruby': 0xff3355, 'sapphire': 0x4466ff, 'emerald': 0x44ff66, 'topaz': 0xffcc33, 'coal': 0x333333, [11]: 0x35b535, [10]: 0x6B4226 };
        const getCol = k => matCol[k] || matCol[String(k)] || 0xaaaaaa;

        const shaftColor = getCol(config.shaftMat);
        const holderColor = getCol(config.holderMat);
        const gemColor = getCol(config.gem);

        // Recolor default shaft
        s._shaftMat.color.setHex(shaftColor);
        s._shaft.visible = true;

        // Recolor orb to gem color
        s._orbMat.color.setHex(gemColor);
        s._orbMat.emissive.setHex(new THREE.Color(gemColor).multiplyScalar(0.5).getHex());
        s._orbMesh.visible = true;

        // Clear old custom holder
        const cg = s._customGrp;
        while (cg.children.length) { const c = cg.children[0]; cg.remove(c); }
        cg.visible = true;

        const hMat = new THREE.MeshStandardMaterial({ color: holderColor, metalness: 0.5, roughness: 0.4 });
        const style = config.holderStyle || 'prongs';

        if (style === 'prongs') {
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2;
                const p = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.14, 0.015), hMat);
                p.position.set(Math.cos(a)*0.055, 1.25, Math.sin(a)*0.055);
                p.rotation.x = Math.sin(a) * 0.3;
                p.rotation.z = -Math.cos(a) * 0.3;
                cg.add(p);
            }
        } else if (style === 'cage') {
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2;
                const bar = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.2, 0.012), hMat);
                bar.position.set(Math.cos(a)*0.06, 1.22, Math.sin(a)*0.06);
                cg.add(bar);
            }
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.008, 4, 12), hMat);
            ring.position.y = 1.12; ring.rotation.x = Math.PI/2; cg.add(ring);
            const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.006, 4, 12), hMat);
            ring2.position.y = 1.30; ring2.rotation.x = Math.PI/2; cg.add(ring2);
        } else if (style === 'coil') {
            // Spiral coil wrapping up around the staff to cradle the gem
            const coilSegs = 24;
            const coilTurns = 3;
            const coilR = 0.045;
            const coilStart = 1.08;
            const coilHeight = 0.22;
            for (let i = 0; i < coilSegs; i++) {
                const t = i / coilSegs;
                const a = t * Math.PI * 2 * coilTurns;
                const r = coilR + t * 0.015; // widen slightly toward top
                const seg = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.015), hMat);
                seg.position.set(Math.cos(a) * r, coilStart + t * coilHeight, Math.sin(a) * r);
                cg.add(seg);
            }
            // Top ring to hold the gem
            const topRing = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 4, 12), hMat);
            topRing.position.set(0, 1.30, 0);
            topRing.rotation.x = Math.PI / 2;
            cg.add(topRing);
        } else if (style === 'claws') {
            for (let i = 0; i < 3; i++) {
                const a = (i / 3) * Math.PI * 2;
                const claw = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.01), hMat);
                claw.position.set(Math.cos(a)*0.06, 1.26, Math.sin(a)*0.06);
                claw.rotation.x = Math.sin(a) * 0.5;
                claw.rotation.z = -Math.cos(a) * 0.5;
                cg.add(claw);
                // Claw tip curving inward
                const tip = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.05, 0.01), hMat);
                tip.position.set(Math.cos(a)*0.03, 1.36, Math.sin(a)*0.03);
                tip.rotation.x = Math.sin(a) * 0.8;
                tip.rotation.z = -Math.cos(a) * 0.8;
                cg.add(tip);
            }
        } else if (style === 'crown') {
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2;
                const spike = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.1 + (i%2)*0.05, 0.015), hMat);
                spike.position.set(Math.cos(a)*0.06, 1.27, Math.sin(a)*0.06);
                cg.add(spike);
            }
            const base = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.01, 4, 12), hMat);
            base.position.y = 1.14; base.rotation.x = Math.PI/2; cg.add(base);
        }

        // Add a point light matching the gem
        const light = new THREE.PointLight(gemColor, 1.0, 2.5);
        light.position.y = 1.26; cg.add(light);
        s._customLight = light;
    }

    triggerSwing() {
        // Don't allow new swing until current one is at least 50% done
        if (this.swingTimer >= 0 && this.swingTimer < 0.5) {
            // Buffer one click so the combo continues when ready
            this._swingQueued = true;
            return;
        }
        // Combo: if clicked within 1.5s of last swing start, advance combo
        if (this.swingTimer >= 0 && this.swingTimer < 1.5) {
            this._comboCount = ((this._comboCount || 0) + 1) % 3;
        } else {
            this._comboCount = 0;
        }
        this.swingTimer = 0;
        this._swingQueued = false;
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
        if (keys[kf]) wantDir += 1;
        if (keys[kk]) wantDir -= 1;

        if (fpMode) {
            if (keys[kl]) strafeDir += 1;
            if (keys[kr]) strafeDir -= 1;
            // Only turn player model when moving
            const isMoving = wantDir !== 0 || strafeDir !== 0;
            if (isMoving) this.group.rotation.y = fpYaw;
        } else {
            // Third person: A/D rotate
            if (keys[kl]) this.group.rotation.y += this.turnRate * dt;
            if (keys[kr]) this.group.rotation.y -= this.turnRate * dt;
        }

        // Crouch with Control
        this._crouching = !!(keys['ControlLeft'] || keys['ControlRight']);
        const wantSprint = !!(keys[ks] && !this._crouching && (wantDir > 0 || strafeDir !== 0) && this.stamina > 0);
        if (wantSprint) {
            this.stamina = Math.max(0, this.stamina - this.staminaDrain * dt);
        } else {
            this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegen * dt);
        }
        const maxSpeed = this._crouching ? this.walkSpeed * 0.4 : (wantSprint ? this.sprintSpeed : this.walkSpeed);

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

        // Creative mode or Dragon Form flight — fly, no gravity, no collision
        if (this.creative || this.dragonFlying) {
            const flySpeed = this.dragonFlying ? (wantSprint ? 20.0 : 12.0) : (wantSprint ? 16.0 : 8.0);
            this.position.x += moveX;
            this.position.z += moveZ;
            if (keys[kj]) this.position.y += flySpeed * dt; // Space = up
            if (keys['ShiftLeft'] || keys['ShiftRight']) this.position.y -= flySpeed * dt; // Shift = down
            // Arrow keys — slow creative movement
            const slowSpeed = 0.5;
            if (keys['ArrowUp']) this.position.y += slowSpeed * dt;
            if (keys['ArrowDown']) this.position.y -= slowSpeed * dt;
            if (keys['ArrowLeft'] || keys['ArrowRight']) {
                if (fpMode) this.group.rotation.y = fpYaw;
                const dir = keys['ArrowLeft'] ? 1 : -1;
                this.position.x += Math.sin(this.group.rotation.y) * slowSpeed * dir * dt;
                this.position.z += Math.cos(this.group.rotation.y) * slowSpeed * dir * dt;
            }
            this.jumpVel = 0;
            this.isGrounded = false;
        } else {
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

        } // end creative else

        // Prevent falling through world — teleport back to surface
        if (!this.creative && this.position.y < -20) {
            const safeY = this.world.getHeight(this.position.x, this.position.z);
            this.position.y = safeY + 2;
            this.jumpVel = 0;
            this.isGrounded = false;
        }

        // ── Animation — exact copy from game.html ──
        const speed = Math.abs(this.speed);
        const isMoving = speed > 0.15;
        const s = this.sprintBlend;
        const cr = this._crouching ? 1 : 0;

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
        const crouchLower = cr * 0.25;
        const baseY = this.hipHeight - crouchLower;
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

        // ── Two-handed sword idle pose — both arms hold sword in front ──
        if (this.swordHeld.visible && this._twoHanded) {
            // Left arm: push sword to center and forward
            this.leftArm.shoulder.rotation.z += 0.3;
            this.leftArm.shoulder.rotation.x -= 0.5;
            // Right arm: mirror left arm but forward to avoid body clip
            this.rightArm.shoulder.rotation.x = this.leftArm.shoulder.rotation.x - 0.15;
            this.rightArm.shoulder.rotation.z = -this.leftArm.shoulder.rotation.z * 0.85;
            this.rightArm.elbow.rotation.x = this.leftArm.elbow.rotation.x - 0.15;
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
            const isSword = this.swordHeld.visible;
            const dur = isSword ? (this._twoHanded ? 0.6 : 0.45) : 0.5;
            this.swingTimer += dt / dur;
            // Process queued swing when threshold reached
            if (this._swingQueued && this.swingTimer >= 0.5) {
                this._swingQueued = false;
                this._comboCount = ((this._comboCount || 0) + 1) % 3;
                this.swingTimer = 0;
            }
            const t = this.swingTimer;
            const ss = (e0, e1, x) => { const u = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };

            if (isSword) {
                const twoH = this._twoHanded;
                // Two-handed swords: slower, bigger swings with more body
                const combo = this._comboCount || 0;
                let lShX=0, lShZ=0, lElX=0, rShX=0, rShZ=0, rElX=0, spY=0, spX=0;
                // Scale up motion for two-handed
                const motionScale = twoH ? 1.3 : 1.0;

                // Smooth keyframe interpolation
                const _lerp = (a, b, u) => a + (b - a) * u;
                const kf = (t, keys) => {
                    if (t <= keys[0][0]) return keys[0][1];
                    if (t >= keys[keys.length-1][0]) return keys[keys.length-1][1];
                    for (let i = 0; i < keys.length - 1; i++) {
                        if (t < keys[i+1][0]) {
                            return _lerp(keys[i][1], keys[i+1][1], ss(keys[i][0], keys[i+1][0], t));
                        }
                    }
                    return keys[keys.length-1][1];
                };

                if (combo === 0) {
                    // Strike 1: high slash left-to-right
                    lShX = kf(t, [[0,0],[0.12,-1.8],[0.30,-0.8],[0.6,0]]);
                    lShZ = kf(t, [[0,0],[0.12,-0.6],[0.30,0.8],[0.6,0]]);
                    lElX = kf(t, [[0,0],[0.12,-0.8],[0.30,0.2],[0.6,0]]);
                    spY  = kf(t, [[0,0],[0.12,-0.4],[0.30,0.6],[0.6,0]]);
                    spX  = kf(t, [[0,0],[0.20,0],[0.30,0.1],[0.6,0]]);
                    rShX = kf(t, [[0,0],[0.12,0.2],[0.30,-0.2],[0.6,0]]);
                } else if (combo === 1) {
                    // Strike 2: reverse slash right-to-left
                    lShX = kf(t, [[0,0],[0.12,-1.5],[0.28,-0.7],[0.6,0]]);
                    lShZ = kf(t, [[0,0],[0.12,0.8],[0.28,-0.8],[0.6,0]]);
                    lElX = kf(t, [[0,0],[0.12,-0.6],[0.28,0.2],[0.6,0]]);
                    spY  = kf(t, [[0,0],[0.12,0.4],[0.28,-0.6],[0.6,0]]);
                    spX  = kf(t, [[0,0],[0.20,0],[0.28,0.1],[0.6,0]]);
                    rShX = kf(t, [[0,0],[0.12,-0.2],[0.28,0.2],[0.6,0]]);
                } else {
                    // Strike 3: overhead chop
                    lShX = kf(t, [[0,0],[0.15,1.5],[0.35,-2.0],[0.7,0]]);
                    lShZ = kf(t, [[0,0],[0.15,-0.3],[0.35,0],[0.7,0]]);
                    lElX = kf(t, [[0,0],[0.15,-1.5],[0.35,0.3],[0.7,0]]);
                    spX  = kf(t, [[0,0],[0.15,-0.15],[0.35,0.2],[0.7,0]]);
                    rShX = kf(t, [[0,0],[0.15,0.4],[0.35,-0.4],[0.7,0]]);
                }
                this.leftArm.shoulder.rotation.x += lShX * motionScale;
                this.leftArm.shoulder.rotation.z += lShZ * motionScale;
                this.leftArm.elbow.rotation.x    += lElX * motionScale;
                this.spine.rotation.y += spY * motionScale;
                this.spine.rotation.x += spX * motionScale;
                if (twoH) {
                    // Two-handed: glue right arm to left arm's final position
                    this.rightArm.shoulder.rotation.x = this.leftArm.shoulder.rotation.x - 0.15;
                    this.rightArm.shoulder.rotation.z = -this.leftArm.shoulder.rotation.z * 0.85;
                    this.rightArm.elbow.rotation.x = this.leftArm.elbow.rotation.x - 0.15;
                } else {
                    this.rightArm.shoulder.rotation.x += rShX;
                }
            } else {
                // Non-sword: original horizontal sweep
                let swShX, swShZ, swElX, swSpineX, swSpineY;
                if (t < 0.2) {
                    const u = ss(0, 0.2, t);
                    swShX = u * (-1.1); swShZ = u * 0.3; swElX = u * (-0.25);
                    swSpineY = u * (-0.45); swSpineX = u * 0.03;
                } else if (t < 0.45) {
                    const u = ss(0.2, 0.45, t);
                    swShX = -1.1; swShZ = 0.3 + (-0.15 - 0.3) * u;
                    swElX = -0.25 + 0.15 * u; swSpineY = -0.45 + 1.0 * u;
                    swSpineX = 0.03 + 0.03 * u;
                } else {
                    const u = ss(0.45, 1.0, t);
                    swShX = -1.1 * (1 - u); swShZ = -0.15 * (1 - u);
                    swElX = -0.1 * (1 - u); swSpineY = 0.55 * (1 - u);
                    swSpineX = 0.06 * (1 - u);
                }
                this.leftArm.shoulder.rotation.x += swShX;
                this.leftArm.shoulder.rotation.z += swShZ;
                this.leftArm.elbow.rotation.x    += swElX;
                this.spine.rotation.x += swSpineX;
                this.spine.rotation.y += swSpineY;
            }

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

    // ── Dragon Form ──
    setDragonForm(enabled) {
        if (enabled === this._dragonForm) return;
        this._dragonForm = enabled;
        if (enabled) {
            this._buildDragonParts();
        } else {
            this._removeDragonParts();
        }
    }

    _buildDragonParts() {
        // Scale — proportional to dragon S=2.55, sized for player body
        const S = 0.28;
        this._dwS = S;

        // Materials — match dragon
        const bBone = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.55, metalness: 0.15 });
        const bMem = new THREE.MeshStandardMaterial({ color: 0x2a1028, roughness: 0.75, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
        const bHorn = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.5 });
        const glowMat = new THREE.MeshStandardMaterial({ color: 0xcc2255, emissive: 0xcc2255, emissiveIntensity: 0.4 });

        // Helper — exact copy of makeDragonBone from dragons.js
        const mkBone = (p1, p2, r1, r2, mat, parent) => {
            const dx = p2[0]-p1[0], dy = p2[1]-p1[1], dz = p2[2]-p1[2];
            const len = Math.sqrt(dx*dx+dy*dy+dz*dz);
            if (len < 0.001) return;
            const b = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, 6), mat);
            b.position.set((p1[0]+p2[0])/2,(p1[1]+p2[1])/2,(p1[2]+p2[2])/2);
            const dir = new THREE.Vector3(dx,dy,dz).normalize();
            b.setRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), dir));
            parent.add(b);
        };

        // Reusable vector for membrane updates
        this._dwV = new THREE.Vector3();

        // === WINGS — exact same structure as dragon wyvern wings ===
        this._dragonWings = new THREE.Group();
        this._dragonWingParts = [];

        for (let s = -1; s <= 1; s += 2) {
            const wg = new THREE.Group();
            wg._s = s;
            wg.position.set(s * 0.12, 0.40, -0.10);

            // Upper arm bone
            const uLen = 0.75 * S;
            const upperBone = new THREE.Mesh(new THREE.CylinderGeometry(0.08*S, 0.06*S, uLen, 6), bBone);
            upperBone.rotation.z = s * -Math.PI / 2;
            upperBone.position.set(s * uLen / 2, 0, 0);
            upperBone.castShadow = true;
            wg.add(upperBone);

            // Patagium (upper arm trailing membrane) — BufferGeometry like dragon
            const patSteps = 6;
            const patArr = new Float32Array(patSteps * 2 * 9);
            const patP0 = [s*-0.35*S, 0, -0.1*S];
            const patP1 = [s*uLen, 0, 0];
            const patMaxW = 0.9*S;
            let pvi = 0;
            for (let i = 0; i < patSteps; i++) {
                const t0 = i / patSteps, t1 = (i + 1) / patSteps;
                const w0 = (0.15 + 0.85 * t0) * patMaxW;
                const w1 = (0.15 + 0.85 * t1) * patMaxW;
                const ax = patP0[0]+(patP1[0]-patP0[0])*t0, ay = 0, az = patP0[2]+(patP1[2]-patP0[2])*t0;
                const bx = patP0[0]+(patP1[0]-patP0[0])*t1, by = 0, bz = patP0[2]+(patP1[2]-patP0[2])*t1;
                patArr[pvi++]=ax; patArr[pvi++]=ay; patArr[pvi++]=az;
                patArr[pvi++]=ax; patArr[pvi++]=ay; patArr[pvi++]=az-w0;
                patArr[pvi++]=bx; patArr[pvi++]=by; patArr[pvi++]=bz;
                patArr[pvi++]=ax; patArr[pvi++]=ay; patArr[pvi++]=az-w0;
                patArr[pvi++]=bx; patArr[pvi++]=by; patArr[pvi++]=bz-w1;
                patArr[pvi++]=bx; patArr[pvi++]=by; patArr[pvi++]=bz;
            }
            const patGeo = new THREE.BufferGeometry();
            patGeo.setAttribute('position', new THREE.BufferAttribute(patArr, 3));
            patGeo.computeVertexNormals();
            const patMesh = new THREE.Mesh(patGeo, bMem);
            wg.add(patMesh);
            wg._patGeo = patGeo; wg._patP0 = patP0; wg._patP1 = patP1; wg._patMaxW = patMaxW; wg._patMesh = patMesh;

            // Elbow group
            const elbowGrp = new THREE.Group();
            elbowGrp.position.set(s * uLen, 0, 0);
            wg.add(elbowGrp);
            elbowGrp.add(new THREE.Mesh(new THREE.SphereGeometry(0.075*S, 6, 4), bBone));
            wg._elbow = elbowGrp;

            // Forearm bone
            const fLen = 1.5 * S;
            const foreBone = new THREE.Mesh(new THREE.CylinderGeometry(0.06*S, 0.045*S, fLen, 6), bBone);
            foreBone.rotation.z = s * -Math.PI / 2;
            foreBone.position.set(s * fLen / 2, 0, 0);
            foreBone.castShadow = true;
            elbowGrp.add(foreBone);

            // Wrist knob + claw
            const wristKnob = new THREE.Mesh(new THREE.SphereGeometry(0.055*S, 6, 4), bBone);
            wristKnob.position.set(s * fLen, 0, 0);
            elbowGrp.add(wristKnob);
            const wristClaw = new THREE.Mesh(new THREE.ConeGeometry(0.035*S, 0.12*S, 4), bHorn);
            wristClaw.position.set(s * fLen, -0.07*S, 0);
            elbowGrp.add(wristClaw);

            // Hand group
            const handGrp = new THREE.Group();
            handGrp.position.set(s * fLen, 0, 0);
            elbowGrp.add(handGrp);
            wg._hand = handGrp;

            // 4 finger bones — exact same layout as dragon wyvern wings
            const fingerDefs = [
                { tip: [s*-1.66*S, 0, -1.7*S], mid: [s*-0.6*S, 0, -1.21*S] },
                { tip: [s*-0.11*S, 0, -2.78*S], mid: [s*0.36*S, 0, -1.62*S] },
                { tip: [s*0.93*S, 0, -2.61*S], mid: [s*1.27*S, 0, -1.38*S] },
                { tip: [s*2.59*S, 0, -1.66*S], mid: [s*1.46*S, 0, -0.68*S] },
            ];
            const fTips = [], fMids = [];
            const fingerGrps = [];
            for (const fd of fingerDefs) {
                fMids.push(fd.mid); fTips.push(fd.tip);
                const tipLocal = [fd.tip[0]-fd.mid[0], fd.tip[1]-fd.mid[1], fd.tip[2]-fd.mid[2]];
                const baseGrp = new THREE.Group(); handGrp.add(baseGrp);
                mkBone([0,0,0], fd.mid, 0.03*S, 0.02*S, bBone, baseGrp);
                const midGrp = new THREE.Group();
                midGrp.position.set(fd.mid[0], fd.mid[1], fd.mid[2]); baseGrp.add(midGrp);
                mkBone([0,0,0], tipLocal, 0.02*S, 0.008*S, bBone, midGrp);
                fingerGrps.push({ baseGrp, midGrp, midPos: fd.mid, tipLocal });
            }
            wg._fingerGrps = fingerGrps;
            wg._fLen = fLen; wg._uLen = uLen;

            // Finger rotation presets (same as dragon)
            wg._foldedFRots = [{spreadY:-0.56,liftX:0,curlX:0},{spreadY:-0.07,liftX:0,curlX:0},{spreadY:0.24,liftX:0,curlX:0},{spreadY:0.52,liftX:0,curlX:0}];
            wg._flyFRots = [{spreadY:0,liftX:0,curlX:0},{spreadY:0,liftX:0,curlX:0},{spreadY:0,liftX:0,curlX:0},{spreadY:0,liftX:0,curlX:0}];

            // Main membrane — outline-based triangle fan (same system as dragon)
            const memOutline = [];
            memOutline.push({ p: fTips[3], s: 2 });
            for (let i = 2; i >= 0; i--) {
                const a = fTips[i+1], b = fTips[i];
                memOutline.push({ p: [(a[0]+b[0])/2, 0, (a[2]+b[2])/2*0.85], s: 2 });
                memOutline.push({ p: b, s: 2 });
            }
            memOutline.push({ p: [s*fLen, 0, -0.5*S], s: 1 });
            memOutline.push({ p: [s*fLen*0.75, 0, -0.45*S], s: 1 });
            memOutline.push({ p: [s*fLen*0.45, 0, -0.7*S], s: 1 });
            memOutline.push({ p: [s*fLen*0.15, 0, -0.85*S], s: 1 });
            memOutline.push({ p: [0, 0, -0.9*S], s: 1 });
            memOutline.push({ p: [s*uLen*0.5, 0, -0.7*S], s: 0 });
            memOutline.push({ p: [s*uLen*0.15, 0, -0.85*S], s: 0 });
            memOutline.push({ p: [0, 0, -0.9*S], s: 0 });
            memOutline.push({ p: [0, 0, 0], s: 0 });
            memOutline.push({ p: [s*uLen*0.5, 0, 0.15*S], s: 0 });
            memOutline.push({ p: [0, 0, 0.15*S], s: 1 });
            memOutline.push({ p: [s*fLen*0.5, 0, 0.1*S], s: 1 });
            memOutline.push({ p: [s*fLen, 0, 0.05*S], s: 1 });
            const memCenter = { p: [s * fLen, 0, 0], s: 1 };
            const nFloats = memOutline.length * 2 * 9;
            const memArr = new Float32Array(nFloats);
            const memGeo = new THREE.BufferGeometry();
            memGeo.setAttribute('position', new THREE.BufferAttribute(memArr, 3));
            const memMesh = new THREE.Mesh(memGeo, bMem);
            wg.add(memMesh);
            wg._memGeo = memGeo; wg._memOutline = memOutline; wg._memCenter = memCenter;

            // Arm-finger membrane (forearm to first finger)
            const afArr = new Float32Array(300);
            const afGeo = new THREE.BufferGeometry();
            afGeo.setAttribute('position', new THREE.BufferAttribute(afArr, 3));
            wg.add(new THREE.Mesh(afGeo, bMem));
            wg._afGeo = afGeo; wg._afFLen = fLen;
            wg._afBodyPt = [s*-0.35*S, 0, -0.22*S];
            wg._afStaticTip = fTips[0]; wg._afStaticMid = fMids[0];

            // Inter-finger membranes
            const ffArr = new Float32Array(324);
            const ffGeo = new THREE.BufferGeometry();
            ffGeo.setAttribute('position', new THREE.BufferAttribute(ffArr, 3));
            wg.add(new THREE.Mesh(ffGeo, bMem));
            wg._ffGeo = ffGeo; wg._ffStaticTips = fTips; wg._ffStaticMids = fMids;

            this._dragonWings.add(wg);
            this._dragonWingParts.push(wg);
        }
        this.spine.add(this._dragonWings);

        // === HORNS — exact same as regular dragon horns (makeDragonBone style) ===
        this._dragonHorns = new THREE.Group();
        const HS = 0.45; // scale to fit player head
        for (let s = -1; s <= 1; s += 2) {
            mkBone([s*0.18*HS, 0.25*HS, -0.1*HS], [s*0.25*HS, 0.5*HS, -0.25*HS], 0.04*HS, 0.05*HS, bHorn, this._dragonHorns);
            mkBone([s*0.25*HS, 0.5*HS, -0.25*HS], [s*0.28*HS, 0.7*HS, -0.5*HS], 0.015*HS, 0.04*HS, bHorn, this._dragonHorns);
        }
        this.headGroup.add(this._dragonHorns);

        // === GLOWING EYES ===
        this._dragonEyeGlow = [];
        for (let s = -1; s <= 1; s += 2) {
            const glow = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), glowMat);
            glow.position.set(s * 0.06, 0.03, 0.115);
            this.headGroup.add(glow);
            this._dragonEyeGlow.push(glow);
        }

        // === TAIL ===
        this._dragonTail = new THREE.Group();
        const tailMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.5, metalness: 0.3 });
        this._dragonTailSegs = [];
        let prevSeg = this._dragonTail;
        for (let i = 0; i < 5; i++) {
            const seg = new THREE.Group();
            const sz = 0.08 - i * 0.012;
            const piece = new THREE.Mesh(new THREE.BoxGeometry(sz, sz * 0.7, 0.08), tailMat);
            seg.add(piece);
            seg.position.set(0, i === 0 ? -0.05 : 0, -0.08);
            prevSeg.add(seg);
            prevSeg = seg;
            this._dragonTailSegs.push(seg);
        }
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 4), bHorn);
        spike.rotation.x = Math.PI / 2;
        spike.position.z = -0.06;
        prevSeg.add(spike);
        this._dragonTail.position.set(0, -0.2, -0.11);
        this.spine.add(this._dragonTail);

        // Animation state
        this._wingPhase = 0;
        this._flapT = 0;
        this.dragonFlying = false;

        // Set initial folded pose and update membranes
        this._dwApplyFingerRots = (w, rots) => {
            if (!w._fingerGrps || !rots) return;
            const si = w._s;
            for (let fi = 0; fi < w._fingerGrps.length; fi++) {
                const fg = w._fingerGrps[fi], rot = rots[fi];
                fg.baseGrp.rotation.set(rot.liftX, si * rot.spreadY, 0);
                fg.midGrp.rotation.set(rot.curlX, 0, 0);
            }
        };
        for (const w of this._dragonWingParts) {
            // Folded backward pose
            const si = w._s;
            w.rotation.set(0, si * 0.54, si * 0.35);
            w._elbow.rotation.set(1.55, si * -1.95, si * 0.74);
            w._hand.rotation.set(-0.2, si * 1.25, si * -0.48);
            this._dwApplyFingerRots(w, w._foldedFRots);
            this._dwUpdateMembrane(w);
        }
    }

    // Transform point from joint space to wing-local space (exact copy of toWgSpace from dragons.js)
    _dwToWg(pt, space, elb, hand) {
        const v = this._dwV;
        v.set(pt[0], pt[1], pt[2]);
        if (space === 2) { v.applyEuler(hand.rotation); v.add(hand.position); }
        if (space >= 1) { v.applyEuler(elb.rotation); v.add(elb.position); }
        return [v.x, v.y, v.z];
    }

    // Update all membrane geometries for a wing (main + arm-finger + inter-finger)
    _dwUpdateMembrane(w) {
        const elb = w._elbow, hand = w._hand;
        // Main outline membrane
        const outline = w._memOutline, geo = w._memGeo;
        const pos = geo.attributes.position.array;
        const pts = [];
        for (let i = 0; i < outline.length; i++) pts.push(this._dwToWg(outline[i].p, outline[i].s, elb, hand));
        const cx = w._memCenter;
        const c = this._dwToWg(cx.p, cx.s, elb, hand);
        let vi = 0;
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            pos[vi++]=c[0]; pos[vi++]=c[1]; pos[vi++]=c[2];
            pos[vi++]=a[0]; pos[vi++]=a[1]; pos[vi++]=a[2];
            pos[vi++]=b[0]; pos[vi++]=b[1]; pos[vi++]=b[2];
            pos[vi++]=c[0]; pos[vi++]=c[1]; pos[vi++]=c[2];
            pos[vi++]=b[0]; pos[vi++]=b[1]; pos[vi++]=b[2];
            pos[vi++]=a[0]; pos[vi++]=a[1]; pos[vi++]=a[2];
        }
        for (; vi < pos.length;) pos[vi++] = 0;
        geo.attributes.position.needsUpdate = true;
        geo.computeVertexNormals();

        // Arm-finger membrane (forearm to first finger)
        if (w._afGeo) this._dwUpdateArmFingerMem(w);
        // Inter-finger membranes
        if (w._ffGeo) this._dwUpdateFingerMem(w);
        // Patagium update (bend toward finger direction)
        if (w._patGeo) this._dwUpdatePatagium(w);
    }

    _dwUpdateArmFingerMem(w) {
        const elb = w._elbow, hand = w._hand;
        const si = w._s, fl = w._afFLen;
        const v = this._dwV;
        let cTip, cMid;
        if (w._fingerGrps && w._fingerGrps[0]) {
            const fg = w._fingerGrps[0], br = fg.baseGrp.rotation;
            v.set(fg.midPos[0], fg.midPos[1], fg.midPos[2]);
            if (br.x || br.y) v.applyEuler(br);
            cMid = [v.x, v.y, v.z];
            v.set(fg.tipLocal[0], fg.tipLocal[1], fg.tipLocal[2]);
            if (fg.midGrp.rotation.x) v.applyEuler(new THREE.Euler(fg.midGrp.rotation.x, 0, 0));
            v.x += fg.midPos[0]; v.y += fg.midPos[1]; v.z += fg.midPos[2];
            if (br.x || br.y) v.applyEuler(br);
            cTip = [v.x, v.y, v.z];
        } else { cTip = w._afStaticTip; cMid = w._afStaticMid; }
        const N = 5;
        const arm = [], fin = [];
        for (let i = 0; i <= N; i++) {
            const t = i / N;
            arm.push(this._dwToWg([si * fl * (1 - t), 0, 0], 1, elb, hand));
            let fp;
            if (t <= 0.5) { const u = t * 2; fp = [cMid[0]*u, cMid[1]*u, cMid[2]*u]; }
            else { const u = (t - 0.5) * 2; fp = [cMid[0]*(1-u)+cTip[0]*u, cMid[1]*(1-u)+cTip[1]*u, cMid[2]*(1-u)+cTip[2]*u]; }
            fin.push(this._dwToWg(fp, 2, elb, hand));
        }
        const pos = w._afGeo.attributes.position.array;
        let vi = 0;
        for (let i = 0; i < N; i++) {
            const fa = arm[i], fb = arm[i+1], ga = fin[i], gb = fin[i+1];
            pos[vi++]=fa[0]; pos[vi++]=fa[1]; pos[vi++]=fa[2];
            pos[vi++]=ga[0]; pos[vi++]=ga[1]; pos[vi++]=ga[2];
            pos[vi++]=fb[0]; pos[vi++]=fb[1]; pos[vi++]=fb[2];
            pos[vi++]=ga[0]; pos[vi++]=ga[1]; pos[vi++]=ga[2];
            pos[vi++]=gb[0]; pos[vi++]=gb[1]; pos[vi++]=gb[2];
            pos[vi++]=fb[0]; pos[vi++]=fb[1]; pos[vi++]=fb[2];
        }
        // Trailing membrane (to body)
        if (w._afBodyPt) {
            const bp = this._dwToWg(w._afBodyPt, 0, elb, hand);
            const armEnd = arm[N], finEnd = fin[N];
            const armShoulder = this._dwToWg([0, 0, 0], 0, elb, hand);
            const N2 = 3;
            const grid = [];
            for (let u = 0; u <= N2; u++) {
                grid.push([]);
                const tu = u / N2;
                for (let vv = 0; vv <= N2; vv++) {
                    const tv = vv / N2;
                    const c00 = finEnd, c01 = bp, c10 = armEnd, c11 = armShoulder;
                    let x = c00[0]*(1-tu)*(1-tv) + c10[0]*tu*(1-tv) + c01[0]*(1-tu)*tv + c11[0]*tu*tv;
                    let y = c00[1]*(1-tu)*(1-tv) + c10[1]*tu*(1-tv) + c01[1]*(1-tu)*tv + c11[1]*tu*tv;
                    let z = c00[2]*(1-tu)*(1-tv) + c10[2]*tu*(1-tv) + c01[2]*(1-tu)*tv + c11[2]*tu*tv;
                    y -= Math.sin(tu * Math.PI) * Math.sin(tv * Math.PI) * 0.06;
                    grid[u].push([x, y, z]);
                }
            }
            for (let u = 0; u < N2; u++) {
                for (let vv = 0; vv < N2; vv++) {
                    const a = grid[u][vv], b = grid[u+1][vv];
                    const c = grid[u][vv+1], d = grid[u+1][vv+1];
                    pos[vi++]=a[0]; pos[vi++]=a[1]; pos[vi++]=a[2];
                    pos[vi++]=c[0]; pos[vi++]=c[1]; pos[vi++]=c[2];
                    pos[vi++]=b[0]; pos[vi++]=b[1]; pos[vi++]=b[2];
                    pos[vi++]=c[0]; pos[vi++]=c[1]; pos[vi++]=c[2];
                    pos[vi++]=d[0]; pos[vi++]=d[1]; pos[vi++]=d[2];
                    pos[vi++]=b[0]; pos[vi++]=b[1]; pos[vi++]=b[2];
                }
            }
        }
        for (; vi < pos.length;) pos[vi++] = 0;
        w._afGeo.attributes.position.needsUpdate = true;
        w._afGeo.computeVertexNormals();
    }

    _dwUpdateFingerMem(w) {
        const elb = w._elbow, hand = w._hand;
        const v = this._dwV;
        const tips = [], mids = [];
        if (w._fingerGrps) {
            for (let fi = 0; fi < 4; fi++) {
                const fg = w._fingerGrps[fi], br = fg.baseGrp.rotation;
                v.set(fg.midPos[0], fg.midPos[1], fg.midPos[2]);
                if (br.x || br.y) v.applyEuler(br);
                mids.push([v.x, v.y, v.z]);
                v.set(fg.tipLocal[0], fg.tipLocal[1], fg.tipLocal[2]);
                if (fg.midGrp.rotation.x) v.applyEuler(new THREE.Euler(fg.midGrp.rotation.x, 0, 0));
                v.x += fg.midPos[0]; v.y += fg.midPos[1]; v.z += fg.midPos[2];
                if (br.x || br.y) v.applyEuler(br);
                tips.push([v.x, v.y, v.z]);
            }
        } else {
            for (let fi = 0; fi < 4; fi++) { tips.push(w._ffStaticTips[fi]); mids.push(w._ffStaticMids[fi]); }
        }
        const pos = w._ffGeo.attributes.position.array;
        let vi = 0;
        const wrist = this._dwToWg([0,0,0], 2, elb, hand);
        const ffPt = (mid, tip, t) => {
            if (t <= 0.5) { const u = t*2; return [mid[0]*u, mid[1]*u, mid[2]*u]; }
            const u = (t-0.5)*2;
            return [mid[0]*(1-u)+tip[0]*u, mid[1]*(1-u)+tip[1]*u, mid[2]*(1-u)+tip[2]*u];
        };
        for (let gap = 0; gap < 3; gap++) {
            const mA = mids[gap], tA = tips[gap], mB = mids[gap+1], tB = tips[gap+1];
            const outline = [];
            for (const t of [0.15, 0.4, 0.7, 1.0]) outline.push(ffPt(mA, tA, t));
            const cpx = (tA[0]+tB[0])*0.35, cpy = (tA[1]+tB[1])*0.35, cpz = (tA[2]+tB[2])*0.35;
            for (const t of [0.15, 0.35, 0.5, 0.65, 0.85]) {
                const u = 1-t;
                outline.push([u*u*tA[0]+2*u*t*cpx+t*t*tB[0], u*u*tA[1]+2*u*t*cpy+t*t*tB[1], u*u*tA[2]+2*u*t*cpz+t*t*tB[2]]);
            }
            for (const t of [1.0, 0.7, 0.4, 0.15]) outline.push(ffPt(mB, tB, t));
            for (let i = 0; i < outline.length - 1; i++) {
                const a = this._dwToWg(outline[i], 2, elb, hand);
                const b = this._dwToWg(outline[i+1], 2, elb, hand);
                pos[vi++]=wrist[0]; pos[vi++]=wrist[1]; pos[vi++]=wrist[2];
                pos[vi++]=a[0]; pos[vi++]=a[1]; pos[vi++]=a[2];
                pos[vi++]=b[0]; pos[vi++]=b[1]; pos[vi++]=b[2];
            }
        }
        for (; vi < pos.length;) pos[vi++] = 0;
        w._ffGeo.attributes.position.needsUpdate = true;
        w._ffGeo.computeVertexNormals();
    }

    _dwUpdatePatagium(w) {
        // Same as dragon — update patagium to bend toward membrane direction
        const pp = w._patGeo.attributes.position.array;
        const p0 = w._patP0, p1 = w._patP1, mw = w._patMaxW;
        let pv = 0;
        const steps = 6;
        for (let i = 0; i < steps; i++) {
            const t0 = i/steps, t1 = (i+1)/steps;
            const w0 = (0.15+0.85*t0)*mw, w1 = (0.15+0.85*t1)*mw;
            const ax = p0[0]+(p1[0]-p0[0])*t0, ay = 0, az = p0[2]+(p1[2]-p0[2])*t0;
            const bx = p0[0]+(p1[0]-p0[0])*t1, by = 0, bz = p0[2]+(p1[2]-p0[2])*t1;
            pp[pv++]=ax; pp[pv++]=ay; pp[pv++]=az;
            pp[pv++]=ax; pp[pv++]=ay; pp[pv++]=az-w0;
            pp[pv++]=bx; pp[pv++]=by; pp[pv++]=bz;
            pp[pv++]=ax; pp[pv++]=ay; pp[pv++]=az-w0;
            pp[pv++]=bx; pp[pv++]=by; pp[pv++]=bz-w1;
            pp[pv++]=bx; pp[pv++]=by; pp[pv++]=bz;
        }
        w._patGeo.attributes.position.needsUpdate = true;
        w._patGeo.computeVertexNormals();
    }

    _removeDragonParts() {
        if (this._dragonWings) { this.spine.remove(this._dragonWings); this._dragonWings = null; }
        if (this._dragonHorns) { this.headGroup.remove(this._dragonHorns); this._dragonHorns = null; }
        if (this._dragonTail) { this.spine.remove(this._dragonTail); this._dragonTail = null; }
        if (this._dragonEyeGlow) {
            for (const g of this._dragonEyeGlow) this.headGroup.remove(g);
            this._dragonEyeGlow = null;
        }
        this._dragonWingParts = null;
        this._dragonTailSegs = null;
        this.dragonFlying = false;
    }

    animateDragonParts(dt) {
        if (!this._dragonForm || !this._dragonWingParts) return;
        this._wingPhase = (this._wingPhase || 0) + dt;
        this._flapT = (this._flapT || 0) + dt;

        const flying = this.dragonFlying;

        // computeFlap — exact copy from dragons.js
        const computeFlap = (t) => {
            const cycle = 1.1, half = 0.55, active = 0.46;
            let p = ((t % cycle) + cycle) % cycle;
            let shoulder, elbow;
            if (p < half) {
                const st = Math.min(p / active, 1);
                shoulder = -Math.cos(st * Math.PI);
                elbow = -Math.cos((p / half) * Math.PI);
            } else {
                const upos = p - half;
                const st = Math.min(upos / active, 1);
                shoulder = Math.cos(st * Math.PI);
                elbow = Math.cos((upos / half) * Math.PI);
            }
            return [shoulder, elbow];
        };

        for (const w of this._dragonWingParts) {
            const si = w._s;

            if (flying) {
                // Flying pose — wings spread out, flapping (same as dragon flying animation)
                const [sFlap, eFlap] = computeFlap(this._flapT);
                w.rotation.set(0, 0, 0);
                w.rotation.y = si * 0.15;
                w.rotation.z = si * (-0.1 + sFlap * 0.4);
                w.rotation.x = sFlap * 0.08;
                w._elbow.rotation.set(0, si * -0.25, si * (-0.15 + eFlap * 0.45));
                w._hand.rotation.set(0, 0, 0);
                this._dwApplyFingerRots(w, w._flyFRots);
            } else {
                // Grounded — wings folded backward (same as dragon walking/idle pose)
                const isMoving = Math.abs(this.speed) > 0.5;
                const wp = this._wingPhase * 3.0;
                const wc = isMoving ? Math.sin(wp) : 0;
                w.rotation.set(0, si * 0.54, si * 0.35);
                w._elbow.rotation.set(1.55, si * -1.95, si * 0.74);
                w._hand.rotation.set(-0.2, si * 1.25, si * -0.48);
                this._dwApplyFingerRots(w, w._foldedFRots);
            }

            // Update all dynamic membranes
            this._dwUpdateMembrane(w);
        }

        // Tail sway
        if (this._dragonTailSegs) {
            for (let i = 0; i < this._dragonTailSegs.length; i++) {
                this._dragonTailSegs[i].rotation.y = Math.sin(this._wingPhase * 1.5 + i * 0.8) * 0.12;
            }
        }

        // Eye glow pulse
        if (this._dragonEyeGlow) {
            const pulse = 0.3 + Math.sin(this._wingPhase * 2) * 0.15;
            for (const g of this._dragonEyeGlow) g.material.emissiveIntensity = pulse;
        }
    }
}
