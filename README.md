# Time Tracker

A lightweight, cross-platform desktop time tracker. Pick a project, press **Start**,
and the app records your working time, pauses automatically when you step away, and
captures periodic screenshots. All data stays on your computer.

> **Status: feasibility build (v0.1).** This version proves that timers, idle detection
> and screenshots work reliably on Windows, macOS and Linux. Task assignment and server
> sync are planned next (see [Roadmap](#roadmap)).

## Features

| Feature | Details |
|---|---|
| Per-project timers | Create projects, track one at a time, see running totals per project |
| Automatic idle pause | Timer stops after a configurable period without keyboard or mouse input |
| Periodic screenshots | Captured at a configurable interval while the timer runs, one image per screen |
| Active window | Shows the application and window title currently in use |
| Local storage | Projects, totals and screenshots are stored on the device only |

## Installation

Download the installer for your system from the **Actions → Build installers → Artifacts**
section of this repository.

| System | File | Notes |
|---|---|---|
| Windows 10/11 | `TimeTracker-Setup-*.exe` or `TimeTracker-Portable-*.exe` | Choose **More info → Run anyway** on the SmartScreen warning (unsigned build) |
| macOS (Apple Silicon and Intel) | `TimeTracker-*-mac-*.dmg` | Drag to Applications, then right-click → **Open** on first launch |
| Linux | `TimeTracker-*.AppImage` or `.deb` | See [Linux notes](#linux-notes) |

### macOS setup

1. Open the `.dmg` and drag **Time Tracker Test** into Applications.
2. First launch: right-click the app → **Open** → **Open**.
   If macOS reports the app as damaged, run:
   `xattr -cr "/Applications/Time Tracker Test.app"`
3. Open **System Settings → Privacy & Security** and enable **Screen Recording**
   (and **Accessibility** for window titles) for the app, then restart it.

### Linux notes

```bash
sudo apt install -y x11-utils gnome-screenshot   # KDE: install spectacle instead
chmod +x TimeTracker-*.AppImage && ./TimeTracker-*.AppImage
```

- **X11 sessions:** all features work.
- **Wayland sessions (GNOME):** idle detection uses GNOME's idle monitor and screenshots
  use `gnome-screenshot`, which avoids a share prompt on every capture. Active-window
  detection is not available on Wayland.

## Usage

1. Choose a project, or create one with **+ New project**.
2. Press **Start**. The timer runs and screenshots are taken at the configured interval.
3. Stop touching the keyboard and mouse: the timer pauses once the idle limit is reached
   and resumes on activity.
4. Press **Stop** to save the session to the project total.
5. Use **Open screenshots folder** to view captured images.

## Platform support

| Capability | Windows | macOS | Linux (X11) | Linux (Wayland) |
|---|---|---|---|---|
| Screenshots | Yes | Yes (permission) | Yes | Yes (with `gnome-screenshot`) |
| Idle detection | Yes | Yes | Yes | GNOME only |
| Active window | Yes | Yes (permission) | Yes (`xprop`) | No |

## Development

Requires Node.js 18 or newer.

```bash
npm install
npm start          # run from source
npm run dist       # build installers for the current OS into dist/
```

Installers must be built on their target OS. The **Build installers** GitHub Actions
workflow builds all three: open **Actions → Build installers → Run workflow**, or push a
tag such as `v0.1.0`.

### Project layout

| File | Purpose |
|---|---|
| `main.js` | Main process: screenshots, idle detection, active window, file storage |
| `preload.js` | Secure bridge between the main process and the UI |
| `index.html` | User interface and timer logic |
| `.github/workflows/build.yml` | Cross-platform installer build |

## Privacy

Screenshots and time data are stored only in the application's local data folder and are
never uploaded. Anyone deploying this to employees should publish a clear monitoring policy
and comply with applicable data-protection law.

## Roadmap

- Task and project assignment from a central server
- Sync of time entries and screenshots to object storage
- Manual time entries with approval
- Signed installers (Windows certificate, Apple notarization)
- Screenshot blur, retention rules and admin reporting

## License

Proprietary. All rights reserved.
