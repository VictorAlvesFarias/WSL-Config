# WSL-Config

Desktop app to manage the WSL distros on this PC: start and stop them, set the resources of the WSL VM, edit each distro's `wsl.conf`, create distros from images or the online catalog, and back them up and restore them.

```
Windows host
└── WSL 2 VM  (one VM: memory, CPUs, swap and network are set in %UserProfile%\.wslconfig)
    ├── Ubuntu-24.04   /etc/wsl.conf: systemd, automount, hostname, interop...
    ├── dev-box        /etc/wsl.conf
    └── ...
```

## Structure

Same layout as [WSL-Vpn](../WSL-Vpn):

- **server/** – Express API (TypeScript run natively by Node 24) on `127.0.0.1:4313`. Drives `wsl.exe`, reads the distro list from the registry (`HKCU\...\Lxss`) and streams state, progress and log to the UI with Server-Sent Events. Settings, images and backups are stored in `~/.wsl-config/data.json` (override with `WSLCONFIG_HOME`).
- **client/** – React + Vite UI on `127.0.0.1:5313` (proxies `/api`).
- **desktop/** – Electron shell and NSIS installer.

## Usage

```sh
npm install
npm run dev       # API + Vite, open http://localhost:5313
npm test          # server unit tests
npm run typecheck
npm run desktop   # build and open in an Electron window
npm run dist      # Windows installer: release/WSL-Config-Setup-<version>.exe
```

For development without touching the real configuration, point the server somewhere else:

```powershell
$env:WSLCONFIG_HOME = 'C:\temp\wsl-config'          # data.json, default folders
$env:WSLCONFIG_FILE = 'C:\temp\wsl-config\.wslconfig' # instead of %UserProfile%\.wslconfig
npm run dev
```

## Tabs

### Máquinas

Every registered distro with its state, WSL version and disk size; start, stop, open a terminal (Windows Terminal, or a console) and open its files in Explorer (`\\wsl.localhost\<name>`). The distro screen adds:

- **Disco**: size of the `ext4.vhdx` on Windows and the space used inside Linux; **resize** and **move** to another folder.
- **Backups**: back up, save as an image, **duplicate** (export + import under a new name).
- **Usuário padrão**: chosen from the users that exist in the distro (`wsl --manage --set-default-user`). When `wsl.conf` has `[user] default`, which wins over it, that key is updated too.
- **wsl.conf**: form for systemd, boot command, automount, hostname, `/etc/hosts` and `resolv.conf` generation, interop and Windows PATH, timezone; or raw text. The previous file is kept as `/etc/wsl.conf.bak`. The distro shows *reiniciar* until it is stopped and started again.
- **Excluir** (`wsl --unregister`), confirmed by typing the distro name.

Reading the inside of a distro (users, disk usage, `wsl.conf`) needs it running, so a stopped distro is only started when you ask.

### Recursos

`%UserProfile%\.wslconfig`: memory, processors, swap, swap file, default disk size of new distros, idle timeout, memory reclaim, networking mode, DNS tunneling, firewall, proxy, localhost forwarding, WSLg, nested virtualization and kernel parameters. Every field can be left at **Padrão do WSL**, which removes the key instead of writing the default. The ceilings come from this PC (RAM and logical processors).

Only the keys you change are rewritten: comments, unknown keys, the BOM and the line endings stay as they were, so the settings WSL-Vpn depends on (`networkingMode=NAT`, `dnsTunneling=false`, `autoProxy=false`) are left alone unless you change them. The last 10 versions are kept in `~/.wsl-config/wslconfig-history`. Changes apply after **Reiniciar o WSL** (`wsl --shutdown`), which closes every distro, a connected WSL-Vpn included.

> Resources can't be limited per distro: WSL 2 runs every distro in the same VM, so the limits are for all of them together.

### Imagens

Root filesystems (`.tar`, `.tar.gz`, `.tar.xz`) and disks (`.vhdx`) that new distros are created from: add a file from disk (it stays where it is), download one (https, e.g. the official Alpine/Arch/Fedora rootfs) or save a configured distro as an image. *Criar distro* imports it (`wsl --import`) into `<distros folder>\<name>` or a folder you choose.

*Nova distro* (Máquinas) also installs from the online catalog (`wsl --install --web-download --no-launch`); the first terminal asks for the Linux user.

### Backups

Exports grouped by distro (`wsl --export`, `tar.gz` by default). A backup can be restored **as a new distro** or **replacing** the original (unregister + import under the same name and folder, confirmed by typing the name). The backup file is never deleted by a restore, so a failed one can be retried.

The gear icon sets the folders for new distros, backups and images, and the default backup format.

## Disk operations and the WSL VM

The WSL 2 VM keeps the `ext4.vhdx` of every distro that ran **attached until the whole VM shuts down**; stopping the distro is not enough (`ERROR_SHARING_VIOLATION`). Moving, resizing and exporting as `vhdx` touch that file, so while the VM is up (any distro running, or the VM still idling) the app asks to **shut WSL down first**, listing the distros that will be closed. `tar`/`tar.gz`/`tar.xz` backups and duplicates work with everything running.

Sparse disks are not offered: WSL 2.7 disabled them over possible data corruption (`--set-sparse` needs `--allow-unsafe`).

## Security

- The local API only accepts requests to `localhost`, and state-changing requests must carry the `x-wsl-config` header, so other websites can't drive it.
- Values reach `wsl.exe` as separate arguments, never through a shell; commands inside a distro use `wsl --exec` with a fixed script, and `wsl.conf` content goes through stdin.
- Deleting a distro and replacing it with a backup require typing its name.
- File and folder pickers are the native Windows dialogs (PowerShell), since a web page can't learn real paths.
