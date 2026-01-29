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
	Hosts                  []HostConfig `json:"hosts"`
	EnableContainerControls bool        `json:"enableContainerControls"`
	AllowedControlActions   []string    `json:"allowedControlActions"`
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

// HostSelection represents per-host container selection configuration
type HostSelection struct {
	HostID           string              `json:"hostId"`
	Mode             string              `json:"mode"` // "whitelist" | "blacklist"
	ContainerIDs     []string            `json:"containerIds"`
	ContainerMetrics map[string][]string `json:"containerMetrics"`
	Metrics          []string            `json:"metrics"` // For blacklist mode
}

// Query model from frontend
type QueryModel struct {
	QueryType      string                   `json:"queryType"`
	HostSelections map[string]HostSelection `json:"hostSelections"`

	// Legacy fields (kept for backward compatibility)
	ContainerIDs         []string `json:"containerIds"`
	ContainerNamePattern string   `json:"containerNamePattern"`
	Metrics              []string `json:"metrics"`
	HostIDs              []string `json:"hostIds"`

	// Control action fields (for queryType: "control")
	ControlAction   string `json:"controlAction"`   // start, stop, restart, pause, unpause
	TargetContainer string `json:"targetContainer"` // container ID
	TargetHost      string `json:"targetHost"`      // host ID
}

// AllMetrics lists all available metrics
var AllMetrics = []string{
	"cpuPercent", "memoryBytes", "memoryPercent",
	"networkRxBytes", "networkTxBytes",
	"diskReadBytes", "diskWriteBytes",
	"uptimeSeconds",
	"cpuPressureSome", "cpuPressureFull",
	"memoryPressureSome", "memoryPressureFull",
	"ioPressureSome", "ioPressureFull",
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

	// Default to metrics query if not specified
	if qm.QueryType == "" {
		qm.QueryType = "metrics"
	}

	d.logger.Debug("Processing query",
		"queryType", qm.QueryType,
		"metrics", qm.Metrics,
		"containerPattern", qm.ContainerNamePattern,
		"timeRange", fmt.Sprintf("%v - %v", query.TimeRange.From, query.TimeRange.To),
	)

	switch qm.QueryType {
	case "metrics", "":
		return d.queryMetrics(ctx, query, qm)
	case "containers":
		return d.queryContainers(ctx, qm)
	case "control":
		return d.queryControl(ctx, qm)
	default:
		// Treat unknown as metrics query for backward compatibility
		return d.queryMetrics(ctx, query, qm)
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
	// New path: if hostSelections exists, use matrix-based filtering
	if len(qm.HostSelections) > 0 {
		return d.queryMetricsMatrix(ctx, query, qm)
	}

	// Legacy path: use existing logic
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

	// Also include containers frame for public dashboard support
	// This allows panels to receive container state info without a separate query
	containersFrame := d.buildContainersFrame(ctx, hosts)
	if containersFrame != nil {
		frames = append(frames, containersFrame)
	}

	response.Frames = frames

	return response
}

// queryMetricsMatrix handles matrix-based container/metric selection
func (d *Datasource) queryMetricsMatrix(ctx context.Context, query backend.DataQuery, qm QueryModel) backend.DataResponse {
	var response backend.DataResponse

	// Log incoming hostSelections for debugging
	for hostID, hostSel := range qm.HostSelections {
		d.logger.Debug("queryMetricsMatrix: incoming hostSelection",
			"hostID", hostID,
			"mode", hostSel.Mode,
			"containerIDsCount", len(hostSel.ContainerIDs),
			"containerMetricsKeys", len(hostSel.ContainerMetrics),
		)
		for containerID, metrics := range hostSel.ContainerMetrics {
			d.logger.Debug("queryMetricsMatrix: containerMetrics entry",
				"hostID", hostID,
				"containerID", containerID,
				"metricsCount", len(metrics),
				"metrics", metrics,
			)
		}
	}

	// Collect all hosts from selections
	hostIDs := make([]string, 0, len(qm.HostSelections))
	for hostID := range qm.HostSelections {
		hostIDs = append(hostIDs, hostID)
	}

	hosts := d.getEnabledHosts(hostIDs)
	if len(hosts) == 0 {
		response.Error = fmt.Errorf("no enabled hosts configured")
		return response
	}

	// Collect metrics from all hosts with matrix-based filtering
	allMetrics := make([]metricsWithHost, 0)

	for _, host := range hosts {
		hostSel, ok := qm.HostSelections[host.ID]
		if !ok {
			continue
		}

		// Determine which metrics to fetch for this host
		metricsToFetch := d.getMetricsForHost(hostSel)
		if len(metricsToFetch) == 0 {
			continue
		}

		metrics, err := d.fetchMetricsFromHost(ctx, host, query.TimeRange, metricsToFetch)
		if err != nil {
			d.logger.Error("Failed to fetch metrics from host",
				"host", host.Name,
				"url", host.URL,
				"error", err,
			)
			continue
		}

		// Filter metrics based on host selection mode
		filtered := d.filterMetricsBySelection(metrics, hostSel)

		// Copy hostSel for the pointer
		hostSelCopy := hostSel
		allMetrics = append(allMetrics, metricsWithHost{
			HostID:        host.ID,
			HostName:      host.Name,
			Metrics:       filtered,
			HostSelection: &hostSelCopy,
		})
	}

	// Collect all requested metrics across all host selections
	requestedMetrics := d.collectRequestedMetrics(qm.HostSelections)

	// Build DataFrames
	frames := d.buildMetricFrames(allMetrics, requestedMetrics)

	// Include containers frame for panel state display
	containersFrame := d.buildContainersFrameFiltered(ctx, hosts, qm.HostSelections)
	if containersFrame != nil {
		frames = append(frames, containersFrame)
	}

	response.Frames = frames
	return response
}

// getMetricsForHost determines which metrics to fetch for a host based on selection
func (d *Datasource) getMetricsForHost(hostSel HostSelection) []string {
	// Both modes use containerMetrics for per-container metric selection
	// Collect unique metrics from containerMetrics
	metricsSet := make(map[string]bool)
	for _, metrics := range hostSel.ContainerMetrics {
		for _, m := range metrics {
			metricsSet[m] = true
		}
	}

	// If no containerMetrics defined, default to all metrics
	if len(metricsSet) == 0 {
		return AllMetrics
	}

	metrics := make([]string, 0, len(metricsSet))
	for m := range metricsSet {
		metrics = append(metrics, m)
	}
	return metrics
}

// filterMetricsBySelection filters metrics based on host selection mode
func (d *Datasource) filterMetricsBySelection(metrics []ContainerMetric, hostSel HostSelection) []ContainerMetric {
	filtered := make([]ContainerMetric, 0)

	containerSet := make(map[string]bool)
	for _, cid := range hostSel.ContainerIDs {
		containerSet[cid] = true
	}

	for _, m := range metrics {
		if hostSel.Mode == "whitelist" {
			// Whitelist: only include if container is in the list
			if !containerSet[m.ContainerID] {
				continue
			}
		} else {
			// Blacklist: exclude if container is in the list
			if containerSet[m.ContainerID] {
				continue
			}
		}
		filtered = append(filtered, m)
	}

	return filtered
}

// collectRequestedMetrics gathers all unique metrics from host selections
func (d *Datasource) collectRequestedMetrics(hostSelections map[string]HostSelection) []string {
	metricsSet := make(map[string]bool)

	for _, hostSel := range hostSelections {
		if hostSel.Mode == "blacklist" {
			// Blacklist mode: use selected metrics or all
			metricsToAdd := hostSel.Metrics
			if len(metricsToAdd) == 0 {
				metricsToAdd = AllMetrics
			}
			for _, m := range metricsToAdd {
				metricsSet[m] = true
			}
		} else {
			// Whitelist mode: collect from containerMetrics
			for _, metrics := range hostSel.ContainerMetrics {
				for _, m := range metrics {
					metricsSet[m] = true
				}
			}
		}
	}

	metrics := make([]string, 0, len(metricsSet))
	for m := range metricsSet {
		metrics = append(metrics, m)
	}

	if len(metrics) == 0 {
		return AllMetrics
	}
	return metrics
}

// buildContainersFrameFiltered builds containers frame filtered by host selections
func (d *Datasource) buildContainersFrameFiltered(ctx context.Context, hosts []HostConfig, hostSelections map[string]HostSelection) *data.Frame {
	containerIDs := make([]string, 0)
	containerNames := make([]string, 0)
	hostIDs := make([]string, 0)
	hostNames := make([]string, 0)
	states := make([]string, 0)
	healthStatuses := make([]string, 0)
	isRunningList := make([]bool, 0)
	isPausedList := make([]bool, 0)
	isUnhealthyList := make([]bool, 0)

	for _, host := range hosts {
		hostSel, ok := hostSelections[host.ID]
		if !ok {
			continue
		}

		containers, err := d.fetchContainersFromHost(ctx, host)
		if err != nil {
			d.logger.Warn("Failed to fetch containers for metrics response",
				"host", host.Name,
				"error", err,
			)
			continue
		}

		containerSet := make(map[string]bool)
		for _, cid := range hostSel.ContainerIDs {
			containerSet[cid] = true
		}

		for _, c := range containers {
			include := false
			if hostSel.Mode == "whitelist" {
				include = containerSet[c.ContainerID]
			} else {
				include = !containerSet[c.ContainerID]
			}

			if include {
				containerIDs = append(containerIDs, c.ContainerID)
				containerNames = append(containerNames, c.ContainerName)
				hostIDs = append(hostIDs, host.ID)
				hostNames = append(hostNames, host.Name)
				states = append(states, c.State)
				healthStatuses = append(healthStatuses, c.HealthStatus)
				isRunningList = append(isRunningList, c.IsRunning)
				isPausedList = append(isPausedList, c.IsPaused)
				isUnhealthyList = append(isUnhealthyList, c.IsUnhealthy)
			}
		}
	}

	if len(containerIDs) == 0 {
		return nil
	}

	frame := data.NewFrame("containers",
		data.NewField("containerId", nil, containerIDs),
		data.NewField("containerName", nil, containerNames),
		data.NewField("hostId", nil, hostIDs),
		data.NewField("hostName", nil, hostNames),
		data.NewField("state", nil, states),
		data.NewField("healthStatus", nil, healthStatuses),
		data.NewField("isRunning", nil, isRunningList),
		data.NewField("isPaused", nil, isPausedList),
		data.NewField("isUnhealthy", nil, isUnhealthyList),
	)

	frame.Meta = &data.FrameMeta{
		Custom: map[string]interface{}{
			"queryType": "containers",
		},
	}

	return frame
}

// buildContainersFrame fetches containers from hosts and builds a DataFrame
func (d *Datasource) buildContainersFrame(ctx context.Context, hosts []HostConfig) *data.Frame {
	containerIDs := make([]string, 0)
	containerNames := make([]string, 0)
	hostIDs := make([]string, 0)
	hostNames := make([]string, 0)
	states := make([]string, 0)
	healthStatuses := make([]string, 0)
	isRunningList := make([]bool, 0)
	isPausedList := make([]bool, 0)
	isUnhealthyList := make([]bool, 0)

	for _, host := range hosts {
		containers, err := d.fetchContainersFromHost(ctx, host)
		if err != nil {
			d.logger.Warn("Failed to fetch containers for metrics response",
				"host", host.Name,
				"error", err,
			)
			continue
		}

		for _, c := range containers {
			containerIDs = append(containerIDs, c.ContainerID)
			containerNames = append(containerNames, c.ContainerName)
			hostIDs = append(hostIDs, host.ID)
			hostNames = append(hostNames, host.Name)
			states = append(states, c.State)
			healthStatuses = append(healthStatuses, c.HealthStatus)
			isRunningList = append(isRunningList, c.IsRunning)
			isPausedList = append(isPausedList, c.IsPaused)
			isUnhealthyList = append(isUnhealthyList, c.IsUnhealthy)
		}
	}

	if len(containerIDs) == 0 {
		return nil
	}

	frame := data.NewFrame("containers",
		data.NewField("containerId", nil, containerIDs),
		data.NewField("containerName", nil, containerNames),
		data.NewField("hostId", nil, hostIDs),
		data.NewField("hostName", nil, hostNames),
		data.NewField("state", nil, states),
		data.NewField("healthStatus", nil, healthStatuses),
		data.NewField("isRunning", nil, isRunningList),
		data.NewField("isPaused", nil, isPausedList),
		data.NewField("isUnhealthy", nil, isUnhealthyList),
	)

	// Mark this frame with custom metadata so panel can identify it
	frame.Meta = &data.FrameMeta{
		Custom: map[string]interface{}{
			"queryType": "containers",
		},
	}

	return frame
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
	HostID        string
	HostName      string
	Metrics       []ContainerMetric
	HostSelection *HostSelection // For per-container metric filtering
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
	hostSelection *HostSelection // For per-container metric filtering
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
					hostSelection: mwh.HostSelection,
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

		// Determine which metrics to include for this container
		containerMetrics := d.getMetricsForContainer(cd.hostSelection, key.containerID)

		d.logger.Debug("buildMetricFrames: processing container",
			"containerID", key.containerID,
			"containerName", cd.containerName,
			"containerMetricsCount", len(containerMetrics),
			"requestedMetricsCount", len(requestedMetrics),
		)

		for _, metricName := range requestedMetrics {
			// Skip if this metric is not selected for this container
			if !contains(containerMetrics, metricName) {
				d.logger.Debug("buildMetricFrames: SKIPPING metric (not in containerMetrics)",
					"containerID", key.containerID,
					"metric", metricName,
				)
				continue
			}
			d.logger.Debug("buildMetricFrames: BUILDING metric frame",
				"containerID", key.containerID,
				"metric", metricName,
			)
			frame := d.buildSingleMetricFrame(key, cd, metricName)
			if frame != nil {
				frames = append(frames, frame)
			}
		}
	}

	return frames
}

// getMetricsForContainer returns the metrics that should be shown for a specific container
func (d *Datasource) getMetricsForContainer(hostSel *HostSelection, containerID string) []string {
	// If no host selection, return all metrics (legacy mode)
	if hostSel == nil {
		d.logger.Debug("getMetricsForContainer: hostSel is nil, returning AllMetrics", "containerID", containerID)
		return AllMetrics
	}

	// Check if container has specific metrics defined
	if metrics, ok := hostSel.ContainerMetrics[containerID]; ok && len(metrics) > 0 {
		d.logger.Debug("getMetricsForContainer: found custom metrics",
			"containerID", containerID,
			"metricsCount", len(metrics),
			"metrics", metrics,
		)
		return metrics
	}

	d.logger.Debug("getMetricsForContainer: no custom metrics, returning AllMetrics",
		"containerID", containerID,
		"containerMetricsKeys", hostSel.ContainerMetrics,
	)
	// Default: return all metrics
	return AllMetrics
}

// metricDisplayName maps internal metric names to display names
var metricDisplayNames = map[string]string{
	"cpuPercent":         "CPU %",
	"memoryBytes":        "Memory (MB)",
	"memoryPercent":      "Memory %",
	"networkRxBytes":     "Network RX (MB)",
	"networkTxBytes":     "Network TX (MB)",
	"diskReadBytes":      "Disk Read (MB)",
	"diskWriteBytes":     "Disk Write (MB)",
	"uptimeSeconds":      "Uptime (s)",
	"cpuPressureSome":    "CPU Pressure (some)",
	"cpuPressureFull":    "CPU Pressure (full)",
	"memoryPressureSome": "Memory Pressure (some)",
	"memoryPressureFull": "Memory Pressure (full)",
	"ioPressureSome":     "I/O Pressure (some)",
	"ioPressureFull":     "I/O Pressure (full)",
}

// metricUnits maps internal metric names to units
var metricUnits = map[string]string{
	"cpuPercent":         "percent",
	"memoryBytes":        "decmbytes",
	"memoryPercent":      "percent",
	"networkRxBytes":     "decmbytes",
	"networkTxBytes":     "decmbytes",
	"diskReadBytes":      "decmbytes",
	"diskWriteBytes":     "decmbytes",
	"uptimeSeconds":      "s",
	"cpuPressureSome":    "percent",
	"cpuPressureFull":    "percent",
	"memoryPressureSome": "percent",
	"memoryPressureFull": "percent",
	"ioPressureSome":     "percent",
	"ioPressureFull":     "percent",
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
		case "cpuPressureSome":
			if m.CPUPressure != nil {
				value = m.CPUPressure.Some10
			}
		case "cpuPressureFull":
			if m.CPUPressure != nil {
				value = m.CPUPressure.Full10
			}
		case "memoryPressureSome":
			if m.MemoryPressure != nil {
				value = m.MemoryPressure.Some10
			}
		case "memoryPressureFull":
			if m.MemoryPressure != nil {
				value = m.MemoryPressure.Full10
			}
		case "ioPressureSome":
			if m.IOPressure != nil {
				value = m.IOPressure.Some10
			}
		case "ioPressureFull":
			if m.IOPressure != nil {
				value = m.IOPressure.Full10
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
	HealthStatus  string `json:"healthStatus"`
	IsRunning     bool   `json:"isRunning"`
	IsPaused      bool   `json:"isPaused"`
	IsUnhealthy   bool   `json:"isUnhealthy"`
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
	hostIDs := make([]string, 0)
	hostNames := make([]string, 0)
	states := make([]string, 0)
	healthStatuses := make([]string, 0)
	isRunningList := make([]bool, 0)
	isPausedList := make([]bool, 0)
	isUnhealthyList := make([]bool, 0)

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
			hostIDs = append(hostIDs, host.ID)
			hostNames = append(hostNames, host.Name)
			states = append(states, c.State)
			healthStatuses = append(healthStatuses, c.HealthStatus)
			isRunningList = append(isRunningList, c.IsRunning)
			isPausedList = append(isPausedList, c.IsPaused)
			isUnhealthyList = append(isUnhealthyList, c.IsUnhealthy)
		}
	}

	// Build frame for variable query
	frame := data.NewFrame("containers",
		data.NewField("containerId", nil, containerIDs),
		data.NewField("containerName", nil, containerNames),
		data.NewField("hostId", nil, hostIDs),
		data.NewField("hostName", nil, hostNames),
		data.NewField("state", nil, states),
		data.NewField("healthStatus", nil, healthStatuses),
		data.NewField("isRunning", nil, isRunningList),
		data.NewField("isPaused", nil, isPausedList),
		data.NewField("isUnhealthy", nil, isUnhealthyList),
	)

	// Mark with custom metadata for identification
	frame.Meta = &data.FrameMeta{
		Custom: map[string]interface{}{
			"queryType": "containers",
		},
	}

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

// ValidControlActions lists all supported container control actions
var ValidControlActions = []string{"start", "stop", "restart", "pause", "unpause"}

// queryControl executes a container control action via the Docker agent
func (d *Datasource) queryControl(ctx context.Context, qm QueryModel) backend.DataResponse {
	var response backend.DataResponse

	// Validate that controls are enabled in datasource settings
	if !d.settings.EnableContainerControls {
		response.Error = fmt.Errorf("container controls are disabled in datasource settings")
		return response
	}

	// Validate action is provided
	if qm.ControlAction == "" {
		response.Error = fmt.Errorf("controlAction is required")
		return response
	}

	// Validate action is in the global valid list
	if !contains(ValidControlActions, qm.ControlAction) {
		response.Error = fmt.Errorf("invalid control action: %s", qm.ControlAction)
		return response
	}

	// Validate action is in the datasource's allowed list
	if len(d.settings.AllowedControlActions) > 0 && !contains(d.settings.AllowedControlActions, qm.ControlAction) {
		response.Error = fmt.Errorf("action '%s' is not allowed by datasource settings", qm.ControlAction)
		return response
	}

	// Validate target container and host are provided
	if qm.TargetContainer == "" {
		response.Error = fmt.Errorf("targetContainer is required")
		return response
	}
	if qm.TargetHost == "" {
		response.Error = fmt.Errorf("targetHost is required")
		return response
	}

	// Find the host by ID
	var targetHost *HostConfig
	for _, h := range d.settings.Hosts {
		if h.ID == qm.TargetHost && h.Enabled {
			targetHost = &h
			break
		}
	}

	if targetHost == nil {
		response.Error = fmt.Errorf("host '%s' not found or not enabled", qm.TargetHost)
		return response
	}

	// Execute the control action
	result, err := d.executeControlAction(ctx, *targetHost, qm.TargetContainer, qm.ControlAction)
	if err != nil {
		d.logger.Error("Control action failed",
			"action", qm.ControlAction,
			"container", qm.TargetContainer,
			"host", targetHost.Name,
			"error", err,
		)
		response.Error = err
		return response
	}

	d.logger.Info("Control action executed",
		"action", qm.ControlAction,
		"container", qm.TargetContainer,
		"host", targetHost.Name,
		"success", result.Success,
	)

	// Return result as DataFrame
	frame := data.NewFrame("control_result",
		data.NewField("success", nil, []bool{result.Success}),
		data.NewField("action", nil, []string{result.Action}),
		data.NewField("containerId", nil, []string{result.ContainerID}),
		data.NewField("error", nil, []string{result.Error}),
	)

	frame.Meta = &data.FrameMeta{
		Custom: map[string]interface{}{
			"queryType": "control",
		},
	}

	response.Frames = append(response.Frames, frame)
	return response
}

// ControlActionResult represents the response from a control action
type ControlActionResult struct {
	Success     bool   `json:"success"`
	Action      string `json:"action"`
	ContainerID string `json:"containerId"`
	Error       string `json:"error"`
}

// executeControlAction sends a control action request to the Docker agent
func (d *Datasource) executeControlAction(ctx context.Context, host HostConfig, containerID, action string) (*ControlActionResult, error) {
	targetURL := fmt.Sprintf("%s/api/containers/%s/%s",
		strings.TrimSuffix(host.URL, "/"),
		url.PathEscape(containerID),
		action,
	)

	d.logger.Debug("Executing control action", "url", targetURL, "action", action)

	req, err := http.NewRequestWithContext(ctx, "POST", targetURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	var result ControlActionResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to decode response (status %d): %s", resp.StatusCode, string(body))
	}

	if !result.Success {
		return &result, fmt.Errorf("action failed: %s", result.Error)
	}

	return &result, nil
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
