import { PanelPlugin } from '@grafana/data';
import { SimpleOptions } from './types';
import { SimplePanel } from './components/SimplePanel';

export const plugin = new PanelPlugin<SimpleOptions>(SimplePanel).setPanelOptions((builder) => {
  return builder
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
