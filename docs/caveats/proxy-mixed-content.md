# Caveat: Grafana Backend Proxy for Mixed Content

## Problem

When Grafana runs over HTTPS and the Docker Metrics Collector agents run over HTTP (common in internal networks), browsers block the requests due to mixed-content security policies.

## Solution

The panel routes all requests through Grafana's backend proxy at:

```
/api/plugins/bitforge-dockermetrics-panel/resources/proxy?url={encoded-target-url}
```

This allows:
- Grafana (HTTPS) → Grafana Backend (server-side) → Agent (HTTP)
- No browser mixed-content violation

## Implementation

**File**: `bitforge-dockermetrics-panel/src/utils/proxy.ts`

```typescript
export async function proxyGet<T>(baseUrl: string, path: string): Promise<T> {
  const targetUrl = `${baseUrl}${path}`;
  const proxyUrl = `/api/plugins/bitforge-dockermetrics-panel/resources/proxy?url=${encodeURIComponent(targetUrl)}`;
  const response = await fetch(proxyUrl);
  return response.json();
}
```

## Trade-offs

**Pros**:
- Works with mixed HTTP/HTTPS environments
- No additional infrastructure (reverse proxy, certs)
- Grafana handles connection pooling

**Cons**:
- All traffic routes through Grafana server
- Adds latency (~1-5ms per request)
- Grafana server must have network access to all agents

## When This Matters

- Production Grafana with TLS termination
- Agents on internal network without TLS
- Multi-host monitoring across network segments

## Alternative Approaches

1. **TLS everywhere**: Add certificates to all agents (complex in dynamic environments)
2. **Reverse proxy**: Central proxy with TLS termination (additional infrastructure)
3. **Direct HTTP**: Run Grafana without TLS (not recommended for production)
