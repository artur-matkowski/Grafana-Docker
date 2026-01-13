import { PanelPlugin } from '@grafana/data';
import { SimpleOptions } from './types';
import { SimplePanel } from './components/SimplePanel';
import { HostManagerEditor } from './components/HostManagerEditor';
import { ContainerSelectorEditor } from './components/ContainerSelectorEditor';

export const plugin = new PanelPlugin<SimpleOptions>(SimplePanel).setPanelOptions((builder) => {
  return builder
    .addTextInput({
      path: 'apiUrl',
      name: 'Collector API URL',
      description: 'URL of the Docker Metrics Collector API (e.g., http://localhost:5000)',
      defaultValue: 'http://localhost:5000',
      category: ['Connection'],
    })
    .addCustomEditor({
      id: 'hostManager',
      path: 'hostConfig',
      name: 'Docker Hosts',
      description: 'Manage Docker hosts to collect metrics from',
      category: ['Docker Hosts'],
      editor: HostManagerEditor,
    })
    .addBooleanSwitch({
      path: 'showAllContainers',
      name: 'Show All Containers',
      description: 'Automatically include all containers (including new ones)',
      defaultValue: true,
      category: ['Containers'],
    })
    .addCustomEditor({
      id: 'containerSelector',
      path: 'containerIds',
      name: 'Select Containers',
      description: 'Choose which containers to display metrics for',
      category: ['Containers'],
      editor: ContainerSelectorEditor,
    })
    .addBooleanSwitch({
      path: 'showMemory',
      name: 'Show Memory',
      description: 'Display memory usage metrics',
      defaultValue: true,
      category: ['Display'],
    })
    .addBooleanSwitch({
      path: 'showCpu',
      name: 'Show CPU',
      description: 'Display CPU usage metrics',
      defaultValue: true,
      category: ['Display'],
    })
    .addBooleanSwitch({
      path: 'showNetwork',
      name: 'Show Network',
      description: 'Display network I/O metrics',
      defaultValue: false,
      category: ['Display'],
    });
});
