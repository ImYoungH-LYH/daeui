package dae

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// OpenWrt manages dae through its procd init script and CLI.
type OpenWrt struct {
	Bin        string // /usr/bin/dae
	ConfigPath string // /etc/dae/config.dae
	InitScript string // /etc/init.d/dae
	PidFile    string // /var/run/dae.pid
	Log        string // /var/log/dae/dae.log
	Geo        string // /usr/share/dae

	mu      sync.Mutex // serialises config writes and service actions
	version string
}

func NewOpenWrt() *OpenWrt {
	return &OpenWrt{
		Bin:        "/usr/bin/dae",
		ConfigPath: "/etc/dae/config.dae",
		InitScript: "/etc/init.d/dae",
		PidFile:    "/var/run/dae.pid",
		Log:        "/var/log/dae/dae.log",
		Geo:        "/usr/share/dae",
	}
}

func (o *OpenWrt) LogFile() string { return o.Log }
func (o *OpenWrt) GeoDir() string  { return o.Geo }

func run(ctx context.Context, timeout time.Duration, name string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	err := cmd.Run()
	return strings.TrimSpace(buf.String()), err
}

func (o *OpenWrt) Status(ctx context.Context) Status {
	st := Status{ConfigPath: o.ConfigPath, Kernel: kernelRelease()}
	if _, err := os.Stat(o.Bin); err == nil {
		st.Installed = true
		if o.version == "" {
			if out, err := run(ctx, 5*time.Second, o.Bin, "--version"); err == nil {
				o.version = firstLine(out)
			}
		}
		st.Version = o.version
	}
	if _, err := os.Stat(o.ConfigPath); err == nil {
		st.ConfigExists = true
	}
	if pid := o.pid(); pid > 0 {
		st.Running = true
		st.Pid = pid
		if t := procStart(pid); !t.IsZero() {
			st.StartedAt = &t
		}
		st.MemRSS = procRSS(pid)
	}
	if _, err := run(ctx, 5*time.Second, o.InitScript, "enabled"); err == nil {
		st.Enabled = true
	}
	st.BTF = btfSource(st.Kernel)
	st.GeoIP = geoFile(filepath.Join(o.Geo, "geoip.dat"))
	st.GeoSite = geoFile(filepath.Join(o.Geo, "geosite.dat"))
	return st
}

// pid returns dae's pid when the process in the pid file is alive and really dae.
func (o *OpenWrt) pid() int {
	b, err := os.ReadFile(o.PidFile)
	if err != nil {
		return 0
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(b)))
	if err != nil || pid <= 0 {
		return 0
	}
	comm, err := os.ReadFile(fmt.Sprintf("/proc/%d/comm", pid))
	if err != nil || !strings.HasPrefix(strings.TrimSpace(string(comm)), "dae") {
		return 0
	}
	return pid
}

func (o *OpenWrt) ReadConfig() (string, bool, error) {
	b, err := os.ReadFile(o.ConfigPath)
	if errors.Is(err, os.ErrNotExist) {
		return "", false, nil
	}
	return string(b), err == nil, err
}

// writeTemp writes text next to the live config: dae resolves includes relative to the
// config's directory and refuses files readable by group/others.
func (o *OpenWrt) writeTemp(text string) (string, error) {
	dir := filepath.Dir(o.ConfigPath)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return "", err
	}
	f, err := os.CreateTemp(dir, ".daeui-*.dae")
	if err != nil {
		return "", err
	}
	name := f.Name()
	if err := f.Chmod(0o600); err == nil {
		_, err = f.WriteString(text)
		if cerr := f.Close(); err == nil {
			err = cerr
		}
	} else {
		f.Close()
	}
	if err != nil {
		os.Remove(name)
		return "", err
	}
	return name, nil
}

func (o *OpenWrt) validateFile(ctx context.Context, path string) error {
	out, err := run(ctx, 30*time.Second, o.Bin, "validate", "-c", path)
	if err != nil {
		var ee *exec.ExitError
		if errors.As(err, &ee) {
			return &ValidationError{Output: strings.ReplaceAll(out, path, filepath.Base(o.ConfigPath))}
		}
		return err
	}
	return nil
}

func (o *OpenWrt) Validate(ctx context.Context, text string) error {
	tmp, err := o.writeTemp(text)
	if err != nil {
		return err
	}
	defer os.Remove(tmp)
	return o.validateFile(ctx, tmp)
}

func (o *OpenWrt) SaveConfig(ctx context.Context, text string) error {
	o.mu.Lock()
	defer o.mu.Unlock()
	tmp, err := o.writeTemp(text)
	if err != nil {
		return err
	}
	if err := o.validateFile(ctx, tmp); err != nil {
		os.Remove(tmp)
		return err
	}
	if old, err := os.ReadFile(o.ConfigPath); err == nil {
		_ = os.WriteFile(o.ConfigPath+".bak", old, 0o600)
	}
	if err := os.Rename(tmp, o.ConfigPath); err != nil {
		os.Remove(tmp)
		return err
	}
	return nil
}

func (o *OpenWrt) Action(ctx context.Context, name string) (string, error) {
	if !ValidAction(name) {
		return "", fmt.Errorf("unknown action %q", name)
	}
	o.mu.Lock()
	defer o.mu.Unlock()
	switch name {
	case ActSuspend:
		pid := o.pid()
		if pid == 0 {
			return "", errors.New("dae is not running")
		}
		return run(ctx, 60*time.Second, o.Bin, "suspend", strconv.Itoa(pid))
	case ActReload:
		pid := o.pid()
		if pid == 0 {
			// Nothing to hot-reload; bring the service up instead.
			return run(ctx, 60*time.Second, o.InitScript, ActStart)
		}
		// `dae reload` swaps the datapath without dropping established connections.
		return run(ctx, 120*time.Second, o.Bin, "reload", strconv.Itoa(pid))
	default:
		return run(ctx, 60*time.Second, o.InitScript, name)
	}
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}

func kernelRelease() string {
	b, err := os.ReadFile("/proc/sys/kernel/osrelease")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

// btfSource mirrors cilium/ebpf's lookup: built-in BTF first, then a detached vmlinux file.
func btfSource(release string) string {
	if _, err := os.Stat("/sys/kernel/btf/vmlinux"); err == nil {
		return "builtin"
	}
	for _, p := range []string{
		"/boot/vmlinux-" + release,
		"/lib/modules/" + release + "/vmlinux-" + release,
		"/lib/modules/" + release + "/build/vmlinux",
		"/usr/lib/modules/" + release + "/kernel/vmlinux",
		"/usr/lib/debug/boot/vmlinux-" + release,
		"/usr/lib/debug/boot/vmlinux-" + release + ".debug",
		"/usr/lib/debug/lib/modules/" + release + "/vmlinux",
	} {
		if _, err := os.Stat(p); err == nil {
			return "detached"
		}
	}
	return ""
}

func geoFile(path string) GeoFile {
	fi, err := os.Stat(path)
	if err != nil {
		return GeoFile{}
	}
	t := fi.ModTime()
	return GeoFile{Size: fi.Size(), ModTime: &t}
}

func procRSS(pid int) int64 {
	f, err := os.Open(fmt.Sprintf("/proc/%d/status", pid))
	if err != nil {
		return 0
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Text()
		if strings.HasPrefix(line, "VmRSS:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				kb, _ := strconv.ParseInt(fields[1], 10, 64)
				return kb * 1024
			}
		}
	}
	return 0
}

// procStart derives the process start time from /proc/<pid>/stat and the boot time.
func procStart(pid int) time.Time {
	b, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
	if err != nil {
		return time.Time{}
	}
	s := string(b)
	// Fields after the parenthesised comm; starttime is field 22 overall.
	i := strings.LastIndexByte(s, ')')
	if i < 0 {
		return time.Time{}
	}
	fields := strings.Fields(s[i+1:])
	if len(fields) < 20 {
		return time.Time{}
	}
	ticks, err := strconv.ParseInt(fields[19], 10, 64)
	if err != nil {
		return time.Time{}
	}
	stat, err := os.ReadFile("/proc/stat")
	if err != nil {
		return time.Time{}
	}
	for _, line := range strings.Split(string(stat), "\n") {
		if strings.HasPrefix(line, "btime ") {
			bt, _ := strconv.ParseInt(strings.TrimSpace(line[6:]), 10, 64)
			const clkTck = 100 // USER_HZ on Linux.
			return time.Unix(bt+ticks/clkTck, 0)
		}
	}
	return time.Time{}
}
