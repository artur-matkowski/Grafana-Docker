import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { PanelProps, DataQueryRequest, dateTime, DataFrame, FieldType } from '@grafana/data';
import { SimpleOptions, ContainerMetrics, ContainerInfo, AVAILABLE_METRICS, MetricDefinition, DEFAULT_METRICS, DataSourceConfig, ContainerState, ContainerHealthStatus, getStateDisplay, getPulseType, DockerMetricsQuery } from 'types';
import { css, cx, keyframes } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import { getDataSourceSrv } from '@grafana/runtime';
import { toPromise, normalizeContainerState, normalizeHealthStatus, isStateRunning, isStatePaused, isHealthUnhealthy } from '../utils/datasource';

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

// Map metric keys to API field names
const METRIC_TO_FIELD: Record<string, string> = {
  cpuPercent: 'cpuPercent',
  memoryBytes: 'memoryBytes',
  memoryPercent: 'memoryPercent',
  networkRxBytes: 'networkRxBytes',
  networkTxBytes: 'networkTxBytes',
  diskReadBytes: 'diskReadBytes',
  diskWriteBytes: 'diskWriteBytes',
  cpuPressureSome: 'cpuPressureSome',
  cpuPressureFull: 'cpuPressureFull',
  memoryPressureSome: 'memoryPressureSome',
  memoryPressureFull: 'memoryPressureFull',
  ioPressureSome: 'ioPressureSome',
  ioPressureFull: 'ioPressureFull',
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

    containers.push({
      hostId: (hostNameField?.values[i] as string) || 'default',
      hostName: (hostNameField?.values[i] as string) || 'default',
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

// Parse metrics from Grafana's DataFrame format (from props.data.series)
function parseMetricsFromDataFrames(frames: DataFrame[]): ContainerMetrics[] {
  const metricsMap = new Map<string, ContainerMetrics>();

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

    for (let i = 0; i < frame.length; i++) {
      const timestamp = new Date(timeField.values[i] as number).toISOString();
      const value = valueField.values[i] as number;

      const key = `${containerId}:${timestamp}`;
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

  return Array.from(metricsMap.values());
}

// Parse metrics from DataFrame format (for direct data source queries - internal format)
function parseMetricsFromFrames(frames: Array<{
  fields: Array<{ name: string; type: string; labels?: Record<string, string>; values: unknown[] }>;
  length: number;
}>): ContainerMetrics[] {
  const metricsMap = new Map<string, ContainerMetrics>();

  for (const frame of frames) {
    if (!frame.fields || frame.fields.length < 2) {
      continue;
    }

    const timeField = frame.fields.find((f) => f.type === 'time');
    const valueField = frame.fields.find((f) => f.type === 'number');

    if (!timeField || !valueField) {
      continue;
    }

    const labels = valueField.labels || {};
    const containerId = labels.containerId || '';
    const containerName = labels.containerName || '';
    const hostName = labels.hostName || 'default';
    const fieldName = valueField.name || '';

    for (let i = 0; i < frame.length; i++) {
      const timestamp = new Date(timeField.values[i] as number).toISOString();
      const value = valueField.values[i] as number;

      const key = `${containerId}:${timestamp}`;
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

  return Array.from(metricsMap.values());
}

// Fetch metrics via direct data source query API (for authenticated dashboards without queries configured)
async function fetchMetricsDirectly(
  dataSourceUid: string,
  metrics: string[],
  from: Date,
  to: Date
): Promise<ContainerMetrics[]> {
  const srv = getDataSourceSrv();
  const ds = await srv.get(dataSourceUid);

  if (!ds || typeof ds.query !== 'function') {
    throw new Error('Data source not found or does not support queries');
  }

  const request: DataQueryRequest<DockerMetricsQuery> = {
    requestId: `docker-metrics-${Date.now()}`,
    interval: '10s',
    intervalMs: 10000,
    range: {
      from: dateTime(from),
      to: dateTime(to),
      raw: { from: dateTime(from), to: dateTime(to) },
    },
    scopedVars: {},
    targets: [{
      refId: 'A',
      queryType: 'metrics',
      metrics: metrics,
      containerNamePattern: '',
    }],
    timezone: 'browser',
    app: 'panel',
    startTime: Date.now(),
  };

  const response = await toPromise(ds.query(request));

  if (!response || !response.data) {
    return [];
  }

  return parseMetricsFromFrames(response.data);
}

// Fetch containers via direct data source query API (for authenticated dashboards without queries configured)
async function fetchContainersDirectly(dataSourceUid: string): Promise<ContainerInfo[]> {
  const srv = getDataSourceSrv();
  const ds = await srv.get(dataSourceUid);

  if (!ds || typeof ds.query !== 'function') {
    throw new Error('Data source not found or does not support queries');
  }

  const now = new Date();
  const request: DataQueryRequest<DockerMetricsQuery> = {
    requestId: `containers-${Date.now()}`,
    interval: '10s',
    intervalMs: 10000,
    range: {
      from: dateTime(now.getTime() - 60000),
      to: dateTime(now),
      raw: { from: dateTime(now.getTime() - 60000), to: dateTime(now) },
    },
    scopedVars: {},
    targets: [{
      refId: 'A',
      queryType: 'containers',
    }],
    timezone: 'browser',
    app: 'panel',
    startTime: Date.now(),
  };

  const response = await toPromise(ds.query(request));

  if (!response || !response.data || response.data.length === 0) {
    return [];
  }

  // Parse container data from the response frame
  const frame = response.data[0];
  const containers: ContainerInfo[] = [];

  const containerIdField = frame.fields.find((f: { name: string }) => f.name === 'containerId');
  const containerNameField = frame.fields.find((f: { name: string }) => f.name === 'containerName');
  const hostNameField = frame.fields.find((f: { name: string }) => f.name === 'hostName');
  const stateField = frame.fields.find((f: { name: string }) => f.name === 'state');
  const healthStatusField = frame.fields.find((f: { name: string }) => f.name === 'healthStatus');
  const isRunningField = frame.fields.find((f: { name: string }) => f.name === 'isRunning');
  const isPausedField = frame.fields.find((f: { name: string }) => f.name === 'isPaused');
  const isUnhealthyField = frame.fields.find((f: { name: string }) => f.name === 'isUnhealthy');

  if (!containerIdField || !containerNameField) {
    return [];
  }

  for (let i = 0; i < frame.length; i++) {
    const state = normalizeContainerState(stateField?.values[i]);
    const healthStatus = normalizeHealthStatus(healthStatusField?.values[i]);

    containers.push({
      hostId: (hostNameField?.values[i] as string) || 'default',
      hostName: (hostNameField?.values[i] as string) || 'default',
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

// Detect if we're on a public dashboard (no direct API access)
function isPublicDashboard(): boolean {
  return window.location.pathname.includes('/public/dashboards/');
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
  state: ContainerState;
  healthStatus: ContainerHealthStatus;
  isRunning: boolean;
  isPaused: boolean;
  isUnhealthy: boolean;
  metrics: ContainerMetrics[];
  latest: ContainerMetrics | null;
  rateData: Map<string, number[]>;
  latestRates: Map<string, number>;
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

export const SimplePanel: React.FC<Props> = ({ width, height, options, timeRange, data }) => {
  // Stabilize time range
  const stableTimeFrom = useMemo(() => {
    return Math.floor(timeRange.from.valueOf() / 10000) * 10000;
  }, [timeRange.from]);
  const stableTimeTo = useMemo(() => {
    return Math.floor(timeRange.to.valueOf() / 10000) * 10000;
  }, [timeRange.to]);

  const containersPerRow = options.containersPerRow || 0;
  const metricsPerRow = options.metricsPerRow || 0;
  const styles = useStyles2(getStyles);

  // Data source config
  const dataSourceConfig: DataSourceConfig = options.dataSourceConfig || {};
  const dataSourceUid = dataSourceConfig.dataSourceUid || '';

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

  // Check if we have query data from Grafana's query system (works on public dashboards)
  const hasQueryData = data?.series?.length > 0;

  // Parse containers from props.data.series (from Grafana's query runner)
  const containersFromProps = useMemo(() => {
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
  const metricsFromProps = useMemo(() => {
    if (!hasQueryData) {
      return [];
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
      return parseMetricsFromDataFrames(metricsFrames);
    }

    return [];
  }, [data?.series, hasQueryData]);

  // Fallback state for direct API calls (authenticated dashboards without queries)
  const [fallbackMetrics, setFallbackMetrics] = useState<ContainerMetrics[]>([]);
  const [fallbackContainers, setFallbackContainers] = useState<ContainerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Use data from props if available, otherwise use fallback from direct API
  const allMetrics = metricsFromProps.length > 0 ? metricsFromProps : fallbackMetrics;
  const containers = containersFromProps.length > 0 ? containersFromProps : fallbackContainers;

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
    fields.add('uptimeSeconds');
    return Array.from(fields);
  }, [options.selectedMetrics]);

  // Fetch state refs
  const lastTimestampRef = useRef<string | null>(null);
  const metricsMapRef = useRef<Map<string, ContainerMetrics>>(new Map());
  const initialFetchDoneRef = useRef<boolean>(false);
  const stableTimeFromRef = useRef<number>(stableTimeFrom);
  const stableTimeToRef = useRef<number>(stableTimeTo);
  stableTimeFromRef.current = stableTimeFrom;
  stableTimeToRef.current = stableTimeTo;

  // Fetch containers via direct API (only when no query data from Grafana)
  useEffect(() => {
    // Skip if we have data from Grafana's query system (e.g., on public dashboards with queries configured)
    if (hasQueryData) {
      return;
    }

    // Skip on public dashboards - they require queries to be configured
    if (isPublicDashboard()) {
      return;
    }

    if (!dataSourceUid) {
      setFallbackContainers([]);
      return;
    }

    const fetchContainers = async () => {
      try {
        const dsContainers = await fetchContainersDirectly(dataSourceUid);
        setFallbackContainers(dsContainers);
      } catch {
        setFallbackContainers([]);
      }
    };

    fetchContainers();
    const interval = setInterval(fetchContainers, 30000);
    return () => clearInterval(interval);
  }, [dataSourceUid, hasQueryData]);

  const targetContainerIds = useMemo(() => {
    if (options.showAllContainers) {
      const blacklist = options.containerBlacklist || [];
      return containers
        .map((c) => c.containerId)
        .filter((id) => !blacklist.includes(id));
    }
    return options.containerIds || [];
  }, [options.showAllContainers, options.containerIds, options.containerBlacklist, containers]);

  // Reset on container selection change (for fallback mode)
  const resetKey = targetContainerIds.join(',');
  const prevResetKeyRef = useRef<string>('');
  useEffect(() => {
    if (hasQueryData) {
      return; // Not using fallback mode
    }
    if (prevResetKeyRef.current !== resetKey) {
      prevResetKeyRef.current = resetKey;
      metricsMapRef.current.clear();
      lastTimestampRef.current = null;
      initialFetchDoneRef.current = false;
      setFallbackMetrics([]);
    }
  }, [resetKey, hasQueryData]);

  // Prune old metrics (for fallback mode)
  useEffect(() => {
    if (hasQueryData) {
      return; // Not using fallback mode
    }
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
      setFallbackMetrics(Array.from(map.values()));
    }
  }, [stableTimeFrom, hasQueryData]);

  // Merge metrics (for fallback mode)
  const mergeFallbackMetrics = useCallback((newMetrics: ContainerMetrics[]) => {
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
    setFallbackMetrics(Array.from(map.values()));
  }, []);

  // Fetch metrics via direct API (only when no query data from Grafana)
  const metricsEffectKey = `${dataSourceUid}-${targetContainerIds.join(',')}-${options.showAllContainers}-${options.refreshInterval}-${selectedFields.join(',')}-${hasQueryData}`;
  useEffect(() => {
    // Skip if we have data from Grafana's query system (e.g., on public dashboards with queries configured)
    if (hasQueryData) {
      return;
    }

    // Skip on public dashboards - they require queries to be configured
    if (isPublicDashboard()) {
      if (!dataSourceUid) {
        setError('Public dashboards require queries to be configured in the panel. Please add container and metrics queries to the panel in edit mode.');
      } else {
        setError('Public dashboards require queries to be configured. Add a "containers" query and a "metrics" query to this panel.');
      }
      return;
    }

    if (!dataSourceUid) {
      setError('No data source selected. Please configure a Docker Metrics data source in panel options.');
      setFallbackMetrics([]);
      return;
    }

    if (targetContainerIds.length === 0 && !options.showAllContainers) {
      setError('No containers selected. Enable "Show All Containers" or select specific containers.');
      setFallbackMetrics([]);
      return;
    }

    setError(null);
    let isCancelled = false;

    const fetchAllMetrics = async (isIncremental: boolean) => {
      if (isCancelled) {return;}

      const fromDate = isIncremental && lastTimestampRef.current
        ? new Date(lastTimestampRef.current)
        : new Date(stableTimeFromRef.current);
      const toDate = new Date(stableTimeToRef.current);

      if (!isIncremental) {
        setLoading(true);
      }

      try {
        const newMetrics = await fetchMetricsDirectly(
          dataSourceUid,
          selectedFields,
          fromDate,
          toDate
        );

        if (isCancelled) {return;}

        if (!isIncremental) {
          setLoading(false);
          initialFetchDoneRef.current = true;
        }

        if (newMetrics.length > 0) {
          mergeFallbackMetrics(newMetrics);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
          setLoading(false);
        }
      }
    };

    fetchAllMetrics(false);

    const refreshInterval = (options.refreshInterval || 10) * 1000;
    const interval = setInterval(() => {
      if (initialFetchDoneRef.current) {
        fetchAllMetrics(true);
      }
    }, refreshInterval);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricsEffectKey]);

  // Group by container and host
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
          state: c.state,
          healthStatus: c.healthStatus,
          isRunning: c.isRunning,
          isPaused: c.isPaused,
          isUnhealthy: c.isUnhealthy,
          metrics: [],
          latest: null,
          rateData: new Map(),
          latestRates: new Map(),
        });
      }
    }

    for (const m of allMetrics) {
      const container = byContainer.get(m.containerId);
      if (container) {
        container.metrics.push(m);
      }
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
  }, [containers, allMetrics, options.showAllContainers, options.containerIds, options.containerBlacklist]);

  const totalContainers = containersByHost.reduce((sum, h) => sum + h.containers.length, 0);
  const totalHosts = containersByHost.length;

  const allContainersFlat = useMemo(() => {
    return containersByHost.flatMap(host => host.containers);
  }, [containersByHost]);

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
            <li>Data Source: {dataSourceUid || 'Not selected'}</li>
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
        <div className={styles.loading}>Loading metrics...</div>
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
            {!dataSourceUid
              ? 'Select a Docker Metrics data source in panel options.'
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
          <span style={{ fontSize: '11px' }}>Select metrics to display in panel options under &quot;Display&quot;.</span>
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
      <div key={container.containerId} className={cardClassName}>
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
        <div className={styles.containersGrid} style={containerGridStyle}>
          {allContainersFlat.map(renderContainerCard)}
        </div>
      </div>
    );
  }

  // Normal mode
  return (
    <div className={cx(styles.wrapper, css`width: ${width}px; height: ${height}px;`)}>
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
