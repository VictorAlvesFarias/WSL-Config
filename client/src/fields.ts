import type { FieldDefinition } from './components/Fields';

export interface FieldGroup {
  title: string;
  description?: string;
  fields: FieldDefinition[];
}

const yes = 'sim';

/** %UserProfile%\.wslconfig. The ceilings come from the host, see ResourcesView. */
export const wslConfigGroups: FieldGroup[] = [
  {
    title: 'Recursos da VM',
    description: 'Todas as distros WSL 2 rodam na mesma VM: estes limites valem para o conjunto delas.',
    fields: [
      { name: 'memory', label: 'Memória', kind: 'size', unit: 'GB', min: 0.25, step: 0.5, defaultText: '50% da memória do PC' },
      { name: 'processors', label: 'Processadores', kind: 'int', min: 1, defaultText: 'todos os processadores lógicos' },
      { name: 'swap', label: 'Swap', kind: 'size', unit: 'GB', min: 0, step: 0.5, help: '0 desativa o swap.', defaultText: '25% da memória do PC' },
      { name: 'swapFile', label: 'Arquivo de swap', kind: 'text', placeholder: '%UserProfile%\\AppData\\Local\\Temp\\swap.vhdx', defaultText: 'na pasta temporária' },
      { name: 'defaultVhdSize', label: 'Tamanho máximo do disco de novas distros', kind: 'size', unit: 'GB', min: 1, defaultText: '1 TB' },
      { name: 'vmIdleTimeout', label: 'Desligar a VM ociosa após', kind: 'int', min: -1, step: 1000, help: 'Em milissegundos; -1 nunca desliga.', defaultText: '60000 (1 minuto)' },
    ],
  },
  {
    title: 'Memória',
    fields: [
      {
        name: 'autoMemoryReclaim',
        label: 'Devolver memória ao Windows',
        kind: 'enum',
        options: [
          { value: 'gradual', label: 'Gradual' },
          { value: 'dropCache', label: 'Liberar cache de uma vez' },
          { value: 'disabled', label: 'Desativado' },
        ],
        help: 'Libera para o Windows a memória que o Linux usou como cache.',
        defaultText: 'desativado',
      },
    ],
  },
  {
    title: 'Rede',
    description: 'O WSL-Vpn depende de NAT com túnel de DNS desligado: não troque se usa a VPN isolada.',
    fields: [
      {
        name: 'networkingMode',
        label: 'Modo de rede',
        kind: 'enum',
        options: [
          { value: 'NAT', label: 'NAT (rede própria)' },
          { value: 'mirrored', label: 'Espelhado (mesma rede do Windows)' },
          { value: 'virtioproxy', label: 'VirtioProxy' },
          { value: 'none', label: 'Sem rede' },
        ],
        defaultText: 'NAT',
      },
      { name: 'dnsTunneling', label: 'Túnel de DNS', kind: 'bool', defaultText: yes },
      { name: 'firewall', label: 'Firewall do Windows (Hyper-V)', kind: 'bool', defaultText: yes },
      { name: 'autoProxy', label: 'Usar o proxy do Windows', kind: 'bool', defaultText: yes },
      { name: 'localhostForwarding', label: 'Encaminhar portas para localhost', kind: 'bool', defaultText: yes },
    ],
  },
  {
    title: 'Avançado',
    fields: [
      { name: 'guiApplications', label: 'Aplicativos gráficos (WSLg)', kind: 'bool', defaultText: yes },
      { name: 'nestedVirtualization', label: 'Virtualização aninhada', kind: 'bool', defaultText: yes },
      { name: 'kernelCommandLine', label: 'Parâmetros do kernel', kind: 'text', wide: true, defaultText: 'nenhum' },
    ],
  },
];

/** /etc/wsl.conf inside a distro. */
export const wslConfGroups: FieldGroup[] = [
  {
    title: 'Inicialização',
    fields: [
      { name: 'systemd', label: 'systemd', kind: 'bool', help: 'Necessário para serviços (docker, snap...).', defaultText: 'depende da distro' },
      { name: 'bootCommand', label: 'Comando ao iniciar', kind: 'text', wide: true, placeholder: 'service docker start', help: 'Roda como root a cada boot.', defaultText: 'nenhum' },
    ],
  },
  {
    title: 'Discos do Windows',
    fields: [
      { name: 'automountEnabled', label: 'Montar C:, D:...', kind: 'bool', defaultText: yes },
      { name: 'automountRoot', label: 'Pasta de montagem', kind: 'text', placeholder: '/mnt/', defaultText: '/mnt/' },
      { name: 'automountOptions', label: 'Opções de montagem', kind: 'text', placeholder: 'metadata,umask=22,fmask=11', defaultText: 'nenhuma' },
      { name: 'mountFsTab', label: 'Montar o /etc/fstab', kind: 'bool', defaultText: yes },
    ],
  },
  {
    title: 'Rede',
    fields: [
      { name: 'hostname', label: 'Hostname', kind: 'text', defaultText: 'o nome do PC' },
      { name: 'generateHosts', label: 'Gerar /etc/hosts', kind: 'bool', defaultText: yes },
      { name: 'generateResolvConf', label: 'Gerar /etc/resolv.conf', kind: 'bool', defaultText: yes },
    ],
  },
  {
    title: 'Integração com o Windows',
    fields: [
      { name: 'interopEnabled', label: 'Rodar programas do Windows', kind: 'bool', defaultText: yes },
      { name: 'appendWindowsPath', label: 'PATH do Windows no Linux', kind: 'bool', defaultText: yes },
      { name: 'useWindowsTimezone', label: 'Fuso horário do Windows', kind: 'bool', defaultText: yes },
    ],
  },
];
