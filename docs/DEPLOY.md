# 🚀 Kitchen Rush — Deployment Guide

This is the "always-on, kids tap iPad whenever, game is just there" setup. Tested on macOS 13+. Should work on macOS 11+ with minor tweaks.

---

## What you're setting up

A Node process running on your Mac, listening on a LAN port. iPad/iPhone/laptop browsers on the same Wi‑Fi hit the URL → game.

```
   ┌────────────┐         WiFi          ┌──────────────────┐
   │   iPad     │  http://Mac:5050  →   │  your Mac (mini, │
   │ (Safari)   │                       │   Air, whatever) │
   └────────────┘                       │                  │
                                        │  Express  :5050  │
   ┌────────────┐                       │  ↳ /api/*  → API │
   │  iPhone    │ ───────────────────→  │  ↳ /*      → UI  │
   │ (Safari)   │                       │                  │
   └────────────┘                       │  SQLite ./data/  │
                                        └──────────────────┘
   ┌────────────┐
   │  another   │ ───────────────────→
   │   Mac      │
   └────────────┘
```

Single port. Single Node process. Survives reboots via macOS LaunchAgent.

---

## Prerequisites

- **Mac on at all times** (or whenever kids might play) — sleep is fine, the agent wakes up. Sleeping the *display* is fine; sleeping the *Mac* hibernates the service until wake.
- **Node 20+**. Check: `node --version`. Install: `brew install node` or [nodejs.org](https://nodejs.org/).
- **Mac and iPads on the same Wi-Fi.** The game does not work over cellular or different VLANs without extra networking.

---

## One-time install

From a Terminal:

```bash
git clone https://github.com/<you>/kitchen-rush.git ~/kitchen-rush
cd ~/kitchen-rush
./run.zsh service install
```

That command:

1. Runs `npm install` (downloads dependencies, ~1–2 min first time)
2. Builds the server (`apps/server/dist/`) and the React app (`apps/web/dist/`)
3. Writes a LaunchAgent file to `~/Library/LaunchAgents/com.kitchen-rush.local.plist`
4. Loads it with `launchctl` so it starts immediately AND auto-runs at every login
5. Prints the URL

You should see something like:

```
════════════════════════════════════════════════
✅ Service installed and running.

  🖥  This Mac : http://localhost:5050
  📱 Wi-Fi    : http://192.168.1.189:5050

  Auto-starts at login. Logs in ~/Library/Logs/kitchen-rush.*.log
  Stop with:    ./run.zsh service stop
  Uninstall:    ./run.zsh service uninstall
════════════════════════════════════════════════
```

Bookmark that **Wi-Fi URL** on every iPad. Done.

---

## Choosing a port

Default is `5050`. To pick a different one:

```bash
KR_PORT=8080 ./run.zsh service install
```

The port is baked into the plist, so the env var only matters at install/reinstall time. To change after install, run `./run.zsh service uninstall` and reinstall with the new `KR_PORT`.

**Don't use** these ports (collisions): 80, 443, 631, 3000 (common React-dev), 5000 (AirPlay on macOS Monterey+), 8080 (if you have a local dev server).

Good choices: `5050`, `5173`, `7777`, `8888`.

---

## Verifying the service

```bash
./run.zsh service status
```

Shows three lines:
- `● plist installed at ~/Library/LaunchAgents/com.kitchen-rush.local.plist`
- `● loaded — <pid> <exit> com.kitchen-rush.local`
- `● /api/health responding at :5050`

If any are `○` (not running), see Troubleshooting below.

---

## Finding the URL from any device

You can always re-print the URL by running:

```bash
./run.zsh status
```

Or just check your Mac's IP:

```bash
ipconfig getifaddr en0           # Wi-Fi
# or
ipconfig getifaddr en1           # Ethernet
```

Then it's `http://<that-ip>:5050`.

> **Note:** the Mac IP can change if your router reassigns it. Pin it in your router's DHCP table to be safe, or use the Mac's `.local` hostname (e.g., `http://kitchen-server.local:5050` if your Mac is named `kitchen-server`).

---

## Updating to a new version

When you `git pull` new features, just run:

```bash
cd ~/kitchen-rush
./run.zsh update
```

That command:
1. `git pull --ff-only`
2. `npm install` (in case deps changed)
3. `npm run build` (server + web)
4. Restarts the LaunchAgent

Total downtime ≈ 5 seconds.

---

## Logs

The service writes two files:

```
~/Library/Logs/kitchen-rush.out.log   ← stdout (info, debug)
~/Library/Logs/kitchen-rush.err.log   ← stderr (errors)
```

Tail them:

```bash
./run.zsh service logs
```

(That's just `tail -F` on both with nice formatting.)

---

## Uninstalling

```bash
./run.zsh service uninstall
```

Removes the LaunchAgent. Your save data (SQLite at `apps/server/data/kitchen-rush.sqlite`) is untouched. To fully wipe:

```bash
./run.zsh service uninstall
rm -rf ~/kitchen-rush       # whole project
```

---

## LAN / firewall notes

### macOS firewall

If you have **System Settings → Network → Firewall** turned on, the first time the Node process binds to a port, macOS pops a dialog asking "Allow incoming connections?" — click **Allow**.

If you missed the prompt and the service can't be reached:

1. **System Settings → Network → Firewall → Options**
2. Find `node` in the list
3. Set it to **Allow incoming connections** (or remove and re-add)

### Router

Most home routers allow LAN traffic by default. If your network has "client isolation" or "AP isolation" enabled (some guest networks do), devices on the same Wi-Fi can't see each other. Disable that setting in the router admin.

### VPN

If the Mac is on a VPN, the LAN may be routed through the tunnel — iPads on local Wi-Fi can't reach it. Either turn the VPN off or split-tunnel the local subnet.

---

## Performance + resource use

The service idles at ~30 MB RAM. Under typical play (3 cooks, 1 customer/sec arrivals) it sits at ~50 MB and 1–3% CPU on Apple Silicon.

SQLite database grows ~10 KB per in-game day of play. A week of nonstop play = ~70 KB. Don't worry about it.

---

## Backing up save data

The game saves everything to a single SQLite file:

```
apps/server/data/kitchen-rush.sqlite
```

Copy it to back up. To restore, replace it with your backup and restart the service:

```bash
./run.zsh service restart
```

---

## Running on Linux instead of Mac

The Mac-service install path uses launchd, which is macOS-only. For Linux:

1. Use `systemd` instead. Create `~/.config/systemd/user/kitchen-rush.service`:
   ```ini
   [Unit]
   Description=Kitchen Rush
   After=network.target

   [Service]
   Type=simple
   WorkingDirectory=%h/kitchen-rush
   Environment="NODE_ENV=production"
   Environment="HOST=0.0.0.0"
   Environment="PORT=5050"
   ExecStart=/usr/bin/node %h/kitchen-rush/apps/server/dist/index.js
   Restart=always

   [Install]
   WantedBy=default.target
   ```
2. `systemctl --user enable --now kitchen-rush`

The `./run.zsh prod` and `./run.zsh build` commands still work cross-platform.

---

## Troubleshooting

### `./run.zsh service install` fails with "command not found: launchctl"

You're not on macOS. See "Running on Linux" above.

### Service installed but URL doesn't load on iPad

1. Mac and iPad on the same Wi-Fi? Confirm SSID matches.
2. Mac firewall allowing Node?
3. Router has AP isolation off?
4. Try `http://localhost:5050` ON the Mac first — if that works but `http://<mac-ip>:5050` doesn't from iPad, it's a network issue, not a service issue.

### "Cannot find module" or build errors

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
npm install
./run.zsh build
./run.zsh service restart
```

### Service keeps crashing — `service status` shows it auto-restarting

```bash
./run.zsh service logs
```

Look at the last 50 lines of the err.log. Common causes:
- **Port already in use** — something else on `:5050`. Pick a different `KR_PORT`.
- **SQLite locked** — another Mac user opened the same database. Use a different `DATA_DIR` per user (advanced).
- **Out of disk space** — `df -h ~`.

### iPad bookmark sometimes shows "Safari can't open the page"

Mac probably slept and got a new DHCP lease. Either:
- Set a DHCP reservation in your router so the Mac always gets the same IP
- Use `.local` mDNS: `http://<mac-name>.local:5050` (works if both devices support Bonjour)

### I want logs to go somewhere else

Edit the plist directly (or pre-set `OUT_LOG`/`ERR_LOG` env vars before `install`, then re-run install — they're baked in).

```bash
nano ~/Library/LaunchAgents/com.kitchen-rush.local.plist
# edit <key>StandardOutPath</key> and <key>StandardErrorPath</key>
launchctl unload ~/Library/LaunchAgents/com.kitchen-rush.local.plist
launchctl load   ~/Library/LaunchAgents/com.kitchen-rush.local.plist
```

---

## Security considerations

This is a LAN-only setup. **Do NOT expose the port to the public internet.** Reasons:

- Username-only login (no password) — anyone who knows a username can log in as them.
- No HTTPS — sessions go over plain HTTP on the LAN.
- No rate-limiting.

If you want internet exposure, put it behind a reverse proxy with HTTPS + real auth (e.g., Caddy + a basic-auth wrapper). That's outside the scope of this guide.

For home/family LAN play, the current setup is fine.

---

## Bonus: shortcut on iPad home screen

Make the game feel like a real app:

1. Open Safari on the iPad
2. Go to `http://<mac-ip>:5050`
3. Tap the **Share** button → **Add to Home Screen**
4. Name it "Kitchen Rush" (or whatever the kid wants) → Add

Now it has an icon on the home screen, opens fullscreen, no Safari chrome. Looks like a real app.

You can do the same on iPhone, iPad, and most Android browsers.

---

Questions? Open an issue on GitHub.
