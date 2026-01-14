package main

import (
	"os"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"

	"github.com/bitforge/dockermetrics-panel/pkg/plugin"
)

func main() {
	p := &plugin.Plugin{}

	err := backend.Serve(backend.ServeOpts{
		CallResourceHandler: p,
		CheckHealthHandler:  p,
	})

	if err != nil {
		log.DefaultLogger.Error("Error starting plugin", "error", err.Error())
		os.Exit(1)
	}
}
