import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { QueryEditorProps } from '@grafana/data';
import { RadioButtonGroup, Checkbox, useStyles2, Spinner, Dropdown, Menu, IconButton } from '@grafana/ui';
import { css } from '@emotion/css';
import { getBackendSrv } from '@grafana/runtime';
import { DockerMetricsDataSource } from '../datasource';
import {
  DockerMetricsQuery,
  DockerMetricsDataSourceOptions,
  HostSelection,
  HostSelectionMode,
  ALL_METRICS,
} from '../types';

type Props = QueryEditorProps<DockerMetricsDataSource, DockerMetricsQuery, DockerMetricsDataSourceOptions>;

interface ContainerInfo {
  containerId: string;
  containerName: string;
  hostName: string;
  hostId: string;
  state: string;
}

// Metric display config
const METRIC_CONFIG: Record<string, { label: string; shortLabel: string }> = {
  cpuPercent: { label: 'CPU %', shortLabel: 'CPU' },
  memoryBytes: { label: 'Memory (MB)', shortLabel: 'Mem' },
  memoryPercent: { label: 'Memory %', shortLabel: 'Mem%' },
  networkRxBytes: { label: 'Network RX', shortLabel: 'RX' },
  networkTxBytes: { label: 'Network TX', shortLabel: 'TX' },
  diskReadBytes: { label: 'Disk Read', shortLabel: 'DskR' },
  diskWriteBytes: { label: 'Disk Write', shortLabel: 'DskW' },
  uptimeSeconds: { label: 'Uptime', shortLabel: 'Up' },
  cpuPressureSome: { label: 'CPU Pressure', shortLabel: 'CPUp' },
  cpuPressureFull: { label: 'CPU Press (full)', shortLabel: 'CPUf' },
  memoryPressureSome: { label: 'Mem Pressure', shortLabel: 'MemP' },
  memoryPressureFull: { label: 'Mem Press (full)', shortLabel: 'Memf' },
  ioPressureSome: { label: 'I/O Pressure', shortLabel: 'IOp' },
  ioPressureFull: { label: 'I/O Press (full)', shortLabel: 'IOf' },
};

const getStyles = () => ({
  container: css`
    margin: 8px 0;
  `,
  loading: css`
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #8e8e8e;
  `,
  error: css`
    color: #ff5555;
    padding: 8px;
  `,
  hostSection: css`
    margin-bottom: 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    overflow: hidden;
  `,
  hostHeader: css`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: rgba(50, 116, 217, 0.15);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  `,
  hostName: css`
    font-weight: 600;
    flex: 1;
  `,
  modeSelector: css`
    display: flex;
    align-items: center;
    gap: 8px;
  `,
  modeLabel: css`
    font-size: 11px;
    color: #8e8e8e;
  `,
  matrix: css`
    overflow-x: auto;
  `,
  table: css`
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  `,
  headerRow: css`
    background: rgba(0, 0, 0, 0.2);
  `,
  headerCell: css`
    padding: 6px 8px;
    text-align: center;
    font-weight: 500;
    font-size: 10px;
    color: #8e8e8e;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    white-space: nowrap;
  `,
  headerCellContainer: css`
    padding: 6px 12px;
    text-align: left;
    font-weight: 500;
    font-size: 10px;
    color: #8e8e8e;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    min-width: 150px;
  `,
  row: css`
    &:hover {
      background: rgba(255, 255, 255, 0.03);
    }
  `,
  rowExcluded: css`
    opacity: 0.5;
    background: rgba(255, 85, 85, 0.05);
  `,
  rowMetricsHeader: css`
    background: rgba(50, 116, 217, 0.08);
    font-weight: 500;
  `,
  containerCell: css`
    padding: 6px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    align-items: center;
    gap: 8px;
  `,
  containerName: css`
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  metricCell: css`
    padding: 4px 8px;
    text-align: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  `,
  metricCellDisabled: css`
    opacity: 0.3;
  `,
  quickActions: css`
    display: flex;
    gap: 12px;
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.1);
    font-size: 11px;
  `,
  quickAction: css`
    color: #6e9fff;
    cursor: pointer;
    &:hover {
      text-decoration: underline;
    }
  `,
  summary: css`
    color: #8e8e8e;
    margin-left: auto;
  `,
  emptyState: css`
    padding: 24px;
    text-align: center;
    color: #8e8e8e;
  `,
  columnToggle: css`
    cursor: pointer;
    &:hover {
      color: #6e9fff;
    }
  `,
  metricsLabel: css`
    font-size: 11px;
    color: #6e9fff;
    font-style: italic;
  `,
  actionsHeaderCell: css`
    padding: 6px 8px;
    text-align: center;
    font-weight: 500;
    font-size: 10px;
    color: #8e8e8e;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    width: 50px;
  `,
  actionsCell: css`
    padding: 4px 8px;
    text-align: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    width: 50px;
  `,
});

export function QueryEditor({ query, onChange, onRunQuery, datasource }: Props) {
  const styles = useStyles2(getStyles);
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch containers from backend
  useEffect(() => {
    const fetchContainers = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await getBackendSrv().fetch({
          url: `/api/ds/query`,
          method: 'POST',
          data: {
            queries: [{
              refId: 'containers',
              datasource: { uid: datasource.uid, type: datasource.type },
              queryType: 'containers',
            }],
            from: 'now-1h',
            to: 'now',
          },
        }).toPromise();

        const result = response?.data as { results?: { containers?: { frames?: Array<{ data?: { values?: unknown[][] } }> } } };
        const frame = result?.results?.containers?.frames?.[0];
        if (frame?.data?.values) {
          const [containerIds, containerNames, hostIds, hostNames] = frame.data.values as [string[], string[], string[], string[]];
          const parsed: ContainerInfo[] = containerIds.map((id, i) => ({
            containerId: id,
            containerName: containerNames[i] || id,
            hostId: hostIds[i] || 'default',
            hostName: hostNames[i] || 'default',
            state: 'running',
          }));
          setContainers(parsed);

          // Initialize hostSelections if empty
          if (!query.hostSelections || Object.keys(query.hostSelections).length === 0) {
            initializeHostSelections(parsed);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch containers');
      } finally {
        setLoading(false);
      }
    };

    fetchContainers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasource.uid]);

  // Group containers by host
  const containersByHost = useMemo(() => {
    const byHost = new Map<string, { hostId: string; hostName: string; containers: ContainerInfo[] }>();
    for (const c of containers) {
      if (!byHost.has(c.hostId)) {
        byHost.set(c.hostId, { hostId: c.hostId, hostName: c.hostName, containers: [] });
      }
      byHost.get(c.hostId)!.containers.push(c);
    }
    // Sort containers within each host
    for (const host of byHost.values()) {
      host.containers.sort((a, b) => a.containerName.localeCompare(b.containerName));
    }
    return Array.from(byHost.values()).sort((a, b) => a.hostName.localeCompare(b.hostName));
  }, [containers]);

  // Initialize host selections with all containers in blacklist mode (auto-include new)
  const initializeHostSelections = useCallback((containerList: ContainerInfo[]) => {
    const hostSelections: Record<string, HostSelection> = {};
    const byHost = new Map<string, ContainerInfo[]>();

    for (const c of containerList) {
      if (!byHost.has(c.hostId)) {
        byHost.set(c.hostId, []);
      }
      byHost.get(c.hostId)!.push(c);
    }

    for (const [hostId] of byHost) {
      hostSelections[hostId] = {
        hostId,
        mode: 'blacklist',
        containerIds: [], // Empty = include all
        containerMetrics: {},
        metrics: [...ALL_METRICS], // All metrics by default
      };
    }

    onChange({ ...query, hostSelections });
  }, [query, onChange]);

  // Get host selection or default
  const getHostSelection = useCallback((hostId: string): HostSelection => {
    return query.hostSelections?.[hostId] || {
      hostId,
      mode: 'blacklist',
      containerIds: [],
      containerMetrics: {},
      metrics: [...ALL_METRICS],
    };
  }, [query.hostSelections]);

  // Update host selection
  const updateHostSelection = useCallback((hostId: string, updates: Partial<HostSelection>) => {
    const current = getHostSelection(hostId);
    const newHostSelections = {
      ...query.hostSelections,
      [hostId]: { ...current, ...updates },
    };
    onChange({ ...query, hostSelections: newHostSelections });
    onRunQuery();
  }, [query, onChange, onRunQuery, getHostSelection]);

  // Toggle host mode
  const onModeChange = useCallback((hostId: string, mode: HostSelectionMode) => {
    const host = containersByHost.find(h => h.hostId === hostId);
    if (!host) {return;}

    if (mode === 'blacklist') {
      // Switching to blacklist: clear container selections, keep all metrics
      updateHostSelection(hostId, {
        mode: 'blacklist',
        containerIds: [],
        containerMetrics: {},
        metrics: [...ALL_METRICS],
      });
    } else {
      // Switching to whitelist: select all containers with all metrics
      const containerMetrics: Record<string, string[]> = {};
      for (const c of host.containers) {
        containerMetrics[c.containerId] = [...ALL_METRICS];
      }
      updateHostSelection(hostId, {
        mode: 'whitelist',
        containerIds: host.containers.map(c => c.containerId),
        containerMetrics,
        metrics: [],
      });
    }
  }, [containersByHost, updateHostSelection]);

  // Toggle container inclusion
  const onContainerToggle = useCallback((hostId: string, containerId: string, checked: boolean) => {
    const hostSel = getHostSelection(hostId);

    if (hostSel.mode === 'whitelist') {
      // Whitelist: checked = include
      const newContainerIds = checked
        ? [...hostSel.containerIds, containerId]
        : hostSel.containerIds.filter(id => id !== containerId);

      const newContainerMetrics = { ...hostSel.containerMetrics };
      if (checked) {
        newContainerMetrics[containerId] = [...ALL_METRICS];
      } else {
        delete newContainerMetrics[containerId];
      }

      updateHostSelection(hostId, {
        containerIds: newContainerIds,
        containerMetrics: newContainerMetrics,
      });
    } else {
      // Blacklist: checked = exclude
      const newContainerIds = checked
        ? [...hostSel.containerIds, containerId]
        : hostSel.containerIds.filter(id => id !== containerId);

      updateHostSelection(hostId, { containerIds: newContainerIds });
    }
  }, [getHostSelection, updateHostSelection]);

  // Toggle metric for a container (works in both modes)
  const onMetricToggle = useCallback((hostId: string, containerId: string, metric: string, checked: boolean) => {
    const hostSel = getHostSelection(hostId);

    // For blacklist mode, if container doesn't have custom metrics yet, start with all metrics
    const currentMetrics = hostSel.containerMetrics[containerId]
      ?? (hostSel.mode === 'blacklist' ? [...ALL_METRICS] : []);

    const newMetrics = checked
      ? [...currentMetrics, metric]
      : currentMetrics.filter(m => m !== metric);

    updateHostSelection(hostId, {
      containerMetrics: {
        ...hostSel.containerMetrics,
        [containerId]: newMetrics,
      },
    });
  }, [getHostSelection, updateHostSelection]);

  // Select all containers for host
  const onSelectAllContainers = useCallback((hostId: string) => {
    const host = containersByHost.find(h => h.hostId === hostId);
    if (!host) {return;}

    const hostSel = getHostSelection(hostId);

    if (hostSel.mode === 'whitelist') {
      const containerMetrics: Record<string, string[]> = {};
      for (const c of host.containers) {
        containerMetrics[c.containerId] = [...ALL_METRICS];
      }
      updateHostSelection(hostId, {
        containerIds: host.containers.map(c => c.containerId),
        containerMetrics,
      });
    } else {
      // Blacklist: clear exclusions
      updateHostSelection(hostId, { containerIds: [] });
    }
  }, [containersByHost, getHostSelection, updateHostSelection]);

  // Clear all containers for host
  const onClearAllContainers = useCallback((hostId: string) => {
    const host = containersByHost.find(h => h.hostId === hostId);
    if (!host) {return;}

    const hostSel = getHostSelection(hostId);

    if (hostSel.mode === 'whitelist') {
      updateHostSelection(hostId, { containerIds: [], containerMetrics: {} });
    } else {
      // Blacklist: exclude all
      updateHostSelection(hostId, { containerIds: host.containers.map(c => c.containerId) });
    }
  }, [containersByHost, getHostSelection, updateHostSelection]);

  // Toggle all containers for a specific metric column (works in both modes)
  const onToggleMetricColumn = useCallback((hostId: string, metric: string) => {
    const host = containersByHost.find(h => h.hostId === hostId);
    if (!host) {return;}

    const hostSel = getHostSelection(hostId);

    // Get included containers based on mode
    const includedContainers = hostSel.mode === 'whitelist'
      ? host.containers.filter(c => hostSel.containerIds.includes(c.containerId))
      : host.containers.filter(c => !hostSel.containerIds.includes(c.containerId));

    if (includedContainers.length === 0) {return;}

    // Check if all included containers have this metric
    const allHaveMetric = includedContainers.every(c => {
      const metrics = hostSel.containerMetrics[c.containerId]
        ?? (hostSel.mode === 'blacklist' ? ALL_METRICS : []);
      return metrics.includes(metric);
    });

    const newContainerMetrics = { ...hostSel.containerMetrics };
    for (const c of includedContainers) {
      const current = newContainerMetrics[c.containerId]
        ?? (hostSel.mode === 'blacklist' ? [...ALL_METRICS] : []);
      if (allHaveMetric) {
        // Remove metric from all
        newContainerMetrics[c.containerId] = current.filter(m => m !== metric);
      } else {
        // Add metric to all
        if (!current.includes(metric)) {
          newContainerMetrics[c.containerId] = [...current, metric];
        }
      }
    }

    updateHostSelection(hostId, { containerMetrics: newContainerMetrics });
  }, [containersByHost, getHostSelection, updateHostSelection]);

  // Count selected
  const getSelectionSummary = useCallback((hostId: string) => {
    const host = containersByHost.find(h => h.hostId === hostId);
    if (!host) {return { containers: 0, total: 0, metrics: 0 };}

    const hostSel = getHostSelection(hostId);
    const containerCount = hostSel.mode === 'whitelist'
      ? hostSel.containerIds.length
      : host.containers.length - hostSel.containerIds.length;
    const metricCount = hostSel.mode === 'blacklist'
      ? (hostSel.metrics?.length || 0)
      : ALL_METRICS.length; // For whitelist, metrics are per-container

    return { containers: containerCount, total: host.containers.length, metrics: metricCount };
  }, [containersByHost, getHostSelection]);

  // Apply metrics from source container to all containers on the same host
  const onApplyToHost = useCallback((hostId: string, sourceContainerId: string) => {
    const hostSel = getHostSelection(hostId);
    const sourceMetrics = hostSel.containerMetrics[sourceContainerId]
      ?? (hostSel.mode === 'blacklist' ? [...ALL_METRICS] : []);

    const host = containersByHost.find(h => h.hostId === hostId);
    if (!host) {return;}

    const newContainerMetrics = { ...hostSel.containerMetrics };
    for (const container of host.containers) {
      // Skip excluded containers in blacklist mode, or non-included in whitelist
      const isExcluded = hostSel.mode === 'blacklist'
        ? hostSel.containerIds.includes(container.containerId)
        : !hostSel.containerIds.includes(container.containerId);
      if (!isExcluded) {
        newContainerMetrics[container.containerId] = [...sourceMetrics];
      }
    }

    updateHostSelection(hostId, { containerMetrics: newContainerMetrics });
  }, [containersByHost, getHostSelection, updateHostSelection]);

  // Apply metrics from source container to all containers across all hosts
  const onApplyToCluster = useCallback((sourceHostId: string, sourceContainerId: string) => {
    const sourceHostSel = getHostSelection(sourceHostId);
    const sourceMetrics = sourceHostSel.containerMetrics[sourceContainerId]
      ?? (sourceHostSel.mode === 'blacklist' ? [...ALL_METRICS] : []);

    const newHostSelections = { ...query.hostSelections };

    for (const host of containersByHost) {
      const hostSel = getHostSelection(host.hostId);
      const newContainerMetrics = { ...hostSel.containerMetrics };

      for (const container of host.containers) {
        const isExcluded = hostSel.mode === 'blacklist'
          ? hostSel.containerIds.includes(container.containerId)
          : !hostSel.containerIds.includes(container.containerId);
        if (!isExcluded) {
          newContainerMetrics[container.containerId] = [...sourceMetrics];
        }
      }

      newHostSelections[host.hostId] = {
        ...hostSel,
        containerMetrics: newContainerMetrics,
      };
    }

    onChange({ ...query, hostSelections: newHostSelections });
    onRunQuery();
  }, [query, onChange, onRunQuery, containersByHost, getHostSelection]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size="sm" />
        Loading containers...
      </div>
    );
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  if (containers.length === 0) {
    return (
      <div className={styles.emptyState}>
        No containers found. Check that Docker Metrics Collector agents are running and configured.
      </div>
    );
  }

  const modeOptions = [
    { label: 'Whitelist', value: 'whitelist' as HostSelectionMode },
    { label: 'Blacklist', value: 'blacklist' as HostSelectionMode },
  ];

  return (
    <div className={styles.container}>
      {containersByHost.map((host) => {
        const hostSel = getHostSelection(host.hostId);
        const summary = getSelectionSummary(host.hostId);
        const selectedMetrics = hostSel.metrics || [];

        return (
          <div key={host.hostId} className={styles.hostSection}>
            <div className={styles.hostHeader}>
              <span className={styles.hostName}>{host.hostName}</span>
              <div className={styles.modeSelector}>
                <span className={styles.modeLabel}>Mode:</span>
                <RadioButtonGroup
                  size="sm"
                  options={modeOptions}
                  value={hostSel.mode}
                  onChange={(v) => onModeChange(host.hostId, v)}
                />
              </div>
            </div>

            <div className={styles.quickActions}>
              <span className={styles.quickAction} onClick={() => onSelectAllContainers(host.hostId)}>
                {hostSel.mode === 'whitelist' ? 'Select All' : 'Include All'}
              </span>
              <span className={styles.quickAction} onClick={() => onClearAllContainers(host.hostId)}>
                {hostSel.mode === 'whitelist' ? 'Clear' : 'Exclude All'}
              </span>
              <span className={styles.summary}>
                {summary.containers}/{summary.total} containers
              </span>
            </div>

            <div className={styles.matrix}>
              <table className={styles.table}>
                <thead>
                  <tr className={styles.headerRow}>
                    <th className={styles.headerCellContainer}>
                      {hostSel.mode === 'blacklist' ? 'Container (✓=exclude)' : 'Container (✓=include)'}
                    </th>
                    {ALL_METRICS.map((metric) => (
                      <th
                        key={metric}
                        className={`${styles.headerCell} ${styles.columnToggle}`}
                        title={`${METRIC_CONFIG[metric]?.label || metric} - Click to toggle all`}
                        onClick={() => onToggleMetricColumn(host.hostId, metric)}
                      >
                        {METRIC_CONFIG[metric]?.shortLabel || metric}
                      </th>
                    ))}
                    <th className={styles.actionsHeaderCell}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Container rows */}
                  {host.containers.map((container) => {
                    const isExcluded = hostSel.mode === 'blacklist'
                      ? hostSel.containerIds.includes(container.containerId)
                      : !hostSel.containerIds.includes(container.containerId);
                    // For blacklist mode, use containerMetrics if set, otherwise default to all metrics
                    const containerMetrics = hostSel.containerMetrics[container.containerId]
                      ?? (hostSel.mode === 'blacklist' ? [...ALL_METRICS] : []);

                    return (
                      <tr key={container.containerId} className={`${styles.row} ${isExcluded ? styles.rowExcluded : ''}`}>
                        <td className={styles.containerCell}>
                          <Checkbox
                            value={hostSel.mode === 'blacklist'
                              ? hostSel.containerIds.includes(container.containerId)
                              : hostSel.containerIds.includes(container.containerId)}
                            onChange={(e) => onContainerToggle(host.hostId, container.containerId, e.currentTarget.checked)}
                          />
                          <span className={styles.containerName} title={container.containerName}>
                            {container.containerName.replace(/^\//, '')}
                          </span>
                        </td>
                        {ALL_METRICS.map((metric) => (
                          <td
                            key={metric}
                            className={`${styles.metricCell} ${isExcluded ? styles.metricCellDisabled : ''}`}
                          >
                            <Checkbox
                              value={!isExcluded && containerMetrics.includes(metric)}
                              disabled={isExcluded}
                              onChange={(e) => onMetricToggle(host.hostId, container.containerId, metric, e.currentTarget.checked)}
                            />
                          </td>
                        ))}
                        <td className={styles.actionsCell}>
                          <Dropdown
                            overlay={
                              <Menu>
                                <Menu.Item
                                  label="Apply to Host"
                                  onClick={() => onApplyToHost(host.hostId, container.containerId)}
                                />
                                <Menu.Item
                                  label="Apply to Cluster"
                                  onClick={() => onApplyToCluster(host.hostId, container.containerId)}
                                />
                              </Menu>
                            }
                          >
                            <IconButton name="ellipsis-v" size="sm" tooltip="Apply metrics schema" />
                          </Dropdown>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
