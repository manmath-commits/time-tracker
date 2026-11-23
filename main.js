const { app, BrowserWindow, ipcMain, desktopCapturer, powerMonitor, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let activeWin = null;
try { activeWin = require('active-win'); } catch (e) { activeWin = null; }

if (process.platform === 'linux') app.commandLine.appendSwitch('no-sandbox'); // AppImage/userns restrictions on newer distros
const shotDir = path.join(app.getPath('userData'), 'screenshots');

function env() {
  return {
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    sessionType: process.env.XDG_SESSION_TYPE || '(n/a)',
    desktop: process.env.XDG_CURRENT_DESKTOP || '(n/a)',
    displays: screen.getAllDisplays().length,
    shotDir,
  };
}

ipcMain.handle('env', () => env());

ipcMain.handle('idle', () => powerMonitor.getSystemIdleTime());

ipcMain.handle('active-window', async () => {
  if (!activeWin) return { ok: false, error: 'active-win module not loaded' };
  try {
    const w = await activeWin();
    if (!w) return { ok: false, error: 'No active window returned (null)' };
    return { ok: true, title: w.title, app: w.owner && w.owner.name, path: w.owner && w.owner.path, url: w.url || null };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});

ipcMain.handle('open-folder', async () => { fs.mkdirSync(shotDir, { recursive: true }); await shell.openPath(shotDir); return shotDir; });

ipcMain.handle('screenshot', async (_e, label) => {
  const slug = String(label || 'no-project').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) || 'no-project';
  const t0 = Date.now();
  try {
    fs.mkdirSync(shotDir, { recursive: true });
    const displays = screen.getAllDisplays();
    const maxW = Math.max(...displays.map(d => d.size.width * d.scaleFactor));
    const maxH = Math.max(...displays.map(d => d.size.height * d.scaleFactor));
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: maxW, height: maxH } });
    if (!sources.length) return { ok: false, error: 'No screen sources returned' };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const files = [];
    sources.forEach((s, i) => {
      if (s.thumbnail.isEmpty()) return;
      const f = path.join(shotDir, `${slug}__${stamp}__screen${i + 1}.jpg`);
      fs.writeFileSync(f, s.thumbnail.toJPEG(70));
      const size = s.thumbnail.getSize();
      files.push({ file: f, kb: Math.round(fs.statSync(f).size / 1024), w: size.width, h: size.height, name: s.name });
    });
    if (!files.length) return { ok: false, error: 'Captured images were empty (likely a permission problem)' };
    return { ok: true, files, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 980, height: 780, minWidth: 760,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  win.loadFile('index.html');
});
app.on('window-all-closed', () => app.quit());
