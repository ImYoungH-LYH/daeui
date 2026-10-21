// Package dae drives a dae installation: config validation, service control, status and logs.
package dae

import (
	"context"
	"errors"
	"time"
)

type Status struct {
	Installed    bool       `json:"installed"`
	Version      string     `json:"version"`
	Running      bool       `json:"running"`
	Pid          int        `json:"pid,omitempty"`
	StartedAt    *time.Time `json:"startedAt,omitempty"`
	MemRSS       int64      `json:"memRss,omitempty"`
	Enabled      bool       `json:"enabled"`
	Kernel       string     `json:"kernel"`
	BTF          string     `json:"btf"` // "builtin", "detached", or "" when missing
	ConfigPath   string     `json:"configPath"`
	ConfigExists bool       `json:"configExists"`
	GeoIP        GeoFile    `json:"geoip"`
	GeoSite      GeoFile    `json:"geosite"`
}

type GeoFile struct {
	Size    int64      `json:"size"`
	ModTime *time.Time `json:"modTime,omitempty"`
}

// Action names accepted by Manager.Action.
const (
	ActStart   = "start"
	ActStop    = "stop"
	ActRestart = "restart"
	ActReload  = "reload"
	ActSuspend = "suspend"
	ActEnable  = "enable"
	ActDisable = "disable"
)

var Actions = []string{ActStart, ActStop, ActRestart, ActReload, ActSuspend, ActEnable, ActDisable}

// ErrInvalid wraps validation failures; the message is dae's own output.
var ErrInvalid = errors.New("invalid config")

type ValidationError struct{ Output string }

func (e *ValidationError) Error() string { return "invalid config: " + e.Output }
func (e *ValidationError) Unwrap() error { return ErrInvalid }

type Manager interface {
	Status(ctx context.Context) Status
	ReadConfig() (text string, exists bool, err error)
	// Validate runs `dae validate` on the given text without touching the live config.
	Validate(ctx context.Context, text string) error
	// SaveConfig validates and atomically replaces the live config (0600), keeping a .bak copy.
	SaveConfig(ctx context.Context, text string) error
	Action(ctx context.Context, name string) (output string, err error)
	// LogFile is the path dae writes its log to.
	LogFile() string
	// GeoDir is where geoip.dat / geosite.dat live.
	GeoDir() string
}

func ValidAction(name string) bool {
	for _, a := range Actions {
		if a == name {
			return true
		}
	}
	return false
}
