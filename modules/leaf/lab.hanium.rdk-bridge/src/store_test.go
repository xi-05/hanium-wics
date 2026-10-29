package main

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

func msg(seq uint64, sec int64) []byte {
	b, _ := json.Marshal(map[string]any{"sequence": seq, "stamp": map[string]int64{"sec": sec, "nanosec": 0}})
	return b
}

func newSlot(limit time.Duration) *slot {
	return &slot{res: Resource{Name: "scan", Limit: limit}}
}

func TestFreshnessRequiresAdvancingSequenceAndStamp(t *testing.T) {
	s := newSlot(3 * time.Second)
	t0 := time.Unix(1000, 0)
	if v := s.view(t0, false); v.State != StateDown {
		t.Fatalf("empty slot must be down, got %s", v.State)
	}
	if v := s.view(t0, true); v.State != StateStale {
		t.Fatalf("adapter alive but silent must be stale, got %s", v.State)
	}
	adv, err := s.ingest(msg(1, 100), "a", t0)
	if err != nil || !adv {
		t.Fatalf("first message: adv=%v err=%v", adv, err)
	}
	if v := s.view(t0.Add(time.Second), true); v.State != StateFresh {
		t.Fatalf("want fresh, got %s", v.State)
	}
	// A hung publisher keeps re-sending the same message: messages arrive, nothing advances.
	for i := 1; i <= 5; i++ {
		adv, _ = s.ingest(msg(1, 100), "a", t0.Add(time.Duration(i)*time.Second))
		if adv {
			t.Fatal("repeated sequence must not count as progress")
		}
	}
	if v := s.view(t0.Add(5*time.Second), true); v.State != StateStale || v.Repeated != 5 {
		t.Fatalf("frozen source must be stale with 5 repeats, got %s/%d", v.State, v.Repeated)
	}
	// sequence moves but stamp does not (replayed header): still no progress.
	if adv, _ = s.ingest(msg(2, 100), "a", t0.Add(6*time.Second)); adv {
		t.Fatal("stamp that does not advance must not count")
	}
	// real progress
	if adv, _ = s.ingest(msg(3, 101), "a", t0.Add(7*time.Second)); !adv {
		t.Fatal("seq+stamp advance must count")
	}
	// adapter restart: counter resets but the stamp is newer
	if adv, _ = s.ingest(msg(1, 150), "a", t0.Add(8*time.Second)); !adv {
		t.Fatal("restart with newer stamp must count")
	}
	// no messages and no adapter -> down
	if v := s.view(t0.Add(30*time.Second), false); v.State != StateDown {
		t.Fatalf("want down, got %s", v.State)
	}
}

func TestMalformedMessagesAreRejected(t *testing.T) {
	s := newSlot(time.Second)
	for _, body := range []string{"", "{", `{"stamp":1}`, `{"sequence":1}`} {
		if _, err := s.ingest([]byte(body), "a", time.Now()); err == nil {
			t.Fatalf("%q must be rejected", body)
		}
	}
	if v := s.view(time.Now(), false); v.Rejected != 4 || v.HasPayload {
		t.Fatalf("rejected=%d payload=%v", v.Rejected, v.HasPayload)
	}
}

func TestImagePacketValidation(t *testing.T) {
	mk := func(enc string, step, h, px int) []byte {
		hdr := fmt.Sprintf(`{"sequence":1,"stamp":{"sec":1,"nanosec":0},"width":4,"height":%d,"encoding":%q,"step":%d}`, h, enc, step)
		b := make([]byte, 4+len(hdr)+px)
		b[0] = byte(len(hdr))
		copy(b[4:], hdr)
		return b
	}
	if _, _, err := splitImagePacket(mk("nv12", 4, 4, 24)); err != nil { // 4*4*3/2
		t.Fatalf("valid nv12: %v", err)
	}
	if _, _, err := splitImagePacket(mk("mono16", 8, 4, 32)); err != nil {
		t.Fatalf("valid mono16: %v", err)
	}
	if _, _, err := splitImagePacket(mk("mono16", 8, 4, 31)); err == nil {
		t.Fatal("short pixel buffer must fail")
	}
	if _, _, err := splitImagePacket([]byte{1, 2}); err == nil {
		t.Fatal("tiny packet must fail")
	}
}

func TestMinGapKeepsProgressButDropsPayload(t *testing.T) {
	s := &slot{res: Resource{Name: "map", Limit: 15 * time.Second, MinGap: time.Second}}
	t0 := time.Unix(1, 0)
	s.ingest(msg(1, 1), "a", t0)
	s.ingest(msg(2, 2), "a", t0.Add(200*time.Millisecond))
	if v := s.view(t0.Add(300*time.Millisecond), true); v.Throttled != 1 || v.State != StateFresh || v.Sequence != 2 {
		t.Fatalf("throttled=%d state=%s seq=%d", v.Throttled, v.State, v.Sequence)
	}
}
