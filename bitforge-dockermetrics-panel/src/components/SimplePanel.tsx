import React, { useMemo, useCallback } from 'react';
import { PanelProps, DataFrame, FieldType } from '@grafana/data';
import { SimpleOptions, ContainerMetrics, ContainerInfo, AVAILABLE_METRICS, MetricDefinition, ContainerState, ContainerHealthStatus, getStateDisplay, getPulseType, ControlAction, ALL_CONTROL_ACTIONS } from 'types';
import { css, cx, keyframes } from '@emotion/css';
import { useStyles2, Alert } from '@grafana/ui';
import { normalizeContainerState, normalizeHealthStatus, isStateRunning, isStatePaused, isHealthUnhealthy } from '../utils/datasource';
import { useContainerControl } from '../hooks/useContainerControl';
import { ContainerControls } from './ContainerControls';

// Format uptime seconds to human-readable string
const formatUptime = (seconds: number): string => {
  if (seconds < 60) {
    return `${Math.floor(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
};

// Pulsating animation keyframes for container status indicators
const pulseRedKeyframes = keyframes`
  0%, 100% {
    border-color: rgba(255, 85, 85, 0.3);
    box-shadow: 0 0 0 0 rgba(255, 85, 85, 0);
    background: rgba(255, 85, 85, 0.04);
  }
  50% {
    border-color: rgba(255, 85, 85, 0.8);
    box-shadow: 0 0 8px 2px rgba(255, 85, 85, 0.3);
    background: rgba(255, 85, 85, 0.08);
  }
`;

const pulseYellowKeyframes = keyframes`
  0%, 100% {
    border-color: rgba(255, 152, 48, 0.3);
    box-shadow: 0 0 0 0 rgba(255, 152, 48, 0);
    background: rgba(255, 152, 48, 0.04);
  }
  50% {
    border-color: rgba(255, 152, 48, 0.8);
    box-shadow: 0 0 8px 2px rgba(255, 152, 48, 0.3);
    background: rgba(255, 152, 48, 0.08);
  }
`;

interface Props extends PanelProps<SimpleOptions> {}

// Parse containers from Grafana's DataFrame format (from props.data.series)
function parseContainersFromDataFrame(frame: DataFrame): ContainerInfo[] {
  const containers: ContainerInfo[] = [];

  const containerIdField = frame.fields.find((f) => f.name === 'containerId');
  const containerNameField = frame.fields.find((f) => f.name === 'containerName');
  const hostIdField = frame.fields.find((f) => f.name === 'hostId');
  const hostNameField = frame.fields.find((f) => f.name === 'hostName');
  const stateField = frame.fields.find((f) => f.name === 'state');
  const healthStatusField = frame.fields.find((f) => f.name === 'healthStatus');
  const isRunningField = frame.fields.find((f) => f.name === 'isRunning');
  const isPausedField = frame.fields.find((f) => f.name === 'isPaused');
  const isUnhealthyField = frame.fields.find((f) => f.name === 'isUnhealthy');

  if (!containerIdField || !containerNameField) {
    return [];
  }

  for (let i = 0; i < frame.length; i++) {
    const state = normalizeContainerState(stateField?.values[i]);
    const healthStatus = normalizeHealthStatus(healthStatusField?.values[i]);
    const hostName = (hostNameField?.values[i] as string) || 'default';

    containers.push({
      hostId: (hostIdField?.values[i] as string) || hostName,
      hostName: hostName,
      containerId: containerIdField.values[i] as string,
      containerName: containerNameField.values[i] as string,
      state,
      healthStatus,
      isRunning: (isRunningField?.values[i] as boolean) ?? isStateRunning(state),
      isPaused: (isPausedField?.values[i] as boolean) ?? isStatePaused(state),
      isUnhealthy: (isUnhealthyField?.values[i] as boolean) ?? isHealthUnhealthy(healthStatus),
    });
  }

  return containers;
}

// Result type for parseMetricsFromDataFrames - includes per-container metric tracking
interface ParsedMetricsResult {
  metrics: ContainerMetrics[];
  presentMetrics: Map<string, Set<string>>; // hostId:containerName -> set of metric keys
}

// Parse metrics from Grafana's DataFrame format (from props.data.series)
function parseMetricsFromDataFrames(frames: DataFrame[]): ParsedMetricsResult {
  const metricsMap = new Map<string, ContainerMetrics>();
  const presentMetrics = new Map<string, Set<string>>();

  for (const frame of frames) {
    if (!frame.fields || frame.fields.length < 2) {
      continue;
    }

    const timeField = frame.fields.find((f) => f.type === FieldType.time);
    const valueField = frame.fields.find((f) => f.type === FieldType.number);

    if (!timeField || !valueField) {
      continue;
    }

    const labels = valueField.labels || {};
    const containerId = labels.containerId || '';
    const containerName = labels.containerName || '';
    const hostName = labels.hostName || 'default';
    const fieldName = valueField.name || '';

    // Track which metric this frame represents for this container
    let metricKey: string | null = null;
    if (fieldName.includes('CPU %') || fieldName === 'cpuPercent') {
      metricKey = 'cpuPercent';
    } else if (fieldName.includes('Memory (MB)') || fieldName === 'memoryBytes') {
      metricKey = 'memoryBytes';
    } else if (fieldName.includes('Memory %') || fieldName === 'memoryPercent') {
      metricKey = 'memoryPercent';
    } else if (fieldName.includes('Network RX') || fieldName === 'networkRxBytes') {
      metricKey = 'networkRxBytes';
    } else if (fieldName.includes('Network TX') || fieldName === 'networkTxBytes') {
      metricKey = 'networkTxBytes';
    } else if (fieldName.includes('Disk Read') || fieldName === 'diskReadBytes') {
      metricKey = 'diskReadBytes';
    } else if (fieldName.includes('Disk Write') || fieldName === 'diskWriteBytes') {
      metricKey = 'diskWriteBytes';
    } else if (fieldName.includes('Uptime') || fieldName === 'uptimeSeconds') {
      metricKey = 'uptimeSeconds';
    } else if (fieldName === 'cpuPressureSome' || fieldName.includes('CPU Pressure (some)')) {
      metricKey = 'cpuPressureSome';
    } else if (fieldName === 'cpuPressureFull' || fieldName.includes('CPU Pressure (full)')) {
      metricKey = 'cpuPressureFull';
    } else if (fieldName === 'memoryPressureSome' || fieldName.includes('Memory Pressure (some)')) {
      metricKey = 'memoryPressureSome';
    } else if (fieldName === 'memoryPressureFull' || fieldName.includes('Memory Pressure (full)')) {
      metricKey = 'memoryPressureFull';
    } else if (fieldName === 'ioPressureSome' || fieldName.includes('I/O Pressure (some)')) {
      metricKey = 'ioPressureSome';
    } else if (fieldName === 'ioPressureFull' || fieldName.includes('I/O Pressure (full)')) {
      metricKey = 'ioPressureFull';
    }

    // Track that this container has this metric (keyed by hostName:containerName for stability across container recreates)
    if (metricKey && containerName && hostName) {
      const containerKey = `${hostName}:${containerName}`;
      if (!presentMetrics.has(containerKey)) {
        presentMetrics.set(containerKey, new Set());
      }
      presentMetrics.get(containerKey)!.add(metricKey);
    }

    for (let i = 0; i < frame.length; i++) {
      const timestamp = new Date(timeField.values[i] as number).toISOString();
      const value = valueField.values[i] as number;

      const key = `${hostName}:${containerName}:${timestamp}`;
      if (!metricsMap.has(key)) {
        metricsMap.set(key, {
          hostId: hostName,
          hostName: hostName,
          containerId,
          containerName,
          timestamp,
          cpuPercent: 0,
          memoryBytes: 0,
          memoryPercent: 0,
          networkRxBytes: 0,
          networkTxBytes: 0,
          diskReadBytes: 0,
          diskWriteBytes: 0,
          uptimeSeconds: 0,
          state: 'undefined' as ContainerState,
          healthStatus: 'none' as ContainerHealthStatus,
          isRunning: false,
          isPaused: false,
          isUnhealthy: false,
          cpuPressure: null,
          memoryPressure: null,
          ioPressure: null,
        });
      }

      const metric = metricsMap.get(key)!;

      // Map display names back to metric keys
      if (fieldName.includes('CPU %') || fieldName === 'cpuPercent') {
        metric.cpuPercent = value;
      } else if (fieldName.includes('Memory (MB)') || fieldName === 'memoryBytes') {
        metric.memoryBytes = value * 1024 * 1024;
      } else if (fieldName.includes('Memory %') || fieldName === 'memoryPercent') {
        metric.memoryPercent = value;
      } else if (fieldName.includes('Network RX') || fieldName === 'networkRxBytes') {
        metric.networkRxBytes = value * 1024 * 1024;
      } else if (fieldName.includes('Network TX') || fieldName === 'networkTxBytes') {
        metric.networkTxBytes = value * 1024 * 1024;
      } else if (fieldName.includes('Disk Read') || fieldName === 'diskReadBytes') {
        metric.diskReadBytes = value * 1024 * 1024;
      } else if (fieldName.includes('Disk Write') || fieldName === 'diskWriteBytes') {
        metric.diskWriteBytes = value * 1024 * 1024;
      } else if (fieldName.includes('Uptime') || fieldName === 'uptimeSeconds') {
        metric.uptimeSeconds = value;
      } else if (fieldName === 'cpuPressureSome' || fieldName.includes('CPU Pressure (some)')) {
        metric.cpuPressure = metric.cpuPressure || { some10: 0, some60: 0, some300: 0, full10: 0, full60: 0, full300: 0 };
        metric.cpuPressure.some10 = value;
      } else if (fieldName === 'cpuPressureFull' || fieldName.includes('CPU Pressure (full)')) {
        metric.cpuPressure = metric.cpuPressure || { some10: 0, some60: 0, some300: 0, full10: 0, full60: 0, full300: 0 };
        metric.cpuPressure.full10 = value;
      } else if (fieldName === 'memoryPressureSome' || fieldName.includes('Memory Pressure (some)')) {
        metric.memoryPressure = metric.memoryPressure || { some10: 0, some60: 0, some300: 0, full10: 0, full60: 0, full300: 0 };
        metric.memoryPressure.some10 = value;
      } else if (fieldName === 'memoryPressureFull' || fieldName.includes('Memory Pressure (full)')) {
        metric.memoryPressure = metric.memoryPressure || { some10: 0, some60: 0, some300: 0, full10: 0, full60: 0, full300: 0 };
        metric.memoryPressure.full10 = value;
      } else if (fieldName === 'ioPressureSome' || fieldName.includes('I/O Pressure (some)')) {
        metric.ioPressure = metric.ioPressure || { some10: 0, some60: 0, some300: 0, full10: 0, full60: 0, full300: 0 };
        metric.ioPressure.some10 = value;
      } else if (fieldName === 'ioPressureFull' || fieldName.includes('I/O Pressure (full)')) {
        metric.ioPressure = metric.ioPressure || { some10: 0, some60: 0, some300: 0, full10: 0, full60: 0, full300: 0 };
        metric.ioPressure.full10 = value;
      }
    }
  }

  return {
    metrics: Array.from(metricsMap.values()),
    presentMetrics,
  };
}

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
      background: rgba(115, 191, 105, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      padding: 12px;
    `,
    containerCardPulseRed: css`
      animation: ${pulseRedKeyframes} 1.2s ease-in-out infinite;
      @media (prefers-reduced-motion: reduce) {
        animation: none;
        border-color: rgba(255, 85, 85, 0.6);
        background: rgba(255, 85, 85, 0.06);
      }
    `,
    containerCardPulseYellow: css`
      animation: ${pulseYellowKeyframes} 1.2s ease-in-out infinite;
      @media (prefers-reduced-motion: reduce) {
        animation: none;
        border-color: rgba(255, 152, 48, 0.6);
        background: rgba(255, 152, 48, 0.06);
      }
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
      flex-shrink: 0;
    `,
    containerUptime: css`
      font-size: 10px;
      color: #888;
      margin-left: 8px;
      flex-shrink: 0;
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
  fixedMin?: number;
  fixedMax?: number;
}

const Sparkline: React.FC<SparklineProps> = ({ data, color, height = 40, formatValue, fixedMin, fixedMax }) => {
  if (data.length < 2) {
    return null;
  }

  const padding = 2;
  const chartHeight = height - padding * 2;

  const min = fixedMin ?? Math.min(...data);
  const max = fixedMax ?? Math.max(...data);
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

// Format bytes/s in compact resistor-style notation (e.g., 1k1 = 1.1 KB/s, 2m5 = 2.5 MB/s)
function formatBytesCompact(kbps: number): string {
  if (kbps < 1) {
    // Sub-KB: show as bytes
    const bytes = Math.round(kbps * 1024);
    return bytes === 0 ? '0' : `${bytes}`;
  }
  if (kbps < 1024) {
    // KB range: use 'k' notation
    const whole = Math.floor(kbps);
    const decimal = Math.round((kbps - whole) * 10);
    if (decimal === 0 || decimal === 10) {
      return `${decimal === 10 ? whole + 1 : whole}k`;
    }
    return `${whole}k${decimal}`;
  }
  // MB range: use 'm' notation
  const mbps = kbps / 1024;
  const whole = Math.floor(mbps);
  const decimal = Math.round((mbps - whole) * 10);
  if (decimal === 0 || decimal === 10) {
    return `${decimal === 10 ? whole + 1 : whole}m`;
  }
  return `${whole}m${decimal}`;
}

// DualSparkline for combined bidirectional metrics (e.g., Net RX/TX)
interface DualSparklineProps {
  upperData: number[];     // TX (upload) - shown above center
  lowerData: number[];     // RX (download) - shown below center
  upperColor: string;      // TX color
  lowerColor: string;      // RX color
  height?: number;
}

const DualSparkline: React.FC<DualSparklineProps> = ({
  upperData,
  lowerData,
  upperColor,
  lowerColor,
  height = 40,
}) => {
  // Need at least 2 points for either dataset
  if (upperData.length < 2 && lowerData.length < 2) {
    return null;
  }

  const padding = 2;
  const chartHeight = height - padding * 2;
  const centerY = padding + chartHeight / 2;

  // Calculate symmetric scale using max of both datasets
  const maxUpper = upperData.length > 0 ? Math.max(...upperData) : 0;
  const maxLower = lowerData.length > 0 ? Math.max(...lowerData) : 0;
  const maxScale = Math.max(maxUpper, maxLower) || 1;

  // Generate points for upper data (TX) - above center line
  const upperPoints = upperData
    .map((value, index) => {
      const x = (index / (upperData.length - 1)) * 100;
      const y = centerY - (value / maxScale) * (chartHeight / 2);
      return `${x},${y}`;
    })
    .join(' ');

  // Generate points for lower data (RX) - below center line (visually inverted)
  const lowerPoints = lowerData
    .map((value, index) => {
      const x = (index / (lowerData.length - 1)) * 100;
      const y = centerY + (value / maxScale) * (chartHeight / 2);
      return `${x},${y}`;
    })
    .join(' ');

  const scaleMaxLabel = formatBytesCompact(maxScale);

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
          {/* Top line (max TX) */}
          <line x1="0" y1={padding} x2="100" y2={padding} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          {/* Center line (0) */}
          <line x1="0" y1={centerY} x2="100" y2={centerY} stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          {/* Bottom line (max RX) */}
          <line x1="0" y1={padding + chartHeight} x2="100" y2={padding + chartHeight} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          {/* TX line (upper, above center) */}
          {upperData.length > 1 && (
            <polyline fill="none" stroke={upperColor} strokeWidth="1.5" points={upperPoints} vectorEffect="non-scaling-stroke" />
          )}
          {/* RX line (lower, below center) */}
          {lowerData.length > 1 && (
            <polyline fill="none" stroke={lowerColor} strokeWidth="1.5" points={lowerPoints} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
      </div>
      <div
        style={{
          width: '28px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          fontSize: '7px',
          color: '#666',
          textAlign: 'right',
          paddingLeft: '2px',
          flexShrink: 0,
        }}
      >
        <span style={{ color: upperColor }}>{scaleMaxLabel}</span>
        <span>0</span>
        <span style={{ color: lowerColor }}>{scaleMaxLabel}</span>
      </div>
    </div>
  );
};

// Helper to calculate memory limit from memoryBytes and memoryPercent
function getMemoryLimit(metrics: ContainerMetrics[]): number | null {
  for (const m of metrics) {
    if (m.memoryBytes > 0 && m.memoryPercent > 0) {
      return m.memoryBytes / (m.memoryPercent / 100);
    }
  }
  return null;
}

interface ContainerWithMetrics {
  containerId: string;
  containerName: string;
  hostId: string;
  hostName: string;
  state: ContainerState;
  healthStatus: ContainerHealthStatus;
  isRunning: boolean;
  isPaused: boolean;
  isUnhealthy: boolean;
  metrics: ContainerMetrics[];
  latest: ContainerMetrics | null;
  rateData: Map<string, number[]>;
  latestRates: Map<string, number>;
  presentMetrics: Set<string>; // Which metrics actually have data for this container
}

// Calculate rate (delta/time) from cumulative values
function calculateRates(
  metrics: ContainerMetrics[],
  getValue: (s: ContainerMetrics) => number | null
): number[] {
  if (metrics.length < 2) {return [];}

  const rates: number[] = [];
  for (let i = 1; i < metrics.length; i++) {
    const prev = metrics[i - 1];
    const curr = metrics[i];
    const prevVal = getValue(prev);
    const currVal = getValue(curr);

    if (prevVal === null || currVal === null) {continue;}

    const timeDelta = (new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000;
    if (timeDelta <= 0) {continue;}

    const valueDelta = currVal - prevVal;
    const rate = valueDelta >= 0 ? valueDelta / timeDelta : 0;
    rates.push(rate / 1024);
  }

  return rates;
}

// Determine which metrics are present in the data (across all containers)
function detectMetricsFromData(presentMetricsMap: Map<string, Set<string>>): MetricDefinition[] {
  // Collect all metrics that are present for any container
  const allPresent = new Set<string>();
  for (const metrics of presentMetricsMap.values()) {
    for (const metric of metrics) {
      allPresent.add(metric);
    }
  }

  if (allPresent.size === 0) {
    return AVAILABLE_METRICS;
  }

  // Check if both network metrics are present - if so, add combined and remove individuals
  const hasNetRx = allPresent.has('networkRxBytes');
  const hasNetTx = allPresent.has('networkTxBytes');
  const useCombinedNetwork = hasNetRx && hasNetTx;

  if (useCombinedNetwork) {
    allPresent.add('networkCombined');
    allPresent.delete('networkRxBytes');
    allPresent.delete('networkTxBytes');
  }

  return AVAILABLE_METRICS.filter(m => allPresent.has(m.key));
}

export const SimplePanel: React.FC<Props> = ({ width, height, options, data }) => {
  const containersPerRow = options.containersPerRow || 0;
  const metricsPerRow = options.metricsPerRow || 0;
  const enableControls = options.enableControls || false;
  const allowedActions = options.allowedActions || ALL_CONTROL_ACTIONS;
  const confirmDangerousActions = options.confirmDangerousActions ?? true;
  const styles = useStyles2(getStyles);

  // Container control hook
  const { executeAction, loading: controlLoading, error: controlError, clearError } = useContainerControl();

  // Extract datasource UID from the query request
  const datasourceUid = useMemo(() => {
    const targets = data?.request?.targets;
    if (targets && targets.length > 0) {
      const ds = targets[0]?.datasource;
      if (ds && typeof ds === 'object' && 'uid' in ds) {
        return (ds as { uid: string }).uid;
      }
    }
    return '';
  }, [data?.request?.targets]);

  // Handle control action
  const handleControlAction = useCallback(
    async (action: ControlAction, containerId: string, hostId: string) => {
      if (!datasourceUid) {
        console.error('Cannot execute control action: datasource UID not available');
        return;
      }
      try {
        await executeAction(action, containerId, hostId, datasourceUid);
      } catch (err) {
        // Error is already stored in hook state
        console.error('Control action failed:', err);
      }
    },
    [executeAction, datasourceUid]
  );

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

  // Check if we have query data from Grafana's query system
  const hasQueryData = data?.series?.length > 0;

  // Parse containers from props.data.series (from Grafana's query runner)
  const containers = useMemo(() => {
    if (!hasQueryData) {
      return [];
    }

    // Find containers query result by refId or queryType
    const containersFrame = data.series.find(frame =>
      frame.refId === 'containers' ||
      frame.meta?.custom?.queryType === 'containers' ||
      // Also check if frame has containerId field (indicator of containers query)
      (frame.fields.some(f => f.name === 'containerId') && frame.fields.some(f => f.name === 'state'))
    );

    if (containersFrame) {
      return parseContainersFromDataFrame(containersFrame);
    }

    return [];
  }, [data?.series, hasQueryData]);

  // Parse metrics from props.data.series (from Grafana's query runner)
  const { allMetrics, presentMetricsMap } = useMemo(() => {
    if (!hasQueryData) {
      return { allMetrics: [], presentMetricsMap: new Map<string, Set<string>>() };
    }

    // Find metric frames (exclude containers frame)
    const metricsFrames = data.series.filter(frame =>
      frame.refId !== 'containers' &&
      frame.meta?.custom?.queryType !== 'containers' &&
      // Check if this frame has time-series data (time field + number field)
      frame.fields.some(f => f.type === FieldType.time) &&
      frame.fields.some(f => f.type === FieldType.number)
    );

    if (metricsFrames.length > 0) {
      const result = parseMetricsFromDataFrames(metricsFrames);
      return { allMetrics: result.metrics, presentMetricsMap: result.presentMetrics };
    }

    return { allMetrics: [], presentMetricsMap: new Map<string, Set<string>>() };
  }, [data?.series, hasQueryData]);

  // Detect which metrics are present in the data (determined by query)
  const selectedMetricDefs = useMemo(() => {
    return detectMetricsFromData(presentMetricsMap);
  }, [presentMetricsMap]);

  // Group by container and host - NO filtering, display everything from query
  // Uses hostName:containerName as key to match metrics frame labels
  const containersByHost = useMemo(() => {
    const byContainer = new Map<string, ContainerWithMetrics>();

    // Add all containers from the containers query result
    for (const c of containers) {
      const containerKey = `${c.hostName}:${c.containerName}`;
      byContainer.set(containerKey, {
        containerId: c.containerId,
        containerName: c.containerName,
        hostId: c.hostId,
        hostName: c.hostName,
        state: c.state,
        healthStatus: c.healthStatus,
        isRunning: c.isRunning,
        isPaused: c.isPaused,
        isUnhealthy: c.isUnhealthy,
        metrics: [],
        latest: null,
        rateData: new Map(),
        latestRates: new Map(),
        presentMetrics: presentMetricsMap.get(containerKey) || new Set(),
      });
    }

    // Add metrics to containers
    for (const m of allMetrics) {
      const containerKey = `${m.hostName}:${m.containerName}`;
      let container = byContainer.get(containerKey);
      if (!container) {
        // Container not in containers list but has metrics - add it
        container = {
          containerId: m.containerId,
          containerName: m.containerName,
          hostId: m.hostName,
          hostName: m.hostName,
          state: 'undefined' as ContainerState,
          healthStatus: 'none' as ContainerHealthStatus,
          isRunning: false,
          isPaused: false,
          isUnhealthy: false,
          metrics: [],
          latest: null,
          rateData: new Map(),
          latestRates: new Map(),
          presentMetrics: presentMetricsMap.get(containerKey) || new Set(),
        };
        byContainer.set(containerKey, container);
      }
      container.metrics.push(m);
    }

    // Sort and calculate rates
    for (const container of byContainer.values()) {
      if (container.metrics.length > 0) {
        container.metrics.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        container.latest = container.metrics[container.metrics.length - 1];

        for (const metricDef of AVAILABLE_METRICS.filter((m) => m.isRate)) {
          const rates = calculateRates(container.metrics, metricDef.getValue);
          container.rateData.set(metricDef.key, rates);
          if (rates.length > 0) {
            container.latestRates.set(metricDef.key, rates[rates.length - 1]);
          }
        }
      }
    }

    // Group by host
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
  }, [containers, allMetrics, presentMetricsMap]);

  const totalContainers = containersByHost.reduce((sum, h) => sum + h.containers.length, 0);
  const totalHosts = containersByHost.length;

  const allContainersFlat = useMemo(() => {
    return containersByHost.flatMap(host => host.containers);
  }, [containersByHost]);

  const renderMetric = (container: ContainerWithMetrics, metricDef: MetricDefinition) => {
    // Handle combined network metric
    if (metricDef.isCombined && metricDef.combineKeys) {
      // For networkCombined, check if either underlying metric is present
      const hasAnyKey = metricDef.combineKeys.some(key => container.presentMetrics.has(key));
      if (!hasAnyKey) {
        return null;
      }

      // Get rate data for both TX and RX
      const txRateData = container.rateData.get('networkTxBytes') || [];
      const rxRateData = container.rateData.get('networkRxBytes') || [];
      const txLatest = container.latestRates.get('networkTxBytes');
      const rxLatest = container.latestRates.get('networkRxBytes');

      if (txRateData.length === 0 && rxRateData.length === 0) {
        return null;
      }

      const txDisplay = txLatest !== undefined ? txLatest : 0;
      const rxDisplay = rxLatest !== undefined ? rxLatest : 0;

      return (
        <div key={metricDef.key} className={styles.metric}>
          <div className={styles.metricHeader}>
            <span className={styles.metricColorDot} style={{ background: metricDef.color }} />
            <span className={styles.metricLabel}>{metricDef.label}</span>
          </div>
          <div className={styles.metricValue}>
            <span style={{ color: metricDef.color }}>{txDisplay.toFixed(1)}</span>
            <span style={{ color: '#888' }}>/</span>
            <span style={{ color: metricDef.secondaryColor }}>{rxDisplay.toFixed(1)}</span>
            <span className={styles.metricUnit}>{metricDef.unit}</span>
          </div>
          {(txRateData.length > 1 || rxRateData.length > 1) && (
            <DualSparkline
              upperData={txRateData}
              lowerData={rxRateData}
              upperColor={metricDef.color}
              lowerColor={metricDef.secondaryColor || '#FF9830'}
            />
          )}
        </div>
      );
    }

    // Check if this container actually has this metric in the query results
    if (!container.presentMetrics.has(metricDef.key)) {
      return null;
    }

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
            <Sparkline
              data={rateData}
              color={metricDef.color}
              formatValue={(v) => v.toFixed(1)}
              fixedMin={metricDef.fixedMin}
              fixedMax={metricDef.fixedMax}
            />
          )}
        </div>
      );
    }

    const rawValue = latest ? metricDef.getValue(latest) : null;

    if (rawValue === null || rawValue === undefined) {
      return null;
    }

    const metricData = container.metrics
      .map((m) => metricDef.getValue(m))
      .filter((v): v is number => v !== null && v !== undefined);

    // For memoryBytes, calculate memory limit for fixedMax
    let effectiveFixedMax = metricDef.fixedMax;
    if (metricDef.key === 'memoryBytes') {
      const memLimit = getMemoryLimit(container.metrics);
      if (memLimit !== null) {
        effectiveFixedMax = memLimit;
      }
    }

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
        {metricData.length > 1 && (
          <Sparkline
            data={metricData}
            color={metricDef.color}
            formatValue={metricDef.format}
            fixedMin={metricDef.fixedMin}
            fixedMax={effectiveFixedMax}
          />
        )}
      </div>
    );
  };

  if (!hasQueryData) {
    return (
      <div className={cx(styles.wrapper, css`width: ${width}px; height: ${height}px;`)}>
        <div className={styles.emptyState}>
          No query data available.
          <br />
          <span style={{ fontSize: '11px' }}>
            Add a Docker Metrics data source query to this panel.
          </span>
        </div>
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
            Configure container selection in the query editor.
          </span>
        </div>
      </div>
    );
  }

  if (selectedMetricDefs.length === 0) {
    return (
      <div className={cx(styles.wrapper, css`width: ${width}px; height: ${height}px;`)}>
        <div className={styles.emptyState}>
          No metrics in query results.
          <br />
          <span style={{ fontSize: '11px' }}>Select metrics in the query editor.</span>
        </div>
      </div>
    );
  }

  const renderContainerCard = (container: ContainerWithMetrics) => {
    // Use container state from container info (from /api/containers), fallback to latest metrics state
    const state: ContainerState = container.state ?? container.latest?.state ?? 'undefined';
    const healthStatus: ContainerHealthStatus = container.healthStatus ?? container.latest?.healthStatus ?? 'none';
    const statusDisplay = getStateDisplay(state);
    const pulseType = getPulseType(state, healthStatus);

    const cardClassName = cx(
      styles.containerCard,
      pulseType === 'red' && styles.containerCardPulseRed,
      pulseType === 'yellow' && styles.containerCardPulseYellow
    );

    return (
      <div key={`${container.hostId}:${container.containerName}`} className={cardClassName}>
        <div className={styles.containerHeader}>
          <span className={styles.containerName} title={container.containerName}>
            {container.containerName.replace(/^\//, '')}
          </span>
          <span className={styles.containerStatus} style={{ color: statusDisplay.color }}>
            {statusDisplay.label}
          </span>
          {container.latest?.uptimeSeconds !== undefined && container.latest.uptimeSeconds > 0 && (
            <span className={styles.containerUptime} title="Container uptime">
              {formatUptime(container.latest.uptimeSeconds)}
            </span>
          )}
          {enableControls && datasourceUid && (
            <ContainerControls
              containerId={container.containerId}
              containerName={container.containerName}
              hostId={container.hostId}
              state={state}
              allowedActions={allowedActions}
              confirmDangerousActions={confirmDangerousActions}
              onAction={handleControlAction}
              loading={controlLoading}
            />
          )}
        </div>
        <div className={styles.metricsGrid} style={metricsGridStyle}>
          {selectedMetricDefs.map((metricDef) => renderMetric(container, metricDef))}
        </div>
      </div>
    );
  };

  // Strip mode
  if (options.stripMode) {
    return (
      <div className={cx(styles.wrapper, css`width: ${width}px; height: ${height}px;`)}>
        {controlError && (
          <Alert
            title="Control action failed"
            severity="error"
            onRemove={clearError}
          >
            {controlError}
          </Alert>
        )}
        <div className={styles.containersGrid} style={containerGridStyle}>
          {allContainersFlat.map(renderContainerCard)}
        </div>
      </div>
    );
  }

  // Normal mode
  return (
    <div className={cx(styles.wrapper, css`width: ${width}px; height: ${height}px;`)}>
      {controlError && (
        <Alert
          title="Control action failed"
          severity="error"
          onRemove={clearError}
        >
          {controlError}
        </Alert>
      )}

      <div className={styles.summary}>
        <span>{totalHosts} host{totalHosts !== 1 ? 's' : ''}</span>
        <span>{totalContainers} container{totalContainers !== 1 ? 's' : ''}</span>
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
            {host.containers.map(renderContainerCard)}
          </div>
        </div>
      ))}
    </div>
  );
};
