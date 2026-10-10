import { useState } from 'react';
import type { AppData, LogEntry, PanelState } from '../types';
import { DistroDialog, type DistroDialogKind } from './DistroDialogs';
import { DistroList } from './DistroList';
import { DistroPanel } from './DistroPanel';
import { LogView } from './LogView';
import { NewDistroDialog } from './NewDistroDialog';

interface MachinesViewProps {
  data: AppData;
  state: PanelState;
  log: LogEntry[];
  onNotify: (kind: 'ok' | 'error', message: string) => void;
}

/** Screen 1 (list) and screen 2 (one distro), with the activity log beside them. */
export function MachinesView({ data, state, log, onNotify }: MachinesViewProps) {
  const [openName, setOpenName] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DistroDialogKind | 'new' | null>(null);
  const open = state.distros.find((distro) => distro.name === openName) ?? null;

  const started = (message: string) => {
    setDialog(null);
    onNotify('ok', message);
    if (dialog === 'delete') setOpenName(null);
  };

  return (
    <div className="panel-layout">
      <div className="panel-main">
        {open ? (
          <DistroPanel
            distro={open}
            data={data}
            state={state}
            onBack={() => setOpenName(null)}
            onDialog={setDialog}
            onNotify={onNotify}
          />
        ) : (
          <DistroList
            state={state}
            onOpen={(distro) => setOpenName(distro.name)}
            onNew={() => setDialog('new')}
            onError={(message) => onNotify('error', message)}
          />
        )}
      </div>

      <LogView entries={log} />

      {dialog === 'new' && <NewDistroDialog settings={data.settings} images={data.images} onClose={() => setDialog(null)} onStarted={started} />}
      {dialog && dialog !== 'new' && open && (
        <DistroDialog
          kind={dialog}
          distro={open}
          settings={data.settings}
          vmRunning={state.vm.running}
          runningDistros={state.distros.filter((distro) => distro.running).map((distro) => distro.name)}
          onClose={() => setDialog(null)}
          onStarted={started}
        />
      )}
    </div>
  );
}
