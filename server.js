// server.js — Sheep and Tree World multiplayer server
//
// Serves the game static files AND runs a WebSocket relay on the same port.
// Run locally:  node server.js
// Then visit    http://localhost:8080/  in your browser.
// To play with friends: port-forward 8080 on your router and share
// http://YOUR_PUBLIC_IP:8080/ with them.
//
// Deploy on Render/Fly.io/etc: set start command to `node server.js`,
// it listens on process.env.PORT (or 8080 locally).

import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { resolve, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = process.env.PORT || 8080;
const STATIC_ROOT = resolve(__dirname);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

const httpServer = createServer(async (req, res) => {
    try {
        let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        // Root → redirect to the dev build
        if (urlPath === '/' || urlPath === '') {
            res.writeHead(302, { Location: '/dev/' });
            res.end();
            return;
        }
        if (urlPath === '/dev' || urlPath === '/dev/') urlPath = '/dev/index.html';

        let filePath = resolve(STATIC_ROOT, '.' + urlPath);
        // Prevent directory traversal
        if (!filePath.startsWith(STATIC_ROOT)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
        const st = await stat(filePath).catch(() => null);
        if (!st || !st.isFile()) {
            res.writeHead(404);
            res.end('Not Found: ' + urlPath);
            return;
        }
        const ext = extname(filePath).toLowerCase();
        const mime = MIME[ext] || 'application/octet-stream';
        const data = await readFile(filePath);
        res.writeHead(200, {
            'Content-Type': mime,
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
        });
        res.end(data);
    } catch (e) {
        res.writeHead(500);
        res.end('Server error');
    }
});

const wss = new WebSocketServer({ server: httpServer });
console.log('[satw-server] HTTP + WebSocket starting on port', PORT);

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

httpServer.listen(PORT, () => {
    console.log('[satw-server] ready');
    console.log('[satw-server] Play locally:   http://localhost:' + PORT + '/');
    console.log('[satw-server] Share with friends: http://YOUR_PUBLIC_IP:' + PORT + '/');
    console.log('[satw-server] (make sure port ' + PORT + ' is forwarded on your router)');
});
