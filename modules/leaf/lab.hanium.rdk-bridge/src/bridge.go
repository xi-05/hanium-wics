package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

type AdapterSpec struct {
	Name     string   `json:"name"`     // process name, also the E-STOP adapter name ("estop")
	Resource string   `json:"resource"` // resource it feeds
	Command  []string `json:"command"`
}

type Config struct {
	Stage        int           `json:"stage"` // 1: status/scan/map/pose/imu, 2: + image_left/depth
	IngestAddr   string        `json:"ingest_addr"`
	IngestToken  string        `json:"ingest_token"`
	Adapters     []AdapterSpec `json:"adapters"`
	ControllerMs int           `json:"controller_wait_ms"`
}

func loadConfig() Config {
	cfg := Config{Stage: 1, IngestAddr: "127.0.0.1:19400", ControllerMs: 2000}
	path := os.Getenv("RDK_BRIDGE_CONFIG")
	if path == "" {
		if dir := os.Getenv("TERRA_MODULE_DATA_DIR"); dir != "" {
			path = dir + string(os.PathSeparator) + "config.json"
		}
	}
	if path != "" {
		if raw, err := os.ReadFile(path); err == nil {
			if err := json.Unmarshal(raw, &cfg); err != nil {
				log.Printf("config %s: %v (using defaults)", path, err)
			}
		}
	}
	if cfg.Stage < 1 || cfg.Stage > 2 {
		cfg.Stage = 1
	}
	if cfg.ControllerMs <= 0 {
		cfg.ControllerMs = 2000
	}
	return cfg
}

// Bridge holds one slot per resource, the adapter supervisors and the E-STOP queue.
type Bridge struct {
	cfg     Config
	slots   map[string]*slot
	started time.Time

	supMu sync.Mutex
	sups  map[string]*supervisor

	ctl *adapterController
}

func NewBridge(cfg Config) *Bridge {
	b := &Bridge{cfg: cfg, slots: map[string]*slot{}, sups: map[string]*supervisor{}, started: time.Now()}
	for _, r := range resourceTable {
		b.slots[r.Name] = &slot{res: r} // "status" holds the robot-reported part (battery, controller mode)
	}
	b.ctl = newAdapterController(time.Duration(cfg.ControllerMs) * time.Millisecond)
	return b
}

func (b *Bridge) enabled(r Resource) bool { return r.Stage <= b.cfg.Stage }

// adapterAlive: a supervised process is running, or an external adapter posted recently.
func (b *Bridge) adapterAlive(resource string) bool {
	b.supMu.Lock()
	defer b.supMu.Unlock()
	for _, s := range b.sups {
		if s.spec.Resource == resource && s.alive() {
			return true
		}
	}
	return false
}

func (b *Bridge) views(now time.Time) map[string]slotView {
	out := map[string]slotView{}
	for name, s := range b.slots {
		if r, _ := lookupResource(name); !b.enabled(r) || name == "status" {
			continue
		}
		out[name] = s.view(now, b.adapterAlive(name))
	}
	return out
}

// Overall mode: ok only if every enabled resource is fresh.
func (b *Bridge) statusDoc(now time.Time) map[string]any {
	views := b.views(now)
	mode := "ok"
	for _, v := range views {
		if v.State != StateFresh {
			mode = "degraded"
		}
	}
	adapters := map[string]any{}
	b.supMu.Lock()
	for name, s := range b.sups {
		adapters[name] = s.info()
	}
	b.supMu.Unlock()
	doc := map[string]any{
		"resource":  "status",
		"mode":      mode,
		"version":   moduleVersion,
		"stage":     b.cfg.Stage,
		"uptime_s":  int(now.Sub(b.started).Seconds()),
		"resources": views,
		"adapters":  adapters,
		"estop":     b.ctl.info(),
		"time":      now.UTC().Format(time.RFC3339Nano),
	}
	// Robot-reported fields (battery, controller mode) from the optional status adapter.
	if raw, ok := b.slots["status"].snapshotIfAny(); ok {
		var robot map[string]any
		if json.Unmarshal(raw, &robot) == nil {
			doc["robot"] = robot
		}
	}
	return doc
}

func (s *slot) snapshotIfAny() ([]byte, bool) {
	if s == nil {
		return nil, false
	}
	return s.snapshot()
}

// ---------- ingest (adapter -> bridge), loopback + token ----------

func (b *Bridge) ingestHandler() http.Handler {
	mux := http.NewServeMux()
	guard := func(h http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("X-Rdk-Token") != b.cfg.IngestToken {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			h(w, r)
		}
	}
	mux.HandleFunc("POST /ingest/{res}", guard(func(w http.ResponseWriter, r *http.Request) {
		name := r.PathValue("res")
		s, ok := b.slots[name]
		if !ok {
			http.Error(w, "unknown resource", http.StatusNotFound)
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 2<<20))
		if err != nil {
			http.Error(w, "body", http.StatusRequestEntityTooLarge)
			return
		}
		adapter := r.Header.Get("X-Rdk-Adapter")
		advanced, err := s.ingest(body, adapter, time.Now())
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		b.noteExternal(adapter, name)
		_ = json.NewEncoder(w).Encode(map[string]any{"advanced": advanced})
	}))
	mux.HandleFunc("GET /cmd/estop/wait", guard(b.ctl.waitHandler))
	mux.HandleFunc("POST /cmd/estop/ack", guard(b.ctl.ackHandler))
	return mux
}

// noteExternal remembers adapters nobody supervises so "alive" still means something.
func (b *Bridge) noteExternal(adapter, resource string) {
	if adapter == "" {
		return
	}
	b.supMu.Lock()
	defer b.supMu.Unlock()
	if s, ok := b.sups[adapter]; ok {
		s.touch()
		return
	}
	s := &supervisor{spec: AdapterSpec{Name: adapter, Resource: resource}, external: true}
	s.touch()
	b.sups[adapter] = s
}

func (b *Bridge) startIngest(ctx context.Context) error {
	ln, err := net.Listen("tcp", b.cfg.IngestAddr)
	if err != nil {
		return err
	}
	srv := &http.Server{Handler: b.ingestHandler(), ReadHeaderTimeout: 5 * time.Second}
	go func() { <-ctx.Done(); _ = srv.Close() }()
	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("ingest server: %v", err)
		}
	}()
	return nil
}

// ---------- supervisor: one OS process per sensor ----------

type supervisor struct {
	spec     AdapterSpec
	external bool

	mu       sync.Mutex
	running  bool
	restarts int
	lastExit string
	lastSeen time.Time
	pid      int
}

func (s *supervisor) touch() { s.mu.Lock(); s.lastSeen = time.Now(); s.mu.Unlock() }

func (s *supervisor) alive() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.external {
		return time.Since(s.lastSeen) < 10*time.Second
	}
	return s.running
}

func (s *supervisor) info() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	return map[string]any{"resource": s.spec.Resource, "alive": s.running || (s.external && time.Since(s.lastSeen) < 10*time.Second),
		"supervised": !s.external, "restarts": s.restarts, "last_exit": s.lastExit, "pid": s.pid}
}

func (s *supervisor) run(ctx context.Context, env []string) {
	backoff := time.Second
	for ctx.Err() == nil {
		cmd := exec.CommandContext(ctx, s.spec.Command[0], s.spec.Command[1:]...)
		cmd.Env = append(os.Environ(), env...)
		cmd.Stdout, cmd.Stderr = os.Stderr, os.Stderr
		began := time.Now()
		err := cmd.Start()
		if err == nil {
			s.mu.Lock()
			s.running, s.pid = true, cmd.Process.Pid
			s.mu.Unlock()
			err = cmd.Wait()
		}
		s.mu.Lock()
		s.running, s.pid = false, 0
		s.restarts++
		s.lastExit = time.Now().UTC().Format(time.RFC3339)
		if err != nil {
			s.lastExit += " " + err.Error()
		}
		s.mu.Unlock()
		if ctx.Err() != nil {
			return
		}
		if time.Since(began) > 30*time.Second {
			backoff = time.Second
		}
		log.Printf("adapter %s exited (%v); restart in %s", s.spec.Name, err, backoff)
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
}

func (b *Bridge) startAdapters(ctx context.Context) {
	env := []string{"RDK_BRIDGE_INGEST=http://" + b.cfg.IngestAddr, "RDK_BRIDGE_TOKEN=" + b.cfg.IngestToken}
	for _, spec := range b.cfg.Adapters {
		if len(spec.Command) == 0 {
			continue
		}
		s := &supervisor{spec: spec}
		b.supMu.Lock()
		b.sups[spec.Name] = s
		b.supMu.Unlock()
		go s.run(ctx, append(env, "RDK_ADAPTER_NAME="+spec.Name))
	}
}

func hasPrefixFold(s, p string) bool { return strings.HasPrefix(strings.ToLower(s), p) }
