import { PanelPlugin } from '@grafana/data';
import { SimpleOptions, DEFAULT_METRICS } from './types';
import { SimplePanel } from './components/SimplePanel';
import { HostManagerEditor } from './components/HostManagerEditor';
import { ContainerSelectorEditor } from './components/ContainerSelectorEditor';
import { MetricSelectorEditor } from './components/MetricSelectorEditor';

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
    .addCustomEditor({
      id: 'metricSelector',
      path: 'selectedMetrics',
      name: 'Display Metrics',
      description: 'Choose which metrics to show for each container',
      category: ['Display'],
      editor: MetricSelectorEditor,
      defaultValue: DEFAULT_METRICS,
    });
});
