// Command terra-rdk-bridge is the lab.hanium.rdk-bridge Leaf module.
//
// ROS 2 never enters this process. One adapter process per sensor posts
// sequence/stamp-carrying messages to a loopback ingest port; this module
// judges freshness, publishes SVI resource descriptors and serves snapshots
// and the E-STOP operation through the Terra Gateway.
package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	modulesdk "github.com/StellaxiaLab/terra-sdk/modulesdk"
	coresvi "github.com/StellaxiaLab/terra-sdk/svi"
)

const (
	moduleVersion = "0.1.0"
	moduleID      = "lab.hanium.rdk-bridge"
	apiPrefix     = "/api/modules/" + moduleID + "/v1"
	imageMIME     = "application/vnd.rdkx5.image-v1"
)

func (b *Bridge) operations() http.Handler {
	mux := http.NewServeMux()
	// JSON resources: always 200 with the freshness verdict inside, so the
	// caller can tell "no signal" from "bridge down".
	for _, r := range resourceTable {
		r := r
		if r.Binary {
			continue
		}
		mux.HandleFunc("GET "+apiPrefix+"/"+route(r.Name), func(w http.ResponseWriter, req *http.Request) {
			if !b.enabled(r) {
				writeErr(w, http.StatusNotFound, "RDK_STAGE_DISABLED", r.Name+" is not enabled at stage "+fmt.Sprint(b.cfg.Stage))
				return
			}
			now := time.Now()
			if r.Name == "status" {
				writeJSON(w, http.StatusOK, b.statusDoc(now))
				return
			}
			s := b.slots[r.Name]
			v := s.view(now, b.adapterAlive(r.Name))
			doc := map[string]any{"resource": r.Name, "topic": r.Topic, "state": v.State, "age_ms": v.AgeMs,
				"sequence": v.Sequence, "stamp": v.Stamp, "hz": v.Hz}
			if raw, ok := s.snapshot(); ok && v.State != StateDown {
				doc["data"] = json.RawMessage(raw)
			}
			writeJSON(w, http.StatusOK, doc)
		})
	}
	// Binary resources: 9093 packet as-is. Not fresh -> 503 so a frozen last
	// frame can never be mistaken for live video.
	for _, r := range resourceTable {
		r := r
		if !r.Binary {
			continue
		}
		mux.HandleFunc("GET "+apiPrefix+"/"+route(r.Name), func(w http.ResponseWriter, req *http.Request) {
			if !b.enabled(r) {
				writeErr(w, http.StatusNotFound, "RDK_STAGE_DISABLED", r.Name+" is not enabled at stage "+fmt.Sprint(b.cfg.Stage))
				return
			}
			s := b.slots[r.Name]
			v := s.view(time.Now(), b.adapterAlive(r.Name))
			pkt, ok := s.snapshot()
			if v.State != StateFresh || !ok {
				writeErr(w, http.StatusServiceUnavailable, "RDK_RESOURCE_"+upper(v.State), r.Name+" is "+v.State)
				return
			}
			if req.URL.Query().Get("format") == "json" {
				// Master relay carries text bodies only (measured: a raw 9093 packet never arrives).
				writeJSON(w, http.StatusOK, map[string]any{"resource": r.Name, "encoding": imageMIME + "+base64", "packet_b64": base64.StdEncoding.EncodeToString(pkt)})
				return
			}
			w.Header().Set("Content-Type", imageMIME)
			w.Header().Set("Cache-Control", "no-store")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(pkt)
		})
	}
	mux.HandleFunc("POST "+apiPrefix+"/estop", func(w http.ResponseWriter, req *http.Request) {
		var in StopRequest
		body, _ := io.ReadAll(http.MaxBytesReader(w, req.Body, 4096))
		if len(body) > 0 {
			if err := json.Unmarshal(body, &in); err != nil {
				writeErr(w, http.StatusBadRequest, "RDK_BAD_REQUEST", "invalid json")
				return
			}
		}
		if in.Reason == "" {
			in.Reason = "operator"
		}
		if sub := req.Header.Get("X-Terra-Subject"); sub != "" {
			in.Requester = sub
		}
		res, err := b.ctl.RequestStop(req.Context(), in)
		if err != nil {
			writeErr(w, http.StatusServiceUnavailable, "RDK_ESTOP_ABORTED", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, res)
	})
	return mux
}

func upper(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'a' && c <= 'z' {
			b[i] = c - 32
		}
	}
	return string(b)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, errCode, msg string) {
	writeJSON(w, code, map[string]any{"error": map[string]any{"code": errCode, "message": msg}})
}

// descriptors publishes the resources. Status follows the freshness verdict, so
// a dead sensor turns "unavailable" in the catalog (and raises
// terra.svi.resources.changed on the Tree) without anyone polling.
func (b *Bridge) descriptors(context.Context) ([]coresvi.ResourceDescriptor, error) {
	now := time.Now()
	var out []coresvi.ResourceDescriptor
	for _, r := range resourceTable {
		if !b.enabled(r) {
			continue
		}
		state := StateFresh
		if r.Name != "status" {
			state = b.slots[r.Name].view(now, b.adapterAlive(r.Name)).State
		} else if b.statusDoc(now)["mode"] != "ok" {
			state = StateStale
		}
		st := coresvi.ResourceAvailable
		if state != StateFresh && r.Name != "status" {
			st = coresvi.ResourceUnavailable
		}
		enc, schema := "application/json", "terra.bytes@1"
		if r.Binary {
			enc = imageMIME
		}
		out = append(out, coresvi.ResourceDescriptor{
			ResourceID:    r.Name,
			Kind:          r.Kind,
			CanonicalName: "ros/" + r.Name,
			DisplayName:   r.Name,
			Labels:        map[string]string{"topic": r.Topic, "freshness": state, "module": moduleID},
			Status:        st,
			Endpoints: []coresvi.EndpointDescriptor{{
				EndpointID:   "output",
				Direction:    coresvi.DirectionSource,
				Interaction:  coresvi.InteractionSnapshot,
				Operations:   []coresvi.Operation{coresvi.OperationInspect, coresvi.OperationRead},
				OutputSchema: schema,
				Encodings:    []string{enc},
				QoSProfiles:  []coresvi.QoSProfile{coresvi.QoSRealtimeLatest},
				Status:       st,
				Metadata: map[string]any{
					"limit_ms": r.Limit.Milliseconds(), "op": apiPrefix + "/" + route(r.Name), "binary": r.Binary,
					"max_hz": maxHz(r),
				},
			}},
		})
	}
	return out, nil
}

func maxHz(r Resource) float64 {
	if r.MinGap == 0 {
		return 1
	}
	return round1(float64(time.Second) / float64(r.MinGap))
}

func ensureToken(cfg *Config) {
	if cfg.IngestToken != "" {
		return
	}
	raw := make([]byte, 16)
	_, _ = rand.Read(raw)
	cfg.IngestToken = hex.EncodeToString(raw)
	if dir := os.Getenv("TERRA_MODULE_DATA_DIR"); dir != "" {
		// External adapters read the token from here.
		_ = os.WriteFile(filepath.Join(dir, "ingest.token"), []byte(cfg.IngestToken), 0o600)
	}
}

func run() error {
	identity, err := modulesdk.FromEnv()
	if err != nil {
		return fmt.Errorf("read workload identity: %w", err)
	}
	cfg := loadConfig()
	ensureToken(&cfg)
	b := NewBridge(cfg)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := b.startIngest(ctx); err != nil {
		return fmt.Errorf("ingest listener %s: %w", cfg.IngestAddr, err)
	}
	b.startAdapters(ctx)
	server, err := modulesdk.Listen(modulesdk.Config{
		Identity:     identity,
		Readiness:    func(context.Context) (bool, string) { return true, "" }, // up even with every sensor down: status explains why
		Operations:   b.operations(),
		SVIResources: b.descriptors,
	})
	if err != nil {
		return fmt.Errorf("bind workload endpoint: %w", err)
	}
	return server.Serve(ctx)
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "terra-rdk-bridge:", err)
		os.Exit(1)
	}
}

// route maps a resource name to its URL segment (operation ids cannot hold "_").
func route(name string) string { return strings.ReplaceAll(name, "_", "-") }
