package plugin

import (
	"context"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

// Make sure Plugin implements required interfaces
var (
	_ backend.CallResourceHandler = (*Plugin)(nil)
	_ backend.CheckHealthHandler  = (*Plugin)(nil)
)

// Plugin is the backend plugin instance
type Plugin struct {
	logger log.Logger
}

// NewPlugin creates a new plugin instance
func NewPlugin(ctx context.Context, settings backend.PluginContext) (instancemgmt.Instance, error) {
	return &Plugin{
		logger: log.DefaultLogger,
	}, nil
}

// Dispose cleans up plugin resources
func (p *Plugin) Dispose() {
	// Clean up if needed
}

// CheckHealth handles health checks from Grafana
func (p *Plugin) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "Docker Metrics Panel backend is running",
	}, nil
}
