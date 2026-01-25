// Data source configuration (required)
export interface DataSourceConfig {
  useDataSource: boolean;
  dataSourceUid?: string;
}

// Panel options
export interface SimpleOptions {
  dataSourceConfig: DataSourceConfig;
  containerIds: string[];           // Whitelist - containers to show when showAllContainers is false
  containerBlacklist: string[];     // Blacklist - containers to exclude when showAllContainers is true
  showAllContainers: boolean;
  selectedMetrics: string[];
  containersPerRow: number;
  metricsPerRow: number;
  refreshInterval: number; // Refresh interval in seconds
  stripMode: boolean;               // Strip mode - hide host headers, show all containers in a single grid
}

// Progressive fetch stages
export type FetchStage = 'initial' | 'recent' | 'history' | 'complete';

// Fetch state for progressive loading
export interface FetchState {
  stage: FetchStage;
  lastTimestamp: string | null;  // For incremental updates
  loadedPoints: number;          // Points loaded so far
}

// Metadata about available metrics from the collector
export interface MetricsMetadata {
  totalAvailable: number;
  availablePerContainer: Record<string, number>;
  limitApplied: boolean;
  timestamp: string;
}

// Wrapped metrics response from collector
export interface MetricsResponse {
  metrics: ContainerMetrics[];
  metadata: MetricsMetadata;
}

// Container info for listing
export interface ContainerInfo {
  hostId: string;
  hostName: string;
  containerId: string;
  containerName: string;
  state: string;
  isRunning: boolean;
  isPaused: boolean;
}

// PSI metrics
export interface PsiMetrics {
  some10: number;
  some60: number;
  some300: number;
  full10: number;
  full60: number;
  full300: number;
}

// Container metrics from agent
export interface ContainerMetrics {
  // Added by panel for multi-host support
  hostId: string;
  hostName: string;

  // From agent
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
  isPaused: boolean;
  cpuPressure: PsiMetrics | null;
  memoryPressure: PsiMetrics | null;
  ioPressure: PsiMetrics | null;
}

// Metric definition for display configuration
export interface MetricDefinition {
  key: string;
  label: string;
  unit: string;
  color: string;
  format: (value: number) => string;
  getValue: (snapshot: ContainerMetrics) => number | null;
  isRate?: boolean;
}

// All available metrics
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
    format: (v) => v.toFixed(1),
    getValue: (s) => s.networkRxBytes,
    isRate: true,
  },
  {
    key: 'networkTxBytes',
    label: 'Net TX',
    unit: 'KB/s',
    color: '#F2495C',
    format: (v) => v.toFixed(1),
    getValue: (s) => s.networkTxBytes,
    isRate: true,
  },
  {
    key: 'diskReadBytes',
    label: 'Disk Read',
    unit: 'KB/s',
    color: '#B877D9',
    format: (v) => v.toFixed(1),
    getValue: (s) => s.diskReadBytes,
    isRate: true,
  },
  {
    key: 'diskWriteBytes',
    label: 'Disk Write',
    unit: 'KB/s',
    color: '#8F3BB8',
    format: (v) => v.toFixed(1),
    getValue: (s) => s.diskWriteBytes,
    isRate: true,
  },
  // PSI CPU metrics
  {
    key: 'cpuPressureSome',
    label: 'CPU Pressure',
    unit: '%',
    color: '#FF6B6B',
    format: (v) => v.toFixed(2),
    getValue: (s) => s.cpuPressure?.some10 ?? null,
  },
  {
    key: 'cpuPressureFull',
    label: 'CPU Pressure (full)',
    unit: '%',
    color: '#EE5A5A',
    format: (v) => v.toFixed(2),
    getValue: (s) => s.cpuPressure?.full10 ?? null,
  },
  // PSI Memory metrics
  {
    key: 'memoryPressureSome',
    label: 'Mem Pressure',
    unit: '%',
    color: '#4ECDC4',
    format: (v) => v.toFixed(2),
    getValue: (s) => s.memoryPressure?.some10 ?? null,
  },
  {
    key: 'memoryPressureFull',
    label: 'Mem Pressure (full)',
    unit: '%',
    color: '#3DBDB5',
    format: (v) => v.toFixed(2),
    getValue: (s) => s.memoryPressure?.full10 ?? null,
  },
  // PSI I/O metrics
  {
    key: 'ioPressureSome',
    label: 'I/O Pressure',
    unit: '%',
    color: '#FFE66D',
    format: (v) => v.toFixed(2),
    getValue: (s) => s.ioPressure?.some10 ?? null,
  },
  {
    key: 'ioPressureFull',
    label: 'I/O Pressure (full)',
    unit: '%',
    color: '#FFD93D',
    format: (v) => v.toFixed(2),
    getValue: (s) => s.ioPressure?.full10 ?? null,
  },
];

// Default metrics to show
export const DEFAULT_METRICS = ['cpuPercent', 'memoryBytes'];
