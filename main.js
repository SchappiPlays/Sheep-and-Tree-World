const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        title: 'Sheep and Tree World',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        }
    });
    win.setMenuBarVisibility(false);
    win.loadFile('index.html');
});

app.on('window-all-closed', () => app.quit());
