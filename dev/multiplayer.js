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

    // ICE servers for NAT traversal
    _iceConfig() {
        return {
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' },
                    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
                    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
                    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
                    { urls: 'turn:numb.viagenie.ca', username: 'webrtc@live.com', credential: 'muazkh' },
                    { urls: 'turn:relay.backups.cz', username: 'webrtc', credential: 'webrtc' },
                ]
            }
        };
    }

    // Host a game — returns room code via callback
    host(callback) {
        const code = 'SATW-' + Math.floor(Math.random() * 9000 + 1000);
        this.peer = new Peer(code, { debug: 0, ...this._iceConfig() });
        this.isHost = true;
        this.peer.on('open', id => {
            this.myId = id;
            this.active = true;
            callback(id);
        });
        this.peer.on('connection', conn => {
            if (this.connections.size >= 4) { conn.close(); return; }
            // Connection may already be open or open later
            const doSetup = () => this._setupConnection(conn);
            if (conn.open) doSetup();
            else conn.on('open', doSetup);
        });
        this.peer.on('error', err => console.error('Peer error:', err));
        this.peer.on('disconnected', () => console.warn('Peer disconnected from server'));
    }

    // Join a game by room code
    join(code, callback) {
        this.peer = new Peer(undefined, { debug: 0, ...this._iceConfig() });
        this.isHost = false;
        this.peer.on('open', id => {
            this.myId = id;
            // serialization 'json' avoids PeerJS BinaryPack which silently drops
            // messages with certain shapes. Host auto-negotiates the same mode.
            const conn = this.peer.connect(code, { reliable: true, serialization: 'json' });
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
        console.log('[mp] connected to peer', pid, '— total peers:', this.connections.size, '— I am', this.isHost ? 'HOST' : 'CLIENT', 'myId=', this.myId);
        // Reset send counters so we see the first sends to this new peer
        this._sentTypes = {};

        const _typeCounts = {};
        conn.on('data', data => {
            // PeerJS handles JSON serialization (set on connect)
            // Log first 3 incoming messages PER TYPE so we can see state messages arriving
            const t = data && data.type;
            if (t) {
                _typeCounts[t] = (_typeCounts[t] || 0) + 1;
                if (_typeCounts[t] <= 3) {
                    console.log('[mp] recv', t, 'from', pid, '#' + _typeCounts[t]);
                }
            }
            try {
            if (data.type === 'state') {
                this._applyRemoteState(pid, data);
                // Host relays player state to other clients so everyone sees each other
                if (this.isHost) this._relayToOthers(pid, { ...data, _fromPid: pid });
            } else if (data.type === 'cc') {
                this._applyRemoteCC(data._fromPid || pid, data);
                if (this.isHost) this._relayToOthers(pid, { ...data, _fromPid: data._fromPid || pid });
            } else if (data.type === 'block') {
                if (this.onBlockChange) this.onBlockChange(data.bx, data.by, data.bz, data.b);
                // Host relays to other clients
                if (this.isHost) this._relayToOthers(pid, data);
            } else if (data.type === 'creatures') {
                if (this.onCreatureSync) this.onCreatureSync(data.list);
            } else if (data.type === 'dragons') {
                if (this.onDragonSync) this.onDragonSync(data.list, data.fromPid || pid);
                if (this.isHost) this._relayToOthers(pid, data);
            } else if (data.type === 'egg_pickup') {
                if (this.onEggPickup) this.onEggPickup(data.idx);
                if (this.isHost) this._relayToOthers(pid, data);
            } else if (data.type === 'dragon_hatch') {
                if (this.onDragonHatch) this.onDragonHatch(data);
                if (this.isHost) this._relayToOthers(pid, data);
            } else if (data.type === 'chest_loot') {
                if (this.onChestLoot) this.onChestLoot(data.key);
                if (this.isHost) this._relayToOthers(pid, data);
            } else if (data.type === 'tod') {
                if (this.onTimeOfDay) this.onTimeOfDay(data.t);
            } else if (data.type === 'horses') {
                if (this.onHorseSync) this.onHorseSync(data.list);
            } else if (data.type === 'sword_pickup') {
                if (this.onSwordPickup) this.onSwordPickup(data.id);
                if (this.isHost) this._relayToOthers(pid, data);
            } else if (data.type === 'world_state') {
                if (this.onWorldStateSync) this.onWorldStateSync(data);
            } else if (data.type === 'boss_killed') {
                if (this.onBossKilled) this.onBossKilled(data.name);
                if (this.isHost) this._relayToOthers(pid, data);
            } else if (data.type === 'chat') {
                if (this.onChat) this.onChat(data.text, data.name, data.color);
                if (this.isHost) this._relayToOthers(pid, data);
            } else if (data.type === 'villagers') {
                if (this.onVillagerSync) this.onVillagerSync(data.list);
            } else if (data.type === 'attack') {
                // Relay attack events
                if (this.onAttack) this.onAttack(data);
                if (this.isHost) this._relayToOthers(pid, data);
            } else if (data.type === 'pvp') {
                // Direct PvP damage targeting a specific player
                if (data.targetPid === this.myId && this.onPvpHit) {
                    this.onPvpHit(data.damage, data.fromPid);
                }
                if (this.isHost && data.targetPid !== this.myId) this._relayToOthers(pid, data);
            }
            } catch (err) {
                console.warn('[mp] error handling message', data && data.type, err);
            }
        });

        conn.on('close', () => {
            this._removeRemotePlayer(pid);
            this.connections.delete(pid);
            if (this.onPeerDisconnect) this.onPeerDisconnect(pid);
        });
    }

    _relayToOthers(fromPid, data) {
        for (const [pid, c] of this.connections) {
            if (pid !== fromPid && c.conn.open) {
                c.conn.send(data);
            }
        }
    }

    // Send local player state — flat primitives only (no nested objects)
    // to avoid PeerJS BinaryPack stalling on the cc charColors object.
    sendState(player, heldItem, swingTimer, charColors, riding) {
        if (!this.active) return;
        // Defensive: ensure all values are valid finite numbers / strings
        // (NaN/Infinity/undefined break BinaryPack serialization silently)
        const safeNum = (n, def) => Number.isFinite(n) ? +n.toFixed(2) : (def || 0);
        const safeStr = (v) => v == null ? '' : String(v);
        const state = {
            type: 'state',
            pid: safeStr(this.myId),
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
        };
        this._broadcast(state);
        // Send charColors as a separate one-shot message (and re-send periodically in case packets are lost)
        if (charColors) {
            this._ccLastSend = (this._ccLastSend || 0) + 1;
            if (!this._ccSent || this._ccLastSend > 200) {
                this._ccSent = true;
                this._ccLastSend = 0;
                this._broadcast({
                    type: 'cc',
                    pid: this.myId,
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

    // Send a direct PvP hit to a specific player
    sendPvpHit(targetPid, damage) {
        if (!this.active) return;
        this._broadcast({ type: 'pvp', targetPid, damage, fromPid: this.myId });
    }

    // Host sends creature state
    sendCreatureState(creatureList) {
        if (!this.active || !this.isHost) return;
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
        this._broadcast({ type: 'creatures', list });
    }

    // Any peer broadcasts the dragons it owns; host relays to other clients
    sendDragonState(dragonList) {
        if (!this.active) return;
        this._broadcast({ type: 'dragons', list: dragonList, fromPid: this.myId });
    }

    // Broadcast that an egg was picked up by this peer
    sendEggPickup(idx) {
        if (!this.active) return;
        this._broadcast({ type: 'egg_pickup', idx, fromPid: this.myId });
    }

    // Broadcast a fresh hatch (so other peers can spawn the same dragon immediately)
    sendDragonHatch(info) {
        if (!this.active) return;
        this._broadcast({ type: 'dragon_hatch', ...info, fromPid: this.myId });
    }

    // Broadcast that a chest was looted (any peer)
    sendChestLoot(key) {
        if (!this.active) return;
        this._broadcast({ type: 'chest_loot', key, fromPid: this.myId });
    }

    // Host broadcasts time of day
    sendTimeOfDay(t) {
        if (!this.active || !this.isHost) return;
        this._broadcast({ type: 'tod', t: +t.toFixed(4) });
    }

    // Host broadcasts horses
    sendHorseState(list) {
        if (!this.active || !this.isHost) return;
        this._broadcast({ type: 'horses', list });
    }

    // Broadcast a fortress sword pickup
    sendSwordPickup(id) {
        if (!this.active) return;
        this._broadcast({ type: 'sword_pickup', id, fromPid: this.myId });
    }

    // Host broadcasts authoritative world state snapshot (low frequency)
    sendWorldState(state) {
        if (!this.active || !this.isHost) return;
        this._broadcast({ type: 'world_state', ...state });
    }

    // Broadcast a boss kill so all peers add it to their killedBosses set
    sendBossKilled(name) {
        if (!this.active) return;
        this._broadcast({ type: 'boss_killed', name, fromPid: this.myId });
    }

    // Broadcast a chat message
    sendChat(text, name, color) {
        if (!this.active) return;
        this._broadcast({ type: 'chat', text, name, color, fromPid: this.myId });
    }

    _broadcast(data) {
        let sent = 0;
        for (const [pid, c] of this.connections) {
            if (c.conn.open) {
                try { c.conn.send(data); sent++; } catch(e) {
                    console.warn('[mp] send failed to', pid, e);
                }
            }
        }
        // Log first 3 broadcasts of each type so we can see if outgoing works
        if (data && data.type) {
            if (!this._sentTypes) this._sentTypes = {};
            this._sentTypes[data.type] = (this._sentTypes[data.type] || 0) + 1;
            if (this._sentTypes[data.type] <= 3) {
                console.log('[mp] sent', data.type, 'to', sent, 'peers (#' + this._sentTypes[data.type] + ')');
            }
        }
    }

    // Print channel state every 3s so we can see if connections are alive and how big the buffer is
    debugHeartbeat() {
        if (!this.active) return;
        const parts = [];
        for (const [pid, c] of this.connections) {
            const dc = c.conn && c.conn.dataChannel;
            const buffered = dc ? dc.bufferedAmount : '?';
            const rs = dc ? dc.readyState : '?';
            parts.push(pid.slice(0, 8) + ':' + rs + '/buf=' + buffered);
        }
        console.log('[mp HB]', this.isHost ? 'HOST' : 'CLIENT', 'peers=' + this.connections.size, 'remote=' + this.remotePlayers.size, parts.join(' | '));
    }

    _createRemotePlayer(pid) {
        const g = new THREE.Group();

        const skinMat = new THREE.MeshStandardMaterial({ color: 0xE8B49D });
        const shirtMat = new THREE.MeshStandardMaterial({ color: 0xBB4444 }); // red shirt to distinguish
        const pantsMat = new THREE.MeshStandardMaterial({ color: 0x334466 });
        const shoeMat = new THREE.MeshStandardMaterial({ color: 0x332211 });
        const hairMat = new THREE.MeshStandardMaterial({ color: 0x3B2507 });
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

        // Colors will be set from remote player's character customization

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
        // Position at world spawn so the player is at least visible somewhere
        // until their first state message arrives
        g.position.set(0, 5, 0);
        g.visible = true;
        this.scene.add(g);
        console.log('[mp] created remote player slot for', pid, '— scene now has', this.remotePlayers.size, 'remote(s)');

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
        // If this is relayed state from another client, use their pid
        const actualPid = s._fromPid || pid;
        if (actualPid === this.myId) {
            if (!this._selfStateLogged) {
                this._selfStateLogged = true;
                console.warn('[mp] _applyRemoteState got self state — skipping. actualPid=', actualPid, 'myId=', this.myId);
            }
            return; // don't render self
        }
        if (!this._applyStateLogged) {
            this._applyStateLogged = 0;
        }
        if (this._applyStateLogged < 3) {
            this._applyStateLogged++;
            console.log('[mp] _applyRemoteState #' + this._applyStateLogged, 'actualPid=', actualPid, 'pos=', s.x, s.y, s.z, 'remotePlayers has it?', this.remotePlayers.has(actualPid));
        }
        if (!this.remotePlayers.has(actualPid)) this._createRemotePlayer(actualPid);
        const rp = this.remotePlayers.get(actualPid);
        if (!rp) return;

        // Store target state for per-frame interpolation
        rp._targetX = s.x; rp._targetY = s.y; rp._targetZ = s.z;
        rp._targetRY = s.ry; rp._targetRX = s.rx || 0;
        rp._wp = s.wp; rp._wb = s.wb; rp._sb = s.sb; rp._sw = s.sw;
        rp._tool = s.tool || '';
        rp._riding = !!s.rd;
        rp._lastUpdate = performance.now();

        // Snap on first receive so player doesn't lerp from (0,0,0)
        if (!rp._hasReceived) {
            rp._hasReceived = true;
            rp.group.position.set(s.x, s.y, s.z);
            rp.group.rotation.y = s.ry;
            rp.group.visible = true;
            console.log('[mp] first state from', actualPid, 'at', s.x, s.y, s.z);
        }

    }

    // Apply character colors received from a peer (sent as a separate message)
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

    // Call this every frame to smoothly interpolate remote players
    updateRemotePlayers() {
        for (const [pid, rp] of this.remotePlayers) {
            if (!rp._hasReceived) continue;

            // Smooth position interpolation
            const tx = rp._targetX, ty = rp._targetY, tz = rp._targetZ;
            rp.group.position.x += (tx - rp.group.position.x) * 0.15;
            rp.group.position.y += (ty - rp.group.position.y) * 0.15;
            rp.group.position.z += (tz - rp.group.position.z) * 0.15;

            // Smooth rotation interpolation
            let da = rp._targetRY - rp.group.rotation.y;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            rp.group.rotation.y += da * 0.15;
            rp.group.rotation.x = rp._targetRX;

            // Update tool visibility
            this._updateRemoteTool(rp, rp._tool);

            // Animation
            const p = rp._wp, b = rp._wb, sp = rp._sb;
            const mix = (a, bv, t) => a + (bv - a) * t;

            // Riding pose overrides walk animation entirely
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

            // Body bob
            rp.body.position.y = 0.95 * (rp._heightScale || 1) + Math.cos(p * 2) * mix(0.025, 0.055, sp) * b;
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
            } // end else (not riding)

            // Hide remote player if no updates for 5 seconds (disconnected)
            if (performance.now() - rp._lastUpdate > 5000) {
                rp.group.visible = false;
            } else {
                rp.group.visible = true;
            }
        }
    }

    // Update held tool mesh on remote player
    _updateRemoteTool(rp, toolName) {
        if (rp._currentTool === toolName) return;
        rp._currentTool = toolName;

        // Remove old tool
        if (rp._toolMesh) {
            rp.leftArm.handGrp.remove(rp._toolMesh);
            rp._toolMesh = null;
        }
        if (!toolName) return;

        const toolGroup = new THREE.Group();

        if (toolName.includes('pickaxe')) {
            // Pickaxe
            const color = toolName.includes('diamond') ? 0x44ddff : toolName.includes('gold') ? 0xffd700 : toolName.includes('iron') ? 0xbbbbbb : toolName.includes('copper') ? 0xcc7744 : 0x888888;
            const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.04), new THREE.MeshStandardMaterial({ color: 0x8B5A2B }));
            handle.position.y = -0.2;
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.06), new THREE.MeshStandardMaterial({ color }));
            head.position.y = 0.05;
            toolGroup.add(handle, head);
            toolGroup.rotation.x = -0.3;
        } else if (toolName.includes('sword') || toolName.includes('csword')) {
            // Sword
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
            // Staff
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
            // Axe
            const color = toolName.includes('diamond') ? 0x44ddff : toolName.includes('iron') ? 0xbbbbbb : 0xcc7744;
            const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.04), new THREE.MeshStandardMaterial({ color: 0x8B5A2B }));
            handle.position.y = -0.2;
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.12), new THREE.MeshStandardMaterial({ color }));
            head.position.set(0, 0.05, 0.06);
            toolGroup.add(handle, head);
            toolGroup.rotation.x = -0.3;
        } else {
            return; // Unknown tool, don't show anything
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
