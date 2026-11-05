import type { AppData, LogEntry, PanelState } from '../types';
import type { DistroDialogKind } from './DistroDialogs';
import { DistroList } from './DistroList';
import { DistroPanel } from './DistroPanel';
import { WithLog } from './Fields';
import { Page } from './Shell';

interface MachinesViewProps {
  data: AppData;
  state: PanelState;
  log: LogEntry[];
  openName: string | null;
  onOpen: (name: string | null) => void;
  onDialog: (kind: DistroDialogKind | 'new') => void;
  onNotify: (kind: 'ok' | 'error', message: string) => void;
}

/** Screen 1 (list) and screen 2 (one distro), with the activity log beside them. */
export function MachinesView({ data, state, log, openName, onOpen, onDialog, onNotify }: MachinesViewProps) {
  const open = state.distros.find((distro) => distro.name === openName) ?? null;

  return (
    <WithLog log={log}>
      <Page>
        {open ? (
          <DistroPanel distro={open} data={data} state={state} onBack={() => onOpen(null)} onDialog={onDialog} onNotify={onNotify} />
        ) : (
          <DistroList state={state} onOpen={(distro) => onOpen(distro.name)} onNew={() => onDialog('new')} onError={(message) => onNotify('error', message)} />
        )}
      </Page>
    </WithLog>
  );
}
