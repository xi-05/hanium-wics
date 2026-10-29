package main

import "context"

// DirectEstop is the contract for the OFFLINE E-STOP path (layer 2 in
// docs/01-ros2-terra-boundary.md §6): site screen -> robot, with no Tree, no
// Terra relay and no Internet in between. It is deliberately interface-only —
// a transport (UDP broadcast, BLE, a hardware button on the site computer) is
// a decision for the control team, and the MCU's onboard stop (layer 3) never
// depends on it.
//
// Requirements any implementation must meet:
//   - fire-and-confirm: Trigger returns only after the robot side acknowledged,
//     or reports that it could not reach it (never "probably sent");
//   - idempotent: repeated Triggers are harmless;
//   - independent of Terra: it must work when the Daemon and Master are down.
type DirectEstop interface {
	Trigger(ctx context.Context, req StopRequest) (StopResult, error)
	// Reachable reports whether the robot answered a recent liveness probe.
	Reachable(ctx context.Context) bool
}
