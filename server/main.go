// Command daeui serves the DaeUI web app and manages a local dae installation.
package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/ImYoungH-LYH/daeui/server/internal/api"
	"github.com/ImYoungH-LYH/daeui/server/internal/auth"
	"github.com/ImYoungH-LYH/daeui/server/internal/dae"
	"github.com/ImYoungH-LYH/daeui/server/web"
)

var version = "dev"

func main() {
	listen := flag.String("listen", ":2027", "address to listen on")
	dataDir := flag.String("data", "/etc/daeui", "directory for DaeUI's own state (password hash)")
	mock := flag.String("mock", "", "development only: imitate dae under this directory instead of managing the real one")
	daeBin := flag.String("dae-bin", "/usr/bin/dae", "dae executable")
	daeConfig := flag.String("dae-config", "/etc/dae/config.dae", "dae config file")
	flag.Parse()

	store, err := auth.New(filepath.Join(*dataDir, "auth.json"))
	if err != nil {
		log.Fatalf("load auth state: %v", err)
	}

	var mgr dae.Manager
	if *mock != "" {
		log.Printf("MOCK MODE: dae is simulated under %s", *mock)
		mgr = dae.NewMock(*mock)
	} else {
		o := dae.NewOpenWrt()
		o.Bin, o.ConfigPath = *daeBin, *daeConfig
		mgr = o
	}

	srv := &http.Server{
		Addr:              *listen,
		Handler:           (&api.Server{Auth: store, Dae: mgr, Web: web.FS(), Version: version}).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()

	log.Printf("DaeUI %s listening on %s", version, *listen)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
