package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// StopRequest is what the bridge hands to the robot controller. Executing the
// stop is the MCU's job; the bridge's duty ends at "received -> forwarded".
type StopRequest struct {
	Reason    string `json:"reason"`
	Requester string `json:"requester,omitempty"`
}

type StopResult struct {
	Seq       uint64 `json:"seq"`
	Delivered bool   `json:"delivered"` // controller adapter acknowledged within the wait
	Queued    bool   `json:"queued"`    // not acknowledged yet; will be delivered when the adapter polls
	Detail    string `json:"detail,omitempty"`
	At        string `json:"at"`
}

// Controller is the bridge-side seam to the robot controller. The shipped
// implementation hands the request to the "estop" adapter process (publishes
// std_msgs/Bool on /estop_request, QoS Reliable).
type Controller interface {
	RequestStop(ctx context.Context, req StopRequest) (StopResult, error)
}

type adapterController struct {
	wait time.Duration

	mu       sync.Mutex
	seq      uint64
	current  StopRequest
	acked    uint64
	ackOK    bool
	ackInfo  string
	lastPoll time.Time
	history  []StopResult
	changed  chan struct{} // closed and replaced on every state change
}

func newAdapterController(wait time.Duration) *adapterController {
	return &adapterController{wait: wait, changed: make(chan struct{})}
}

func (c *adapterController) broadcastLocked() {
	close(c.changed)
	c.changed = make(chan struct{})
}

func (c *adapterController) RequestStop(ctx context.Context, req StopRequest) (StopResult, error) {
	c.mu.Lock()
	c.seq++
	n := c.seq
	c.current = req
	c.broadcastLocked()
	c.mu.Unlock()

	res := StopResult{Seq: n, At: time.Now().UTC().Format(time.RFC3339Nano)}
	deadline := time.NewTimer(c.wait)
	defer deadline.Stop()
	for {
		c.mu.Lock()
		if c.acked >= n {
			res.Delivered, res.Detail = c.ackOK, c.ackInfo
			res.Queued = !c.ackOK
			c.history = append(c.history, res)
			if len(c.history) > 20 {
				c.history = c.history[1:]
			}
			c.mu.Unlock()
			return res, nil
		}
		ch := c.changed
		c.mu.Unlock()
		select {
		case <-ch:
		case <-deadline.C:
			res.Queued, res.Detail = true, "controller adapter did not acknowledge in time"
			c.mu.Lock()
			c.history = append(c.history, res)
			c.mu.Unlock()
			return res, nil
		case <-ctx.Done():
			return res, ctx.Err()
		}
	}
}

func (c *adapterController) info() map[string]any {
	c.mu.Lock()
	defer c.mu.Unlock()
	connected := !c.lastPoll.IsZero() && time.Since(c.lastPoll) < 30*time.Second
	out := map[string]any{"controller_adapter_connected": connected, "requests": c.seq, "acked": c.acked}
	if len(c.history) > 0 {
		out["last"] = c.history[len(c.history)-1]
	}
	return out
}

// GET /cmd/estop/wait?after=N&timeout=S — long poll used by the estop adapter.
func (c *adapterController) waitHandler(w http.ResponseWriter, r *http.Request) {
	after, _ := strconv.ParseUint(r.URL.Query().Get("after"), 10, 64)
	secs, _ := strconv.Atoi(r.URL.Query().Get("timeout"))
	if secs <= 0 || secs > 25 {
		secs = 20
	}
	timer := time.NewTimer(time.Duration(secs) * time.Second)
	defer timer.Stop()
	for {
		c.mu.Lock()
		c.lastPoll = time.Now()
		if c.seq > after {
			out := map[string]any{"seq": c.seq, "reason": c.current.Reason, "requester": c.current.Requester}
			c.mu.Unlock()
			_ = json.NewEncoder(w).Encode(out)
			return
		}
		ch := c.changed
		c.mu.Unlock()
		select {
		case <-ch:
		case <-timer.C:
			w.WriteHeader(http.StatusNoContent)
			return
		case <-r.Context().Done():
			return
		}
	}
}

// POST /cmd/estop/ack {"seq":N,"ok":true,"detail":"..."}
func (c *adapterController) ackHandler(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Seq    uint64 `json:"seq"`
		OK     bool   `json:"ok"`
		Detail string `json:"detail"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	c.mu.Lock()
	if body.Seq > c.acked && body.Seq <= c.seq {
		c.acked, c.ackOK, c.ackInfo = body.Seq, body.OK, body.Detail
		c.broadcastLocked()
	}
	c.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}
