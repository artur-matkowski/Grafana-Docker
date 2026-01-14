//go:build mage

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/magefile/mage/mg"
	"github.com/magefile/mage/sh"
)

// Default target
var Default = Build

// Build builds the backend plugin for the current platform
func Build() error {
	return BuildAll()
}

// BuildAll builds the backend plugin for all supported platforms
func BuildAll() error {
	platforms := []struct {
		OS   string
		Arch string
	}{
		{"linux", "amd64"},
		{"linux", "arm64"},
		{"darwin", "amd64"},
		{"darwin", "arm64"},
		{"windows", "amd64"},
	}

	for _, p := range platforms {
		if err := buildFor(p.OS, p.Arch); err != nil {
			return err
		}
	}
	return nil
}

// BuildLinux builds for linux/amd64 only
func BuildLinux() error {
	return buildFor("linux", "amd64")
}

// BuildCurrent builds for the current platform only
func BuildCurrent() error {
	return buildFor(runtime.GOOS, runtime.GOARCH)
}

func buildFor(goos, goarch string) error {
	mg.Deps(getDeps)

	ext := ""
	if goos == "windows" {
		ext = ".exe"
	}

	output := filepath.Join("dist", fmt.Sprintf("gpx_bitforge_dockermetrics_panel_%s_%s%s", goos, goarch, ext))

	env := map[string]string{
		"GOOS":        goos,
		"GOARCH":      goarch,
		"CGO_ENABLED": "0",
	}

	fmt.Printf("Building for %s/%s -> %s\n", goos, goarch, output)

	return sh.RunWithV(env, "go", "build",
		"-ldflags", "-w -s",
		"-o", output,
		"./pkg")
}

func getDeps() error {
	return sh.Run("go", "mod", "download")
}

// Clean removes build artifacts
func Clean() error {
	patterns := []string{
		"dist/gpx_*",
	}
	for _, p := range patterns {
		matches, _ := filepath.Glob(p)
		for _, m := range matches {
			os.Remove(m)
		}
	}
	return nil
}

// Test runs the tests
func Test() error {
	return sh.RunV("go", "test", "-v", "./...")
}
