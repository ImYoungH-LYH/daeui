// Package api exposes the HTTP API used by the DaeUI frontend and serves the embedded web app.
package api

import (
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"log"
	"math"
	"net"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/ImYoungH-LYH/daeui/server/internal/auth"
	"github.com/ImYoungH-LYH/daeui/server/internal/dae"
)

const cookieName = "daeui_session"

type Server struct {
	Auth    *auth.Store
	Dae     dae.Manager
	Web     fs.FS // built frontend (index.html at the root)
	Version string
	// GeoSources maps file name to download URL.
	GeoSources map[string]string
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/auth/state", s.authState)
	mux.HandleFunc("POST /api/auth/setup", s.setup)
	mux.HandleFunc("POST /api/auth/login", s.login)
	mux.HandleFunc("POST /api/auth/logout", s.logout)
	mux.Handle("POST /api/auth/password", s.private(s.changePassword))
	mux.Handle("GET /api/status", s.private(s.status))
	mux.Handle("GET /api/config", s.private(s.getConfig))
	mux.Handle("POST /api/config/validate", s.private(s.validate))
	mux.Handle("PUT /api/config", s.private(s.saveConfig))
	mux.Handle("POST /api/service/{action}", s.private(s.action))
	mux.Handle("GET /api/logs", s.private(s.logs))
	mux.Handle("GET /api/logs/stream", s.private(s.logStream))
	mux.Handle("POST /api/geo/update", s.private(s.geoUpdate))
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { writeErr(w, http.StatusNotFound, "not found") })
	mux.HandleFunc("/", s.static)
	return secure(mux)
}

// secure adds headers and rejects cross-site state-changing requests.
func secure(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'")
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			if o := r.Header.Get("Origin"); o != "" {
				u, err := url.Parse(o)
				if err != nil || u.Host != r.Host {
					writeErr(w, http.StatusForbidden, "cross-site request rejected")
					return
				}
			}
			if r.ContentLength != 0 && !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
				writeErr(w, http.StatusUnsupportedMediaType, "expected application/json")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) private(fn http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(cookieName)
		if err != nil || !s.Auth.Valid(c.Value) {
			writeErr(w, http.StatusUnauthorized, "login required")
			return
		}
		fn(w, r)
	})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func readJSON(r *http.Request, v any) error {
	return json.NewDecoder(io.LimitReader(r.Body, 4<<20)).Decode(v)
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func (s *Server) setCookie(w http.ResponseWriter, r *http.Request, tok string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: tok, Path: "/", MaxAge: maxAge,
		HttpOnly: true, Secure: r.TLS != nil, SameSite: http.SameSiteStrictMode,
	})
}

// ---- auth ----

func (s *Server) authState(w http.ResponseWriter, r *http.Request) {
	authed := false
	if c, err := r.Cookie(cookieName); err == nil {
		authed = s.Auth.Valid(c.Value)
	}
	writeJSON(w, http.StatusOK, map[string]any{"setup": s.Auth.HasPassword(), "authed": authed, "version": s.Version})
}

type pwReq struct {
	Password string `json:"password"`
	Old      string `json:"old"`
}

func (s *Server) setup(w http.ResponseWriter, r *http.Request) {
	var req pwReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request")
		return
	}
	switch err := s.Auth.Setup(req.Password); {
	case errors.Is(err, auth.ErrHasPassword):
		writeErr(w, http.StatusConflict, "密码已设置，请登录")
	case errors.Is(err, auth.ErrWeakPassword):
		writeErr(w, http.StatusBadRequest, "密码至少 6 位")
	case err != nil:
		log.Printf("setup: %v", err)
		writeErr(w, http.StatusInternalServerError, "保存密码失败")
	default:
		s.setCookie(w, r, s.Auth.NewSession(), int(auth.SessionTTL.Seconds()))
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if d := s.Auth.Locked(ip); d > 0 {
		writeErr(w, http.StatusTooManyRequests, "尝试次数过多，请 "+strconv.Itoa(int(math.Ceil(d.Seconds())))+" 秒后再试")
		return
	}
	var req pwReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request")
		return
	}
	tok, err := s.Auth.Login(ip, req.Password)
	if err != nil {
		if errors.Is(err, auth.ErrNoPassword) {
			writeErr(w, http.StatusConflict, "尚未设置密码")
			return
		}
		// Slow down guessing a little even before the lockout kicks in.
		time.Sleep(500 * time.Millisecond)
		writeErr(w, http.StatusUnauthorized, "密码错误")
		return
	}
	s.setCookie(w, r, tok, int(auth.SessionTTL.Seconds()))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(cookieName); err == nil {
		s.Auth.Logout(c.Value)
	}
	s.setCookie(w, r, "", -1)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	var req pwReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request")
		return
	}
	switch err := s.Auth.Change(req.Old, req.Password); {
	case errors.Is(err, auth.ErrBadPassword):
		writeErr(w, http.StatusBadRequest, "原密码错误")
	case errors.Is(err, auth.ErrWeakPassword):
		writeErr(w, http.StatusBadRequest, "新密码至少 6 位")
	case err != nil:
		log.Printf("change password: %v", err)
		writeErr(w, http.StatusInternalServerError, "保存密码失败")
	default:
		// All sessions were revoked; log this browser back in.
		s.setCookie(w, r, s.Auth.NewSession(), int(auth.SessionTTL.Seconds()))
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}

// ---- dae ----

func (s *Server) status(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.Dae.Status(r.Context()))
}

func (s *Server) getConfig(w http.ResponseWriter, r *http.Request) {
	text, exists, err := s.Dae.ReadConfig()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"text": text, "exists": exists})
}

type cfgReq struct {
	Text string `json:"text"`
	// Apply hot-reloads dae (or starts it) after saving.
	Apply bool `json:"apply"`
}

func validationResponse(w http.ResponseWriter, err error) bool {
	var ve *dae.ValidationError
	if errors.As(err, &ve) {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "配置校验未通过", "output": ve.Output})
		return true
	}
	return false
}

func (s *Server) validate(w http.ResponseWriter, r *http.Request) {
	var req cfgReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request")
		return
	}
	if err := s.Dae.Validate(r.Context(), req.Text); err != nil {
		if !validationResponse(w, err) {
			writeErr(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) saveConfig(w http.ResponseWriter, r *http.Request) {
	var req cfgReq
	if err := readJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request")
		return
	}
	if err := s.Dae.SaveConfig(r.Context(), req.Text); err != nil {
		if !validationResponse(w, err) {
			writeErr(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	resp := map[string]any{"ok": true, "applied": false}
	if req.Apply {
		out, err := s.Dae.Action(r.Context(), dae.ActReload)
		resp["output"] = out
		if err != nil {
			resp["ok"] = false
			resp["error"] = "配置已保存，但重载失败：" + err.Error()
			writeJSON(w, http.StatusBadGateway, resp)
			return
		}
		resp["applied"] = true
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) action(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("action")
	if !dae.ValidAction(name) {
		writeErr(w, http.StatusNotFound, "unknown action")
		return
	}
	out, err := s.Dae.Action(r.Context(), name)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error(), "output": out})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "output": out, "status": s.Dae.Status(r.Context())})
}

// ---- static ----

func (s *Server) static(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	p := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	if p == "" {
		p = "index.html"
	}
	if fi, err := fs.Stat(s.Web, p); err != nil || fi.IsDir() {
		p = "index.html" // SPA fallback
	}
	if p == "index.html" {
		w.Header().Set("Cache-Control", "no-cache")
	} else if strings.HasPrefix(p, "assets/") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}
	http.ServeFileFS(w, r, s.Web, p)
}
