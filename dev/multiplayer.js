// multiplayer.js — WebSocket-based multiplayer client
//
// This connects to a Node WebSocket server (see /server.js at repo root).
// One server process holds the authoritative world state. All players
// connect TO it as clients. Same model as Java Edition Minecraft.
//
// By default the client auto-detects the server URL based on the page
// origin — if the page was loaded from http://foo:8080/, it connects to
// ws://foo:8080/ on the same origin. This means the same server.js that
// served the game files also accepts the WebSocket connection.
//
// You can override the URL with:
//   ?ws=wss://your-server.example/   (query string)
//   window._wsUrl = '...';            (before the script loads)

function _resolveWsUrl() {
    try {
        const params = new URLSearchParams(window.location.search);
        const fromQuery = params.get('ws');
        if (fromQuery) return fromQuery;
    } catch (e) {}
    if (typeof window !== 'undefined' && window._wsUrl) return window._wsUrl;
    // Default: same origin as the page, swapping http(s) for ws(s)
    try {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        return proto + '//' + location.host;
    } catch (e) {
        return 'ws://localhost:8080';
    }
}

export class Multiplayer {
    constructor(scene) {
        this.scene = scene;
        this.ws = null;
        this.myId = '';
        this.active = false;
        this.isHost = false; // legacy field — server marks one client as host for AI broadcasts
        this.connections = new Map(); // pid → { name, charColors }
        this.remotePlayers = new Map();
        this._sendAccum = 0;
        this._creatureSendAccum = 0;

        // Callbacks (populated by index.html)
        this.onBlockChange = null;
        this.onCreatureSync = null;
        this.onDragonSync = null;
        this.onEggPickup = null;
        this.onChestLoot = null;
        this.onSwordPickup = null;
        this.onBossKilled = null;
        this.onChat = null;
        this.onWorldStateSync = null;
        this.onTimeOfDay = null;
        this.onHorseSync = null;
        this.onVillagerSync = null;
        this.onAttack = null;
        this.onPvpHit = null;
        this.onPeerDisconnect = null;
        this.onDragonHatch = null;
    }

    // ── Connection lifecycle ──

    _connect(callback) {
        const wsUrl = _resolveWsUrl();
        console.log('[mp] connecting to', wsUrl);
        try {
            this.ws = new WebSocket(wsUrl);
        } catch (e) {
            console.error('[mp] WebSocket init failed:', e);
            if (callback) callback(null);
            return;
        }
        this._connectCallback = callback;

        this.ws.onopen = () => {
            console.log('[mp] WebSocket connected');
        };
        this.ws.onmessage = (e) => {
            let msg;
            try { msg = JSON.parse(e.data); } catch (err) { return; }
            this._handleMessage(msg);
        };
        this.ws.onerror = (e) => {
            console.warn('[mp] WebSocket error', e);
            if (this._connectCallback) {
                this._connectCallback(null);
                this._connectCallback = null;
            }
        };
        this.ws.onclose = () => {
            console.log('[mp] WebSocket disconnected');
            this.active = false;
            for (const [pid] of this.remotePlayers) this._removeRemotePlayer(pid);
            this.remotePlayers.clear();
            this.connections.clear();
        };
    }

    // Legacy host/join API — both just connect to the shared server now
    host(callback) { this._connect(id => callback && callback(id ? 'SHARED-WORLD' : null)); }
    join(_code, callback) { this._connect(callback); }

    disconnect() {
        if (this.ws) try { this.ws.close(); } catch (e) {}
        this.ws = null;
        this.active = false;
        for (const [pid] of this.remotePlayers) this._removeRemotePlayer(pid);
        this.remotePlayers.clear();
        this.connections.clear();
    }

    get playerCount() { return this.remotePlayers.size + 1; }

    debugHeartbeat() {
        if (!this.active) return;
        console.log('[mp HB]', this.isHost ? 'HOST' : 'CLIENT',
            'pid=' + this.myId, 'players=' + (this.remotePlayers.size + 1),
            'buf=' + (this.ws && this.ws.bufferedAmount));
    }

    // ── Incoming messages ──

    _handleMessage(msg) {
        if (!msg || !msg.t) return;
        const t = msg.t;
        const pid = String(msg.pid || '');

        if (t === 'welcome') {
            this.myId = String(msg.pid);
            this.active = true;
            this.isHost = !!msg.isHost;
            console.log('[mp] welcomed as pid', this.myId, 'isHost=', this.isHost);
            // Apply authoritative world state
            if (msg.world && this.onWorldStateSync) {
                this.onWorldStateSync({
                    swords: msg.world.pickedSwords || [],
                    chests: msg.world.lootedChests || [],
                    eggs: msg.world.pickedEggs || [],
                    bosses: msg.world.killedBosses || [],
                });
            }
            if (msg.world && this.onTimeOfDay) this.onTimeOfDay(msg.world.tod);
            // Pre-create remote players for peers already connected
            if (msg.peers) {
                for (const p of msg.peers) {
                    const pp = String(p.pid);
                    this._createRemotePlayer(pp);
                    if (p.cc) this._applyRemoteCC(pp, p.cc);
                }
            }
            if (this._connectCallback) {
                this._connectCallback(this.myId);
                this._connectCallback = null;
            }
            return;
        }
        if (t === 'host_promoted') {
            this.isHost = true;
            console.log('[mp] promoted to host');
            return;
        }
        if (t === 'player_join') {
            this._createRemotePlayer(pid);
            return;
        }
        if (t === 'player_leave') {
            this._removeRemotePlayer(pid);
            if (this.onPeerDisconnect) this.onPeerDisconnect(pid);
            return;
        }
        if (t === 'state') {
            this._applyRemoteState(pid, msg);
            return;
        }
        if (t === 'cc') {
            this._applyRemoteCC(pid, msg);
            return;
        }
        if (t === 'block') {
            if (this.onBlockChange) this.onBlockChange(msg.bx, msg.by, msg.bz, msg.b);
            return;
        }
        if (t === 'creatures') {
            if (this.onCreatureSync) this.onCreatureSync(msg.list);
            return;
        }
        if (t === 'dragons') {
            if (this.onDragonSync) this.onDragonSync(msg.list, pid);
            return;
        }
        if (t === 'horses') {
            if (this.onHorseSync) this.onHorseSync(msg.list);
            return;
        }
        if (t === 'tod') {
            if (this.onTimeOfDay) this.onTimeOfDay(msg.tod);
            return;
        }
        if (t === 'villagers') {
            if (this.onVillagerSync) this.onVillagerSync(msg.list);
            return;
        }
        if (t === 'chat') {
            if (this.onChat) this.onChat(msg.text, msg.name, msg.color);
            return;
        }
        if (t === 'egg_pickup') {
            if (this.onEggPickup) this.onEggPickup(msg.idx);
            return;
        }
        if (t === 'chest_loot') {
            if (this.onChestLoot) this.onChestLoot(msg.key);
            return;
        }
        if (t === 'sword_pickup') {
            if (this.onSwordPickup) this.onSwordPickup(msg.id);
            return;
        }
        if (t === 'boss_killed') {
            if (this.onBossKilled) this.onBossKilled(msg.name);
            return;
        }
        if (t === 'attack') {
            if (this.onAttack) this.onAttack(msg);
            return;
        }
        if (t === 'pvp') {
            if (msg.targetPid === this.myId && this.onPvpHit) this.onPvpHit(msg.damage, msg.fromPid);
            return;
        }
    }

    // ── Outgoing send helpers ──

    _send(data) {
        if (!this.active || !this.ws || this.ws.readyState !== 1) return;
        try { this.ws.send(JSON.stringify(data)); } catch (e) {}
    }

    sendState(player, heldItem, swingTimer, charColors, riding) {
        if (!this.active) return;
        const safeNum = (n, def) => Number.isFinite(n) ? +n.toFixed(2) : (def || 0);
        const safeStr = (v) => v == null ? '' : String(v);
        this._send({
            t: 'state',
            x: safeNum(player.position.x),
            y: safeNum(player.position.y),
            z: safeNum(player.position.z),
            ry: safeNum(player.group.rotation.y),
            rx: safeNum(player.group.rotation.x),
            wp: safeNum(player.walkPhase),
            wb: safeNum(player.walkBlend),
            sb: safeNum(player.sprintBlend),
            sw: safeNum(swingTimer >= 0 ? swingTimer : -1, -1),
            tool: safeStr(heldItem),
            rd: riding ? 1 : 0,
        });
        // Send charColors as a one-shot, then re-send every ~10s for new joiners
        this._ccLastSend = (this._ccLastSend || 0) + 1;
        if (charColors && (!this._ccSent || this._ccLastSend > 200)) {
            this._ccSent = true;
            this._ccLastSend = 0;
            this._send({
                t: 'cc',
                shirt: charColors.shirt || '',
                pants: charColors.pants || '',
                skin: charColors.skin || '',
                hair: charColors.hair || '',
                shoes: charColors.shoes || '',
                name: charColors.name || 'Player',
                hairStyle: charColors.hairStyle || 'short',
                height: +(charColors.height || 1),
            });
        }
    }

    sendBlockChange(bx, by, bz, b) { this._send({ t: 'block', bx, by, bz, b }); }
    sendAttack(x, z, angle, damage) { this._send({ t: 'attack', x, z, angle, damage }); }
    sendPvpHit(targetPid, damage) { this._send({ t: 'pvp', targetPid, damage, fromPid: this.myId }); }
    sendCreatureState(creatureList) {
        if (!this.isHost) return; // only host broadcasts creatures
        const list = creatureList.map(c => ({
            id: c.cid, x: +c.x.toFixed(2), z: +c.z.toFixed(2),
            ry: +c.group.rotation.y.toFixed(2),
            w: c.walking ? 1 : 0, d: c.dead ? 1 : 0,
            t: c.type,
            h: c.hostile ? 1 : 0,
            tm: c._tamed ? 1 : 0,
            wp: c._waitingAtPost ? 1 : 0,
            np: c._necProvoked ? 1 : 0,
            hp: c.hp != null ? +c.hp.toFixed(0) : null,
        }));
        this._send({ t: 'creatures', list });
    }
    sendHorseState(list) { if (this.isHost) this._send({ t: 'horses', list }); }
    sendChestLoot(key) { this._send({ t: 'chest_loot', key }); }
    sendEggPickup(idx) { this._send({ t: 'egg_pickup', idx }); }
    sendSwordPickup(id) { this._send({ t: 'sword_pickup', id }); }
    sendBossKilled(name) { this._send({ t: 'boss_killed', name }); }
    sendChat(text, name, color) { this._send({ t: 'chat', text, name, color }); }
    sendDragonState(list) { this._send({ t: 'dragons', list }); }
    sendDragonHatch(info) { this._send({ t: 'dragon_hatch', ...info }); }
    // Server is authoritative for these — no-op
    sendTimeOfDay(_t) { /* server runs the clock */ }
    sendWorldState(_state) { /* server has the source of truth */ }

    // ── Remote player rendering (carried over from PeerJS version) ──

    _createRemotePlayer(pid) {
        if (this.remotePlayers.has(pid)) return;
        const g = new THREE.Group();

        const skinMat = new THREE.MeshStandardMaterial({ color: 0xE8B49D });
        const shirtMat = new THREE.MeshStandardMaterial({ color: 0xBB4444 });
        const pantsMat = new THREE.MeshStandardMaterial({ color: 0x334466 });
        const shoeMat = new THREE.MeshStandardMaterial({ color: 0x332211 });
        const hairMat = new THREE.MeshStandardMaterial({ color: 0x3B2507 });
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

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
        const hairGroup = new THREE.Group();
        const defaultHair = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.24), hairMat);
        defaultHair.position.y = 0.13; hairGroup.add(defaultHair);
        headGroup.add(hairGroup);
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
        const labelMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true });
        const label = new THREE.Sprite(labelMat);
        label.position.y = 2.2; label.scale.set(1.0, 0.25, 1);
        g.add(label);

        g.rotation.order = 'YXZ';
        g.position.set(0, 5, 0);
        g.visible = true;
        this.scene.add(g);
        console.log('[mp] created remote player slot for', pid);

        const rp = {
            group: g, body, spine, headGroup, torso,
            leftArm, rightArm, leftLeg, rightLeg,
            _skinMat: skinMat, _shirtMat: shirtMat, _pantsMat: pantsMat,
            _shoeMat: shoeMat, _hairMat: hairMat, _hairGroup: hairGroup,
            _labelCanvas: canvas, _labelTex: tex,
        };
        rp.setHeight = function(h) {
            h = h || 1;
            body.scale.set(1, h, 1);
            if (headGroup) headGroup.scale.set(1, 1/h, 1);
            body.position.y = 0.90 * h;
        };
        this.remotePlayers.set(pid, rp);
    }

    _applyRemoteState(pid, s) {
        if (pid === this.myId) return;
        if (!this.remotePlayers.has(pid)) this._createRemotePlayer(pid);
        const rp = this.remotePlayers.get(pid);
        if (!rp) return;

        rp._targetX = s.x; rp._targetY = s.y; rp._targetZ = s.z;
        rp._targetRY = s.ry; rp._targetRX = s.rx || 0;
        rp._wp = s.wp; rp._wb = s.wb; rp._sb = s.sb; rp._sw = s.sw;
        rp._tool = s.tool || '';
        rp._riding = !!s.rd;
        rp._lastUpdate = performance.now();

        if (!rp._hasReceived) {
            rp._hasReceived = true;
            rp.group.position.set(s.x, s.y, s.z);
            rp.group.rotation.y = s.ry;
            rp.group.visible = true;
            console.log('[mp] first state from', pid, 'at', s.x, s.y, s.z);
        }
    }

    _applyRemoteCC(pid, cc) {
        if (pid === this.myId) return;
        if (!this.remotePlayers.has(pid)) this._createRemotePlayer(pid);
        const rp = this.remotePlayers.get(pid);
        if (!rp || rp._colorsApplied) return;
        rp._colorsApplied = true;
        if (cc.shirt) rp._shirtMat.color.set(cc.shirt);
        if (cc.pants) rp._pantsMat.color.set(cc.pants);
        if (cc.skin) rp._skinMat.color.set(cc.skin);
        if (cc.hair) rp._hairMat.color.set(cc.hair);
        if (cc.shoes) rp._shoeMat.color.set(cc.shoes);
        if (cc.height && rp.setHeight) { rp.setHeight(cc.height); rp._heightScale = cc.height; }
        if (cc.hairStyle && rp._hairGroup) {
            const hg = rp._hairGroup;
            while (hg.children.length) hg.remove(hg.children[0]);
            const hm = rp._hairMat;
            const hs = cc.hairStyle;
            if (hs === 'short') { const h = new THREE.Mesh(new THREE.BoxGeometry(0.24,0.08,0.24), hm); h.position.y = 0.13; hg.add(h); }
            else if (hs === 'flat') { const h = new THREE.Mesh(new THREE.BoxGeometry(0.24,0.04,0.24), hm); h.position.y = 0.14; hg.add(h); const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.26,0.12,0.26), hm); s2.position.y = 0.10; hg.add(s2); }
            else if (hs === 'long') { const t = new THREE.Mesh(new THREE.BoxGeometry(0.24,0.08,0.24), hm); t.position.y = 0.13; hg.add(t); const b = new THREE.Mesh(new THREE.BoxGeometry(0.24,0.28,0.06), hm); b.position.set(0,-0.02,-0.12); hg.add(b); }
            else if (hs === 'mohawk') { const r = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.14,0.22), hm); r.position.y = 0.18; hg.add(r); }
            else if (hs === 'messy') { const t = new THREE.Mesh(new THREE.BoxGeometry(0.26,0.10,0.26), hm); t.position.y = 0.14; hg.add(t); }
        }
        if (cc.name && rp._labelCanvas) {
            const ctx = rp._labelCanvas.getContext('2d');
            ctx.clearRect(0, 0, 128, 32);
            ctx.fillStyle = '#fff'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
            ctx.fillText(cc.name, 64, 20);
            rp._labelTex.needsUpdate = true;
        }
    }

    updateRemotePlayers() {
        for (const [pid, rp] of this.remotePlayers) {
            if (!rp._hasReceived) continue;

            const tx = rp._targetX, ty = rp._targetY, tz = rp._targetZ;
            rp.group.position.x += (tx - rp.group.position.x) * 0.15;
            rp.group.position.y += (ty - rp.group.position.y) * 0.15;
            rp.group.position.z += (tz - rp.group.position.z) * 0.15;

            let da = rp._targetRY - rp.group.rotation.y;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            rp.group.rotation.y += da * 0.15;
            rp.group.rotation.x = rp._targetRX;

            this._updateRemoteTool(rp, rp._tool);

            const p = rp._wp, b = rp._wb, sp = rp._sb;
            const mix = (a, bv, t) => a + (bv - a) * t;

            if (rp._riding) {
                rp.body.position.y = 0.95 * (rp._heightScale || 1);
                rp.body.position.x = 0;
                rp.leftLeg.hip.rotation.set(-1.5, 0, -0.2);
                rp.rightLeg.hip.rotation.set(-1.5, 0, 0.2);
                rp.leftLeg.knee.rotation.x = 0.15;
                rp.rightLeg.knee.rotation.x = 0.15;
                rp.leftArm.shoulder.rotation.set(-0.5, 0, 0.3);
                rp.rightArm.shoulder.rotation.set(-0.5, 0, -0.3);
                rp.leftArm.elbow.rotation.x = -0.8;
                rp.rightArm.elbow.rotation.x = -0.8;
                rp.spine.rotation.set(0.15, 0, 0);
                rp.torso.rotation.y = 0;
                rp.headGroup.rotation.x = -0.1;
            } else {
                rp.body.position.y = 0.95 * (rp._heightScale || 1) + Math.cos(p * 2) * mix(0.025, 0.055, sp) * b;
                rp.body.position.x = Math.sin(p) * mix(0.018, 0.008, sp) * b;

                const legAmp = mix(0.5, 0.85, sp);
                const legSwing = Math.sin(p) * legAmp * b;
                rp.leftLeg.hip.rotation.x = legSwing;
                rp.rightLeg.hip.rotation.x = -legSwing;
                const kneeAmp = mix(0.7, 1.25, sp);
                rp.leftLeg.knee.rotation.x = Math.max(0, -Math.sin(p)) * kneeAmp * b;
                rp.rightLeg.knee.rotation.x = Math.max(0, Math.sin(p)) * kneeAmp * b;

                rp.spine.rotation.x = mix(0.04, 0.16, sp) * b;
                rp.spine.rotation.y = 0; rp.spine.rotation.z = 0;
                rp.torso.rotation.y = Math.sin(p) * mix(0.04, 0.07, sp) * b;
                rp.headGroup.rotation.x = -rp.spine.rotation.x * 0.45;

                const armMul = mix(0.7, 1.1, sp);
                rp.leftArm.shoulder.rotation.x = -legSwing * armMul;
                rp.leftArm.shoulder.rotation.z = 0;
                rp.rightArm.shoulder.rotation.x = legSwing * armMul;
                rp.rightArm.shoulder.rotation.z = 0;
                const elbBase = mix(-0.15, -1.4, sp);
                const elbDyn = mix(0.3, 0.45, sp);
                rp.leftArm.elbow.rotation.x = b * (elbBase - Math.max(0, Math.sin(p)) * elbDyn);
                rp.rightArm.elbow.rotation.x = b * (elbBase - Math.max(0, -Math.sin(p)) * elbDyn);

                const sw = rp._sw;
                if (sw >= 0 && sw <= 1.5) {
                    const t = Math.min(sw, 1);
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

            if (performance.now() - rp._lastUpdate > 5000) rp.group.visible = false;
            else rp.group.visible = true;
        }
    }

    _updateRemoteTool(rp, toolName) {
        if (rp._currentTool === toolName) return;
        rp._currentTool = toolName;

        if (rp._toolMesh) {
            rp.leftArm.handGrp.remove(rp._toolMesh);
            rp._toolMesh = null;
        }
        if (!toolName) return;

        const toolGroup = new THREE.Group();

        if (toolName.includes('pickaxe')) {
            const color = toolName.includes('diamond') ? 0x44ddff : toolName.includes('gold') ? 0xffd700 : toolName.includes('iron') ? 0xbbbbbb : toolName.includes('copper') ? 0xcc7744 : 0x888888;
            const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.04), new THREE.MeshStandardMaterial({ color: 0x8B5A2B }));
            handle.position.y = -0.2;
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.06), new THREE.MeshStandardMaterial({ color }));
            head.position.y = 0.05;
            toolGroup.add(handle, head);
            toolGroup.rotation.x = -0.3;
        } else if (toolName.includes('sword') || toolName.includes('csword')) {
            const color = toolName.includes('diamond') ? 0x44ddff : toolName.includes('gold') ? 0xffd700 : toolName.includes('iron') ? 0xcccccc : toolName.includes('copper') ? 0xcc7744 : 0xaaaaaa;
            const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.04), new THREE.MeshStandardMaterial({ color: 0x8B5A2B }));
            handle.position.y = -0.15;
            const guard = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.06), new THREE.MeshStandardMaterial({ color: 0x666666 }));
            guard.position.y = -0.07;
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.02), new THREE.MeshStandardMaterial({ color }));
            blade.position.y = 0.13;
            toolGroup.add(handle, guard, blade);
            toolGroup.rotation.x = Math.PI - 0.4;
        } else if (toolName.includes('staff') || toolName.includes('cstaff')) {
            const isVoid = toolName.includes('void');
            const isFire = toolName.includes('fire');
            const isIce = toolName.includes('ice');
            const isLightning = toolName.includes('lightning');
            const handleColor = isVoid ? 0x2a0a3a : 0x6B3A1F;
            const orbColor = isVoid ? 0x8800ff : isFire ? 0xff4400 : isIce ? 0x44ccff : isLightning ? 0xffee00 : 0x44aa44;
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.7, 6), new THREE.MeshStandardMaterial({ color: handleColor }));
            pole.position.y = 0.0;
            const orb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshStandardMaterial({ color: orbColor, emissive: orbColor, emissiveIntensity: 0.5 }));
            orb.position.y = 0.38;
            toolGroup.add(pole, orb);
            toolGroup.rotation.x = -0.2;
        } else if (toolName.includes('axe')) {
            const color = toolName.includes('diamond') ? 0x44ddff : toolName.includes('iron') ? 0xbbbbbb : 0xcc7744;
            const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.04), new THREE.MeshStandardMaterial({ color: 0x8B5A2B }));
            handle.position.y = -0.2;
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.12), new THREE.MeshStandardMaterial({ color }));
            head.position.set(0, 0.05, 0.06);
            toolGroup.add(handle, head);
            toolGroup.rotation.x = -0.3;
        } else {
            return;
        }

        rp._toolMesh = toolGroup;
        rp.leftArm.handGrp.add(toolGroup);
    }

    _removeRemotePlayer(pid) {
        const rp = this.remotePlayers.get(pid);
        if (rp) {
            this.scene.remove(rp.group);
            this.remotePlayers.delete(pid);
        }
    }
}
