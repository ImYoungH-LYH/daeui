package dae

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Mock imitates a dae installation under a local directory, for developing the UI off-router.
// Validation only rejects text containing "INVALID" so error paths can be exercised.
type Mock struct {
	Dir string

	mu        sync.Mutex
	running   bool
	suspended bool
	enabled   bool
	started   time.Time
}

func NewMock(dir string) *Mock {
	_ = os.MkdirAll(filepath.Join(dir, "geo"), 0o755)
	return &Mock{Dir: dir, enabled: true}
}

func (m *Mock) cfg() string     { return filepath.Join(m.Dir, "config.dae") }
func (m *Mock) LogFile() string { return filepath.Join(m.Dir, "dae.log") }
func (m *Mock) GeoDir() string  { return filepath.Join(m.Dir, "geo") }
func (m *Mock) logf(f string, a ...any) {
	line := fmt.Sprintf("time=%q level=info msg=%q\n", time.Now().Format(time.RFC3339), fmt.Sprintf(f, a...))
	fh, err := os.OpenFile(m.LogFile(), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err == nil {
		fh.WriteString(line)
		fh.Close()
	}
}

func (m *Mock) Status(context.Context) Status {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, err := os.Stat(m.cfg())
	st := Status{
		Installed: true, Version: "dae version v2.1.1 (mock)", Running: m.running, Enabled: m.enabled,
		Kernel: "6.12.94", BTF: "detached", ConfigPath: m.cfg(), ConfigExists: err == nil,
		GeoIP: geoFile(filepath.Join(m.GeoDir(), "geoip.dat")), GeoSite: geoFile(filepath.Join(m.GeoDir(), "geosite.dat")),
	}
	if m.running {
		started := m.started
		st.Pid, st.StartedAt, st.MemRSS = 4242, &started, 58<<20
	}
	return st
}

func (m *Mock) ReadConfig() (string, bool, error) {
	b, err := os.ReadFile(m.cfg())
	if errors.Is(err, os.ErrNotExist) {
		return "", false, nil
	}
	return string(b), err == nil, err
}

func (m *Mock) Validate(_ context.Context, text string) error {
	if strings.Contains(text, "INVALID") {
		return &ValidationError{Output: "level=fatal msg=\"failed to parse config: mock rejects INVALID\""}
	}
	return nil
}

func (m *Mock) SaveConfig(ctx context.Context, text string) error {
	if err := m.Validate(ctx, text); err != nil {
		return err
	}
	m.logf("config saved (%d bytes)", len(text))
	return os.WriteFile(m.cfg(), []byte(text), 0o600)
}

func (m *Mock) Action(_ context.Context, name string) (string, error) {
	if !ValidAction(name) {
		return "", fmt.Errorf("unknown action %q", name)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	switch name {
	case ActStart:
		m.running, m.suspended, m.started = true, false, time.Now()
		m.logf("Started")
	case ActStop:
		m.running = false
		m.logf("Exiting")
	case ActRestart:
		m.running, m.suspended, m.started = true, false, time.Now()
		m.logf("Restarted")
	case ActReload:
		if !m.running {
			m.running, m.started = true, time.Now()
			m.logf("Started")
		} else {
			m.suspended = false
			m.logf("[Reload] Finished")
		}
	case ActSuspend:
		if !m.running {
			return "", errors.New("dae is not running")
		}
		m.suspended = true
		m.logf("Suspended")
	case ActEnable:
		m.enabled = true
	case ActDisable:
		m.enabled = false
	}
	return "", nil
}
