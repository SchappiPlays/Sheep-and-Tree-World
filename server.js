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
import https from 'https';
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
const clients = new Map(); // pid → { ws, name, charColors, pid, code, isHost }
const rooms = new Map();   // code → { hostPid, members: Set<pid> }

// Generate a short unique room code
function makeRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
    for (let tries = 0; tries < 100; tries++) {
        let code = '';
        for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
        if (!rooms.has(code)) return code;
    }
    return 'ROOM' + Date.now();
}

// Connection summary every 30s
setInterval(() => {
    if (rooms.size === 0) return;
    console.log('[satw-server] rooms:', rooms.size, 'clients:', clients.size);
}, 30000);

function send(ws, data) {
    if (ws.readyState !== 1) return;
    try { ws.send(JSON.stringify(data)); } catch (e) {}
}

// Broadcast to everyone in the same room as senderPid (except sender)
function broadcastToRoom(code, data, exceptPid) {
    const room = rooms.get(code);
    if (!room) return;
    const json = JSON.stringify(data);
    for (const pid of room.members) {
        if (pid === exceptPid) continue;
        const c = clients.get(pid);
        if (!c || c.ws.readyState !== 1) continue;
        try { c.ws.send(json); } catch (e) {}
    }
}

// Ping all clients every 25s to keep connections alive (Render kills idle sockets)
setInterval(() => {
    for (const [pid, c] of clients) {
        if (c.ws.readyState !== 1) continue;
        if (c._pongPending) {
            // Missed last pong — connection is dead
            console.log('[satw-server]', pid, 'missed pong, terminating');
            c.ws.terminate();
            continue;
        }
        c._pongPending = true;
        c.ws.ping();
    }
}, 25000);

wss.on('connection', (ws) => {
    const pid = String(++nextPid);
    const client = { ws, name: 'Player', charColors: null, pid, code: null, isHost: false };
    clients.set(pid, client);
    console.log('[satw-server]', pid, 'connected (awaiting host/join)');

    // Initial welcome — no room yet, client must host or join
    send(ws, { t: 'welcome', pid });

    ws.on('pong', () => { client._pongPending = false; });

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
        if (!msg || !msg.t) return;

        // ── Host a new room ──
        if (msg.t === 'host') {
            const code = makeRoomCode();
            rooms.set(code, { hostPid: pid, members: new Set([pid]) });
            client.code = code;
            client.isHost = true;
            send(ws, { t: 'hosting', code });
            console.log('[satw-server]', pid, 'hosting room', code);
            return;
        }

        // ── Join an existing room ──
        if (msg.t === 'join') {
            const code = (msg.code || '').toUpperCase();
            const room = rooms.get(code);
            if (!room) { send(ws, { t: 'join_failed', reason: 'Room not found' }); return; }
            const hostClient = clients.get(room.hostPid);
            if (!hostClient) { send(ws, { t: 'join_failed', reason: 'Host offline' }); return; }
            client.code = code;
            client.isHost = false;
            room.members.add(pid);
            // Tell guest they joined, list existing peers
            const peers = [...room.members]
                .filter(p => p !== pid && clients.has(p))
                .map(p => { const c = clients.get(p); return { pid: c.pid, name: c.name, cc: c.charColors }; });
            send(ws, { t: 'joined', code, hostPid: room.hostPid, peers });
            // Ask host for their full world state and forward to this guest
            send(hostClient.ws, { t: 'request_state', forPid: pid });
            // Notify existing room members
            broadcastToRoom(code, { t: 'player_join', pid }, pid);
            console.log('[satw-server]', pid, 'joined room', code);
            return;
        }

        if (!client.code) return; // must be in a room to do anything else

        // ── Host sends full state to a specific guest ──
        if (msg.t === 'full_state' && msg.forPid) {
            const guest = clients.get(msg.forPid);
            if (guest) send(guest.ws, { t: 'full_state', state: msg.state });
            return;
        }

        // Cache identity
        if (msg.t === 'cc') {
            client.charColors = { ...msg };
            delete client.charColors.t;
            client.name = msg.name || 'Player';
        }

        // Tag with sender pid and broadcast to everyone else in the same room
        msg.pid = pid;
        broadcastToRoom(client.code, msg, pid);
    });

    ws.on('close', () => {
        const code = client.code;
        clients.delete(pid);
        if (code) {
            const room = rooms.get(code);
            if (room) {
                room.members.delete(pid);
                if (room.hostPid === pid) {
                    // Host left — close the room, kick everyone else
                    console.log('[satw-server] host of room', code, 'left — closing room');
                    for (const mpid of room.members) {
                        const m = clients.get(mpid);
                        if (m) { send(m.ws, { t: 'room_closed', reason: 'Host disconnected' }); m.code = null; }
                    }
                    rooms.delete(code);
                } else {
                    broadcastToRoom(code, { t: 'player_leave', pid });
                    if (room.members.size === 0) rooms.delete(code);
                }
            }
        }
        console.log('[satw-server]', pid, 'disconnected');
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
