# WICS on Terra — rdk-bridge / wics-web

Hanium 2026 exploration robot: ROS 2 sensors exposed as Terra resources, plus a web console over `terra.events.v1`.

- `modules/leaf/lab.hanium.rdk-bridge` — Terra Leaf module (Go). One adapter process per sensor; freshness judged by sequence+stamp.
- `adapters/rdk_adapter.py` — per-sensor adapter (`--source mock` verified, `--source ros` **not verified on hardware**) and E-STOP adapter.
- `wics-web` — static web console + zero-dependency Node server.
- `tools` — contract generator, deploy/start/stop scripts (assume a local Terra dev build; paths are Windows-specific).
- `docs` — boundary design, implementation/verification report, design notes.

Read `docs/02-implementation-and-verification.md` first: it states what was and was not verified (no real RDK run).
The local verification stack (`stack/`, with tokens and databases) is deliberately not part of this repo.
