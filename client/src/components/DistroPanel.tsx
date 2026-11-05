import {
  Archive,
  ArrowLeft,
  Copy,
  FolderOpen,
  HardDrive,
  Image,
  LoaderCircle,
  Play,
  Power,
  Save,
  SlidersHorizontal,
  Square,
  SquareTerminal,
  Star,
  Trash2,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import { wslConfGroups } from '../fields';
import { bytes, dateTime } from '../format';
import type { AppData, Distro, DistroInside, PanelState } from '../types';
import { ConfigEditor } from './ConfigEditor';
import type { DistroDialogKind } from './DistroDialogs';
import { jobFor } from './DistroList';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Select } from './ui/Input';
import { Panel, PanelHeader } from './ui/Panel';
import { Switch } from './ui/Switch';
import { Tip } from './ui/Tip';

interface DistroPanelProps {
  distro: Distro;
  data: AppData;
  state: PanelState;
  onBack: () => void;
  onDialog: (kind: DistroDialogKind) => void;
  onNotify: (kind: 'ok' | 'error', message: string) => void;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

/** Screen 2: one distro. What lives inside it (users, wsl.conf, disk usage) needs it running. */
export function DistroPanel({ distro, data, state, onBack, onDialog, onNotify }: DistroPanelProps) {
  const [inside, setInside] = useState<DistroInside | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [user, setUser] = useState('');
  const job = jobFor(state, distro);
  const busy = Boolean(job) || Boolean(acting);
  const pending = state.pending.distros.includes(distro.name);
  const backups = data.backups.filter((backup) => backup.distro === distro.name).slice(0, 5);

  const load = useCallback(
    async (start: boolean) => {
      setLoading(true);
      try {
        const result = await api.inside(distro.name, start);
        setInside(result);
        setUser(result.users.find((item) => item.uid === distro.defaultUid)?.name ?? '');
      } catch (error) {
        if (start) onNotify('error', (error as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [distro.name, distro.defaultUid, onNotify],
  );

  // Reads the inside right away only when that doesn't boot the distro. Keyed on the name alone:
  // the running flag flips on every start/stop and must not reload (or clear) the form.
  useEffect(() => {
    setInside(null);
    if (distro.running) void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distro.name]);

  async function act(label: string, action: () => Promise<unknown>, okMessage?: string) {
    setActing(label);
    try {
      await action();
      if (okMessage) onNotify('ok', okMessage);
    } catch (error) {
      onNotify('error', (error as Error).message);
    } finally {
      setActing(null);
    }
  }

  const restart = () =>
    act(
      'restart',
      async () => {
        await api.stop(distro.name);
        await api.start(distro.name);
        await load(false);
      },
      `${distro.name} reiniciada`,
    );

  const used = inside?.disk ? inside.disk.used : null;

  return (
    <>
      <Panel className="overflow-hidden">
        <header className="flex items-center gap-2 border-b border-line px-2 py-2">
          <Tip content="Voltar para as máquinas">
            <Button size="icon" variant="ghost" className="size-8" onClick={onBack} aria-label="Voltar">
              <ArrowLeft />
            </Button>
          </Tip>
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 truncate text-[15px] font-semibold">
              {distro.name}
              {distro.isDefault && (
                <Badge tone="accent">
                  <Star /> Padrão
                </Badge>
              )}
            </h2>
            <p className="truncate text-[12px] text-fg-muted">
              {inside?.os || [distro.flavor, distro.osVersion].filter(Boolean).join(' ') || 'Linux'} · WSL {distro.version}
              {inside?.kernel && ` · kernel ${inside.kernel}`}
            </p>
          </div>
          <Badge tone={job ? 'warn' : distro.running ? 'ok' : 'neutral'} className="mr-2">
            {job ? 'Ocupada' : distro.running ? 'Rodando' : 'Parada'}
          </Badge>
        </header>

        {job && (
          <div className="flex items-center gap-2 border-b border-line bg-warn-soft px-4 py-2 text-[12.5px] text-warn">
            <LoaderCircle className="size-3.5 animate-spin" />
            {job.label}…
          </div>
        )}
        {pending && (
          <div className="flex items-center gap-3 border-b border-line bg-warn-soft px-4 py-2 text-[12.5px] text-warn">
            <TriangleAlert className="size-3.5 shrink-0" />
            <span className="flex-1">O wsl.conf mudou: reinicie a distro para aplicar.</span>
            <Button size="sm" onClick={() => void restart()} disabled={busy}>
              {acting === 'restart' ? 'Reiniciando…' : 'Reiniciar distro'}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2 px-4 py-3">
          {distro.running ? (
            <Button onClick={() => void act('stop', () => api.stop(distro.name))} disabled={busy}>
              <Square />
              {acting === 'stop' ? 'Parando…' : 'Parar'}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() =>
                void act('start', async () => {
                  await api.start(distro.name);
                  await load(false);
                })
              }
              disabled={busy}
            >
              <Play />
              {acting === 'start' ? 'Iniciando…' : 'Iniciar'}
            </Button>
          )}
          <Button onClick={() => void act('terminal', () => api.terminal(distro.name))} disabled={busy}>
            <SquareTerminal />
            Terminal
          </Button>
          <Button onClick={() => void act('files', () => api.files(distro.name))} disabled={busy}>
            <FolderOpen />
            Arquivos
          </Button>
          {!distro.isDefault && (
            <Button onClick={() => void act('default', () => api.makeDefault(distro.name), `${distro.name} é a distro padrão`)} disabled={busy}>
              <Star />
              Tornar padrão
            </Button>
          )}
        </div>

        <label className="flex items-center gap-3 border-t border-line px-4 py-3">
          <Power className="size-4 shrink-0 text-fg-muted" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium">Iniciar com o Windows</span>
            <span className="block text-[12px] text-fg-muted">
              Sobe a distro quando você entra no Windows e a mantém rodando, sem abrir janela. Parar a distro vale até o próximo logon.
            </span>
          </span>
          <Switch
            checked={distro.autostart}
            disabled={busy}
            onCheckedChange={(enabled) =>
              void act('autostart', () => api.setAutostart(distro.name, enabled), enabled ? `${distro.name} vai iniciar com o Windows` : `${distro.name} não inicia mais com o Windows`)
            }
            aria-label="Iniciar com o Windows"
          />
        </label>
      </Panel>

      <div className="grid gap-5 md:grid-cols-2">
        <Panel className="flex flex-col">
          <PanelHeader icon={<HardDrive />} title="Disco" />
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 px-4 py-3 text-[12.5px]">
            <Fact label="No Windows">{distro.vhdPath ? bytes(distro.vhdSize) : 'WSL 1: arquivos soltos'}</Fact>
            <Fact label="Em uso no Linux">{used !== null ? `${bytes(used)} de ${bytes(inside?.disk?.total)}` : '—'}</Fact>
            <Fact label="Pasta">
              <span className="selectable font-mono text-[11.5px] break-all text-fg-muted">{distro.basePath}</span>
            </Fact>
          </dl>
          <footer className="mt-auto flex gap-2 border-t border-line px-4 py-2.5">
            <Button size="sm" onClick={() => onDialog('resize')} disabled={busy || distro.version !== 2}>
              Redimensionar
            </Button>
            <Button size="sm" onClick={() => onDialog('move')} disabled={busy}>
              Mover
            </Button>
          </footer>
        </Panel>

        <Panel className="flex flex-col">
          <PanelHeader icon={<Archive />} title="Backups" />
          <div className="px-4 py-3">
            {backups.length ? (
              <ul className="space-y-1 text-[12.5px]">
                {backups.map((backup) => (
                  <li key={backup.id} className="flex justify-between gap-3">
                    <span>{dateTime(backup.createdAt)}</span>
                    <span className="text-fg-muted">
                      {backup.format} · {bytes(backup.size)}
                      {!backup.exists && ' · arquivo apagado'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-fg-muted">Nenhum backup ainda.</p>
            )}
          </div>
          <footer className="mt-auto flex flex-wrap gap-2 border-t border-line px-4 py-2.5">
            <Button size="sm" variant="primary" onClick={() => onDialog('backup')} disabled={busy}>
              <Archive />
              Fazer backup
            </Button>
            <Button size="sm" onClick={() => onDialog('image')} disabled={busy}>
              <Image />
              Salvar como imagem
            </Button>
            <Button size="sm" onClick={() => onDialog('duplicate')} disabled={busy}>
              <Copy />
              Duplicar
            </Button>
          </footer>
        </Panel>
      </div>

      {inside ? (
        <>
          <Panel>
            <PanelHeader icon={<UserRound />} title="Usuário padrão" description="Usuário que o terminal e o wsl.exe usam ao entrar na distro." />
            <div className="flex gap-2 px-4 py-3">
              <Select className="max-w-sm" value={user} onChange={(e) => setUser(e.target.value)}>
                {!user && <option value="">—</option>}
                {inside.users.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name} (uid {item.uid})
                  </option>
                ))}
              </Select>
              <Button
                onClick={() => void act('user', () => api.setUser(distro.name, user), `Usuário padrão de ${distro.name}: ${user}`)}
                disabled={busy || !user || inside.users.find((item) => item.name === user)?.uid === distro.defaultUid}
              >
                <Save />
                Salvar
              </Button>
            </div>
          </Panel>

          <ConfigEditor
            groups={wslConfGroups}
            values={inside.values}
            text={inside.wslConf}
            fileLabel="/etc/wsl.conf"
            disabled={busy}
            onSave={async (changes) => {
              await api.saveWslConf(distro.name, changes).catch((error: Error) => {
                onNotify('error', error.message);
                throw error;
              });
              onNotify('ok', 'wsl.conf salvo');
              await load(false);
            }}
            onSaveText={async (text) => {
              await api.saveWslConfText(distro.name, text).catch((error: Error) => {
                onNotify('error', error.message);
                throw error;
              });
              onNotify('ok', 'wsl.conf salvo');
              await load(false);
            }}
          />
        </>
      ) : (
        <Panel>
          <PanelHeader icon={<SlidersHorizontal />} title="Configuração da distro (wsl.conf) e usuários" />
          <div className="flex items-center gap-3 px-4 py-3">
            <p className="flex-1 text-[12.5px] text-fg-muted">
              {distro.running ? 'Carregando…' : 'A distro está parada. Ler a configuração de dentro dela vai iniciá-la.'}
            </p>
            {!distro.running && (
              <Button onClick={() => void load(true)} disabled={loading || busy}>
                <Play />
                {loading ? 'Iniciando…' : 'Iniciar e carregar'}
              </Button>
            )}
          </div>
        </Panel>
      )}

      <Panel className="border-danger/30">
        <PanelHeader title={<span className="text-danger">Zona de perigo</span>} />
        <div className="flex items-center gap-3 px-4 py-3">
          <p className="flex-1 text-[12.5px] text-fg-muted">Excluir apaga o disco da distro. Faça um backup antes se quiser guardar algo.</p>
          <Button variant="danger" onClick={() => onDialog('delete')} disabled={busy}>
            <Trash2 />
            Excluir distro
          </Button>
        </div>
      </Panel>
    </>
  );
}
