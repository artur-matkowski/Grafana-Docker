---
title: "Lesson 06 – Extending Metrics: Network, Disk, Uptime/Status, Host CPU Frequency"
objectives:
  - Extend collection and schema to include network I/O, disk usage, uptime, status, and host CPU frequency.
  - Visualize multiple metrics and status indicators in the panel.
prerequisites:
  - Lessons 03–05 completed and basic metrics flowing end-to-end.
acceptance_criteria:
  - Collector and schema updated for network RX/TX, disk metrics, uptime, status, and host CPU frequency.
  - Panel displays at least:
    - Container CPU%, memory, and network usage.
    - Host CPU usage and CPU frequency.
    - Container and host up/down status and uptime in some visual form (table, badges, or similar).
references:
  - title: "Docker Engine API – Container Stats"
    url: "https://docs.docker.com/engine/api/"
---

## Steps

1. **Extend the C# collector**
   - Identify fields in the Docker API that provide network I/O and disk-related metrics.
   - Add logic to compute or extract uptime and status (e.g., based on container state and start time).
   - For host CPU frequency, decide whether to obtain it from Docker or directly from the host OS.

2. **Update Postgres schema**
   - Add columns/tables as needed for new metrics (network, disk, uptime, status, host CPU frequency).
   - Apply migrations carefully, preserving existing data.

3. **Update read API and queries**
   - Include new metrics in your HTTP responses or Postgres queries.

4. **Enhance the panel visualization**
   - Add graphs or additional series for network and disk metrics.
   - Add visual indicators (e.g., colored labels or icons) for container/host up/down status.
   - Display uptime in a human-readable format if feasible.

## Micro-checks

- Can you verify a container's reported uptime/status matches reality (e.g., via `docker ps`)?
- Can you see host CPU frequency changing over time (if hardware/OS exposes it)?

## Notes

- Be cautious about panel clutter; focus on the most informative metrics first.
