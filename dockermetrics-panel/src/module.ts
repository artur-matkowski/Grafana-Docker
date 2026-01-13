import { PanelPlugin } from '@grafana/data';
import { SimpleOptions } from './types';
import { SimplePanel } from './components/SimplePanel';

export const plugin = new PanelPlugin<SimpleOptions>(SimplePanel).setPanelOptions((builder) => {
  return builder
    .addTextInput({
      path: 'apiUrl',
      name: 'Collector API URL',
      description: 'URL of the Docker Metrics Collector API (e.g., http://localhost:5000)',
      defaultValue: 'http://localhost:5000',
      category: ['Connection'],
    })
    .addTextInput({
      path: 'containerId',
      name: 'Container ID',
      description: 'Docker container ID to display metrics for (full 64-char ID)',
      defaultValue: '',
      category: ['Connection'],
    })
    .addBooleanSwitch({
      path: 'showMemory',
      name: 'Show Memory',
      description: 'Display memory usage metrics',
      defaultValue: true,
      category: ['Metrics'],
    })
    .addBooleanSwitch({
      path: 'showCpu',
      name: 'Show CPU',
      description: 'Display CPU usage metrics',
      defaultValue: true,
      category: ['Metrics'],
    })
    .addBooleanSwitch({
      path: 'showNetwork',
      name: 'Show Network',
      description: 'Display network I/O metrics',
      defaultValue: false,
      category: ['Metrics'],
    });
});
