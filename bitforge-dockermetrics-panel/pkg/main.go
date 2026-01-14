package main

import (
	"os"

	"github.com/grafana/grafana-plugin-sdk-go/backend/datasource"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"

	"github.com/bitforge/dockermetrics-panel/pkg/plugin"
)

func main() {
	if err := datasource.Manage("bitforge-dockermetrics-panel", plugin.NewPlugin, datasource.ManageOpts{}); err != nil {
		log.DefaultLogger.Error("Error starting plugin", "error", err.Error())
		os.Exit(1)
	}
}
