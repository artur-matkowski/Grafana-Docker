export interface SimpleOptions {
  apiUrl: string;
  containerIds: string[];
  showAllContainers: boolean;
  selectedMetrics: string[];
}

// Metric definition for display configuration
export interface MetricDefinition {
  key: string;
  label: string;
  unit: string;
  color: string;
  format: (value: number) => string;
  getValue: (snapshot: ContainerMetricSnapshot) => number | null;
}

// All available metrics from the collector
export const AVAILABLE_METRICS: MetricDefinition[] = [
  {
    key: 'cpuPercent',
    label: 'CPU',
    unit: '%',
    color: '#5794F2',
    format: (v) => v.toFixed(1),
    getValue: (s) => s.cpuPercent,
  },
  {
    key: 'memoryBytes',
    label: 'Memory',
    unit: 'MB',
    color: '#73BF69',
    format: (v) => (v / (1024 * 1024)).toFixed(0),
    getValue: (s) => s.memoryBytes,
  },
  {
    key: 'memoryPercent',
    label: 'Memory %',
    unit: '%',
    color: '#73BF69',
    format: (v) => v.toFixed(1),
    getValue: (s) => s.memoryPercent,
  },
  {
    key: 'networkRxBytes',
    label: 'Net RX',
    unit: 'KB/s',
    color: '#FF9830',
    format: (v) => (v / 1024).toFixed(1),
    getValue: (s) => s.networkRxBytes,
  },
  {
    key: 'networkTxBytes',
    label: 'Net TX',
    unit: 'KB/s',
    color: '#F2495C',
    format: (v) => (v / 1024).toFixed(1),
    getValue: (s) => s.networkTxBytes,
  },
  {
    key: 'diskReadBytes',
    label: 'Disk Read',
    unit: 'MB',
    color: '#B877D9',
    format: (v) => (v / (1024 * 1024)).toFixed(1),
    getValue: (s) => s.diskReadBytes,
  },
  {
    key: 'diskWriteBytes',
    label: 'Disk Write',
    unit: 'MB',
    color: '#8F3BB8',
    format: (v) => (v / (1024 * 1024)).toFixed(1),
    getValue: (s) => s.diskWriteBytes,
  },
  {
    key: 'uptimeSeconds',
    label: 'Uptime',
    unit: 'h',
    color: '#888888',
    format: (v) => (v / 3600).toFixed(1),
    getValue: (s) => s.uptimeSeconds,
  },
  {
    key: 'cpuPressureSome',
    label: 'CPU Pressure (some)',
    unit: '%',
    color: '#FF6B6B',
    format: (v) => v.toFixed(2),
    getValue: (s) => s.cpuPressureSome,
  },
  {
    key: 'cpuPressureFull',
    label: 'CPU Pressure (full)',
    unit: '%',
    color: '#EE5A5A',
    format: (v) => v.toFixed(2),
    getValue: (s) => s.cpuPressureFull,
  },
  {
    key: 'memoryPressureSome',
    label: 'Mem Pressure (some)',
    unit: '%',
    color: '#4ECDC4',
    format: (v) => v.toFixed(2),
    getValue: (s) => s.memoryPressureSome,
  },
  {
    key: 'memoryPressureFull',
    label: 'Mem Pressure (full)',
    unit: '%',
    color: '#3DBDB5',
    format: (v) => v.toFixed(2),
    getValue: (s) => s.memoryPressureFull,
  },
  {
    key: 'ioPressureSome',
    label: 'I/O Pressure (some)',
    unit: '%',
    color: '#FFE66D',
    format: (v) => v.toFixed(2),
    getValue: (s) => s.ioPressureSome,
  },
  {
    key: 'ioPressureFull',
    label: 'I/O Pressure (full)',
    unit: '%',
    color: '#FFD93D',
    format: (v) => v.toFixed(2),
    getValue: (s) => s.ioPressureFull,
  },
];

// Default metrics to show
export const DEFAULT_METRICS = ['cpuPercent', 'memoryBytes'];

// Docker Host Configuration
export interface DockerHostConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

// Docker Host with runtime status
export interface DockerHostStatus {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  lastSeen: string | null;
  isHealthy: boolean;
  lastError: string | null;
  containerCount: number;
}

// Collector Configuration
export interface CollectorConfig {
  hosts: DockerHostConfig[];
  settings: CollectorSettings;
}

export interface CollectorSettings {
  pollIntervalSeconds: number;
  retentionHours: number;
}

// Container info for listing
export interface ContainerInfo {
  hostId: string;
  hostName: string;
  containerId: string;
  containerName: string;
}

// Types matching the C# API responses
export interface ContainerMetricSnapshot {
  hostId: string;
  hostName: string;
  containerId: string;
  containerName: string;
  timestamp: string;
  cpuPercent: number;
  memoryBytes: number;
  memoryPercent: number;
  networkRxBytes: number;
  networkTxBytes: number;
  diskReadBytes: number;
  diskWriteBytes: number;
  uptimeSeconds: number;
  isRunning: boolean;
  cpuPressureSome: number | null;
  cpuPressureFull: number | null;
  memoryPressureSome: number | null;
  memoryPressureFull: number | null;
  ioPressureSome: number | null;
  ioPressureFull: number | null;
}

export interface HostMetricSnapshot {
  hostname: string;
  timestamp: string;
  cpuPercent: number;
  cpuFrequencyMhz: number;
  memoryBytes: number;
  memoryPercent: number;
  uptimeSeconds: number;
  isUp: boolean;
}
