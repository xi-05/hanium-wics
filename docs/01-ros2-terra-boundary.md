# ROS 2 ↔ Terra 경계 설계 (1페이지)

작성: 2026-10-17 · 대상: Terra v0.6.2 / rdk-bridge 0.1 · 상태: 설계(구현 전 확정본)

## 1. 결론

| 경계 단계 | 넘기는 것 | 결정 |
|---|---|---|
| 상태만 | status(센서 신선도·모드·배터리·E-STOP) | **1단계** |
| 저용량 데이터 | scan, pose, map | **1단계** (map은 변경 시에만, 최대 0.5 Hz) |
| 프레임 | image_left, depth (기존 9093 바이너리 패킷 그대로) | **2단계**, 1~2 Hz 상한 |
| 원시 스트림 | right 카메라, combine, tf, 10 Hz 영상 | 경계 밖(로봇 안에만 존재) |

DDS/ROS 2는 대체하지 않는다. 로봇 안의 실시간 제어와 온보드 정지는 MCU 몫이고 Terra 경로에 의존하지 않는다(NFR-08).

## 2. 구조

```
ROS 2 토픽 ──(DDS)──> ros-adapter 프로세스 × 센서별 ──loopback HTTP POST──> rdk-bridge (Terra Leaf 모듈, Go)
 /scan  /map /pose ...    scan | map | pose | status | image | depth            │ ① SVI 자원 서술자 7개 게시
                         (프로세스 1개 = 센서 1개)                              │ ② /v1/<자원> 스냅샷, /v1/estop
                                                                               ▼
                                                           Terra Daemon ─relay─> Tree(Master) ─> wics-web
```

- **프로세스 분리(NFR-12)**: 센서마다 어댑터 프로세스가 따로 뜬다. 하나가 죽으면 그 자원만 `stale`이 되고 나머지는 계속 동작한다. 브리지 모듈은 ROS를 모르고(rclpy 의존 없음) 어댑터의 감독·재시작만 한다. 지금처럼 한 컨테이너에 rosbridge/이미지/대시보드가 몰려 있는 구조를 없앤다.
- 어댑터→모듈 입구는 loopback + 무작위 토큰. 포트는 외부에 열지 않는다(SSH 터널 불필요).

## 3. 자원 계약

이름: `scan, map, pose, image_left, depth, imu, status` (SVI 서술자 `resource_id`. 데몬이 `svi.<node>.` 접두를 붙인다).

| 자원 | 페이로드 | 주기 상한 | 단계 |
|---|---|---|---|
| status | JSON (아래 §4) | 1 Hz | 1 |
| scan | JSON `{angle_min, angle_increment, range_min/max, ranges[]}` (NaN/Inf→null) | 5 Hz | 1 |
| map | JSON `{width,height,resolution,origin,data_b64}` (int8 격자, base64) | 0.5 Hz | 1 |
| pose | JSON `{x,y,yaw,cov}` | 5 Hz | 1 |
| imu | JSON(자세·각속도·가속도) | 5 Hz | 1.5 (어댑터만 있으면 노출) |
| image_left / depth | **9093 패킷**: uint32 LE 헤더길이 + UTF-8 JSON 헤더 + 픽셀. `application/vnd.rdkx5.image-v1` | 1~2 Hz | 2 |

## 4. 신선도 규칙 (토픽 존재 ≠ 정상)

모든 어댑터 메시지는 `sequence`(어댑터가 센 값), `stamp`(ROS header.stamp 또는 수신 시각), `source_hz`를 단다. 모듈은 자원마다 **마지막으로 sequence가 늘어난 시각**을 기록하고 다음으로 판정한다.

- `fresh`: sequence가 증가했고 `now − 마지막 증가 < limit`(scan 3 s, pose 3 s, map 15 s, image/depth 5 s, status 5 s)
- `stale`: 어댑터가 살아 있지만 sequence가 멈춤, 또는 stamp가 되감김/정지
- `down`: 어댑터 연결 없음 또는 프로세스 사망
- 서술자 `status`: fresh→`available`, 그 외→`unavailable` (Terra 쪽에서 `svi.resources.changed` 이벤트로 보인다)

## 5. 전달 경로 — 실측으로 확인된 제약 (중요)

Terra v0.6.2 코드를 읽어 확인한 사실이다.

1. **모듈은 SVI source로 프레임을 밀어 넣을 수 없다.** 데몬이 모듈 provider를 source 없이 등록한다(`RegisterSVIProvider(adapter, nil, sinks)`). 모듈이 게시하는 것은 *서술자*이고, handle로 구독하면 backend unavailable이다.
2. **relay는 스트림을 나르지 않는다.** 원격 노드의 모듈 데이터는 요청-응답(`/api/nodes/{node}/modules/{id}/v1/...`)으로만 간다. `terra.events.v1`은 알림 전용이며 모듈이 신호를 낼 수 없다(데몬 고정 신호: modules/svi.declarations/io.devices 등).

따라서 **1단계 전달 방식**: 서술자(발견·신선도 반영) + 모듈 HTTP 스냅샷. wics-web은
- `terra.events.v1` WebSocket으로 **노드 접속·모듈 상태·자원 가용성 변화**를 즉시 받고(기존 2초 폴링의 상태 확인 대체),
- 센서 **데이터는 이벤트로 연결 상태를 확인한 뒤 자원별 주기(§3)로 당겨온다**. 데이터 푸시 스트림은 Terra에 source 경로가 생기기 전에는 불가능하다.

**업그레이드 경로(미구현)**: 데몬의 `net` source 선언(`--connect tcp://`, 울타리 파일 수정+재시작 필요)으로 어댑터 TCP를 SVI 자원(`net.scan` 등)으로 올리면 handle 스트림이 relay를 탄다. 자원 이름이 `net.` 접두가 되고 설정 편집이 필요해 이번 범위에서는 제외했다. Terra에 "모듈 source 연결"을 요청하는 것이 정석이다.

## 6. E-STOP 경계 (3층)

1. 정상 경로(구현): wics-web → Master → 현장 → Daemon → `POST /v1/estop` → rdk-bridge → **로봇 컨트롤러 인터페이스(`Controller.RequestStop`)** → 어댑터가 `/estop_request`(std_msgs/Bool, Reliable)로 전달. 여기까지가 이 저장소의 책임이고, "전달 확인(ack)"만 돌려준다. 정지 실행은 MCU.
2. 오프라인 직결 경로(인터페이스만): `DirectEstop` — 현장 화면→로봇 직접. 구현 없음, 계약만 `internal/estop/direct.go`.
3. 온보드 정지: MCU. 범위 밖. **네트워크 단절이 정지를 유발하지도, 막지도 않는다.**

권한/감사(FR-USR, NFR-01/04)는 이번에 구현하지 않는다. 설계 메모는 `03-design-notes.md`.
