import React, { useCallback } from 'react';
import { DataSourcePluginOptionsEditorProps, SelectableValue } from '@grafana/data';
import { InlineField, Input, Button, VerticalGroup, HorizontalGroup, Switch, IconButton, MultiSelect, Alert } from '@grafana/ui';
import { DockerMetricsDataSourceOptions, HostConfig, ControlAction, ALL_CONTROL_ACTIONS } from '../types';
import { css } from '@emotion/css';
import { VersionInfo } from './VersionInfo';

interface Props extends DataSourcePluginOptionsEditorProps<DockerMetricsDataSourceOptions> {}

const styles = {
  hostCard: css`
    background: rgba(0, 0, 0, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    padding: 12px;
    margin-bottom: 8px;
  `,
  hostHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  `,
  hostTitle: css`
    font-weight: 500;
    font-size: 14px;
  `,
  addButton: css`
    margin-top: 8px;
  `,
  securitySection: css`
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  `,
  securityCard: css`
    background: rgba(255, 152, 48, 0.05);
    border: 1px solid rgba(255, 152, 48, 0.2);
    border-radius: 4px;
    padding: 16px;
    margin-top: 12px;
  `,
};

const controlActionOptions: Array<SelectableValue<ControlAction>> = ALL_CONTROL_ACTIONS.map((action) => ({
  label: action.charAt(0).toUpperCase() + action.slice(1),
  value: action,
  description: getActionDescription(action),
}));

function getActionDescription(action: ControlAction): string {
  switch (action) {
    case 'start':
      return 'Start a stopped container';
    case 'stop':
      return 'Stop a running container';
    case 'restart':
      return 'Restart a container';
    case 'pause':
      return 'Pause a running container';
    case 'unpause':
      return 'Resume a paused container';
  }
}

export function ConfigEditor(props: Props) {
  const { options, onOptionsChange } = props;
  const hosts = options.jsonData.hosts || [];
  const enableContainerControls = options.jsonData.enableContainerControls || false;
  const allowedControlActions = options.jsonData.allowedControlActions || [];

  const updateJsonData = useCallback(
    (updates: Partial<DockerMetricsDataSourceOptions>) => {
      onOptionsChange({
        ...options,
        jsonData: {
          ...options.jsonData,
          ...updates,
        },
      });
    },
    [options, onOptionsChange]
  );

  const updateHosts = useCallback(
    (newHosts: HostConfig[]) => {
      onOptionsChange({
        ...options,
        jsonData: {
          ...options.jsonData,
          hosts: newHosts,
        },
      });
    },
    [options, onOptionsChange]
  );

  const addHost = useCallback(() => {
    const newHost: HostConfig = {
      id: `host-${Date.now()}`,
      name: `Docker Host ${hosts.length + 1}`,
      url: 'http://localhost:5000',
      enabled: true,
    };
    updateHosts([...hosts, newHost]);
  }, [hosts, updateHosts]);

  const updateHost = useCallback(
    (index: number, updates: Partial<HostConfig>) => {
      const newHosts = [...hosts];
      newHosts[index] = { ...newHosts[index], ...updates };
      updateHosts(newHosts);
    },
    [hosts, updateHosts]
  );

  const removeHost = useCallback(
    (index: number) => {
      const newHosts = hosts.filter((_, i) => i !== index);
      updateHosts(newHosts);
    },
    [hosts, updateHosts]
  );

  return (
    <VerticalGroup spacing="md">
      <VersionInfo />
      <h4>Docker Metrics Collector Agents</h4>
      <p style={{ color: '#888', fontSize: '12px', marginBottom: '16px' }}>
        Configure the Docker Metrics Collector agents running on your Docker hosts.
        Each agent should be accessible from the Grafana server.
      </p>

      {hosts.map((host, index) => (
        <div key={host.id} className={styles.hostCard}>
          <div className={styles.hostHeader}>
            <span className={styles.hostTitle}>{host.name || `Host ${index + 1}`}</span>
            <HorizontalGroup spacing="sm">
              <Switch
                value={host.enabled}
                onChange={(e) => updateHost(index, { enabled: e.currentTarget.checked })}
                label="Enabled"
              />
              <IconButton
                name="trash-alt"
                tooltip="Remove host"
                onClick={() => removeHost(index)}
              />
            </HorizontalGroup>
          </div>

          <VerticalGroup spacing="sm">
            <InlineField label="Name" labelWidth={12} tooltip="Display name for this host">
              <Input
                value={host.name}
                onChange={(e) => updateHost(index, { name: e.currentTarget.value })}
                placeholder="Docker Host 1"
                width={40}
              />
            </InlineField>

            <InlineField label="URL" labelWidth={12} tooltip="URL of the Docker Metrics Collector agent">
              <Input
                value={host.url}
                onChange={(e) => updateHost(index, { url: e.currentTarget.value })}
                placeholder="http://192.168.1.100:5000"
                width={40}
              />
            </InlineField>
          </VerticalGroup>
        </div>
      ))}

      <Button
        variant="secondary"
        icon="plus"
        onClick={addHost}
        className={styles.addButton}
      >
        Add Host
      </Button>

      {hosts.length === 0 && (
        <p style={{ color: '#888', fontStyle: 'italic' }}>
          No hosts configured. Click &quot;Add Host&quot; to add a Docker Metrics Collector agent.
        </p>
      )}

      <div className={styles.securitySection}>
        <h4>Container Controls</h4>
        <p style={{ color: '#888', fontSize: '12px', marginBottom: '12px' }}>
          Enable container control actions (start, stop, restart, pause, unpause) from dashboards.
          This allows users to manage containers directly from panels.
        </p>

        <div className={styles.securityCard}>
          <VerticalGroup spacing="md">
            <HorizontalGroup>
              <Switch
                value={enableContainerControls}
                onChange={(e) => {
                  const enabled = e.currentTarget.checked;
                  updateJsonData({
                    enableContainerControls: enabled,
                    allowedControlActions: enabled ? ALL_CONTROL_ACTIONS : [],
                  });
                }}
                label="Enable Container Controls"
              />
            </HorizontalGroup>

            {enableContainerControls && (
              <>
                <Alert title="Security Warning" severity="warning">
                  Container controls allow dashboard users to manage Docker containers.
                  Only enable specific actions that are safe for your environment.
                </Alert>

                <InlineField
                  label="Allowed Actions"
                  labelWidth={16}
                  tooltip="Select which container actions are permitted. Leave empty to allow all actions."
                >
                  <MultiSelect
                    options={controlActionOptions}
                    value={allowedControlActions.map((a) => ({ label: a, value: a }))}
                    onChange={(selected) => {
                      updateJsonData({
                        allowedControlActions: selected.map((s) => s.value as ControlAction),
                      });
                    }}
                    placeholder="Select allowed actions..."
                    width={40}
                  />
                </InlineField>

                {allowedControlActions.length === 0 && (
                  <p style={{ color: '#FF9830', fontSize: '11px', marginTop: '-8px' }}>
                    Warning: No actions selected. All actions will be blocked until you select at least one.
                  </p>
                )}
              </>
            )}
          </VerticalGroup>
        </div>
      </div>
    </VerticalGroup>
  );
}
