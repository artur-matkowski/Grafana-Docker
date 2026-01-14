import { getBackendSrv } from '@grafana/runtime';

const PLUGIN_ID = 'bitforge-dockermetrics-panel';

/**
 * Proxy a request through the Grafana backend.
 * This avoids mixed content issues when Grafana is served over HTTPS
 * but Docker agents are on HTTP.
 */
export async function proxyFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const backendSrv = getBackendSrv();
  const proxyUrl = `/api/plugins/${PLUGIN_ID}/resources/proxy?url=${encodeURIComponent(url)}`;

  const response = await backendSrv.fetch<T>({
    url: proxyUrl,
    method: (options?.method as 'GET' | 'POST') || 'GET',
    data: options?.body,
    headers: options?.headers as Record<string, string>,
  }).toPromise();

  if (!response) {
    throw new Error('No response from backend');
  }

  return response.data;
}

/**
 * Proxy a GET request
 */
export async function proxyGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  const backendSrv = getBackendSrv();
  const proxyUrl = `/api/plugins/${PLUGIN_ID}/resources/proxy?url=${encodeURIComponent(url)}`;

  const response = await backendSrv.fetch<T>({
    url: proxyUrl,
    method: 'GET',
  }).toPromise();

  if (!response) {
    throw new Error('No response from backend');
  }

  return response.data;
}

/**
 * Proxy a POST request
 */
export async function proxyPost<T>(url: string, body?: unknown): Promise<T> {
  const backendSrv = getBackendSrv();
  const proxyUrl = `/api/plugins/${PLUGIN_ID}/resources/proxy?url=${encodeURIComponent(url)}`;

  const response = await backendSrv.fetch<T>({
    url: proxyUrl,
    method: 'POST',
    data: body,
  }).toPromise();

  if (!response) {
    throw new Error('No response from backend');
  }

  return response.data;
}
