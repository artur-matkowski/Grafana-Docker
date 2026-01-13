# Grafana Docker & Host Metrics Plugin – 10-Hour MVP Course Plan

## MVP Definition

Build a **Grafana panel plugin** (for Grafana 12.3) plus a **C# metrics collector service** that together:

- Collect and persist **Docker container metrics** via the Docker Engine API over TCP (port 2375):
  - CPU usage (%), memory usage (bytes / %), network usage (rx/tx bytes), disk usage (basic I/O or space),
  - Container **uptime** and **up/down status**.
- Collect and persist **host metrics**:
  - CPU usage, **CPU frequency**, memory usage, and **host uptime** and **up/down status**.
- Store all metrics in **PostgreSQL** as the primary persistence layer.
- Provide a **Grafana panel plugin** that:
  - Allows configuring connection info (either Postgres DS / C# API URL) and selecting containers/hosts.
  - Displays time-series graphs and simple status indicators for the metrics above over a chosen time range.

## MVP Acceptance Criteria

1. **C# collector service**
   - Configurable Docker endpoint (IP + port 2375) and Postgres connection.
   - Periodically polls Docker API for container stats and host information.
   - Persists container and host metrics (including uptime and status, host CPU frequency) into Postgres.
   - Exposes at least one **read-only HTTP endpoint** to fetch recent metrics (optional path if Grafana reads directly from Postgres).

2. **Postgres schema**
   - At least one table for **container metrics** and one for **host metrics**, with reasonable indexing on time and identity (container/host).
   - Ability to retrieve historical metrics for a given container/host and time range using simple SQL queries.

3. **Grafana panel plugin (TypeScript + React)**
   - Builds and loads successfully in Grafana 12.3.
   - Exposes configuration UI for selecting data source (Postgres or custom HTTP endpoint) and target containers/hosts.
   - Renders at least:
     - One time-series graph showing container CPU% and memory usage over time.
     - One visualization (graph/stat/table) showing host CPU usage and CPU frequency over time.
     - A simple way to indicate container and host **up/down status** and uptime (e.g., color-coded labels or table).

4. **End-to-end demo**
   - With Docker running and the collector connected, metrics appear in Postgres.
   - Grafana dashboard using the custom panel shows live(ish) and historical data for at least one host and one container.
   - You can explain the architecture and main code pieces in your own words.

## Time Budget

Total conceptual budget: **~10 hours** of focused learning and implementation. The plan favors:

- A minimal but real **plugin** over feature breadth.
- Leveraging your **C# and Postgres** strength to keep Grafana-side complexity manageable.
- Reducing deep React/TypeScript complexity by starting with simple UIs and data flows.

---

## Lesson Overview

We’ll structure the course into 7 lessons. Durations are approximate and for planning only.

1. **Lesson 01 – Environment Setup & Hello Panel Plugin**
2. **Lesson 02 – Grafana Panel Plugin Data Flow & TypeScript Basics**
3. **Lesson 03 – C# Collector Skeleton: Talking to Docker & Modeling Metrics**
4. **Lesson 04 – Persistence in Postgres & C# Read API**
5. **Lesson 05 – Wiring Grafana Panel to Data (Postgres/HTTP)**
6. **Lesson 06 – Extending Metrics: Network, Disk, Uptime/Status, Host CPU Frequency**
7. **Lesson 07 – Polish, Packaging, and CV-Ready Summary**

Each lesson has objectives, prerequisites, acceptance criteria, and references in its own file under `./tutor/lessons/`.

---

## Lesson Summaries

### Lesson 01 – Environment Setup & Hello Panel Plugin

**Goal:** Get a minimal Grafana panel plugin building and running in Grafana 12.3, and understand the basic file structure.

**Key outcomes:**
- Grafana plugin development environment set up.
- A simple panel that renders static text or a static chart.
- You can build, sign (if needed), and load the plugin into Grafana.

### Lesson 02 – Grafana Panel Plugin Data Flow & TypeScript Basics

**Goal:** Understand how data is passed to a panel plugin (data frames) and get comfortable with basic TypeScript used inside the plugin.

**Key outcomes:**
- A panel that accepts time-series data (mocked or from an existing data source) and renders a simple graph.
- You can read and modify TypeScript types/interfaces used by the plugin.

### Lesson 03 – C# Collector Skeleton: Talking to Docker & Modeling Metrics

**Goal:** Build a C# service that connects to Docker’s API (port 2375), fetches container stats, and defines the Postgres schema for container and host metrics.

**Key outcomes:**
- C# project scaffolding with configuration for Docker endpoint and Postgres.
- Basic call to Docker API to list containers and fetch stats.
- SQL schema for container and host metrics, including uptime, status, and host CPU frequency.

### Lesson 04 – Persistence in Postgres & C# Read API

**Goal:** Implement periodic metric collection and persistence to Postgres, plus a minimal HTTP API to read metrics back.

**Key outcomes:**
- A timer/loop that periodically polls Docker and inserts metrics into Postgres.
- One or more HTTP endpoints (e.g., `/metrics/containers`, `/metrics/hosts`) that return recent/historical data.
- Basic testing via curl/Postman/HTTP client.

### Lesson 05 – Wiring Grafana Panel to Data (Postgres/HTTP)

**Goal:** Connect the Grafana panel plugin to your data, using either Grafana’s Postgres data source or your custom HTTP API.

**Key outcomes:**
- Panel plugin can query/post-process data for a chosen container/host and time range.
- You can see real metrics from your collector in a custom panel graph.

### Lesson 06 – Extending Metrics: Network, Disk, Uptime/Status, Host CPU Frequency

**Goal:** Add the full metric set (CPU, memory, network, disk, uptime/status, host CPU frequency) and visualize them meaningfully.

**Key outcomes:**
- Collector and schema extended to support network I/O, disk usage, uptime, status, and host CPU frequency.
- Panel updated to show additional series and status indicators (e.g., color-coded up/down status).

### Lesson 07 – Polish, Packaging, and CV-Ready Summary

**Goal:** Make the plugin usable and presentable, and produce a concise summary suitable for a CV or portfolio.

**Key outcomes:**
- Basic plugin configuration UI (e.g., Docker host, Postgres or API URL).
- Clean up code, add minimal README/description, and verify build steps.
- Document a short demo script and bullet points for your CV.

---

## References (initial)

We will refine and version these in `./tutor/research/refs.md` as we go.

- **Grafana Plugin Development (12.x)**  
  https://grafana.com/docs/grafana/latest/developers/plugins/

- **Panel Plugins**  
  https://grafana.com/docs/grafana/latest/developers/plugins/panel-plugins/

- **Grafana Data Frames**  
  https://grafana.com/docs/grafana/latest/packages_api/data/dataframe/

- **Docker Engine API**  
  https://docs.docker.com/engine/api/

- **PostgreSQL Official Documentation**  
  https://www.postgresql.org/docs/current/

---

## Plan Notes & Migration Policy

- This plan is designed for a ~10-hour learning path and may be adjusted based on your progress.
- If we change lesson order or scope, we will **append migration notes** here and in the relevant lesson files instead of overwriting history.

---

## Migration Note – 2026-01-13: Rescope to In-Memory Storage

**Change:** Removed PostgreSQL from the architecture. Metrics now stored in-memory only (rolling 24h window).

**Rationale:**
- Postgres adds complexity without significant learning value for the CV goal (Grafana plugin development).
- 24h of metrics for ~10-20 containers fits easily in <50 MB RAM.
- Simpler architecture: C# collector with HTTP API → Grafana panel.

**Affected lessons:**
- **Lesson 03**: Remove Postgres schema design; add in-memory data structure design instead.
- **Lesson 04**: Simplify to HTTP API only (no Postgres persistence).
- **Lesson 05**: Panel connects to C# HTTP API only (remove Postgres data source option).

**Updated MVP Acceptance Criteria:**
1. C# collector stores metrics in a rolling 24h in-memory buffer.
2. C# collector exposes HTTP endpoints to query metrics by container/host and time range.
3. Grafana panel queries the C# HTTP API and renders graphs/status.
4. No external database dependency.
