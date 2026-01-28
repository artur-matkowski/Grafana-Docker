package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/data"
)

// Make sure Datasource implements required interfaces
var (
	_ backend.QueryDataHandler      = (*Datasource)(nil)
	_ backend.CheckHealthHandler    = (*Datasource)(nil)
	_ instancemgmt.InstanceDisposer = (*Datasource)(nil)
)

// httpClient with reasonable timeouts
var httpClient = &http.Client{
	Timeout: 30 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
	},
}

// HostConfig represents a Docker agent host configuration
type HostConfig struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	URL     string `json:"url"`
	Enabled bool   `json:"enabled"`
}

// DatasourceSettings contains the data source configuration
type DatasourceSettings struct {
	Hosts []HostConfig `json:"hosts"`
}

// Datasource is a data source instance
type Datasource struct {
	settings DatasourceSettings
	logger   log.Logger
}

// NewDatasource creates a new datasource instance
func NewDatasource(ctx context.Context, settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	logger := log.DefaultLogger

	var dsSettings DatasourceSettings
	if settings.JSONData != nil && len(settings.JSONData) > 0 {
		if err := json.Unmarshal(settings.JSONData, &dsSettings); err != nil {
			logger.Error("Failed to parse datasource settings", "error", err)
			return nil, fmt.Errorf("failed to parse datasource settings: %w", err)
		}
	}

	logger.Info("Created Docker Metrics datasource instance",
		"hosts", len(dsSettings.Hosts),
		"id", settings.ID,
	)

	return &Datasource{
		settings: dsSettings,
		logger:   logger,
	}, nil
}

// Dispose cleans up resources when instance is destroyed
func (d *Datasource) Dispose() {
	d.logger.Info("Disposing Docker Metrics datasource instance")
}

// QueryData handles multiple queries
func (d *Datasource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	response := backend.NewQueryDataResponse()

	for _, q := range req.Queries {
		res := d.query(ctx, req.PluginContext, q)
		response.Responses[q.RefID] = res
	}

	return response, nil
}

// Query model from frontend
type QueryModel struct {
	QueryType            string   `json:"queryType"`
	ContainerIDs         []string `json:"containerIds"`
	ContainerNamePattern string   `json:"containerNamePattern"`
	Metrics              []string `json:"metrics"`
	HostIDs              []string `json:"hostIds"`
}

// query handles a single query
func (d *Datasource) query(ctx context.Context, pCtx backend.PluginContext, query backend.DataQuery) backend.DataResponse {
	var response backend.DataResponse

	// Parse query model
	var qm QueryModel
	if err := json.Unmarshal(query.JSON, &qm); err != nil {
		d.logger.Error("Failed to parse query", "error", err)
		response.Error = fmt.Errorf("failed to parse query: %w", err)
		return response
	}

	d.logger.Debug("Processing query",
		"queryType", qm.QueryType,
		"metrics", qm.Metrics,
		"containerPattern", qm.ContainerNamePattern,
		"timeRange", fmt.Sprintf("%v - %v", query.TimeRange.From, query.TimeRange.To),
	)

	switch qm.QueryType {
	case "metrics":
		return d.queryMetrics(ctx, query, qm)
	case "containers":
		return d.queryContainers(ctx, qm)
	default:
		response.Error = fmt.Errorf("unknown query type: %s", qm.QueryType)
		return response
	}
}

// ContainerMetric represents a single metric data point from the agent
type ContainerMetric struct {
	ContainerID     string      `json:"containerId"`
	ContainerName   string      `json:"containerName"`
	Timestamp       string      `json:"timestamp"`
	CPUPercent      float64     `json:"cpuPercent"`
	MemoryBytes     float64     `json:"memoryBytes"`
	MemoryPercent   float64     `json:"memoryPercent"`
	NetworkRxBytes  float64     `json:"networkRxBytes"`
	NetworkTxBytes  float64     `json:"networkTxBytes"`
	DiskReadBytes   float64     `json:"diskReadBytes"`
	DiskWriteBytes  float64     `json:"diskWriteBytes"`
	UptimeSeconds   float64     `json:"uptimeSeconds"`
	IsRunning       bool        `json:"isRunning"`
	IsPaused        bool        `json:"isPaused"`
	CPUPressure     *PSIMetrics `json:"cpuPressure"`
	MemoryPressure  *PSIMetrics `json:"memoryPressure"`
	IOPressure      *PSIMetrics `json:"ioPressure"`
}

// PSIMetrics represents pressure stall information
type PSIMetrics struct {
	Some10  float64 `json:"some10"`
	Some60  float64 `json:"some60"`
	Some300 float64 `json:"some300"`
	Full10  float64 `json:"full10"`
	Full60  float64 `json:"full60"`
	Full300 float64 `json:"full300"`
}

// MetricsResponse from the Docker agent
type MetricsResponse struct {
	Metrics []ContainerMetric `json:"metrics"`
}

// queryMetrics fetches metrics from Docker agents and returns DataFrames
func (d *Datasource) queryMetrics(ctx context.Context, query backend.DataQuery, qm QueryModel) backend.DataResponse {
	var response backend.DataResponse

	if len(qm.Metrics) == 0 {
		response.Error = fmt.Errorf("no metrics selected")
		return response
	}

	// Get enabled hosts
	hosts := d.getEnabledHosts(qm.HostIDs)
	if len(hosts) == 0 {
		response.Error = fmt.Errorf("no enabled hosts configured")
		return response
	}

	// Compile container name pattern if provided
	var containerPattern *regexp.Regexp
	if qm.ContainerNamePattern != "" {
		var err error
		containerPattern, err = regexp.Compile(qm.ContainerNamePattern)
		if err != nil {
			d.logger.Warn("Invalid container name pattern", "pattern", qm.ContainerNamePattern, "error", err)
		}
	}

	// Collect metrics from all hosts
	allMetrics := make([]metricsWithHost, 0)

	for _, host := range hosts {
		metrics, err := d.fetchMetricsFromHost(ctx, host, query.TimeRange, qm.Metrics)
		if err != nil {
			d.logger.Error("Failed to fetch metrics from host",
				"host", host.Name,
				"url", host.URL,
				"error", err,
			)
			continue
		}

		// Filter by container pattern
		filtered := make([]ContainerMetric, 0)
		for _, m := range metrics {
			if containerPattern != nil && !containerPattern.MatchString(m.ContainerName) {
				continue
			}
			if len(qm.ContainerIDs) > 0 && !contains(qm.ContainerIDs, m.ContainerID) {
				continue
			}
			filtered = append(filtered, m)
		}

		allMetrics = append(allMetrics, metricsWithHost{
			HostID:   host.ID,
			HostName: host.Name,
			Metrics:  filtered,
		})
	}

	// Build DataFrames - one frame per metric type per container
	frames := d.buildMetricFrames(allMetrics, qm.Metrics)
	response.Frames = frames

	return response
}

// fetchMetricsFromHost fetches metrics from a single Docker agent
func (d *Datasource) fetchMetricsFromHost(ctx context.Context, host HostConfig, timeRange backend.TimeRange, metrics []string) ([]ContainerMetric, error) {
	// Build URL
	params := url.Values{}
	params.Set("from", timeRange.From.Format(time.RFC3339))
	params.Set("to", timeRange.To.Format(time.RFC3339))
	params.Set("fields", strings.Join(metrics, ","))

	targetURL := fmt.Sprintf("%s/api/metrics?%s", strings.TrimSuffix(host.URL, "/"), params.Encode())

	d.logger.Debug("Fetching metrics from host", "url", targetURL)

	req, err := http.NewRequestWithContext(ctx, "GET", targetURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("unexpected status %d (failed to read body: %w)", resp.StatusCode, err)
		}
		return nil, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
	}

	var metricsResp MetricsResponse
	if err := json.NewDecoder(resp.Body).Decode(&metricsResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return metricsResp.Metrics, nil
}

// metricsWithHost groups metrics by host
type metricsWithHost struct {
	HostID   string
	HostName string
	Metrics  []ContainerMetric
}

// containerKey identifies a container across hosts
type containerKey struct {
	hostID      string
	containerID string
}

// containerData holds container info and metrics
type containerData struct {
	hostName      string
	containerName string
	metrics       []ContainerMetric
}

// buildMetricFrames converts metrics into Grafana DataFrames
func (d *Datasource) buildMetricFrames(allMetrics []metricsWithHost, requestedMetrics []string) []*data.Frame {
	// Group metrics by container
	byContainer := make(map[containerKey]*containerData)

	for _, mwh := range allMetrics {
		for _, m := range mwh.Metrics {
			key := containerKey{hostID: mwh.HostID, containerID: m.ContainerID}
			if byContainer[key] == nil {
				byContainer[key] = &containerData{
					hostName:      mwh.HostName,
					containerName: m.ContainerName,
					metrics:       make([]ContainerMetric, 0),
				}
			}
			byContainer[key].metrics = append(byContainer[key].metrics, m)
		}
	}

	// Create frames - one per container per metric
	frames := make([]*data.Frame, 0)

	for key, cd := range byContainer {
		// Sort metrics by timestamp
		sortMetricsByTime(cd.metrics)

		for _, metricName := range requestedMetrics {
			frame := d.buildSingleMetricFrame(key, cd, metricName)
			if frame != nil {
				frames = append(frames, frame)
			}
		}
	}

	return frames
}

// metricDisplayName maps internal metric names to display names
var metricDisplayNames = map[string]string{
	"cpuPercent":      "CPU %",
	"memoryBytes":     "Memory (MB)",
	"memoryPercent":   "Memory %",
	"networkRxBytes":  "Network RX (MB)",
	"networkTxBytes":  "Network TX (MB)",
	"diskReadBytes":   "Disk Read (MB)",
	"diskWriteBytes":  "Disk Write (MB)",
	"uptimeSeconds":   "Uptime (s)",
	"cpuPressure":     "CPU Pressure",
	"memoryPressure":  "Memory Pressure",
	"ioPressure":      "I/O Pressure",
}

// metricUnits maps internal metric names to units
var metricUnits = map[string]string{
	"cpuPercent":      "percent",
	"memoryBytes":     "decmbytes",
	"memoryPercent":   "percent",
	"networkRxBytes":  "decmbytes",
	"networkTxBytes":  "decmbytes",
	"diskReadBytes":   "decmbytes",
	"diskWriteBytes":  "decmbytes",
	"uptimeSeconds":   "s",
	"cpuPressure":     "percent",
	"memoryPressure":  "percent",
	"ioPressure":      "percent",
}

// buildSingleMetricFrame creates a DataFrame for a single metric
func (d *Datasource) buildSingleMetricFrame(key containerKey, cd *containerData, metricName string) *data.Frame {
	times := make([]time.Time, 0, len(cd.metrics))
	values := make([]float64, 0, len(cd.metrics))

	const bytesToMB = 1024.0 * 1024.0

	for _, m := range cd.metrics {
		t, err := time.Parse(time.RFC3339, m.Timestamp)
		if err != nil {
			continue
		}

		var value float64

		switch metricName {
		case "cpuPercent":
			value = m.CPUPercent
		case "memoryBytes":
			value = m.MemoryBytes / bytesToMB
		case "memoryPercent":
			value = m.MemoryPercent
		case "networkRxBytes":
			value = m.NetworkRxBytes / bytesToMB
		case "networkTxBytes":
			value = m.NetworkTxBytes / bytesToMB
		case "diskReadBytes":
			value = m.DiskReadBytes / bytesToMB
		case "diskWriteBytes":
			value = m.DiskWriteBytes / bytesToMB
		case "uptimeSeconds":
			value = m.UptimeSeconds
		case "cpuPressure":
			if m.CPUPressure != nil {
				value = m.CPUPressure.Some10
			}
		case "memoryPressure":
			if m.MemoryPressure != nil {
				value = m.MemoryPressure.Some10
			}
		case "ioPressure":
			if m.IOPressure != nil {
				value = m.IOPressure.Some10
			}
		default:
			continue
		}

		times = append(times, t)
		values = append(values, value)
	}

	if len(times) == 0 {
		return nil
	}

	// Get display name and unit
	displayName := metricDisplayNames[metricName]
	if displayName == "" {
		displayName = metricName
	}
	unit := metricUnits[metricName]

	// Create value field with proper config
	valueField := data.NewField(displayName, data.Labels{
		"containerId":   key.containerID,
		"containerName": cd.containerName,
		"hostName":      cd.hostName,
	}, values)

	// Set field config for proper display in Grafana
	valueField.Config = &data.FieldConfig{
		DisplayName: fmt.Sprintf("%s - %s", cd.containerName, displayName),
		Unit:        unit,
	}

	// Create frame
	frame := data.NewFrame(
		fmt.Sprintf("%s - %s", cd.containerName, displayName),
		data.NewField("time", nil, times),
		valueField,
	)

	return frame
}

// ContainerInfo for container list queries
type ContainerInfo struct {
	ContainerID   string `json:"containerId"`
	ContainerName string `json:"containerName"`
	State         string `json:"state"`
	IsRunning     bool   `json:"isRunning"`
	IsPaused      bool   `json:"isPaused"`
}

// queryContainers returns a list of containers for variable queries
func (d *Datasource) queryContainers(ctx context.Context, qm QueryModel) backend.DataResponse {
	var response backend.DataResponse

	hosts := d.getEnabledHosts(qm.HostIDs)
	if len(hosts) == 0 {
		response.Error = fmt.Errorf("no enabled hosts configured")
		return response
	}

	// Collect containers from all hosts
	containerIDs := make([]string, 0)
	containerNames := make([]string, 0)
	hostNames := make([]string, 0)
	states := make([]string, 0)
	isRunningList := make([]bool, 0)
	isPausedList := make([]bool, 0)

	for _, host := range hosts {
		containers, err := d.fetchContainersFromHost(ctx, host)
		if err != nil {
			d.logger.Error("Failed to fetch containers from host",
				"host", host.Name,
				"error", err,
			)
			continue
		}

		for _, c := range containers {
			containerIDs = append(containerIDs, c.ContainerID)
			containerNames = append(containerNames, c.ContainerName)
			hostNames = append(hostNames, host.Name)
			states = append(states, c.State)
			isRunningList = append(isRunningList, c.IsRunning)
			isPausedList = append(isPausedList, c.IsPaused)
		}
	}

	// Build frame for variable query
	frame := data.NewFrame("containers",
		data.NewField("containerId", nil, containerIDs),
		data.NewField("containerName", nil, containerNames),
		data.NewField("hostName", nil, hostNames),
		data.NewField("state", nil, states),
		data.NewField("isRunning", nil, isRunningList),
		data.NewField("isPaused", nil, isPausedList),
	)

	response.Frames = append(response.Frames, frame)
	return response
}

// fetchContainersFromHost gets container list from a Docker agent
func (d *Datasource) fetchContainersFromHost(ctx context.Context, host HostConfig) ([]ContainerInfo, error) {
	targetURL := fmt.Sprintf("%s/api/containers?all=true", strings.TrimSuffix(host.URL, "/"))

	req, err := http.NewRequestWithContext(ctx, "GET", targetURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var containers []ContainerInfo
	if err := json.NewDecoder(resp.Body).Decode(&containers); err != nil {
		return nil, err
	}

	return containers, nil
}

// getEnabledHosts returns enabled hosts, optionally filtered by IDs
func (d *Datasource) getEnabledHosts(filterIDs []string) []HostConfig {
	result := make([]HostConfig, 0)
	for _, h := range d.settings.Hosts {
		if !h.Enabled {
			continue
		}
		if len(filterIDs) > 0 && !contains(filterIDs, h.ID) {
			continue
		}
		result = append(result, h)
	}
	return result
}

// CheckHealth performs a health check
func (d *Datasource) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	hosts := d.getEnabledHosts(nil)

	if len(hosts) == 0 {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: "No hosts configured. Add Docker Metrics Collector agents in the data source settings.",
		}, nil
	}

	// Test connectivity to each host
	healthyHosts := 0
	var lastError string

	for _, host := range hosts {
		targetURL := fmt.Sprintf("%s/api/info", strings.TrimSuffix(host.URL, "/"))
		req, err := http.NewRequestWithContext(ctx, "GET", targetURL, nil)
		if err != nil {
			lastError = fmt.Sprintf("%s: %v", host.Name, err)
			continue
		}

		resp, err := httpClient.Do(req)
		if err != nil {
			lastError = fmt.Sprintf("%s: %v", host.Name, err)
			continue
		}

		statusCode := resp.StatusCode
		resp.Body.Close()

		if statusCode == http.StatusOK {
			healthyHosts++
		} else {
			lastError = fmt.Sprintf("%s: status %d", host.Name, statusCode)
		}
	}

	if healthyHosts == len(hosts) {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusOk,
			Message: fmt.Sprintf("Connected to %d Docker Metrics Collector agent(s)", healthyHosts),
		}, nil
	}

	if healthyHosts > 0 {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusOk,
			Message: fmt.Sprintf("Connected to %d/%d hosts. Last error: %s", healthyHosts, len(hosts), lastError),
		}, nil
	}

	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusError,
		Message: fmt.Sprintf("Failed to connect to any host. Last error: %s", lastError),
	}, nil
}

// Helper functions

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

func sortMetricsByTime(metrics []ContainerMetric) {
	sort.Slice(metrics, func(i, j int) bool {
		t1, _ := time.Parse(time.RFC3339, metrics[i].Timestamp)
		t2, _ := time.Parse(time.RFC3339, metrics[j].Timestamp)
		return t1.Before(t2)
	})
}
