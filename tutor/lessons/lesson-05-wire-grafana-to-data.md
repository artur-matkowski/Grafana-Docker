---
title: "Lesson 05 – Wiring Grafana Panel to the HTTP API"
objectives:
  - Connect the panel plugin to real metrics from the C# collector's HTTP API.
  - Fetch and transform JSON data into Grafana-compatible format.
  - Render container and host metrics in the panel.
prerequisites:
  - Lessons 01–04 completed.
  - Collector running with HTTP API serving metrics.
acceptance_criteria:
  - The panel displays real container CPU and memory metrics over time.
  - The panel displays at least one host metric (CPU usage or frequency) over time.
  - Configuration options allow selecting which container/host and time range to show.
references:
  - title: "Panel Plugins"
    url: "https://grafana.com/docs/grafana/latest/developers/plugins/panel-plugins/"
  - title: "Grafana Data Frames"
    url: "https://grafana.com/docs/grafana/latest/packages_api/data/dataframe/"
---

## Steps

1. **Configure API endpoint in panel options**
   - Add a panel option for the collector API URL (e.g., `http://localhost:5000`).
   - Store this in the panel's options so it persists with the dashboard.

2. **Fetch data from the C# API**
   - Use `fetch()` or a similar HTTP client to call the collector API from the panel.
   - Handle the Grafana time range (`props.timeRange`) to pass `from`/`to` parameters.
   - Parse the JSON response into TypeScript objects.

3. **Transform JSON to Grafana data frames**
   - Convert the array of metric snapshots into Grafana `DataFrame` format.
   - Each metric (cpu%, mem, etc.) becomes a field in the frame.
   - The timestamp becomes a time field.

4. **Render the data**
   - Use a charting library (e.g., uPlot via `@grafana/ui`, or the built-in TimeSeries component).
   - Display CPU and memory as line graphs over time.

5. **Add container/host selection**
   - Fetch the list of containers from `/api/containers`.
   - Add a dropdown or text input in panel options to select which container to display.
   - Re-fetch metrics when selection changes.

6. **Visual verification**
   - Create a dashboard with your panel.
   - Confirm that changing time range and container selection updates the graphs.

## Micro-checks

- Can you explain the data flow: Docker → Collector → HTTP API → Panel → Chart?
- What happens if the API is unreachable? Does the panel handle errors gracefully?
- Can you adjust the time range in Grafana and see the panel update accordingly?

## Notes

- Start with a single container and CPU metric; expand incrementally.
- Consider caching the container list to avoid fetching on every render.

---

## Migration Note – 2026-01-13

**Changed:** Removed Postgres data source option. Panel now connects exclusively via HTTP API.

**Rationale:** Simpler architecture with single data path.
