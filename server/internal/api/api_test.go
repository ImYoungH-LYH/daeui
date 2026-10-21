package api

import (
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/ImYoungH-LYH/daeui/server/internal/auth"
	"github.com/ImYoungH-LYH/daeui/server/internal/dae"
)

type client struct {
	t    *testing.T
	base string
	c    *http.Client
}

func newEnv(t *testing.T) (*client, *dae.Mock) {
	t.Helper()
	dir := t.TempDir()
	store, err := auth.New(filepath.Join(dir, "auth.json"))
	if err != nil {
		t.Fatal(err)
	}
	mock := dae.NewMock(filepath.Join(dir, "dae"))
	web := fstest.MapFS{"index.html": {Data: []byte("<html>app</html>")}, "assets/a.js": {Data: []byte("js")}}
	ts := httptest.NewServer((&Server{Auth: store, Dae: mock, Web: web}).Handler())
	t.Cleanup(ts.Close)
	jar, _ := cookiejar.New(nil)
	return &client{t: t, base: ts.URL, c: &http.Client{Jar: jar}}, mock
}

func (c *client) do(method, path, body string, hdr ...string) (int, map[string]any) {
	c.t.Helper()
	req, _ := http.NewRequest(method, c.base+path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	for i := 0; i+1 < len(hdr); i += 2 {
		req.Header.Set(hdr[i], hdr[i+1])
	}
	resp, err := c.c.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer resp.Body.Close()
	var m map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&m)
	return resp.StatusCode, m
}

func TestAuthFlow(t *testing.T) {
	c, _ := newEnv(t)

	_, st := c.do("GET", "/api/auth/state", "")
	if st["setup"] != false || st["authed"] != false {
		t.Fatalf("fresh state = %v", st)
	}
	if code, _ := c.do("GET", "/api/status", ""); code != http.StatusUnauthorized {
		t.Fatalf("status without login = %d", code)
	}
	if code, _ := c.do("POST", "/api/auth/setup", `{"password":"123"}`); code != http.StatusBadRequest {
		t.Fatalf("weak password accepted: %d", code)
	}
	if code, _ := c.do("POST", "/api/auth/setup", `{"password":"secret123"}`); code != http.StatusOK {
		t.Fatalf("setup = %d", code)
	}
	// Setup logs the browser in.
	if code, _ := c.do("GET", "/api/status", ""); code != http.StatusOK {
		t.Fatalf("status after setup = %d", code)
	}
	if code, _ := c.do("POST", "/api/auth/setup", `{"password":"another1"}`); code != http.StatusConflict {
		t.Fatalf("second setup = %d", code)
	}

	c.do("POST", "/api/auth/logout", "")
	if code, _ := c.do("GET", "/api/status", ""); code != http.StatusUnauthorized {
		t.Fatalf("status after logout = %d", code)
	}
	if code, _ := c.do("POST", "/api/auth/login", `{"password":"secret123"}`); code != http.StatusOK {
		t.Fatalf("login = %d", code)
	}

	if code, _ := c.do("POST", "/api/auth/password", `{"old":"nope","password":"newsecret"}`); code != http.StatusBadRequest {
		t.Fatalf("change with wrong old = %d", code)
	}
	if code, _ := c.do("POST", "/api/auth/password", `{"old":"secret123","password":"newsecret"}`); code != http.StatusOK {
		t.Fatalf("change = %d", code)
	}
	if code, _ := c.do("GET", "/api/status", ""); code != http.StatusOK {
		t.Fatalf("still logged in after change = %d", code)
	}
}

func TestLoginLockout(t *testing.T) {
	c, _ := newEnv(t)
	c.do("POST", "/api/auth/setup", `{"password":"secret123"}`)
	c.do("POST", "/api/auth/logout", "")
	for i := 0; i < 5; i++ {
		if code, _ := c.do("POST", "/api/auth/login", `{"password":"wrong"}`); code != http.StatusUnauthorized {
			t.Fatalf("attempt %d = %d", i, code)
		}
	}
	// Even the right password is refused while locked.
	if code, _ := c.do("POST", "/api/auth/login", `{"password":"secret123"}`); code != http.StatusTooManyRequests {
		t.Fatalf("locked login = %d", code)
	}
}

func TestCrossSiteRejected(t *testing.T) {
	c, _ := newEnv(t)
	if code, _ := c.do("POST", "/api/auth/setup", `{"password":"secret123"}`, "Origin", "http://evil.example"); code != http.StatusForbidden {
		t.Fatalf("cross-origin setup = %d", code)
	}
	req, _ := http.NewRequest("POST", c.base+"/api/auth/setup", strings.NewReader("password=secret123"))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := c.c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnsupportedMediaType {
		t.Fatalf("form post = %d", resp.StatusCode)
	}
}

func TestConfigAndService(t *testing.T) {
	c, mock := newEnv(t)
	c.do("POST", "/api/auth/setup", `{"password":"secret123"}`)

	if _, m := c.do("GET", "/api/config", ""); m["exists"] != false {
		t.Fatalf("config before save = %v", m)
	}
	code, m := c.do("PUT", "/api/config", `{"text":"global { INVALID }"}`)
	if code != http.StatusUnprocessableEntity || !strings.Contains(m["output"].(string), "INVALID") {
		t.Fatalf("invalid save = %d %v", code, m)
	}
	if _, err := os.Stat(filepath.Join(mock.Dir, "config.dae")); !os.IsNotExist(err) {
		t.Fatal("invalid config was written")
	}
	code, m = c.do("PUT", "/api/config", `{"text":"global {}\nrouting {}\n","apply":true}`)
	if code != http.StatusOK || m["applied"] != true {
		t.Fatalf("save+apply = %d %v", code, m)
	}
	if _, m = c.do("GET", "/api/config", ""); m["text"] != "global {}\nrouting {}\n" {
		t.Fatalf("read back = %v", m)
	}
	_, m = c.do("GET", "/api/status", "")
	if m["running"] != true {
		t.Fatalf("apply should start dae: %v", m)
	}
	if code, _ := c.do("POST", "/api/service/stop", ""); code != http.StatusOK {
		t.Fatalf("stop = %d", code)
	}
	if code, _ := c.do("POST", "/api/service/rm-rf", ""); code != http.StatusNotFound {
		t.Fatalf("unknown action = %d", code)
	}
	_, m = c.do("GET", "/api/logs?lines=10", "")
	if lines, _ := m["lines"].([]any); len(lines) == 0 {
		t.Fatalf("expected log lines: %v", m)
	}
}

func TestStaticFallback(t *testing.T) {
	c, _ := newEnv(t)
	for _, p := range []string{"/", "/some/route", "/assets/a.js"} {
		resp, err := c.c.Get(c.base + p)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("%s = %d", p, resp.StatusCode)
		}
	}
	if code, _ := c.do("GET", "/api/nope", ""); code != http.StatusNotFound {
		t.Fatalf("unknown api = %d", code)
	}
}
