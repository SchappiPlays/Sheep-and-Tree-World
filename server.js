// server.js — Sheep and Tree World multiplayer server
//
// A simple WebSocket relay + authoritative world-state server.
// Run locally: node server.js
// Deploy on Render/Fly.io/etc: set start command to `node server.js`,
// it listens on process.env.PORT (or 8080 locally).

import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
console.log('[satw-server] WebSocket server listening on port', PORT);

let nextPid = 0;
const clients = new Map(); // pid → { ws, name, charColors, lastState, isHost }
let hostPid = null; // designated host for creature/villager/horse AI broadcasts

// Authoritative persistent world state
const world = {
    pickedEggs: new Set(),
    lootedChests: new Set(),
    pickedSwords: new Set(),
    killedBosses: new Set(),
    timeOfDay: 0.35,
};

// Server tick — advance time of day
let lastTick = Date.now();
const DAY_LENGTH = 600; // seconds for a full day cycle
setInterval(() => {
    const now = Date.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;
    world.timeOfDay = (world.timeOfDay + dt / DAY_LENGTH) % 1.0;
}, 100);

// Periodic time-of-day broadcast
setInterval(() => {
    broadcast({ t: 'tod', tod: +world.timeOfDay.toFixed(4) });
}, 2000);

// Connection summary every 30s
setInterval(() => {
    if (clients.size === 0) return;
    console.log('[satw-server] active clients:', clients.size, 'host=', hostPid);
}, 30000);

function send(ws, data) {
    if (ws.readyState !== 1) return;
    try { ws.send(JSON.stringify(data)); } catch (e) {}
}

function broadcast(data, exceptPid) {
    const json = JSON.stringify(data);
    for (const [pid, c] of clients) {
        if (pid === exceptPid) continue;
        if (c.ws.readyState !== 1) continue;
        try { c.ws.send(json); } catch (e) {}
    }
}

wss.on('connection', (ws) => {
    const pid = String(++nextPid);
    const isFirst = hostPid === null;
    if (isFirst) hostPid = pid;
    const client = { ws, name: 'Player', charColors: null, pid, isHost: isFirst };
    clients.set(pid, client);
    console.log('[satw-server]', pid, 'connected (host=' + isFirst + '), total:', clients.size);

    // Send welcome with current world state and existing peers
    send(ws, {
        t: 'welcome',
        pid,
        isHost: isFirst,
        world: {
            pickedEggs: [...world.pickedEggs],
            lootedChests: [...world.lootedChests],
            pickedSwords: [...world.pickedSwords],
            killedBosses: [...world.killedBosses],
            tod: +world.timeOfDay.toFixed(4),
        },
        peers: [...clients.values()]
            .filter(c => c.pid !== pid)
            .map(c => ({ pid: c.pid, name: c.name, cc: c.charColors })),
    });

    // Notify existing clients of the new join
    broadcast({ t: 'player_join', pid }, pid);

    // If this is a non-host client, send them the current host's last known state
    if (!isFirst && hostPid && clients.has(hostPid)) {
        const host = clients.get(hostPid);
        if (host.charColors) {
            send(ws, { t: 'cc', pid: hostPid, ...host.charColors });
        }
    }

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
        if (!msg || !msg.t) return;

        // Cache identity
        if (msg.t === 'cc') {
            client.charColors = { ...msg };
            delete client.charColors.t;
            client.name = msg.name || 'Player';
        }
        if (msg.t === 'state') {
            client.lastState = msg;
        }

        // World state mutations
        if (msg.t === 'egg_pickup' && msg.idx != null) world.pickedEggs.add(msg.idx);
        if (msg.t === 'chest_loot' && msg.key) world.lootedChests.add(msg.key);
        if (msg.t === 'sword_pickup' && msg.id) world.pickedSwords.add(msg.id);
        if (msg.t === 'boss_killed' && msg.name) world.killedBosses.add(msg.name);

        // Tag with sender pid and broadcast to everyone else
        msg.pid = pid;
        broadcast(msg, pid);
    });

    ws.on('close', () => {
        clients.delete(pid);
        // Promote next client as host if the host left
        if (hostPid === pid) {
            const next = clients.keys().next().value;
            hostPid = next || null;
            if (next) {
                const nc = clients.get(next);
                nc.isHost = true;
                send(nc.ws, { t: 'host_promoted' });
                console.log('[satw-server] promoted', next, 'to host');
            }
        }
        broadcast({ t: 'player_leave', pid });
        console.log('[satw-server]', pid, 'disconnected, total:', clients.size);
    });

    ws.on('error', (err) => {
        console.warn('[satw-server]', pid, 'error:', err.message);
    });
});
