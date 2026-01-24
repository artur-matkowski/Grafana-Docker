# Docker Metrics Data Source

Grafana data source for fetching metrics from Docker Metrics Collector agents.

## Features

- Query container metrics (CPU, memory, network, disk, PSI pressure)
- Support for multiple Docker hosts
- Container filtering by name pattern
- Works with Grafana public dashboards

## Configuration

1. Add the data source in Grafana
2. Configure one or more Docker Metrics Collector agent URLs
3. Save and test the connection

## Usage

1. Create a new panel
2. Select 'Docker Metrics' as the data source
3. Choose metrics and optionally filter containers
4. Visualize your Docker container metrics

