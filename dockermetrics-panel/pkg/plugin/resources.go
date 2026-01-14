package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/resource/httpadapter"
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

// CallResource handles resource calls from the frontend
// Routes:
//   - GET/POST /proxy/* - Proxy requests to Docker agents
func (p *Plugin) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	// Use httpadapter for easier request handling
	return httpadapter.New(p.handleResource).CallResource(ctx, req, sender)
}

func (p *Plugin) handleResource(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/")

	switch {
	case strings.HasPrefix(path, "proxy/"):
		p.handleProxy(w, r, strings.TrimPrefix(path, "proxy/"))
	default:
		http.Error(w, "Not found", http.StatusNotFound)
	}
}

// handleProxy proxies requests to Docker agents
// Path format: /proxy/{base64-encoded-url}/{remaining-path}
// Or with query param: /proxy?url={full-url}
func (p *Plugin) handleProxy(w http.ResponseWriter, r *http.Request, path string) {
	// Get target URL from query parameter
	targetURL := r.URL.Query().Get("url")
	if targetURL == "" {
		http.Error(w, "Missing 'url' query parameter", http.StatusBadRequest)
		return
	}

	// Validate URL
	parsedURL, err := url.Parse(targetURL)
	if err != nil {
		http.Error(w, fmt.Sprintf("Invalid URL: %v", err), http.StatusBadRequest)
		return
	}

	// Only allow http/https
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		http.Error(w, "Only http and https URLs are allowed", http.StatusBadRequest)
		return
	}

	// Create proxy request
	proxyReq, err := http.NewRequestWithContext(r.Context(), r.Method, targetURL, r.Body)
	if err != nil {
		p.logger.Error("Failed to create proxy request", "error", err)
		http.Error(w, "Failed to create proxy request", http.StatusInternalServerError)
		return
	}

	// Copy relevant headers
	for key, values := range r.Header {
		// Skip hop-by-hop headers
		if isHopByHop(key) {
			continue
		}
		for _, value := range values {
			proxyReq.Header.Add(key, value)
		}
	}

	// Set content type for POST requests
	if r.Method == "POST" && proxyReq.Header.Get("Content-Type") == "" {
		proxyReq.Header.Set("Content-Type", "application/json")
	}

	// Execute request
	resp, err := httpClient.Do(proxyReq)
	if err != nil {
		p.logger.Error("Proxy request failed", "url", targetURL, "error", err)

		// Return error as JSON
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Failed to connect to agent",
			"details": err.Error(),
		})
		return
	}
	defer resp.Body.Close()

	// Copy response headers
	for key, values := range resp.Header {
		if isHopByHop(key) {
			continue
		}
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}

	// Set status code
	w.WriteHeader(resp.StatusCode)

	// Copy response body
	io.Copy(w, resp.Body)
}

// isHopByHop checks if a header is a hop-by-hop header
func isHopByHop(header string) bool {
	hopByHop := map[string]bool{
		"Connection":          true,
		"Keep-Alive":          true,
		"Proxy-Authenticate":  true,
		"Proxy-Authorization": true,
		"Te":                  true,
		"Trailers":            true,
		"Transfer-Encoding":   true,
		"Upgrade":             true,
	}
	return hopByHop[http.CanonicalHeaderKey(header)]
}
