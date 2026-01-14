package plugin

import (
	"context"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
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

// Logger returns the plugin logger, initializing if needed
func (p *Plugin) Logger() log.Logger {
	if p.logger == nil {
		p.logger = log.DefaultLogger
	}
	return p.logger
}

// CheckHealth handles health checks from Grafana
func (p *Plugin) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "Docker Metrics Panel backend is running",
	}, nil
}
