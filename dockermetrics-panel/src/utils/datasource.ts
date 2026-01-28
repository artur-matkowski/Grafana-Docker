import { DataQueryRequest, dateTime } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { ContainerInfo, ContainerState, VALID_CONTAINER_STATES, isStateRunning, isStatePaused, DockerMetricsQuery } from '../types';

/**
 * Convert Observable or Promise to Promise for data source queries.
 */
export async function toPromise<T>(result: Promise<T> | { toPromise(): Promise<T> }): Promise<T> {
  if ('toPromise' in result && typeof result.toPromise === 'function') {
    return result.toPromise();
  }
  return result as Promise<T>;
}

/**
 * Validate and normalize container state from API response.
 * Handles case mismatches and invalid values.
 */
export function normalizeContainerState(rawState: unknown): ContainerState {
  if (rawState === undefined || rawState === null || rawState === '') {
    return 'undefined';
  }
  const normalizedState = typeof rawState === 'string' ? rawState.toLowerCase() : String(rawState);
  if (VALID_CONTAINER_STATES.includes(normalizedState as ContainerState)) {
    return normalizedState as ContainerState;
  }
  return 'invalid';
}

/**
 * Build a DataQueryRequest for container queries.
 */
function buildContainerQueryRequest(): DataQueryRequest<DockerMetricsQuery> {
  const now = new Date();
  return {
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
}

/**
 * Parse container data from a DataFrame response.
 */
function parseContainersFromFrame(frame: {
  fields: Array<{ name: string; values: unknown[] }>;
  length: number;
}): ContainerInfo[] {
  const containers: ContainerInfo[] = [];

  const containerIdField = frame.fields.find((f) => f.name === 'containerId');
  const containerNameField = frame.fields.find((f) => f.name === 'containerName');
  const hostNameField = frame.fields.find((f) => f.name === 'hostName');
  const stateField = frame.fields.find((f) => f.name === 'state');
  const isRunningField = frame.fields.find((f) => f.name === 'isRunning');
  const isPausedField = frame.fields.find((f) => f.name === 'isPaused');

  if (!containerIdField || !containerNameField) {
    return [];
  }

  for (let i = 0; i < frame.length; i++) {
    const state = normalizeContainerState(stateField?.values[i]);

    containers.push({
      hostId: (hostNameField?.values[i] as string) || 'default',
      hostName: (hostNameField?.values[i] as string) || 'default',
      containerId: containerIdField.values[i] as string,
      containerName: containerNameField.values[i] as string,
      state,
      isRunning: (isRunningField?.values[i] as boolean) ?? isStateRunning(state),
      isPaused: (isPausedField?.values[i] as boolean) ?? isStatePaused(state),
    });
  }

  return containers;
}

/**
 * Fetch container list via data source query API.
 */
export async function fetchContainersViaDataSource(dataSourceUid: string): Promise<ContainerInfo[]> {
  const srv = getDataSourceSrv();
  const ds = await srv.get(dataSourceUid);

  if (!ds || typeof ds.query !== 'function') {
    throw new Error('Data source not found or does not support queries');
  }

  const request = buildContainerQueryRequest();
  const response = await toPromise(ds.query(request));

  if (!response || !response.data || response.data.length === 0) {
    return [];
  }

  return parseContainersFromFrame(response.data[0]);
}
