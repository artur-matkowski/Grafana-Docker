package main

import (
	"os"

	"github.com/grafana/grafana-plugin-sdk-go/backend/datasource"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"

	"github.com/dockermetrics/dockermetrics-datasource/pkg/plugin"
)

func main() {
	err := datasource.Manage("dockermetrics-datasource", plugin.NewDatasource, datasource.ManageOpts{})

	if err != nil {
		log.DefaultLogger.Error("Error running datasource", "error", err.Error())
		os.Exit(1)
	}
}
