package api

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

const tailBytes = 256 << 10

// tail returns up to n trailing lines of the file and the file size it read up to.
func tail(path string, n int) ([]string, int64, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, 0, err
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil {
		return nil, 0, err
	}
	size := fi.Size()
	start := size - tailBytes
	if start < 0 {
		start = 0
	}
	buf := make([]byte, size-start)
	if _, err := f.ReadAt(buf, start); err != nil && !errors.Is(err, io.EOF) {
		return nil, 0, err
	}
	if start > 0 {
		// Drop the partial first line.
		if i := bytes.IndexByte(buf, '\n'); i >= 0 {
			buf = buf[i+1:]
		}
	}
	lines := strings.Split(strings.TrimRight(string(buf), "\n"), "\n")
	if len(lines) == 1 && lines[0] == "" {
		lines = nil
	}
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return lines, size, nil
}

func (s *Server) logs(w http.ResponseWriter, r *http.Request) {
	n, _ := strconv.Atoi(r.URL.Query().Get("lines"))
	if n <= 0 || n > 5000 {
		n = 500
	}
	lines, _, err := tail(s.Dae.LogFile(), n)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if lines == nil {
		lines = []string{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"lines": lines})
}

// logStream pushes the last lines, then new lines as they are appended (Server-Sent Events).
func (s *Server) logStream(w http.ResponseWriter, r *http.Request) {
	fl, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-store")
	h.Set("X-Accel-Buffering", "no")

	path := s.Dae.LogFile()
	send := func(line string) {
		fmt.Fprintf(w, "data: %s\n\n", strings.ReplaceAll(line, "\r", ""))
	}
	lines, offset, _ := tail(path, 200)
	for _, l := range lines {
		send(l)
	}
	fl.Flush()

	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	keepalive := time.NewTicker(20 * time.Second)
	defer keepalive.Stop()
	var partial string
	for {
		select {
		case <-r.Context().Done():
			return
		case <-keepalive.C:
			fmt.Fprint(w, ": ping\n\n")
			fl.Flush()
		case <-tick.C:
			fi, err := os.Stat(path)
			if err != nil {
				continue
			}
			if fi.Size() < offset {
				// Rotated or truncated: start over from the beginning of the new file.
				offset, partial = 0, ""
				send("--- 日志已轮转 ---")
			}
			if fi.Size() == offset {
				continue
			}
			f, err := os.Open(path)
			if err != nil {
				continue
			}
			buf := make([]byte, min(fi.Size()-offset, tailBytes))
			k, _ := f.ReadAt(buf, offset)
			f.Close()
			offset += int64(k)
			chunk := partial + string(buf[:k])
			parts := strings.Split(chunk, "\n")
			partial = parts[len(parts)-1]
			for _, l := range parts[:len(parts)-1] {
				send(l)
			}
			fl.Flush()
		}
	}
}
