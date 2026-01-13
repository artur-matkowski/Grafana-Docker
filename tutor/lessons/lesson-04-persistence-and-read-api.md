---
title: "Lesson 04 – Collection Loop & HTTP Read API"
objectives:
  - Implement periodic metric collection into the in-memory store.
  - Add a minimal HTTP API to read container and host metrics.
  - Validate end-to-end collection and retrieval without Grafana.
prerequisites:
  - Lesson 03 data model completed (MetricsStore with rolling 24h retention).
acceptance_criteria:
  - The collector periodically writes container and host metrics into the in-memory store.
  - An HTTP endpoint (e.g., `/api/metrics/containers`, `/api/metrics/hosts`) returns metrics for a given time range.
  - Basic manual tests (curl/Postman) confirm correct data shape and values.
references:
  - title: "ASP.NET Core Minimal APIs"
    url: "https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis"
  - title: "Docker Engine API"
    url: "https://docs.docker.com/engine/api/"
---

## Steps

1. **Implement periodic collection loop**
   - Add a timer or `BackgroundService` that polls Docker at fixed intervals (e.g., 10 seconds).
   - For each poll:
     - Fetch container list and stats from Docker API.
     - Create `ContainerMetricSnapshot` objects and add to `MetricsStore`.
     - Fetch/compute host metrics and add `HostMetricSnapshot`.
   - Periodically call `Trim()` to remove entries older than 24h.

2. **Create HTTP API endpoints**
   - Add a minimal HTTP server (ASP.NET Core minimal API recommended).
   - Implement endpoints:
     - `GET /api/containers` – list known containers
     - `GET /api/metrics/containers?id={containerId}&from={iso}&to={iso}` – metrics for a container
     - `GET /api/metrics/hosts?from={iso}&to={iso}` – host metrics
   - Return JSON arrays of metric snapshots.

3. **Add CORS support**
   - Enable CORS so the Grafana panel (running in browser) can call the API.
   - For dev, allow `*` origin; for production, restrict to Grafana's origin.

4. **Test end-to-end**
   - Run the collector and confirm metrics accumulate in memory.
   - Query the HTTP API with curl and inspect JSON responses.
   - Verify time-range filtering works correctly.

## Micro-checks

- Can you fetch metrics for a specific container and time range via HTTP?
- What happens if you request a container ID that doesn't exist?
- Can you see the in-memory buffer growing, then stabilizing after 24h worth of data?

## Notes

- Keep the API read-only; all writes happen internally via the collection loop.
- Consider returning metrics in a format that's easy for Grafana to consume (array of {timestamp, value} objects).

---

## Migration Note – 2026-01-13

**Changed:** Removed Postgres integration. Now uses in-memory store from Lesson 03.

**Rationale:** Simpler architecture, no external DB dependency.
