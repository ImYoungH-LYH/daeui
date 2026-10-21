package api

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/ImYoungH-LYH/daeui/server/internal/dae"
)

// DefaultGeoSources are the files dae looks for, from the v2fly projects.
var DefaultGeoSources = map[string]string{
	"geoip.dat":   "https://github.com/v2fly/geoip/releases/latest/download/geoip.dat",
	"geosite.dat": "https://github.com/v2fly/domain-list-community/releases/latest/download/dlc.dat",
}

const minGeoSize = 64 << 10

type geoReq struct {
	// Mirror is an optional URL prefix such as "https://ghfast.top/" for networks that cannot reach GitHub.
	Mirror string `json:"mirror"`
	Reload bool   `json:"reload"`
}

func download(ctx context.Context, url, dst string) (int64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	tmp := dst + ".download"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return 0, err
	}
	n, err := io.Copy(f, io.LimitReader(resp.Body, 256<<20))
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err == nil && n < minGeoSize {
		err = fmt.Errorf("file too small (%d bytes)", n)
	}
	if err != nil {
		os.Remove(tmp)
		return 0, err
	}
	return n, os.Rename(tmp, dst)
}

func (s *Server) geoUpdate(w http.ResponseWriter, r *http.Request) {
	var req geoReq
	if r.ContentLength != 0 {
		if err := readJSON(r, &req); err != nil {
			writeErr(w, http.StatusBadRequest, "bad request")
			return
		}
	}
	mirror := strings.TrimSpace(req.Mirror)
	if mirror != "" && !strings.HasPrefix(mirror, "https://") && !strings.HasPrefix(mirror, "http://") {
		writeErr(w, http.StatusBadRequest, "镜像地址需以 http:// 或 https:// 开头")
		return
	}
	sources := s.GeoSources
	if sources == nil {
		sources = DefaultGeoSources
	}
	dir := s.Dae.GeoDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
	defer cancel()

	names := make([]string, 0, len(sources))
	for n := range sources {
		names = append(names, n)
	}
	sort.Strings(names)
	results := map[string]any{}
	failed := false
	for _, name := range names {
		n, err := download(ctx, mirror+sources[name], filepath.Join(dir, name))
		if err != nil {
			failed = true
			results[name] = map[string]any{"ok": false, "error": err.Error()}
			continue
		}
		results[name] = map[string]any{"ok": true, "size": n}
	}
	resp := map[string]any{"ok": !failed, "files": results}
	if !failed && req.Reload && s.Dae.Status(ctx).Running {
		if out, err := s.Dae.Action(ctx, dae.ActReload); err != nil {
			resp["ok"] = false
			resp["error"] = "已更新，但重载 dae 失败：" + err.Error()
			resp["output"] = out
		}
	}
	code := http.StatusOK
	if resp["ok"] == false {
		code = http.StatusBadGateway
	}
	writeJSON(w, code, resp)
}
