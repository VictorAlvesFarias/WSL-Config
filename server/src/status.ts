import { say, state, updateState, type Distro } from './events.ts';
import { fileSize, listAll, listRunning, readRegistry, vmMemory, type RegistryDistro } from './wsl.ts';

const registryMaxAge = 30_000;

let registry: { defaultId: string | null; distros: RegistryDistro[] } | null = null;
let registryAt = 0;
let refreshing: Promise<void> | null = null;
let warned = false;

/**
 * Updates the distro list and the VM status. The registry read goes through PowerShell (~1 s), so
 * it is cached and only re-read when the set of names changes, when forced, or every 30 s.
 */
export function refreshStatus(force = false): Promise<void> {
  if (refreshing) return force ? refreshing.then(() => refreshStatus(true)) : refreshing;
  refreshing = doRefresh(force).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function doRefresh(force: boolean): Promise<void> {
  try {
    const [names, running, memory] = await Promise.all([listAll(), listRunning(), vmMemory().catch(() => null)]);
    const known = registry?.distros.map((d) => d.name).sort().join('|');
    const stale = force || !registry || Date.now() - registryAt > registryMaxAge || known !== [...names].sort().join('|');
    if (stale) {
      registry = await readRegistry();
      registryAt = Date.now();
    }

    const runningSet = new Set(running);
    const distros: Distro[] = await Promise.all(
      (registry?.distros ?? []).map(async (item) => ({
        ...item,
        running: runningSet.has(item.name),
        isDefault: item.id === registry?.defaultId,
        vhdSize: await fileSize(item.vhdPath),
      })),
    );
    distros.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));

    // The VM can stay up with no distro running (vmIdleTimeout), still holding their disks: the
    // vmmemWSL process is what tells whether it is really off.
    const vmRunning = running.length > 0 || memory !== null;
    // A stopped distro (or VM) has picked up its new configuration on the next start.
    const pending = {
      vm: state.pending.vm && vmRunning,
      distros: state.pending.distros.filter((name) => runningSet.has(name)),
    };

    warned = false;
    updateState({
      distros,
      pending,
      vm: { running: vmRunning, memory },
      reachable: true,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (!warned) say(`Aviso: não foi possível consultar o WSL (${(error as Error).message})`, 'warn');
    warned = true;
    updateState({ reachable: false, checkedAt: new Date().toISOString() });
  }
}

export function findDistro(name: string): Distro | undefined {
  return state.distros.find((distro) => distro.name.toLowerCase() === name.toLowerCase());
}
