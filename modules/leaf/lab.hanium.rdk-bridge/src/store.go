package main

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"
)

// Resource names are the contract with wics-web (docs/01-ros2-terra-boundary.md §3).
type Resource struct {
	Name   string
	Kind   string // SVI kind token: lower-case, no underscore
	Binary bool   // 9093 image packet instead of JSON
	Limit  time.Duration
	Stage  int
	MinGap time.Duration // ingest-side rate cap (0 = none)
	Topic  string
}

var resourceTable = []Resource{
	{Name: "status", Kind: "ros.status", Limit: 5 * time.Second, Stage: 1, Topic: "(bridge)"},
	{Name: "scan", Kind: "ros.laserscan", Limit: 3 * time.Second, Stage: 1, Topic: "/scan", MinGap: 150 * time.Millisecond},
	{Name: "map", Kind: "ros.occupancygrid", Limit: 15 * time.Second, Stage: 1, Topic: "/map", MinGap: 1500 * time.Millisecond},
	{Name: "pose", Kind: "ros.pose", Limit: 3 * time.Second, Stage: 1, Topic: "/pose", MinGap: 150 * time.Millisecond},
	{Name: "imu", Kind: "ros.imu", Limit: 3 * time.Second, Stage: 1, Topic: "/imu/left/data_calibrated", MinGap: 150 * time.Millisecond},
	{Name: "image_left", Kind: "ros.image", Binary: true, Limit: 5 * time.Second, Stage: 2, Topic: "/image_left_raw", MinGap: 450 * time.Millisecond},
	{Name: "depth", Kind: "ros.depth", Binary: true, Limit: 5 * time.Second, Stage: 2, Topic: "/StereoNetNode/stereonet_depth", MinGap: 450 * time.Millisecond},
}

func lookupResource(name string) (Resource, bool) {
	for _, r := range resourceTable {
		if r.Name == name {
			return r, true
		}
	}
	return Resource{}, false
}

// Freshness states. "A topic exists" is never a state: only a sequence AND a
// stamp that keep advancing make a resource fresh.
const (
	StateFresh = "fresh"
	StateStale = "stale" // messages arrive (or the adapter lives) but nothing new is produced
	StateDown  = "down"  // no messages and no live adapter
)

type slot struct {
	mu          sync.Mutex
	res         Resource
	payload     []byte
	seq         uint64
	stamp       float64
	haveSeq     bool
	lastAdvance time.Time
	lastRecv    time.Time
	lastAccept  time.Time
	received    uint64
	rejected    uint64 // malformed
	repeated    uint64 // sequence/stamp did not advance
	throttled   uint64
	hz          float64
	adapter     string
}

func (s *slot) ingest(body []byte, adapter string, now time.Time) (advanced bool, err error) {
	seq, stamp, err := extractSeqStamp(s.res, body)
	s.mu.Lock()
	defer s.mu.Unlock()
	if err != nil {
		s.rejected++
		return false, err
	}
	s.lastRecv = now
	s.received++
	s.adapter = adapter
	if s.haveSeq {
		restart := seq < s.seq && stamp > s.stamp // adapter restarted: new counter, newer stamp
		forward := seq > s.seq && stamp > s.stamp
		if !restart && !forward {
			s.repeated++
			return false, nil
		}
	}
	if s.res.MinGap > 0 && !s.lastAccept.IsZero() && now.Sub(s.lastAccept) < s.res.MinGap {
		s.throttled++
		// Still counts as progress (the source is alive); the payload is not kept.
		s.seq, s.stamp, s.haveSeq, s.lastAdvance = seq, stamp, true, now
		return true, nil
	}
	if !s.lastAccept.IsZero() {
		if dt := now.Sub(s.lastAccept).Seconds(); dt > 0 {
			inst := 1 / dt
			if s.hz == 0 {
				s.hz = inst
			} else {
				s.hz = 0.8*s.hz + 0.2*inst
			}
		}
	}
	s.payload = append(s.payload[:0], body...)
	s.seq, s.stamp, s.haveSeq = seq, stamp, true
	s.lastAdvance, s.lastAccept = now, now
	return true, nil
}

type slotView struct {
	State      string  `json:"state"`
	AgeMs      int64   `json:"age_ms"`
	Sequence   uint64  `json:"sequence"`
	Stamp      float64 `json:"stamp"`
	Hz         float64 `json:"hz"`
	Received   uint64  `json:"received"`
	Repeated   uint64  `json:"repeated"`
	Rejected   uint64  `json:"rejected"`
	Throttled  uint64  `json:"throttled"`
	Adapter    string  `json:"adapter,omitempty"`
	AdapterUp  bool    `json:"adapter_alive"`
	LimitMs    int64   `json:"limit_ms"`
	HasPayload bool    `json:"has_payload"`
}

func (s *slot) view(now time.Time, adapterAlive bool) slotView {
	s.mu.Lock()
	defer s.mu.Unlock()
	v := slotView{Sequence: s.seq, Stamp: s.stamp, Hz: round1(s.hz), Received: s.received, Repeated: s.repeated,
		Rejected: s.rejected, Throttled: s.throttled, Adapter: s.adapter, AdapterUp: adapterAlive,
		LimitMs: s.res.Limit.Milliseconds(), HasPayload: len(s.payload) > 0}
	if s.lastAdvance.IsZero() {
		v.AgeMs = -1
		v.State = StateDown
		if adapterAlive {
			v.State = StateStale
		}
		return v
	}
	v.AgeMs = now.Sub(s.lastAdvance).Milliseconds()
	switch {
	case now.Sub(s.lastAdvance) <= s.res.Limit:
		v.State = StateFresh
	case now.Sub(s.lastRecv) <= s.res.Limit || adapterAlive:
		v.State = StateStale
	default:
		v.State = StateDown
	}
	return v
}

func (s *slot) snapshot() (payload []byte, ok bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.payload) == 0 {
		return nil, false
	}
	return append([]byte(nil), s.payload...), true
}

func round1(f float64) float64 { return float64(int(f*10+0.5)) / 10 }

type stampField struct {
	Sec     int64 `json:"sec"`
	Nanosec int64 `json:"nanosec"`
}

func parseStamp(raw json.RawMessage) (float64, error) {
	if len(raw) == 0 {
		return 0, errors.New("stamp missing")
	}
	var num float64
	if json.Unmarshal(raw, &num) == nil {
		return num, nil
	}
	var sf stampField
	if err := json.Unmarshal(raw, &sf); err != nil {
		return 0, fmt.Errorf("stamp: %w", err)
	}
	return float64(sf.Sec) + float64(sf.Nanosec)/1e9, nil
}

type seqStamp struct {
	Sequence *uint64         `json:"sequence"`
	Stamp    json.RawMessage `json:"stamp"`
}

func extractSeqStamp(res Resource, body []byte) (uint64, float64, error) {
	if res.Binary {
		hdr, _, err := splitImagePacket(body)
		if err != nil {
			return 0, 0, err
		}
		return seqStampFrom(hdr.raw)
	}
	return seqStampFrom(body)
}

func seqStampFrom(js []byte) (uint64, float64, error) {
	var ss seqStamp
	if err := json.Unmarshal(js, &ss); err != nil {
		return 0, 0, fmt.Errorf("json: %w", err)
	}
	if ss.Sequence == nil {
		return 0, 0, errors.New("sequence missing")
	}
	st, err := parseStamp(ss.Stamp)
	if err != nil {
		return 0, 0, err
	}
	return *ss.Sequence, st, nil
}

// imageHeader mirrors the 9093 header (DATA_PORT_CLIENT_GUIDE.md §4.3).
type imageHeader struct {
	raw      []byte
	Topic    string `json:"topic"`
	Width    int    `json:"width"`
	Height   int    `json:"height"`
	Encoding string `json:"encoding"`
	Step     int    `json:"step"`
}

// splitImagePacket validates: uint32 LE header length + UTF-8 JSON header + pixels.
func splitImagePacket(b []byte) (imageHeader, []byte, error) {
	var h imageHeader
	if len(b) < 5 {
		return h, nil, errors.New("packet too short")
	}
	n := int(binary.LittleEndian.Uint32(b))
	if n == 0 || n > 64<<10 || 4+n > len(b) {
		return h, nil, errors.New("bad header length")
	}
	h.raw = b[4 : 4+n]
	if err := json.Unmarshal(h.raw, &h); err != nil {
		return h, nil, fmt.Errorf("header json: %w", err)
	}
	pixels := b[4+n:]
	var want int
	switch h.Encoding {
	case "nv12":
		want = h.Step * h.Height * 3 / 2
	default:
		want = h.Step * h.Height
	}
	if h.Width <= 0 || h.Height <= 0 || h.Step <= 0 || len(pixels) != want {
		return h, nil, fmt.Errorf("pixel size %d != expected %d for %s %dx%d step %d", len(pixels), want, h.Encoding, h.Width, h.Height, h.Step)
	}
	return h, pixels, nil
}
