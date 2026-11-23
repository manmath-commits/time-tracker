# Time Tracker Test

Pick a project, press Start: tracks time, pauses on idle, takes screenshots.
Everything is stored locally on the user's computer (nothing is uploaded).

## For users - install
- **Windows:** run `TimeTracker-Setup-*.exe` (or the Portable exe, no install).
  If SmartScreen warns: More info > Run anyway (build is unsigned).
- **macOS:** open the `.dmg`, drag the app to Applications. First launch:
  right-click the app > Open > Open. If it says "damaged":
  `xattr -cr "/Applications/Time Tracker Test.app"`
  Then allow Screen Recording (and Accessibility) in
  System Settings > Privacy & Security, and restart the app.
- **Linux:** `chmod +x TimeTracker-*.AppImage && ./TimeTracker-*.AppImage`
  or `sudo apt install ./TimeTracker-*.deb`. Needs `xprop`
  (`sudo apt install x11-utils`). Full features need an X11 session;
  Wayland blocks silent screenshots / active window.

Screenshots folder: click "Open screenshots folder" in the app.

## For maintainers - build installers for all 3 OSes
Installers must be built on their own OS. Easiest: GitHub Actions.
1. Push this folder to a (private) GitHub repo.
2. Actions tab > "Build installers" > Run workflow
   (or push a tag like `v0.1.0`).
3. Download the artifacts: Windows .exe, macOS .dmg/.zip, Linux .AppImage/.deb.

Local build on each OS: `npm install` then `npm run dist`
(outputs to `dist/`). Run from source: `npm install && npm start`.

## Before wider rollout
- Sign builds (Windows cert, Apple Developer ID + notarization) to remove
  security warnings.
- Replace the placeholder author email in package.json.
