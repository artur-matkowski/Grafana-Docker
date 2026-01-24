# Grafana Panel Component

## Overview

The Bitforge Docker Metrics Panel is a React-based Grafana panel plugin that visualizes Docker container metrics and provides container management controls.

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│              Bitforge Docker Metrics Panel                      │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    SimplePanel.tsx                      │   │
│  │                  (Main Dashboard)                       │   │
│  │                                                         │   │
│  │  State:                                                 │   │
│  │  - allMetrics: ContainerMetrics[]                      │   │
│  │  - containers: ContainerInfo[]                         │   │
│  │  - statusOverrides: Map<id, ContainerStatus>           │   │
│  │  - pendingActions: Map<id, action>                     │   │
│  │                                                         │   │
│  │  Rendering:                                             │   │
│  │  - Host groups with health badges                      │   │
│  │  - Container cards with metric grids                   │   │
│  │  - Sparkline visualizations                            │   │
│  │  - Control buttons (optional)                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                         │                                       │
│           ┌─────────────┼───────────────────┐                   │
│           ▼             ▼                   ▼                   │
│  ┌─────────────┐ ┌─────────────────┐ ┌─────────────────────┐   │
│  │ Container   │ │ Host Manager    │ │ Metric Selector     │   │
│  │ Controls    │ │ Editor          │ │ Editor              │   │
│  │             │ │                 │ │                     │   │
│  │ Actions:    │ │ Configure:      │ │ Select:             │   │
│  │ - Start     │ │ - Agent URLs    │ │ - Display metrics   │   │
│  │ - Stop      │ │ - Enable/disable│ │ - From 14 available │   │
│  │ - Restart   │ │ - Hostnames     │ │                     │   │
│  │ - Pause     │ │                 │ │                     │   │
│  │ - Unpause   │ │                 │ │                     │   │
│  └─────────────┘ └─────────────────┘ └─────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      proxy.ts                           │   │
│  │              (Grafana Backend Proxy)                    │   │
│  │                                                         │   │
│  │  - Routes through /api/plugins/{id}/resources/proxy    │   │
│  │  - Handles HTTPS→HTTP mixed content                    │   │
│  │  - Typed GET/POST helpers                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Source Files

### Core Components

| File | Lines | Purpose |
|------|-------|---------|
| `src/module.ts` | 8 | Plugin registration with Grafana |
| `src/types.ts` | 278 | TypeScript type definitions |
| `src/components/SimplePanel.tsx` | 1197 | Main panel component |
| `src/utils/proxy.ts` | 66 | Backend proxy utilities |

### Editor Components

| File | Purpose |
|------|---------|
| `HostManagerEditor.tsx` | Configure collector agent endpoints |
| `ContainerSelectorEditor.tsx` | Whitelist/blacklist container filtering |
| `MetricSelectorEditor.tsx` | Choose which metrics to display |
| `VersionInfoEditor.tsx` | Display plugin version |

## Data Types

**File**: `src/types.ts`

```typescript
interface SimpleOptions {
  hosts: HostConfig[];           // Agent configurations
  selectedContainerIds: string[];// Container filter
  containerFilterMode: 'all' | 'whitelist' | 'blacklist';
  refreshInterval: number;       // 1-300 seconds
  containersPerRow: number;      // Layout control
  metricsPerRow: number;
  selectedMetrics: string[];     // Which metrics to show
  showControls: boolean;         // Enable action buttons
}

interface ContainerMetrics {
  id: string;
  name: string;
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
  cpuPressure?: PsiMetrics;
  memoryPressure?: PsiMetrics;
  ioPressure?: PsiMetrics;
}

interface HostConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}
```

## State Management

SimplePanel uses React hooks for state:

| State | Type | Purpose |
|-------|------|---------|
| `allMetrics` | `Map<hostId, ContainerMetrics[]>` | Aggregated metrics from all hosts |
| `containers` | `ContainerInfo[]` | Discovered containers |
| `statusOverrides` | `Map<id, ContainerStatus>` | Real-time status from polling |
| `pendingActions` | `Map<id, string>` | In-flight control operations |
| `errors` | `Map<hostId, string>` | Host-level error tracking |
| `loading` | `boolean` | Initial load indicator |

## Data Loading Strategy

1. **Initial Load**: Full metrics fetch for all containers
2. **Incremental Updates**: Fetch only latest metrics (configurable interval)
3. **Container Discovery**: Refresh container list every 30 seconds
4. **Status Polling**: Active polling during pending actions

## Metrics Display

14 metrics available for display:

| Metric Key | Display Name |
|------------|--------------|
| `cpuPercent` | CPU % |
| `memoryBytes` | Memory |
| `memoryPercent` | Memory % |
| `networkRxBytes` | Network RX |
| `networkTxBytes` | Network TX |
| `diskReadBytes` | Disk Read |
| `diskWriteBytes` | Disk Write |
| `uptimeSeconds` | Uptime |
| `cpuPressureSome10` | CPU Pressure (some) |
| `cpuPressureFull10` | CPU Pressure (full) |
| `memoryPressureSome10` | Mem Pressure (some) |
| `memoryPressureFull10` | Mem Pressure (full) |
| `ioPressureSome10` | I/O Pressure (some) |
| `ioPressureFull10` | I/O Pressure (full) |

## Container Controls

Actions available when `showControls: true`:

| Action | API Endpoint | Expected Result |
|--------|--------------|-----------------|
| Start | `POST /api/containers/{id}/start` | `isRunning: true` |
| Stop | `POST /api/containers/{id}/stop` | `isRunning: false` |
| Restart | `POST /api/containers/{id}/restart` | `isRunning: true` |
| Pause | `POST /api/containers/{id}/pause` | `isPaused: true` |
| Unpause | `POST /api/containers/{id}/unpause` | `isPaused: false` |

Control flow:
1. User clicks action button
2. Button enters pending state (spinner)
3. POST request sent to collector
4. Panel polls status every 500ms
5. On expected state match, pending cleared
6. Timeout after 30 seconds

## Proxy Layer

**File**: `src/utils/proxy.ts`

Routes requests through Grafana backend to avoid mixed-content issues:

```typescript
// GET request through proxy
proxyGet<T>(baseUrl: string, path: string): Promise<T>

// POST request through proxy
proxyPost<T>(baseUrl: string, path: string, body?: unknown): Promise<T>
```

Proxy URL format: `/api/plugins/bitforge-dockermetrics-panel/resources/proxy?url={encoded}`

## Build & Development

**Package**: `bitforge-dockermetrics-panel` v1.2.14

Key dependencies:
- `@grafana/ui` 12.3.1
- `react` 18.3.0
- `typescript` 5.9.2

Build commands:
```bash
npm install
npm run build    # Production build
npm run dev      # Development with watch
npm run test     # Jest + Playwright tests
```
