import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import express, { type ErrorRequestHandler, type Request } from 'express';
import { wslConfFields, wslConfigFields } from './configModel.ts';
import { pickFile, pickFolder } from './dialogs.ts';
import * as distros from './distros.ts';
import { dataChanged, listenerCount, recentLog, say, state, subscribe } from './events.ts';
import { startJob } from './jobs.ts';
import * as library from './library.ts';
import { paths } from './paths.ts';
import { refreshStatus } from './status.ts';
import { mutate, type Settings } from './store.ts';
import {
  configText,
  confirmed,
  diskSizeGb,
  distroName,
  exportFormat,
  fieldValues,
  httpsUrl,
  linuxUser,
  text,
  windowsPath,
  type Body,
} from './validation.ts';
import { hostInfo, readWslConfig, saveWslConfigText, saveWslConfigValues } from './wslconfig.ts';
import * as wsl from './wsl.ts';

// The API creates, deletes and reconfigures distros, so only same-machine requests are accepted
// (blocks DNS rebinding), and every state-changing request must carry a custom header that
// cross-site pages can't send without a CORS preflight (which is never granted).
const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const body = (req: Request) => (req.body ?? {}) as Body;
const name = (req: Request) => distroName(req.params.name);
const location = (req: Request) => windowsPath(body(req).location, 'Pasta de instalação', { required: false });
/** The user agreed to shut WSL down so a disk can be detached (see requireDetachedDisks). */
const shutdownFirst = (req: Request) => body(req).shutdownFirst === true;

function parseSettings(input: Body): Settings {
  return {
    distrosDir: windowsPath(input.distrosDir, 'Pasta das distros'),
    backupsDir: windowsPath(input.backupsDir, 'Pasta dos backups'),
    imagesDir: windowsPath(input.imagesDir, 'Pasta das imagens'),
    backupFormat: exportFormat(input.backupFormat),
  };
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.use('/api', (req, res, next) => {
    const safeMethod = req.method === 'GET' || req.method === 'HEAD';
    if (!allowedHosts.has(req.hostname) || (!safeMethod && req.get('x-wsl-config') !== '1')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  });

  // Live state, log and job results (Server-Sent Events).
  app.get('/api/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send('state', state);
    send('history', recentLog());
    const unsubscribe = subscribe(send);
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
    void refreshStatus(true);
  });

  // ------------------------------------------------------------- data/system
  app.get('/api/data', async (_req, res) => {
    res.json(await library.publicData());
  });

  app.put('/api/settings', async (req, res) => {
    const settings = parseSettings(body(req));
    for (const folder of [settings.distrosDir, settings.backupsDir, settings.imagesDir]) await mkdir(folder, { recursive: true });
    await mutate((data) => {
      data.settings = settings;
    });
    dataChanged();
    res.json(settings);
  });

  app.get('/api/system', async (_req, res) => {
    res.json({ host: hostInfo(), wsl: await wsl.wslVersion(), dataDir: paths.dataDir });
  });

  app.get('/api/online', async (_req, res) => {
    res.json(await wsl.onlineDistros());
  });

  app.post('/api/system/shutdown', (_req, res) => {
    startJob([], 'Desligando o WSL', async () => {
      await wsl.shutdown();
      return 'WSL desligado. As distros sobem de novo quando forem usadas.';
    }, { global: true });
    res.status(202).json({ ok: true });
  });

  app.post('/api/dialog/file', async (req, res) => {
    res.json({ path: await pickFile(body(req).kind === 'image' ? 'image' : 'any') });
  });

  app.post('/api/dialog/folder', async (_req, res) => {
    res.json({ path: await pickFolder() });
  });

  // ------------------------------------------------------------- .wslconfig
  app.get('/api/wslconfig', async (_req, res) => {
    res.json(await readWslConfig());
  });

  app.put('/api/wslconfig', async (req, res) => {
    await saveWslConfigValues(fieldValues(body(req), wslConfigFields));
    res.json(await readWslConfig());
  });

  app.put('/api/wslconfig/raw', async (req, res) => {
    await saveWslConfigText(configText(body(req).text, 'Conteúdo do .wslconfig'));
    res.json(await readWslConfig());
  });

  // ------------------------------------------------------------- distros
  app.post('/api/distros/install', async (req, res) => {
    const distro = text(body(req), 'distro', 'Distro', { required: true, max: 80, pattern: /^[A-Za-z0-9._-]+$/ });
    await distros.installOnline(distro, distroName(body(req).name), location(req));
    res.status(202).json({ ok: true });
  });

  app.post('/api/distros/import', async (req, res) => {
    const file = windowsPath(body(req).file, 'Arquivo');
    library.formatOf(file);
    await distros.importFile(distroName(body(req).name), file, location(req));
    res.status(202).json({ ok: true });
  });

  app.get('/api/distros/:name/inside', async (req, res) => {
    res.json(await distros.inside(name(req), req.query.start === '1'));
  });

  app.post('/api/distros/:name/start', async (req, res) => {
    await distros.start(name(req));
    res.json({ ok: true });
  });

  app.post('/api/distros/:name/stop', async (req, res) => {
    await distros.stop(name(req));
    res.json({ ok: true });
  });

  app.post('/api/distros/:name/default', async (req, res) => {
    await distros.makeDefault(name(req));
    res.json({ ok: true });
  });

  app.post('/api/distros/:name/terminal', async (req, res) => {
    await distros.openTerminal(name(req));
    res.json({ ok: true });
  });

  app.post('/api/distros/:name/files', async (req, res) => {
    await distros.openFiles(name(req));
    res.json({ ok: true });
  });

  app.put('/api/distros/:name/wslconf', async (req, res) => {
    await distros.saveWslConf(name(req), { values: fieldValues(body(req), wslConfFields) });
    res.json({ ok: true });
  });

  app.put('/api/distros/:name/wslconf/raw', async (req, res) => {
    await distros.saveWslConf(name(req), { text: configText(body(req).text, 'Conteúdo do wsl.conf') });
    res.json({ ok: true });
  });

  app.put('/api/distros/:name/user', async (req, res) => {
    await distros.setDefaultUser(name(req), linuxUser(body(req).user));
    res.json({ ok: true });
  });

  app.post('/api/distros/:name/move', async (req, res) => {
    await distros.move(name(req), windowsPath(body(req).location, 'Nova pasta'), shutdownFirst(req));
    res.status(202).json({ ok: true });
  });

  app.post('/api/distros/:name/resize', async (req, res) => {
    await distros.resize(name(req), diskSizeGb(body(req).sizeGb), shutdownFirst(req));
    res.status(202).json({ ok: true });
  });

  app.post('/api/distros/:name/duplicate', async (req, res) => {
    await distros.duplicate(name(req), distroName(body(req).newName, 'Nome da cópia'), location(req));
    res.status(202).json({ ok: true });
  });

  app.post('/api/distros/:name/backup', async (req, res) => {
    const format = exportFormat(body(req).format);
    await library.createBackup(name(req), format, text(body(req), 'note', 'Observação', { max: 200 }), shutdownFirst(req));
    res.status(202).json({ ok: true });
  });

  app.post('/api/distros/:name/image', async (req, res) => {
    const format = exportFormat(body(req).format);
    await library.imageFromDistro(name(req), text(body(req), 'imageName', 'Nome da imagem', { max: 80 }), format, shutdownFirst(req));
    res.status(202).json({ ok: true });
  });

  app.delete('/api/distros/:name', async (req, res) => {
    const distro = await distros.requireDistro(name(req));
    confirmed(body(req), distro.name);
    await distros.remove(distro.name);
    res.status(202).json({ ok: true });
  });

  // ------------------------------------------------------------- images
  app.post('/api/images', async (req, res) => {
    const file = windowsPath(body(req).file, 'Arquivo');
    res.status(201).json(await library.registerImage(file, text(body(req), 'name', 'Nome', { max: 80 })));
  });

  app.post('/api/images/download', async (req, res) => {
    await library.downloadImage(httpsUrl(body(req).url), text(body(req), 'name', 'Nome', { max: 80 }));
    res.status(202).json({ ok: true });
  });

  app.post('/api/images/:id/create', async (req, res) => {
    await library.createFromImage(req.params.id, distroName(body(req).name), location(req));
    res.status(202).json({ ok: true });
  });

  app.post('/api/images/:id/reveal', async (req, res) => {
    await library.revealFile((await library.findImage(req.params.id)).file);
    res.json({ ok: true });
  });

  app.delete('/api/images/:id', async (req, res) => {
    await library.deleteImage(req.params.id, body(req).deleteFile === true);
    res.json({ ok: true });
  });

  // ------------------------------------------------------------- backups
  app.post('/api/backups/:id/restore', async (req, res) => {
    if (body(req).mode === 'replace') {
      const backup = await library.findBackup(req.params.id);
      confirmed(body(req), backup.distro);
      await library.restoreReplacing(backup.id);
    } else {
      await library.restoreAsNew(req.params.id, distroName(body(req).name), location(req));
    }
    res.status(202).json({ ok: true });
  });

  app.post('/api/backups/:id/reveal', async (req, res) => {
    await library.revealFile((await library.findBackup(req.params.id)).file);
    res.json({ ok: true });
  });

  app.delete('/api/backups/:id', async (req, res) => {
    await library.deleteBackup(req.params.id);
    res.json({ ok: true });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  if (existsSync(paths.clientDistDir)) {
    app.use(express.static(paths.clientDistDir));
  }

  app.use(errorHandler);
  return app;
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error.name === 'AbortError' || res.headersSent) return;
  const status = typeof error.status === 'number' ? error.status : 500;
  if (status >= 500) say(`Erro: ${error.message}`, 'error');
  res.status(status).json({ error: error.message ?? 'Erro inesperado' });
};

/** Polls the distros every few seconds while someone is watching (the window is open). */
function startPolling(): void {
  setInterval(() => {
    if (listenerCount() > 0) void refreshStatus();
  }, 4000);
}

/** Starts the API (and the built UI, when present) on 127.0.0.1. Port 0 picks a free port. */
export async function startServer(port: number): Promise<{ port: number; close: () => void }> {
  startPolling();
  return new Promise((resolve, reject) => {
    const server = createApp().listen(port, '127.0.0.1', (error?: Error) => {
      if (error) return reject(error);
      resolve({ port: (server.address() as AddressInfo).port, close: () => server.close() });
    });
  });
}
