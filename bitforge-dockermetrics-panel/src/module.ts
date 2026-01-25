import { PanelPlugin } from '@grafana/data';
import { SimpleOptions, DEFAULT_METRICS } from './types';
import { SimplePanel } from './components/SimplePanel';
import { ContainerSelectorEditor } from './components/ContainerSelectorEditor';
import { MetricSelectorEditor } from './components/MetricSelectorEditor';
import { DataSourceEditor } from './components/DataSourceEditor';

export const plugin = new PanelPlugin<SimpleOptions>(SimplePanel).setPanelOptions((builder) => {
  return builder
    .addCustomEditor({
      id: 'dataSourceSelector',
      path: 'dataSourceConfig',
      name: 'Data Source',
      description: 'Select the Docker Metrics data source to fetch metrics from',
      category: ['Data Source'],
      editor: DataSourceEditor,
      defaultValue: { useDataSource: false },
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
