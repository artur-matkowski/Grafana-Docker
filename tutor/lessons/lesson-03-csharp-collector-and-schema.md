---
title: "Lesson 03 – C# Collector Skeleton: Docker API & In-Memory Metrics"
objectives:
  - Scaffold a C# service that can connect to the Docker Engine API over TCP (port 2375).
  - Fetch basic container stats and host info from Docker.
  - Design in-memory data structures for a rolling 24h metrics buffer.
prerequisites:
  - Comfortable building and running a simple C# console/service application.
  - Access to a Docker host exposing the API on TCP (2375) in a controlled environment.
acceptance_criteria:
  - A C# project that can list running containers and retrieve basic stats via the Docker API.
  - In-memory data model for container and host metrics (CPU, mem, network, disk, uptime, status, host CPU frequency).
  - A plan for rolling 24h retention with efficient memory usage.
references:
  - title: "Docker Engine API Overview"
    url: "https://docs.docker.com/engine/api/"
---

## Steps

1. **Create a new C# project** ✓ DONE
   - Choose a template (e.g., .NET console app or worker service) suitable for a long-running collector.
   - Add configuration for Docker endpoint (`DOCKER_HOST` or appsettings.json with host/IP and port 2375).

2. **Call the Docker Engine API** ✓ DONE
   - Implement a minimal HTTP client to call Docker's API over TCP 2375.
   - Start with listing containers and inspecting one container's stats endpoint.

3. **Identify required metrics** ✓ DONE
   - From the Docker API responses, identify how to obtain:
     - Container CPU%, memory usage, network I/O, disk-related counters (where available), uptime, and up/down status.
     - Host CPU usage and CPU frequency (from Docker or from the host OS as needed).

4. **Design in-memory data structures** ← CURRENT
   - Define C# classes/records for:
     - `ContainerMetricSnapshot` – container_id, name, timestamp, cpu%, mem bytes/%, net rx/tx, disk read/write, uptime, status
     - `HostMetricSnapshot` – hostname, timestamp, cpu%, cpu_freq, mem bytes/%, uptime, status
   - Choose a collection strategy for rolling 24h retention:
     - Option A: `ConcurrentQueue<T>` with periodic trimming
     - Option B: Circular buffer (fixed-size array with wrap-around index)
     - Option C: `List<T>` sorted by time, with periodic removal of old entries
   - Consider thread safety (collector writes, HTTP API reads concurrently).

5. **Implement the data model**
   - Create the snapshot classes with appropriate types.
   - Create a `MetricsStore` class that holds the collections and provides:
     - `Add(snapshot)` – thread-safe insert
     - `GetRange(containerId, from, to)` – query by time range
     - `Trim()` – remove entries older than 24h

## Micro-checks

- Can your C# code successfully hit the Docker API and parse a minimal stats response? ✓
- Can you explain your choice of collection type and why it's suitable for rolling retention?
- How will you handle concurrent read/write access?

## Notes

- Security note: port 2375 is typically unencrypted and unauthenticated; ensure this is used only in a trusted lab environment.

---

## Migration Note – 2026-01-13

**Changed:** Replaced Postgres schema design (Step 4-5) with in-memory data structure design.

**Rationale:** Simpler architecture, no external DB dependency, sufficient for 24h retention with <50 MB RAM.
