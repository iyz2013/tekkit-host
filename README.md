# Tekkit Host

Local dashboard that installs, starts, and monitors **Tekkit 2** dedicated servers on the machine sitting in front of you. Built first for an Apple Silicon MacBook (M-series, including M5 Max / 128 GB). It also runs on the Windows PC you are using now.

This folder is the whole project. Push it to GitHub, clone it on the Mac, run `./setup.sh` then `./start.sh`.

Dashboard login (change later in `data/config.json` if you want):

- Username: `admin`
- Password: `admin`

## Why this stack

Tekkit 2 is the official Technic remake of Tekkit Classic.

| Piece | What we use | Why |
| --- | --- | --- |
| Pack | Tekkit 2 **1.2.6** (all official builds 1.0.0–1.2.6) | Current recommended Technic release |
| Game | Minecraft **1.12.2** | That is the pack version. Not 1.20+, not Bedrock |
| Loader | Forge 1.12.2 (jar inside the official server zip) | Comes from Technic, not a random Curse pack |
| Java | **Java 8 only** | Forge 1.12.2 LaunchWrapper crashes on Java 11+ |
| Mac Java | Azul Zulu 8 **ARM64** | Native on Apple Silicon. Faster than Intel Java + Rosetta |
| Server files | Official zip from `servers.technicpack.net` | Same files Pterodactyl / Technic “Server Download” use |
| Friends | Technic Launcher → Tekkit 2, same version | Vanilla Minecraft cannot join |

Do **not** install Temurin 21 or the newest macOS Java and expect Tekkit 2 to start. The dashboard will refuse to launch the server unless it finds Java 8.

## What the dashboard does

- Create more than one server (each gets its own folder, port, memory, world)
- Download a Tekkit 2 version and install it
- Start / stop / restart with a live console
- Host monitors: RAM, disk, CPU, Java status
- Per-server CPU / RAM (the Java process)
- Player list, kick / ban / op
- Mod folder: enable, disable, upload, delete
- World backups and full instance backups, restore, download
- Optional timed world backups
- Memory sliders and `server.properties` settings
- LAN + public IP so you can tell friends how to connect

## MacBook setup (M5 Max)

1. Install [Homebrew](https://brew.sh) if you do not have it.
2. Install Node 18+ (20 is fine):

```bash
brew install node
```

3. Clone this repo and run setup:

```bash
git clone <your-github-url> tekkit-host
cd tekkit-host
chmod +x setup.sh start.sh
./setup.sh
```

4. Start the dashboard, sign in with `admin` / `admin`. Java 8 is installed from the UI if needed (Azul Zulu ARM64 on Apple Silicon). Creating or starting a server also downloads Java 8 automatically. Optional system-wide install: `brew install --cask zulu@8`.

5. Start:

```bash
./start.sh
```

Browser: [http://127.0.0.1:3840](http://127.0.0.1:3840)

During development (hot reload):

```bash
npm run dev
```

UI: [http://127.0.0.1:5173](http://127.0.0.1:5173)

6. In the UI: accept the Minecraft EULA, create a Tekkit 2 server (8 GB RAM is a good default; this machine can go to 16–32 GB if factories get huge), wait for the official zip to extract, then Start.

First Forge boot can take several minutes while it verifies libraries.

## Windows (this computer)

```powershell
.\setup.ps1
.\start.ps1
```

Or `npm install` then `npm run dev`. The Java tab can download a Windows x64 Java 8 JRE the same way.

## Let other people join

Everyone needs:

- Minecraft Java account
- [Technic Launcher](https://www.technicpack.net/download)
- Pack **Tekkit 2**, version matching the server (1.2.6 unless you pinned an older build)

Then:

1. **Same Wi-Fi** — join `LAN-IP:25565` from the Network page.
2. **Internet** — forward TCP 25565 (or whatever port you set) on the router to the Mac. Allow Java through the macOS firewall if it asks.
3. **No port forward** — install [Tailscale](https://tailscale.com) on the Mac and on each friend. They join `100.x.x.x:25565`.

Keep the Mac awake. Sleeping the lid will drop the server.

## Memory on 128 GB

| Use | Xmx |
| --- | --- |
| Testing / 1–4 players | 6–8 GB |
| Normal world + machines | 8–12 GB |
| Large factories / many players | 16–24 GB |

Leave tens of GB for macOS and Chrome. There is no benefit to giving one 1.12.2 world 64 GB.

## Folder layout

```
tekkit-host/
  server/          Node control API + process manager
  web/             Dashboard UI
  data/instances/  Each Minecraft server lives here
  data/backups/    Zip backups
  data/runtime/    Bundled Java 8 if you download it from the UI
  data/config.json Created on first run
```

Worlds and Java downloads are gitignored. After a clone on the Mac you get a clean panel, then install servers again (or copy `data/` over).

## GitHub

From this folder:

```bash
git init
git add .
git commit -m "Add Tekkit Host local dashboard"
# create a GitHub repo, then:
git remote add origin <url>
git push -u origin main
```

On the Mac, clone that repo. Do not copy `node_modules` from Windows.

## Commands friends / you will use

Dashboard console accepts normal Minecraft commands: `list`, `op Steve`, `whitelist add Steve`, `save-all`.

## License note

Minecraft and Tekkit 2 belong to Mojang / Technic. This repo only automates the official server zip and a local control UI. You still accept the Minecraft EULA when you create a server.
