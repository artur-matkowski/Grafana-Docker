---
title: "Lesson 02 – Grafana Panel Data Flow & TypeScript Basics"
objectives:
  - Understand how data frames are passed into a panel plugin.
  - Gain basic familiarity with TypeScript syntax used in the plugin.
  - Render a simple time-series graph using mock or existing data.
prerequisites:
  - Lesson 01 completed: hello-world panel plugin builds and loads in Grafana.
acceptance_criteria:
  - The panel reads data passed from Grafana (even if from a built-in data source).
  - You can modify TypeScript types/interfaces without breaking the build.
  - The panel renders a simple chart of a numeric series over time.
references:
  - title: "Panel Plugins"
    url: "https://grafana.com/docs/grafana/latest/developers/plugins/panel-plugins/"
  - title: "Data Frames"
    url: "https://grafana.com/docs/grafana/latest/packages_api/data/dataframe/"
---

## Steps

1. **Review the panel's `props` and data model**
   - Locate the TypeScript interfaces describing the panel's props (e.g., `PanelProps`).
   - Inspect how `data.series` is accessed inside the React component.

2. **Inspect data from an existing data source**
   - Configure a dashboard panel using an existing data source (e.g., Postgres or a test data source).
   - Use your custom panel in that context to see what data is passed in.

3. **Add TypeScript types for your data**
   - Define or refine interfaces/types to represent time-series data within the panel.
   - Ensure the project builds successfully.

4. **Render a basic time-series graph**
   - Use Grafana's React components or a simple SVG/canvas approach to render a line graph of numeric data over time.
   - Start with one series (e.g., random or synthetic data) to keep it simple.

5. **Experiment with props and options**
   - Add one or two panel options (e.g., a title prefix) and display them in the panel.

## Micro-checks

- Can you explain what a `DataFrame` is in the context of Grafana?
- Can you log or inspect the data your panel receives at runtime?

## Notes

- We keep TypeScript usage minimal and practical, focusing on the parts directly used in the plugin.
