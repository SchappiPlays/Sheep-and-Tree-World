// multiplayer.js — PeerJS-based P2P multiplayer (up to 5 players)

export class Multiplayer {
    constructor(scene) {
        this.scene = scene;
        this.peer = null;
        this.connections = new Map(); // peerId → { conn, playerMesh, lastState }
        this.isHost = false;
        this.hostConn = null; // if client, connection to host
        this.myId = '';
        this.active = false;
        this.onBlockChange = null; // callback(bx,by,bz,blockType)
        this.onCreatureSync = null; // callback(creatures)
        this.remotePlayers = new Map(); // peerId → { group, body, spine, ... }
        this._sendAccum = 0;
        this._creatureSendAccum = 0;
    }

    // Host a game — returns room code via callback
    host(callback) {
        const code = 'SATW-' + Math.floor(Math.random() * 9000 + 1000);
        this.peer = new Peer(code, { debug: 0 });
        this.isHost = true;
        this.peer.on('open', id => {
            this.myId = id;
            this.active = true;
            callback(id);
        });
        this.peer.on('connection', conn => {
            if (this.connections.size >= 4) { conn.close(); return; } // max 5 total
            this._setupConnection(conn);
        });
        this.peer.on('error', err => console.error('Peer error:', err));
    }

    // Join a game by room code
    join(code, callback) {
        this.peer = new Peer(undefined, { debug: 0 });
        this.isHost = false;
        this.peer.on('open', id => {
            this.myId = id;
            const conn = this.peer.connect(code, { reliable: true });
            conn.on('open', () => {
                this.hostConn = conn;
                this.active = true;
                this._setupConnection(conn);
                callback(id);
            });
            conn.on('error', err => console.error('Join error:', err));
        });
        this.peer.on('error', err => {
            console.error('Peer error:', err);
            callback(null);
        });
    }

    _setupConnection(conn) {
        const pid = conn.peer;
        this.connections.set(pid, { conn, lastState: null });
        // Create remote player model
        this._createRemotePlayer(pid);

        conn.on('data', data => {
            if (data.type === 'state') {
                this._applyRemoteState(pid, data);
            } else if (data.type === 'block') {
                if (this.onBlockChange) this.onBlockChange(data.bx, data.by, data.bz, data.b);
                // Host relays to other clients
                if (this.isHost) this._relayToOthers(pid, data);
            } else if (data.type === 'creatures') {
                if (this.onCreatureSync) this.onCreatureSync(data.list);
            } else if (data.type === 'villagers') {
                if (this.onVillagerSync) this.onVillagerSync(data.list);
            } else if (data.type === 'attack') {
                // Relay attack events
                if (this.onAttack) this.onAttack(data);
                if (this.isHost) this._relayToOthers(pid, data);
            }
        });

        conn.on('close', () => {
            this._removeRemotePlayer(pid);
            this.connections.delete(pid);
        });
    }

    _relayToOthers(fromPid, data) {
        for (const [pid, c] of this.connections) {
            if (pid !== fromPid && c.conn.open) {
                c.conn.send(data);
            }
        }
    }

    // Send local player state
    sendState(player, heldItem, swingTimer) {
        if (!this.active) return;
        const state = {
            type: 'state',
            pid: this.myId,
            x: +player.position.x.toFixed(2),
            y: +player.position.y.toFixed(2),
            z: +player.position.z.toFixed(2),
            ry: +player.group.rotation.y.toFixed(3),
            rx: +(player.group.rotation.x || 0).toFixed(3),
            wp: +(player.walkPhase || 0).toFixed(2),
            wb: +(player.walkBlend || 0).toFixed(2),
            sb: +(player.sprintBlend || 0).toFixed(2),
            sw: +(swingTimer >= 0 ? swingTimer : -1).toFixed(2),
            tool: heldItem || '',
        };
        this._broadcast(state);
    }

    // Send block change
    sendBlockChange(bx, by, bz, blockType) {
        if (!this.active) return;
        this._broadcast({ type: 'block', bx, by, bz, b: blockType });
    }

    // Send attack event
    sendAttack(x, z, angle, damage) {
        if (!this.active) return;
        this._broadcast({ type: 'attack', x, z, angle, damage, pid: this.myId });
    }

    // Host sends creature state
    sendCreatureState(creatureList) {
        if (!this.active || !this.isHost) return;
        const list = creatureList.map(c => ({
            id: c.cid, x: +c.x.toFixed(2), z: +c.z.toFixed(2),
            ry: +c.group.rotation.y.toFixed(2),
            w: c.walking ? 1 : 0, d: c.dead ? 1 : 0,
            t: c.type,
        }));
        this._broadcast({ type: 'creatures', list });
    }

    _broadcast(data) {
        for (const [pid, c] of this.connections) {
            if (c.conn.open) try { c.conn.send(data); } catch(e) {}
        }
    }

    _createRemotePlayer(pid) {
        const g = new THREE.Group();

        const skinMat = new THREE.MeshStandardMaterial({ color: 0xE8B49D });
        const shirtMat = new THREE.MeshStandardMaterial({ color: 0xBB4444 }); // red shirt to distinguish
        const pantsMat = new THREE.MeshStandardMaterial({ color: 0x334466 });
        const shoeMat = new THREE.MeshStandardMaterial({ color: 0x332211 });
        const hairMat = new THREE.MeshStandardMaterial({ color: 0x3B2507 });
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

        // Pick a unique color per player
        const colors = [0xBB4444, 0x44BB44, 0x4444BB, 0xBBBB44];
        const ci = this.remotePlayers.size % colors.length;
        shirtMat.color.setHex(colors[ci]);

        const body = new THREE.Group();
        body.position.y = 0.95;
        g.add(body);

        const spine = new THREE.Group();
        body.add(spine);

        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.55, 0.22), shirtMat);
        torso.position.y = 0.3; torso.castShadow = true; spine.add(torso);

        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), skinMat);
        neck.position.y = 0.62; spine.add(neck);

        const headGroup = new THREE.Group();
        headGroup.position.y = 0.76; spine.add(headGroup);
        headGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.22), skinMat));
        const hair = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.24), hairMat);
        hair.position.y = 0.13; headGroup.add(hair);
        const lEye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), eyeMat);
        lEye.position.set(-0.06, 0.03, 0.11); headGroup.add(lEye);
        const rEye = lEye.clone(); rEye.position.x = 0.06; headGroup.add(rEye);

        function makeArm(sign) {
            const shoulder = new THREE.Group();
            shoulder.position.set(sign * 0.28, 0.5, 0); spine.add(shoulder);
            const upper = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.28, 0.10), shirtMat);
            upper.position.y = -0.14; shoulder.add(upper);
            const elbow = new THREE.Group(); elbow.position.y = -0.28; shoulder.add(elbow);
            const fore = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.26, 0.085), skinMat);
            fore.position.y = -0.13; elbow.add(fore);
            const handGrp = new THREE.Group(); handGrp.position.y = -0.28; elbow.add(handGrp);
            handGrp.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.05), skinMat));
            return { shoulder, elbow, handGrp };
        }
        const leftArm = makeArm(-1), rightArm = makeArm(1);

        function makeLeg(sign) {
            const hip = new THREE.Group();
            hip.position.set(sign * 0.11, 0, 0); body.add(hip);
            const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.14), pantsMat);
            thigh.position.y = -0.21; hip.add(thigh);
            const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
            const shin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.40, 0.12), pantsMat);
            shin.position.y = -0.20; knee.add(shin);
            const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.24), shoeMat);
            foot.position.set(0, -0.43, 0.04); knee.add(foot);
            return { hip, knee };
        }
        const leftLeg = makeLeg(-1), rightLeg = makeLeg(1);

        // Name label
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
        ctx.fillText('Player', 64, 20);
        const tex = new THREE.CanvasTexture(canvas);
        const labelMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const label = new THREE.Sprite(labelMat);
        label.position.y = 2.2; label.scale.set(1.0, 0.25, 1);
        g.add(label);

        g.rotation.order = 'YXZ';
        this.scene.add(g);

        this.remotePlayers.set(pid, {
            group: g, body, spine, headGroup, torso,
            leftArm, rightArm, leftLeg, rightLeg,
        });
    }

    _applyRemoteState(pid, s) {
        const rp = this.remotePlayers.get(pid);
        if (!rp) return;

        // Position + rotation (smooth lerp)
        rp.group.position.lerp(new THREE.Vector3(s.x, s.y, s.z), 0.3);
        let da = s.ry - rp.group.rotation.y;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        rp.group.rotation.y += da * 0.3;
        rp.group.rotation.x = s.rx || 0;

        // Animation
        const p = s.wp, b = s.wb, sp = s.sb;
        const mix = (a, b, t) => a + (b - a) * t;

        // Body bob
        rp.body.position.y = 0.95 + Math.cos(p * 2) * mix(0.025, 0.055, sp) * b;
        rp.body.position.x = Math.sin(p) * mix(0.018, 0.008, sp) * b;

        // Legs
        const legAmp = mix(0.5, 0.85, sp);
        const legSwing = Math.sin(p) * legAmp * b;
        rp.leftLeg.hip.rotation.x = legSwing;
        rp.rightLeg.hip.rotation.x = -legSwing;
        const kneeAmp = mix(0.7, 1.25, sp);
        rp.leftLeg.knee.rotation.x = Math.max(0, -Math.sin(p)) * kneeAmp * b;
        rp.rightLeg.knee.rotation.x = Math.max(0, Math.sin(p)) * kneeAmp * b;

        // Spine
        rp.spine.rotation.x = mix(0.04, 0.16, sp) * b;
        rp.spine.rotation.y = 0; rp.spine.rotation.z = 0;
        rp.torso.rotation.y = Math.sin(p) * mix(0.04, 0.07, sp) * b;
        rp.headGroup.rotation.x = -rp.spine.rotation.x * 0.45;

        // Arms
        const armMul = mix(0.7, 1.1, sp);
        rp.leftArm.shoulder.rotation.x = -legSwing * armMul;
        rp.leftArm.shoulder.rotation.z = 0;
        rp.rightArm.shoulder.rotation.x = legSwing * armMul;
        rp.rightArm.shoulder.rotation.z = 0;
        const elbBase = mix(-0.15, -1.4, sp);
        const elbDyn = mix(0.3, 0.45, sp);
        rp.leftArm.elbow.rotation.x = b * (elbBase - Math.max(0, Math.sin(p)) * elbDyn);
        rp.rightArm.elbow.rotation.x = b * (elbBase - Math.max(0, -Math.sin(p)) * elbDyn);

        // Swing overlay
        if (s.sw >= 0 && s.sw <= 1) {
            const t = s.sw;
            const ss = (e0, e1, x) => { const u = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
            let swShX, swShZ, swElX, swSpineX, swSpineY;
            if (t < 0.2) {
                const u = ss(0, 0.2, t);
                swShX = u * -1.1; swShZ = u * 0.3; swElX = u * -0.25; swSpineY = u * -0.45; swSpineX = u * 0.03;
            } else if (t < 0.45) {
                const u = ss(0.2, 0.45, t);
                swShX = -1.1; swShZ = 0.3 + (-0.15 - 0.3) * u; swElX = -0.25 + 0.15 * u; swSpineY = -0.45 + 1.0 * u; swSpineX = 0.03 + 0.03 * u;
            } else {
                const u = ss(0.45, 1.0, t);
                swShX = -1.1 * (1 - u); swShZ = -0.15 * (1 - u); swElX = -0.1 * (1 - u); swSpineY = 0.55 * (1 - u); swSpineX = 0.06 * (1 - u);
            }
            rp.leftArm.shoulder.rotation.x += swShX;
            rp.leftArm.shoulder.rotation.z += swShZ;
            rp.leftArm.elbow.rotation.x += swElX;
            rp.spine.rotation.x += swSpineX;
            rp.spine.rotation.y += swSpineY;
        }
    }

    _removeRemotePlayer(pid) {
        const rp = this.remotePlayers.get(pid);
        if (rp) {
            this.scene.remove(rp.group);
            this.remotePlayers.delete(pid);
        }
    }

    disconnect() {
        for (const [pid] of this.connections) this._removeRemotePlayer(pid);
        this.connections.clear();
        if (this.peer) this.peer.destroy();
        this.peer = null;
        this.active = false;
        this.hostConn = null;
    }

    get playerCount() { return this.connections.size + 1; }
}
