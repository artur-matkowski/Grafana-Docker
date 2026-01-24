import { PanelPlugin } from '@grafana/data';
import { SimpleOptions, DEFAULT_METRICS, DEFAULT_HOSTS } from './types';
import { SimplePanel } from './components/SimplePanel';
import { HostManagerEditor } from './components/HostManagerEditor';
import { ContainerSelectorEditor } from './components/ContainerSelectorEditor';
import { MetricSelectorEditor } from './components/MetricSelectorEditor';

export const plugin = new PanelPlugin<SimpleOptions>(SimplePanel).setPanelOptions((builder) => {
  console.warn('[DockerMetrics:module] setPanelOptions called, registering options...');
  return builder
    .addCustomEditor({
      id: 'hostManager',
      path: 'hosts',
      name: 'Docker Metrics Agents',
      description: 'Configure agents running on each Docker host',
      category: ['Agents'],
      editor: HostManagerEditor,
      defaultValue: DEFAULT_HOSTS,
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
    })
    .addBooleanSwitch({
      path: 'stripMode',
      name: 'Strip Mode',
      description: 'Hide host headers and show all containers in a single grid (useful for small panels)',
      defaultValue: false,
      category: ['Layout'],
      showIf: (config) => {
        console.warn('[DockerMetrics:module] stripMode showIf called, config:', config);
        return true;
      },
    })
    .addNumberInput({
      path: 'containersPerRow',
      name: 'Containers per row',
      description: 'Number of container cards per row (0 = auto)',
      defaultValue: 0,
      category: ['Layout'],
      settings: {
        min: 0,
        max: 10,
        integer: true,
      },
    })
    .addNumberInput({
      path: 'metricsPerRow',
      name: 'Metrics per row',
      description: 'Number of metrics per row within each container card (0 = auto)',
      defaultValue: 0,
      category: ['Layout'],
      settings: {
        min: 0,
        max: 8,
        integer: true,
      },
    })
    .addBooleanSwitch({
      path: 'enableContainerControls',
      name: 'Enable Container Controls',
      description: 'Show start/stop/restart/pause buttons for each container',
      defaultValue: false,
      category: ['Controls'],
    })
    .addNumberInput({
      path: 'refreshInterval',
      name: 'Refresh Interval',
      description: 'How often to fetch new metrics (in seconds)',
      defaultValue: 10,
      category: ['Data'],
      settings: {
        min: 1,
        max: 300,
        integer: true,
      },
    });
});
