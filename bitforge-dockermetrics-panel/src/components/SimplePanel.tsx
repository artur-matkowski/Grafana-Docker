import React, { useEffect, useState, useMemo } from 'react';
import { PanelProps } from '@grafana/data';
import { SimpleOptions, ContainerMetricSnapshot, ContainerInfo, AVAILABLE_METRICS, MetricDefinition, DEFAULT_METRICS } from 'types';
import { css, cx } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';

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

  // Generate points as percentage-based coordinates (0-100 for x, actual pixels for y)
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
      {/* Chart area - takes remaining space */}
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          style={{ display: 'block' }}
        >
          {/* Grid lines */}
          <line x1="0" y1={padding} x2="100" y2={padding} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          <line x1="0" y1={padding + chartHeight / 2} x2="100" y2={padding + chartHeight / 2} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          <line x1="0" y1={padding + chartHeight} x2="100" y2={padding + chartHeight} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          {/* Data line */}
          <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      {/* Scale labels - fixed width, not stretched */}
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
  metrics: ContainerMetricSnapshot[];
  latest: ContainerMetricSnapshot | null;
  rateData: Map<string, number[]>; // Calculated rate data for rate metrics
  latestRates: Map<string, number>; // Latest rate values
}

// Calculate rate (delta/time) from cumulative values
function calculateRates(
  metrics: ContainerMetricSnapshot[],
  metricKey: string,
  getValue: (s: ContainerMetricSnapshot) => number | null
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
    // Handle counter resets (when container restarts)
    const rate = valueDelta >= 0 ? valueDelta / timeDelta : 0;
    // Convert to KB/s
    rates.push(rate / 1024);
  }

  return rates;
}

export const SimplePanel: React.FC<Props> = ({ width, height, options, timeRange }) => {
  const containersPerRow = options.containersPerRow || 0;
  const metricsPerRow = options.metricsPerRow || 0;
  const styles = useStyles2(getStyles);

  // Dynamic grid styles based on options
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

  const [allMetrics, setAllMetrics] = useState<ContainerMetricSnapshot[]>([]);
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const selectedMetricDefs = useMemo(() => {
    const selected = options.selectedMetrics || DEFAULT_METRICS;
    return AVAILABLE_METRICS.filter((m) => selected.includes(m.key));
  }, [options.selectedMetrics]);

  useEffect(() => {
    const fetchContainers = async () => {
      if (!options.apiUrl) return;
      try {
        const response = await fetch(`${options.apiUrl}/api/containers`);
        if (response.ok) {
          const data: ContainerInfo[] = await response.json();
          setContainers(data);
        }
      } catch {
        // Ignore errors
      }
    };

    fetchContainers();
    const interval = setInterval(fetchContainers, 30000);
    return () => clearInterval(interval);
  }, [options.apiUrl]);

  const targetContainerIds = useMemo(() => {
    if (options.showAllContainers) {
      return containers.map((c) => c.containerId);
    }
    return options.containerIds || [];
  }, [options.showAllContainers, options.containerIds, containers]);

  useEffect(() => {
    const fetchMetrics = async () => {
      if (!options.apiUrl) {
        setError('Please configure API URL in panel options');
        setAllMetrics([]);
        return;
      }

      if (targetContainerIds.length === 0 && !options.showAllContainers) {
        setError('No containers selected. Enable "Show All Containers" or select specific containers.');
        setAllMetrics([]);
        return;
      }

      if (targetContainerIds.length === 0) {
        setAllMetrics([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const from = timeRange.from.toISOString();
        const to = timeRange.to.toISOString();

        const metricsPromises = targetContainerIds.map(async (containerId) => {
          const url = `${options.apiUrl}/api/metrics/containers?id=${containerId}&from=${from}&to=${to}`;
          const response = await fetch(url);
          if (!response.ok) return [];
          return response.json() as Promise<ContainerMetricSnapshot[]>;
        });

        const results = await Promise.all(metricsPromises);
        const combined = results.flat();
        setAllMetrics(combined);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
        setAllMetrics([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000);
    return () => clearInterval(interval);
  }, [options.apiUrl, targetContainerIds, options.showAllContainers, timeRange.from.valueOf(), timeRange.to.valueOf()]);

  const containersByHost = useMemo(() => {
    const byContainer = new Map<string, ContainerWithMetrics>();

    for (const c of containers) {
      if (options.showAllContainers || (options.containerIds || []).includes(c.containerId)) {
        byContainer.set(c.containerId, {
          containerId: c.containerId,
          containerName: c.containerName,
          hostId: c.hostId,
          hostName: c.hostName,
          metrics: [],
          latest: null,
          rateData: new Map(),
          latestRates: new Map(),
        });
      }
    }

    for (const m of allMetrics) {
      let container = byContainer.get(m.containerId);
      if (!container) {
        container = {
          containerId: m.containerId,
          containerName: m.containerName,
          hostId: m.hostId,
          hostName: m.hostName,
          metrics: [],
          latest: null,
          rateData: new Map(),
          latestRates: new Map(),
        };
        byContainer.set(m.containerId, container);
      }
      container.metrics.push(m);
    }

    // Sort metrics and calculate rates
    for (const container of byContainer.values()) {
      if (container.metrics.length > 0) {
        container.metrics.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        container.latest = container.metrics[container.metrics.length - 1];

        // Calculate rates for rate-based metrics
        for (const metricDef of AVAILABLE_METRICS.filter((m) => m.isRate)) {
          const rates = calculateRates(container.metrics, metricDef.key, metricDef.getValue);
          container.rateData.set(metricDef.key, rates);
          if (rates.length > 0) {
            container.latestRates.set(metricDef.key, rates[rates.length - 1]);
          }
        }
      }
    }

    const byHost = new Map<string, { hostId: string; hostName: string; containers: ContainerWithMetrics[] }>();
    for (const container of byContainer.values()) {
      const hostKey = container.hostId;
      if (!byHost.has(hostKey)) {
        byHost.set(hostKey, {
          hostId: container.hostId,
          hostName: container.hostName,
          containers: [],
        });
      }
      byHost.get(hostKey)!.containers.push(container);
    }

    for (const host of byHost.values()) {
      host.containers.sort((a, b) => a.containerName.localeCompare(b.containerName));
    }

    return Array.from(byHost.values()).sort((a, b) => a.hostName.localeCompare(b.hostName));
  }, [containers, allMetrics, options.showAllContainers, options.containerIds]);

  const totalContainers = containersByHost.reduce((sum, h) => sum + h.containers.length, 0);
  const totalHosts = containersByHost.length;

  const renderMetric = (container: ContainerWithMetrics, metricDef: MetricDefinition) => {
    const latest = container.latest;

    // For rate metrics, use calculated rate data
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

    // For non-rate metrics, use direct values
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
            <li>API URL: {options.apiUrl || '(not set)'}</li>
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
        <div className={styles.loading}>Loading metrics for {targetContainerIds.length} containers...</div>
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
            {options.showAllContainers
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
        <span>{allMetrics.length} samples</span>
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
            {host.containers.map((container) => (
              <div key={container.containerId} className={styles.containerCard}>
                <div className={styles.containerHeader}>
                  <span className={styles.containerName} title={container.containerName}>
                    {container.containerName.replace(/^\//, '')}
                  </span>
                  <span
                    className={styles.containerStatus}
                    style={{ color: container.latest?.isRunning ? '#73BF69' : '#FF5555' }}
                  >
                    {container.latest?.isRunning ? '● Running' : '● Stopped'}
                  </span>
                </div>

                <div className={styles.metricsGrid} style={metricsGridStyle}>
                  {selectedMetricDefs.map((metricDef) => renderMetric(container, metricDef))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
