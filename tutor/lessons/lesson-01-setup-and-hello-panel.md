---
title: "Lesson 01 – Environment Setup & Hello Panel Plugin"
objectives:
  - Set up the Grafana plugin development toolchain for Grafana 12.3.
  - Scaffold a minimal panel plugin in TypeScript/React.
  - Build and load the plugin into your Grafana instance.
prerequisites:
  - Grafana 12.3 instance available (local or remote).
  - Node.js and npm installed.
  - Basic familiarity with CLI and Git.
acceptance_criteria:
  - A new panel plugin appears in Grafana's "Add panel" dialog.
  - The panel renders a simple static message or number.
  - You can rebuild/reload the plugin after making a code change.
references:
  - title: "Grafana Plugin Development Overview"
    url: "https://grafana.com/docs/grafana/latest/developers/plugins/"
  - title: "Panel Plugins"
    url: "https://grafana.com/docs/grafana/latest/developers/plugins/panel-plugins/"
---

## Steps

1. **Verify Grafana version and access**
   - Confirm you can log into the Grafana 12.3 instance you will target.
   - Ensure you have admin rights or sufficient permissions to install custom plugins.

2. **Install Node.js and npm (if not already installed)**
   - Verify `node -v` and `npm -v` in your shell.
   - Prefer an LTS Node version supported by Grafana's plugin tooling.

3. **Set up Grafana plugin tooling**
   - Follow the official docs to either:
     - Use `@grafana/create-plugin` (recommended), or
     - Clone a starter plugin repository.
   - Initialize a new **panel plugin** project.

4. **Explore the generated plugin structure**
   - Identify key files: `src/module.ts`, main React component, `plugin.json`, etc.
   - Note where panel options and rendering code live.

5. **Implement a "hello world" render**
   - Modify the panel's React component to render a static message like "Docker Metrics Panel – Hello".

6. **Build and load the plugin into Grafana**
   - Run the plugin build script (usually `npm install` then `npm run dev` or `npm run build`).
   - Configure Grafana to load the plugin (development mode or by copying into the plugins directory).
   - Verify the panel appears and can be added to a dashboard.

## Micro-checks

- Can you point to where the panel's React component is defined?
- Can you change the rendered text and see the update in Grafana after rebuilding?

## Notes

- Keep changes small and commit frequently once you have Git initialized for the plugin project.
- We will build on this plugin in subsequent lessons to connect it to real data.
