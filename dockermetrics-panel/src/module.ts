import { PanelPlugin } from '@grafana/data';
import { SimpleOptions, ALL_CONTROL_ACTIONS } from './types';
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
    })
    .addBooleanSwitch({
      path: 'enableControls',
      name: 'Enable Container Controls',
      description: 'Show start/stop/restart/pause/unpause buttons on container cards',
      defaultValue: false,
      category: ['Controls'],
    })
    .addMultiSelect({
      path: 'allowedActions',
      name: 'Allowed Actions',
      description: 'Which container actions to show (requires datasource-level permission)',
      defaultValue: ALL_CONTROL_ACTIONS,
      category: ['Controls'],
      settings: {
        options: [
          { label: 'Start', value: 'start', description: 'Start stopped containers' },
          { label: 'Stop', value: 'stop', description: 'Stop running containers' },
          { label: 'Restart', value: 'restart', description: 'Restart containers' },
          { label: 'Pause', value: 'pause', description: 'Pause running containers' },
          { label: 'Unpause', value: 'unpause', description: 'Resume paused containers' },
        ],
      },
      showIf: (config) => config.enableControls === true,
    })
    .addBooleanSwitch({
      path: 'confirmDangerousActions',
      name: 'Confirm Dangerous Actions',
      description: 'Show confirmation dialog for stop and restart actions',
      defaultValue: true,
      category: ['Controls'],
      showIf: (config) => config.enableControls === true,
    });
});
