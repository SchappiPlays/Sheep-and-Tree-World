const { app, BrowserWindow } = require('electron');
const http = require('http');
const path = require('path');

const CMD_PORT = 7777;
let mainWin = null;

app.whenReady().then(() => {
    mainWin = new BrowserWindow({
        width: 1280,
        height: 800,
        title: 'Sheep and Tree World',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        }
    });
    mainWin.setMenuBarVisibility(false);
    mainWin.loadFile('index.html');

    // Command server — accepts commands via HTTP from any terminal or NFC trigger
    const server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        const parts = req.url.split('/').filter(Boolean);
        if (parts[0] !== 'cmd' || parts.length < 2) {
            res.writeHead(400); res.end('Usage: /cmd/<command>/[args...]\n');
            return;
        }
        const cmd = parts[1];
        const args = parts.slice(2);
        const payload = JSON.stringify({ cmd, args });
        mainWin.webContents.executeJavaScript(`window._gameCmd(${payload})`);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`OK: ${cmd} ${args.join(' ')}\n`);
    });
    server.listen(CMD_PORT, () => {
        console.log(`Command server on http://localhost:${CMD_PORT}/cmd/<command>/[args]`);
    });
});

app.on('window-all-closed', () => app.quit());
