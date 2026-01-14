import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { PanelProps } from '@grafana/data';
import { SimpleOptions, ContainerMetrics, ContainerInfo, ContainerStatus, HostConfig, AVAILABLE_METRICS, MetricDefinition, DEFAULT_METRICS, DEFAULT_HOSTS, ContainerAction, PendingAction, PENDING_ACTION_LABELS, MetricsResponse } from 'types';
import { css, cx } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import { proxyGet, proxyPost } from '../utils/proxy';

// Debug logging - set to true when troubleshooting issues
const DEBUG = false;
const log = (area: string, message: string, data?: unknown) => {
  if (DEBUG) {
    // Use warn instead of log - less likely to be stripped
    console.warn(`[DockerMetrics:${area}]`, message, data !== undefined ? data : '');
  }
};

// Map metric keys to API field names
const METRIC_TO_FIELD: Record<string, string> = {
  cpuPercent: 'cpuPercent',
  memoryBytes: 'memoryBytes',
  memoryPercent: 'memoryPercent',
  networkRxBytes: 'networkRxBytes',
  networkTxBytes: 'networkTxBytes',
  diskReadBytes: 'diskReadBytes',
  diskWriteBytes: 'diskWriteBytes',
  uptimeSeconds: 'uptimeSeconds',
  cpuPressureSome: 'cpuPressure',
  cpuPressureFull: 'cpuPressure',
  memoryPressureSome: 'memoryPressure',
  memoryPressureFull: 'memoryPressure',
  ioPressureSome: 'ioPressure',
  ioPressureFull: 'ioPressure',
};


interface Props extends PanelProps<SimpleOptions> {}

const getStyles = () => {
  return {
    wrapper: css`
      position: relative;
      overflow: auto;
      padding: 10px;
    `,
    error: css`
      color: #ff5555;
      padding: 10px;
    `,
    info: css`
      font-size: 12px;
      margin-bottom: 10px;
    `,
    loading: css`
      padding: 10px;
      color: #888;
    `,
    hostSection: css`
      margin-bottom: 16px;
      &:last-child {
        margin-bottom: 0;
      }
    `,
    hostHeader: css`
      font-size: 13px;
      font-weight: 600;
      padding: 8px 12px;
      margin-bottom: 8px;
      background: rgba(50, 116, 217, 0.15);
      border-left: 3px solid #3274d9;
      border-radius: 0 4px 4px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    `,
    hostHealthDot: css`
      width: 8px;
      height: 8px;
      border-radius: 50%;
    `,
    containerCount: css`
      font-size: 11px;
      color: #888;
      font-weight: normal;
      margin-left: auto;
    `,
    containersGrid: css`
      display: grid;
      gap: 12px;
      padding: 0 4px;
    `,
    containerCard: css`
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 6px;
      padding: 12px;
    `,
    containerHeader: css`
      display: flex;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    `,
    containerName: css`
      font-size: 13px;
      font-weight: 500;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `,
    containerStatus: css`
      font-size: 11px;
      margin-left: 8px;
    `,
    metricsGrid: css`
      display: grid;
      gap: 10px;
    `,
    metric: css`
      background: rgba(0, 0, 0, 0.15);
      border-radius: 4px;
      padding: 8px;
    `,
    metricHeader: css`
      display: flex;
      align-items: center;
      margin-bottom: 4px;
    `,
    metricColorDot: css`
      width: 6px;
      height: 6px;
      border-radius: 50%;
      margin-right: 6px;
    `,
    metricLabel: css`
      font-size: 10px;
      color: #888;
    `,
    metricValue: css`
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 4px;
    `,
    metricUnit: css`
      font-size: 10px;
      color: #888;
      margin-left: 2px;
    `,
    emptyState: css`
      color: #888;
      font-size: 13px;
      text-align: center;
      padding: 40px 20px;
    `,
    summary: css`
      font-size: 11px;
      color: #888;
      padding: 4px 8px;
      margin-bottom: 12px;
      display: flex;
      gap: 16px;
    `,
    controlsRow: css`
      display: flex;
      gap: 4px;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    `,
    controlButton: css`
      flex: 1;
      padding: 6px 8px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.2);
      color: #ccc;
      font-size: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      transition: all 0.15s ease;
      &:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.25);
      }
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
    controlButtonStart: css`
      &:hover {
        background: rgba(115, 191, 105, 0.2);
        border-color: #73bf69;
        color: #73bf69;
      }
    `,
    controlButtonStop: css`
      &:hover {
        background: rgba(242, 73, 92, 0.2);
        border-color: #f2495c;
        color: #f2495c;
      }
    `,
    controlButtonRestart: css`
      &:hover {
        background: rgba(255, 152, 48, 0.2);
        border-color: #ff9830;
        color: #ff9830;
      }
    `,
    controlButtonPause: css`
      &:hover {
        background: rgba(87, 148, 242, 0.2);
        border-color: #5794f2;
        color: #5794f2;
      }
    `,
  };
};

interface SparklineProps {
  data: number[];
  color: string;
  height?: number;
  formatValue: (v: number) => string;
}

const Sparkline: React.FC<SparklineProps> = ({ data, color, height = 40, formatValue }) => {
  if (data.length < 2) {
    return null;
  }

  const padding = 2;
  const chartHeight = height - padding * 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * 100;
      const y = padding + chartHeight - ((value - min) / range) * chartHeight;
      return `${x},${y}`;
    })
    .join(' ');

  const scaleMax = formatValue(max);
  const scaleMin = formatValue(min);

  return (
    <div style={{ position: 'relative', height, display: 'flex' }}>
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          style={{ display: 'block' }}
        >
          <line x1="0" y1={padding} x2="100" y2={padding} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          <line x1="0" y1={padding + chartHeight / 2} x2="100" y2={padding + chartHeight / 2} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          <line x1="0" y1={padding + chartHeight} x2="100" y2={padding + chartHeight} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div
        style={{
          width: '32px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          fontSize: '8px',
          color: '#666',
          textAlign: 'right',
          paddingLeft: '4px',
          flexShrink: 0,
        }}
      >
        <span>{scaleMax}</span>
        <span>{scaleMin}</span>
      </div>
    </div>
  );
};

interface ContainerWithMetrics {
  containerId: string;
  containerName: string;
  hostId: string;
  hostName: string;
  hostUrl: string;
  metrics: ContainerMetrics[];
  latest: ContainerMetrics | null;
  rateData: Map<string, number[]>;
  latestRates: Map<string, number>;
}

// Calculate rate (delta/time) from cumulative values
function calculateRates(
  metrics: ContainerMetrics[],
  metricKey: string,
  getValue: (s: ContainerMetrics) => number | null
): number[] {
  if (metrics.length < 2) return [];

  const rates: number[] = [];
  for (let i = 1; i < metrics.length; i++) {
    const prev = metrics[i - 1];
    const curr = metrics[i];
    const prevVal = getValue(prev);
    const currVal = getValue(curr);

    if (prevVal === null || currVal === null) continue;

    const timeDelta = (new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000;
    if (timeDelta <= 0) continue;

    const valueDelta = currVal - prevVal;
    const rate = valueDelta >= 0 ? valueDelta / timeDelta : 0;
    rates.push(rate / 1024);
  }

  return rates;
}

interface ContainerControlsProps {
  hostUrl: string;
  containerId: string;
  isRunning: boolean;
  isPaused: boolean;
  styles: ReturnType<typeof getStyles>;
  pendingAction: PendingAction | null;
  onPendingStart: (containerId: string, action: ContainerAction) => void;
  onPendingComplete: (containerId: string) => void;
  onStatusUpdate?: (status: ContainerStatus) => void;
}

const ContainerControls: React.FC<ContainerControlsProps> = ({
  hostUrl,
  containerId,
  isRunning,
  isPaused,
  styles,
  pendingAction,
  onPendingStart,
  onPendingComplete,
  onStatusUpdate,
}) => {
  // Helper to get expected state for an action
  const getExpectedState = useCallback((action: ContainerAction): { expectedRunning: boolean; expectedPaused: boolean } => {
    switch (action) {
      case 'start':
        return { expectedRunning: true, expectedPaused: false };
      case 'stop':
        return { expectedRunning: false, expectedPaused: false };
      case 'restart':
        return { expectedRunning: true, expectedPaused: false };
      case 'pause':
        return { expectedRunning: true, expectedPaused: true };
      case 'unpause':
        return { expectedRunning: true, expectedPaused: false };
      default:
        return { expectedRunning: isRunning, expectedPaused: isPaused };
    }
  }, [isRunning, isPaused]);

  // Poll for status and check if it matches expected state
  const pollForStatus = useCallback(async (action: ContainerAction) => {
    const { expectedRunning, expectedPaused } = getExpectedState(action);
    const maxAttempts = 30; // 15 seconds at 500ms intervals

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const status = await proxyGet<ContainerStatus>(`${hostUrl}/api/containers/${containerId}/status`);

        // Only update status when it matches expected state
        // This ensures the pending state stays visible until action is confirmed
        if (status.isRunning === expectedRunning && status.isPaused === expectedPaused) {
          onStatusUpdate?.(status);
          onPendingComplete(containerId);
          return;
        }
        // Don't update status for intermediate states - let pending state show
      } catch {
        // Ignore polling errors
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Timeout reached - clear pending state, let normal metrics refresh handle status
    onPendingComplete(containerId);
  }, [hostUrl, containerId, getExpectedState, onStatusUpdate, onPendingComplete]);

  const executeAction = async (action: ContainerAction) => {
    // Set pending state before API call
    onPendingStart(containerId, action);

    try {
      await proxyPost(`${hostUrl}/api/containers/${containerId}/${action}`);
      // Start polling for expected state
      pollForStatus(action);
    } catch (err) {
      console.error(`Failed to ${action} container:`, err);
      // Clear pending on error
      onPendingComplete(containerId);
    }
  };

  // Check if any action is pending
  const isActionPending = pendingAction !== null;

  return (
    <div className={styles.controlsRow}>
      {!isRunning ? (
        <button
          className={`${styles.controlButton} ${styles.controlButtonStart}`}
          onClick={() => executeAction('start')}
          disabled={isActionPending}
          title="Start container"
        >
          {pendingAction?.action === 'start' ? '...' : '▶ Start'}
        </button>
      ) : (
        <button
          className={`${styles.controlButton} ${styles.controlButtonStop}`}
          onClick={() => executeAction('stop')}
          disabled={isActionPending}
          title="Stop container"
        >
          {pendingAction?.action === 'stop' ? '...' : '■ Stop'}
        </button>
      )}
      <button
        className={`${styles.controlButton} ${styles.controlButtonRestart}`}
        onClick={() => executeAction('restart')}
        disabled={isActionPending || !isRunning}
        title="Restart container"
      >
        {pendingAction?.action === 'restart' ? '...' : '↻ Restart'}
      </button>
      {isPaused ? (
        <button
          className={`${styles.controlButton} ${styles.controlButtonStart}`}
          onClick={() => executeAction('unpause')}
          disabled={isActionPending}
          title="Unpause container"
        >
          {pendingAction?.action === 'unpause' ? '...' : '▶ Unpause'}
        </button>
      ) : (
        <button
          className={`${styles.controlButton} ${styles.controlButtonPause}`}
          onClick={() => executeAction('pause')}
          disabled={isActionPending || !isRunning}
          title="Pause container"
        >
          {pendingAction?.action === 'pause' ? '...' : '⏸ Pause'}
        </button>
      )}
    </div>
  );
};

export const SimplePanel: React.FC<Props> = ({ width, height, options, timeRange }) => {
  const renderCountRef = useRef(0);
  renderCountRef.current++;
  log('Render', `Component rendering #${renderCountRef.current}`);

  // Stabilize time range - round to nearest 10 seconds to prevent constant re-fetches
  // when using "Last X minutes" with live "now" endpoint
  const stableTimeFrom = useMemo(() => {
    return Math.floor(timeRange.from.valueOf() / 10000) * 10000;
  }, [timeRange.from]);
  const stableTimeTo = useMemo(() => {
    return Math.floor(timeRange.to.valueOf() / 10000) * 10000;
  }, [timeRange.to]);

  const hosts = useMemo(() => options.hosts || DEFAULT_HOSTS, [options.hosts]);
  const enabledHosts = useMemo(() => hosts.filter((h: HostConfig) => h.enabled), [hosts]);
  const containersPerRow = options.containersPerRow || 0;
  const metricsPerRow = options.metricsPerRow || 0;
  const styles = useStyles2(getStyles);

  const containerGridStyle = {
    gridTemplateColumns:
      containersPerRow > 0
        ? `repeat(${containersPerRow}, 1fr)`
        : 'repeat(auto-fill, minmax(300px, 1fr))',
  };

  const metricsGridStyle = {
    gridTemplateColumns:
      metricsPerRow > 0 ? `repeat(${metricsPerRow}, 1fr)` : 'repeat(auto-fill, minmax(120px, 1fr))',
  };

  const [allMetrics, setAllMetricsRaw] = useState<ContainerMetrics[]>([]);
  const [containers, setContainersRaw] = useState<ContainerInfo[]>([]);
  const [error, setErrorRaw] = useState<string | null>(null);
  const [loading, setLoadingRaw] = useState<boolean>(false);

  // Wrapped setters with logging
  const setAllMetrics = useCallback((metrics: ContainerMetrics[]) => {
    log('State', `setAllMetrics called, count: ${metrics.length}`);
    setAllMetricsRaw(metrics);
  }, []);
  const setContainers = useCallback((c: ContainerInfo[]) => {
    log('State', `setContainers called, count: ${c.length}`);
    setContainersRaw(c);
  }, []);
  const setError = useCallback((e: string | null) => {
    log('State', `setError called: ${e}`);
    setErrorRaw(e);
  }, []);
  const setLoading = useCallback((l: boolean) => {
    log('State', `setLoading called: ${l}`);
    setLoadingRaw(l);
  }, []);

  // Track real-time status overrides (from control actions)
  const [statusOverrides, setStatusOverrides] = useState<Map<string, ContainerStatus>>(new Map());

  // Track pending actions per container
  const [pendingActions, setPendingActions] = useState<Map<string, PendingAction>>(new Map());

  const handleStatusUpdate = useCallback((status: ContainerStatus) => {
    setStatusOverrides(prev => {
      const next = new Map(prev);
      next.set(status.containerId, status);
      return next;
    });
  }, []);

  const handlePendingStart = useCallback((containerId: string, action: ContainerAction) => {
    setPendingActions(prev => {
      const next = new Map(prev);
      next.set(containerId, { action, startTime: Date.now() });
      return next;
    });
  }, []);

  const handlePendingComplete = useCallback((containerId: string) => {
    setPendingActions(prev => {
      const next = new Map(prev);
      next.delete(containerId);
      return next;
    });
  }, []);

  const selectedMetricDefs = useMemo(() => {
    const selected = options.selectedMetrics || DEFAULT_METRICS;
    return AVAILABLE_METRICS.filter((m) => selected.includes(m.key));
  }, [options.selectedMetrics]);

  // Get unique API field names for selected metrics
  const selectedFields = useMemo(() => {
    const fields = new Set<string>();
    const selected = options.selectedMetrics || DEFAULT_METRICS;
    for (const key of selected) {
      const field = METRIC_TO_FIELD[key];
      if (field) {
        fields.add(field);
      }
    }
    return Array.from(fields);
  }, [options.selectedMetrics]);

  // Fetch state - using refs to avoid re-render loops
  const lastTimestampRef = useRef<string | null>(null);
  const metricsMapRef = useRef<Map<string, ContainerMetrics>>(new Map());
  const totalAvailableRef = useRef<number>(0);
  const initialFetchDoneRef = useRef<boolean>(false);

  // Time range refs - used by fetch callbacks to get latest values without causing re-runs
  const stableTimeFromRef = useRef<number>(stableTimeFrom);
  const stableTimeToRef = useRef<number>(stableTimeTo);
  stableTimeFromRef.current = stableTimeFrom;
  stableTimeToRef.current = stableTimeTo;

  // Fetch containers from all enabled hosts
  useEffect(() => {
    log('Effect:Containers', 'useEffect triggered');
    const fetchContainers = async () => {
      log('Effect:Containers', 'fetchContainers called');
      if (enabledHosts.length === 0) {
        setContainers([]);
        return;
      }

      try {
        const allContainers: ContainerInfo[] = [];

        await Promise.all(
          enabledHosts.map(async (host: HostConfig) => {
            try {
              const data = await proxyGet<Array<{ containerId: string; containerName: string; state: string; isRunning: boolean; isPaused: boolean }>>(`${host.url}/api/containers?all=true`);
              for (const container of data) {
                allContainers.push({
                  ...container,
                  hostId: host.id,
                  hostName: host.name,
                });
              }
            } catch {
              // Ignore individual host errors
            }
          })
        );

        setContainers(allContainers);
      } catch {
        // Ignore errors
      }
    };

    fetchContainers();
    const interval = setInterval(fetchContainers, 30000);
    return () => {
      log('Effect:Containers', 'cleanup');
      clearInterval(interval);
    };
  }, [enabledHosts, setContainers]);

  const targetContainerIds = useMemo(() => {
    if (options.showAllContainers) {
      // Show all containers except blacklisted ones
      const blacklist = options.containerBlacklist || [];
      return containers
        .map((c) => c.containerId)
        .filter((id) => !blacklist.includes(id));
    }
    return options.containerIds || [];
  }, [options.showAllContainers, options.containerIds, options.containerBlacklist, containers]);

  // Reset fetch state ONLY when container selection changes
  // Time range changes should NOT trigger a reset - we prune old data instead
  const resetKey = targetContainerIds.join(',');
  const prevResetKeyRef = useRef<string>('');
  useEffect(() => {
    if (prevResetKeyRef.current !== resetKey) {
      log('Effect:Reset', `Container selection changed, resetting`);
      prevResetKeyRef.current = resetKey;
      metricsMapRef.current.clear();
      lastTimestampRef.current = null;
      totalAvailableRef.current = 0;
      initialFetchDoneRef.current = false;
      setAllMetrics([]);
    }
  }, [resetKey, setAllMetrics]);

  // Prune old metrics that are outside the current time range
  useEffect(() => {
    const fromMs = stableTimeFrom;
    const map = metricsMapRef.current;
    let pruned = 0;

    for (const [key, metric] of map.entries()) {
      const metricTime = new Date(metric.timestamp).getTime();
      if (metricTime < fromMs) {
        map.delete(key);
        pruned++;
      }
    }

    if (pruned > 0) {
      log('Effect:Prune', `Pruned ${pruned} old metrics outside time range`);
      // Update state with pruned data
      setAllMetrics(Array.from(map.values()));
    }
  }, [stableTimeFrom, setAllMetrics]);

  // Merge new metrics with existing, deduplicating by containerId+timestamp
  // Note: No dependencies - uses refs and sets all metrics, filtering happens in useMemo
  const mergeMetrics = useCallback((newMetrics: ContainerMetrics[]) => {
    const map = metricsMapRef.current;
    let maxTimestamp = lastTimestampRef.current;

    for (const metric of newMetrics) {
      const key = `${metric.containerId}:${metric.timestamp}`;
      if (!map.has(key)) {
        map.set(key, metric);
        if (!maxTimestamp || metric.timestamp > maxTimestamp) {
          maxTimestamp = metric.timestamp;
        }
      }
    }

    lastTimestampRef.current = maxTimestamp;

    // Set all metrics - filtering by target containers happens in containersByHost useMemo
    setAllMetrics(Array.from(map.values()));
  }, []);

  // Build URL with query parameters for metrics fetch
  const buildMetricsUrl = useCallback((
    hostUrl: string,
    containerIds: string[],
    fields: string[],
    from: string,
    to: string,
    limit?: number,
    latest?: boolean
  ) => {
    const params = new URLSearchParams();
    params.set('from', from);
    params.set('to', to);

    if (containerIds.length > 0) {
      params.set('containerIds', containerIds.join(','));
    }
    if (fields.length > 0) {
      params.set('fields', fields.join(','));
    }
    if (limit && limit > 0) {
      params.set('limit', limit.toString());
    }
    if (latest) {
      params.set('latest', 'true');
    }

    return `${hostUrl}/api/metrics?${params.toString()}`;
  }, []);

  // Simple metrics fetching - initial full fetch, then incremental updates
  // Note: Time range is accessed via refs to prevent re-running effect when time changes
  const metricsEffectKey = `${enabledHosts.map(h => h.id + h.url).join(',')}-${targetContainerIds.join(',')}-${options.showAllContainers}-${options.refreshInterval}-${selectedFields.join(',')}`;
  const prevMetricsEffectKeyRef = useRef<string>('');
  useEffect(() => {
    const keyChanged = prevMetricsEffectKeyRef.current !== metricsEffectKey;
    log('Effect:Metrics', `useEffect triggered, keyChanged: ${keyChanged}`);
    if (keyChanged) {
      log('Effect:Metrics', `Key changed from "${prevMetricsEffectKeyRef.current.substring(0, 80)}..." to "${metricsEffectKey.substring(0, 80)}..."`);
    }
    prevMetricsEffectKeyRef.current = metricsEffectKey;

    if (enabledHosts.length === 0) {
      log('Effect:Metrics', 'No enabled hosts, setting error');
      setError('No agents configured. Add Docker Metrics Agents in panel options.');
      setAllMetrics([]);
      return;
    }

    if (targetContainerIds.length === 0 && !options.showAllContainers) {
      log('Effect:Metrics', 'No containers selected, setting error');
      setError('No containers selected. Enable "Show All Containers" or select specific containers.');
      setAllMetrics([]);
      return;
    }

    setError(null);
    let isCancelled = false;

    const fetchAllMetrics = async (isIncremental: boolean) => {
      if (isCancelled) {
        log('Effect:Metrics', 'fetchAllMetrics skipped - cancelled');
        return;
      }

      log('Effect:Metrics', `fetchAllMetrics called, isIncremental: ${isIncremental}`);

      // Use refs to get latest time values without causing effect re-runs
      const from = isIncremental && lastTimestampRef.current
        ? lastTimestampRef.current
        : new Date(stableTimeFromRef.current).toISOString();
      const to = new Date(stableTimeToRef.current).toISOString();

      if (!isIncremental) {
        setLoading(true);
      }

      try {
        const newMetrics: ContainerMetrics[] = [];
        let totalAvailable = 0;

        await Promise.all(
          enabledHosts.map(async (host: HostConfig) => {
            try {
              const url = buildMetricsUrl(
                host.url,
                targetContainerIds,
                selectedFields,
                from,
                to,
                undefined, // no limit - get all data
                false
              );

              const response = await proxyGet<MetricsResponse>(url);
              // Only track totalAvailable from full fetches
              if (!isIncremental) {
                totalAvailable += response.metadata.totalAvailable;
              }
              for (const metric of response.metrics) {
                newMetrics.push({
                  ...metric,
                  hostId: host.id,
                  hostName: host.name,
                });
              }
            } catch (e) {
              log('Effect:Metrics', `Error fetching from host ${host.url}: ${e}`);
            }
          })
        );

        if (isCancelled) {
          log('Effect:Metrics', 'fetchAllMetrics cancelled after fetch');
          return;
        }

        log('Effect:Metrics', `Fetched ${newMetrics.length} metrics, totalAvailable: ${totalAvailable}`);

        // Only update totalAvailable from full fetches
        if (!isIncremental) {
          totalAvailableRef.current = totalAvailable;
          setLoading(false);
          initialFetchDoneRef.current = true;
        }

        if (newMetrics.length > 0) {
          mergeMetrics(newMetrics);
        }

      } catch (err) {
        log('Effect:Metrics', `fetchAllMetrics error: ${err}`);
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
          setLoading(false);
        }
      }
    };

    // Initial full fetch
    log('Effect:Metrics', 'Starting initial full fetch');
    fetchAllMetrics(false);

    // Set up interval for incremental updates
    const refreshInterval = (options.refreshInterval || 10) * 1000;
    log('Effect:Metrics', `Setting up interval with refreshInterval: ${refreshInterval}ms`);
    const interval = setInterval(() => {
      if (initialFetchDoneRef.current) {
        fetchAllMetrics(true);
      }
    }, refreshInterval);

    return () => {
      log('Effect:Metrics', 'cleanup - cancelling and clearing interval');
      isCancelled = true;
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Use stable string keys instead of object references to prevent re-runs
    // Note: Time range NOT included - accessed via refs to prevent re-runs when time changes
    enabledHosts.map(h => h.id + h.url).join(','),
    targetContainerIds.join(','),
    options.showAllContainers,
    options.refreshInterval,
    selectedFields.join(','),
  ]);

  // Build host URL lookup
  const hostUrlMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const host of hosts) {
      map.set(host.id, host.url);
    }
    return map;
  }, [hosts]);

  const containersByHost = useMemo(() => {
    const byContainer = new Map<string, ContainerWithMetrics>();
    const blacklist = options.containerBlacklist || [];

    for (const c of containers) {
      const isWhitelisted = (options.containerIds || []).includes(c.containerId);
      const isBlacklisted = blacklist.includes(c.containerId);
      const shouldInclude = options.showAllContainers ? !isBlacklisted : isWhitelisted;

      if (shouldInclude) {
        byContainer.set(c.containerId, {
          containerId: c.containerId,
          containerName: c.containerName,
          hostId: c.hostId,
          hostName: c.hostName,
          hostUrl: hostUrlMap.get(c.hostId) || '',
          metrics: [],
          latest: null,
          rateData: new Map(),
          latestRates: new Map(),
        });
      }
    }

    for (const m of allMetrics) {
      // Only add metrics to containers that exist in the current containers list
      // This prevents phantom containers from stale metrics cache
      const container = byContainer.get(m.containerId);
      if (container) {
        container.metrics.push(m);
      }
    }

    // Sort metrics and calculate rates
    for (const container of byContainer.values()) {
      if (container.metrics.length > 0) {
        container.metrics.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        container.latest = container.metrics[container.metrics.length - 1];

        for (const metricDef of AVAILABLE_METRICS.filter((m) => m.isRate)) {
          const rates = calculateRates(container.metrics, metricDef.key, metricDef.getValue);
          container.rateData.set(metricDef.key, rates);
          if (rates.length > 0) {
            container.latestRates.set(metricDef.key, rates[rates.length - 1]);
          }
        }
      }
    }

    const byHost = new Map<string, { hostId: string; hostName: string; hostUrl: string; containers: ContainerWithMetrics[] }>();
    for (const container of byContainer.values()) {
      const hostKey = container.hostId;
      if (!byHost.has(hostKey)) {
        byHost.set(hostKey, {
          hostId: container.hostId,
          hostName: container.hostName,
          hostUrl: container.hostUrl,
          containers: [],
        });
      }
      byHost.get(hostKey)!.containers.push(container);
    }

    for (const host of byHost.values()) {
      host.containers.sort((a, b) => a.containerName.localeCompare(b.containerName));
    }

    return Array.from(byHost.values()).sort((a, b) => a.hostName.localeCompare(b.hostName));
  }, [containers, allMetrics, options.showAllContainers, options.containerIds, options.containerBlacklist, hostUrlMap]);

  const totalContainers = containersByHost.reduce((sum, h) => sum + h.containers.length, 0);
  const totalHosts = containersByHost.length;

  const renderMetric = (container: ContainerWithMetrics, metricDef: MetricDefinition) => {
    const latest = container.latest;

    if (metricDef.isRate) {
      const rateData = container.rateData.get(metricDef.key) || [];
      const latestRate = container.latestRates.get(metricDef.key);

      if (latestRate === undefined && rateData.length === 0) {
        return null;
      }

      const displayValue = latestRate !== undefined ? latestRate : 0;

      return (
        <div key={metricDef.key} className={styles.metric}>
          <div className={styles.metricHeader}>
            <span className={styles.metricColorDot} style={{ background: metricDef.color }} />
            <span className={styles.metricLabel}>{metricDef.label}</span>
          </div>
          <div className={styles.metricValue}>
            {displayValue.toFixed(1)}
            <span className={styles.metricUnit}>{metricDef.unit}</span>
          </div>
          {rateData.length > 1 && (
            <Sparkline data={rateData} color={metricDef.color} formatValue={(v) => v.toFixed(1)} />
          )}
        </div>
      );
    }

    const rawValue = latest ? metricDef.getValue(latest) : null;

    if (rawValue === null || rawValue === undefined) {
      return null;
    }

    const data = container.metrics
      .map((m) => metricDef.getValue(m))
      .filter((v): v is number => v !== null && v !== undefined);

    return (
      <div key={metricDef.key} className={styles.metric}>
        <div className={styles.metricHeader}>
          <span className={styles.metricColorDot} style={{ background: metricDef.color }} />
          <span className={styles.metricLabel}>{metricDef.label}</span>
        </div>
        <div className={styles.metricValue}>
          {metricDef.format(rawValue)}
          <span className={styles.metricUnit}>{metricDef.unit}</span>
        </div>
        {data.length > 1 && <Sparkline data={data} color={metricDef.color} formatValue={metricDef.format} />}
      </div>
    );
  };

  if (error) {
    return (
      <div className={cx(styles.wrapper, css`width: ${width}px; height: ${height}px;`)}>
        <div className={styles.error}>
          <strong>Error:</strong> {error}
        </div>
        <div className={styles.info}>
          <p>Configuration:</p>
          <ul>
            <li>Agents: {enabledHosts.length} enabled</li>
            <li>Show All: {options.showAllContainers ? 'Yes' : 'No'}</li>
            <li>Selected: {(options.containerIds || []).length} containers</li>
          </ul>
        </div>
      </div>
    );
  }

  if (loading && allMetrics.length === 0 && targetContainerIds.length > 0) {
    return (
      <div className={cx(styles.wrapper, css`width: ${width}px; height: ${height}px;`)}>
        <div className={styles.loading}>Loading metrics from {enabledHosts.length} agent(s)...</div>
      </div>
    );
  }

  if (totalContainers === 0) {
    return (
      <div className={cx(styles.wrapper, css`width: ${width}px; height: ${height}px;`)}>
        <div className={styles.emptyState}>
          No containers to display.
          <br />
          <span style={{ fontSize: '11px' }}>
            {enabledHosts.length === 0
              ? 'Add and enable Docker Metrics Agents in panel options.'
              : options.showAllContainers
                ? 'Waiting for containers to be discovered...'
                : 'Select containers in panel options or enable "Show All Containers".'}
          </span>
        </div>
      </div>
    );
  }

  if (selectedMetricDefs.length === 0) {
    return (
      <div className={cx(styles.wrapper, css`width: ${width}px; height: ${height}px;`)}>
        <div className={styles.emptyState}>
          No metrics selected.
          <br />
          <span style={{ fontSize: '11px' }}>Select metrics to display in panel options under "Display".</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cx(styles.wrapper, css`width: ${width}px; height: ${height}px;`)}>
      <div className={styles.summary}>
        <span>
          {totalHosts} host{totalHosts !== 1 ? 's' : ''}
        </span>
        <span>
          {totalContainers} container{totalContainers !== 1 ? 's' : ''}
        </span>
        <span>{selectedMetricDefs.length} metrics</span>
        <span>
          {allMetrics.length}{totalAvailableRef.current > 0 ? `/${totalAvailableRef.current}` : ''} samples
          {initialFetchDoneRef.current ? ' ✓' : ''}
        </span>
      </div>

      {containersByHost.map((host) => (
        <div key={host.hostId} className={styles.hostSection}>
          <div className={styles.hostHeader}>
            <span className={styles.hostHealthDot} style={{ background: '#73BF69' }} />
            {host.hostName}
            <span className={styles.containerCount}>
              {host.containers.length} container{host.containers.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className={styles.containersGrid} style={containerGridStyle}>
            {host.containers.map((container) => {
              const statusOverride = statusOverrides.get(container.containerId);
              const isRunning = statusOverride?.isRunning ?? container.latest?.isRunning ?? false;
              const isPaused = statusOverride?.isPaused ?? container.latest?.isPaused ?? false;
              const pendingAction = pendingActions.get(container.containerId) || null;

              // Determine status display - pending action takes precedence
              const getStatusDisplay = () => {
                if (pendingAction) {
                  return {
                    label: `⏳ ${PENDING_ACTION_LABELS[pendingAction.action]}`,
                    color: '#FF9830', // amber for pending
                  };
                }
                if (isPaused) {
                  return { label: '● Paused', color: '#FF9830' };
                }
                if (isRunning) {
                  return { label: '● Running', color: '#73BF69' };
                }
                return { label: '● Stopped', color: '#FF5555' };
              };

              const statusDisplay = getStatusDisplay();

              return (
              <div key={container.containerId} className={styles.containerCard}>
                <div className={styles.containerHeader}>
                  <span className={styles.containerName} title={container.containerName}>
                    {container.containerName.replace(/^\//, '')}
                  </span>
                  <span
                    className={styles.containerStatus}
                    style={{ color: statusDisplay.color }}
                  >
                    {statusDisplay.label}
                  </span>
                </div>

                <div className={styles.metricsGrid} style={metricsGridStyle}>
                  {selectedMetricDefs.map((metricDef) => renderMetric(container, metricDef))}
                </div>

                {options.enableContainerControls && container.hostUrl && (
                  <ContainerControls
                    hostUrl={container.hostUrl}
                    containerId={container.containerId}
                    isRunning={isRunning}
                    isPaused={isPaused}
                    styles={styles}
                    pendingAction={pendingAction}
                    onPendingStart={handlePendingStart}
                    onPendingComplete={handlePendingComplete}
                    onStatusUpdate={handleStatusUpdate}
                  />
                )}
              </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
