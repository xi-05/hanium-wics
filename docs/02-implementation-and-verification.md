# 구현 및 검증 결과 (2026-10-17)

범위: rdk-bridge(로봇 Leaf 모듈) 1단계 + 2단계 일부, wics-web, E-STOP 전달 경로. 3D 맵·AWS 배포는 범위 밖.
**실기(RDK) 검증은 하지 않았다. 아래 모든 "통과"는 모의 ROS 퍼블리셔(`adapters/rdk_adapter.py --source mock`) 기준이다.**

## 1. 선행 확인 결과 (Terra)

| 항목 | 확인 내용 |
|---|---|
| 저장소 | `C:\Claude Dev\Terra` (origin `StellaxiaLab/Terra`), 최신 태그 v0.6.2, main HEAD `1d3c5c12` (2026-10-15). 이 저장소는 읽기만 했다. |
| `fix/relay-read-loop-deadlock` | 브랜치는 더 이상 없다. 수정 커밋 8건(`e7fee77f`~`7787365f`)은 모두 origin/main의 조상이다(병합됨). |
| 0.4.40 3노드 판정 | **0.4.40 자체의 판정은 없고 더는 의미가 없다.** 8/30 보고서는 결함 7건을 찾았고 "실기계 판정 미실시"로 끝난다. 9/2 보고서가 서버·Windows·RDK 3기계에서 SVI 트랙 전부 통과(빌드 0.4.53)를 기록했으나 relay/WireGuard/nodetalk 전체 재판정은 아니다. |
| 남은 결함 | 모듈 개발을 막는 것은 없다. 알려진 제약: Docker runner 스텁(`ErrDockerUnavailable`) 그대로, Master HTTP only, 모듈 카탈로그 반영 지연. |
| 이번 측정 환경 | Terra dev 빌드(`C:\Claude Dev\stack\bin`)로 **한 PC의 windows-amd64 3프로세스**: Tree(Master) + 로봇 Leaf + 현장 Leaf. 서버 Linux / RDK arm64 노드는 쓰지 않았다. |

## 2. 만든 것

```
C:\hanium\wics\
  docs\                 01 경계 설계, 02 이 문서, 03 설계 메모(권한/감사)
  modules\leaf\lab.hanium.rdk-bridge\   Terra Leaf 모듈 (Go, SDK terra-sdk v0.1.0)
  adapters\rdk_adapter.py               센서별 어댑터 (mock + rclpy[미검증]) + E-STOP 어댑터
  wics-web\                             정적 웹 + 의존성 없는 Node 서버
  tools\                                계약 생성, 배포, 이벤트 프로브, 스택 기동/정지
  stack\                                검증용 비공개 3노드 스택(포트 280xx~282xx, 기존 스택 18xxx와 분리)
```

- 모듈 id `lab.hanium.rdk-bridge` (`io.terra.*` 접두는 Terra 예약). 계약 op 8개: status/scan/map/pose/imu(GET), image-left/depth(GET, 2단계), estop(POST). `terra contract validate` 통과.
- `stage` 설정: 1이면 status·scan·map·pose·imu만, 2이면 image_left·depth 추가(어댑터 쪽 상한 1~2 Hz, 브리지 쪽 최소 간격으로 이중 제한).
- 어댑터는 센서당 OS 프로세스 하나. 모듈이 감독(1→30 s 백오프 재시작). 모듈 자신은 ROS를 모른다.

## 3. 검증 표

| # | 확인 | 방법 | 결과 |
|---|---|---|---|
| 1 | 신선도 규칙(sequence·stamp 동시 진행, 재시작, 반복, 형식 오류, 패킷 검증, 간격 상한) | `go test` 4건 | 통과 |
| 2 | **멈춘 퍼블리셔 감지**: 메시지는 계속 도착하지만 sequence/stamp가 고정 | 스탠드얼론 + `--freeze-after 4` | 도착 50건 중 30건이 "반복"으로 집계, 11초 시점 `stale` (토픽/메시지 존재만으로 fresh 판정하지 않음) |
| 3 | **센서별 프로세스 분리(NFR-12)**: depth 어댑터를 14초간 4번 kill | 3노드 스택, Tree 경유 | depth `stale`→`down`, 나머지 5개 리소스 계속 `fresh`, kill 종료 약 4초 뒤 자동 복구 |
| 4 | 어댑터 재시작 후 sequence 되감김 수용 | 3의 map 어댑터 kill | sequence 1부터 재시작, stamp가 새로워 수용 |
| 5 | Terra 카탈로그에 7개 리소스 등재 | Master `GET /api/v1/svi/resources` | status/scan/map/pose/imu/image_left/depth 전부 `available` |
| 6 | 센서 이상이 카탈로그와 이벤트에 반영 | 3 동안 이벤트 프로브 | depth 정지 약 3초 뒤 카탈로그 `unavailable`, `terra.svi.resources.changed` 이벤트 수신, 복구 때 다시 수신 |
| 7 | Tree 경유 원격 호출 | `/api/nodes/{node}/modules/{id}/v1/*` | status/scan/map/pose/imu 200 (6~25 ms), E-STOP 12 ms |
| 8 | 영상·깊이 | 같은 경로 | **바이너리 패킷은 relay로 도착하지 않았다**(15 s 타임아웃). `?format=json`(패킷을 base64로 감쌈)으로 우회, 깊이 601 KB 200 OK (relay 응답 상한 768 KiB) |
| 9 | wics-web 대시보드 | 내장 브라우저 로그인 후 확인 | 이벤트 WebSocket 연결, 노드·모듈·리소스 신선도 표시 |
| 10 | wics-web 지도 | 같은 방식 | 점유 격자 + 스캔 점 + 위치 화살표 렌더(모의 데이터), 어댑터 재시작 시 지도가 처음부터 다시 그려짐 |
| 11 | wics-web 카메라/깊이 | 같은 방식 | NV12 640×352 컬러 변환, mono16 깊이 컬러맵, sequence·stamp 표시 |
| 12 | E-STOP | UI 두 번 클릭(무장→전송) | 어댑터 수신 확인(seq 1, 12 ms). 어댑터가 없을 때: `delivered:false, queued:true` |
| 13 | 인증 | curl | 워크로드 자격 없음 401, 잘못된 ingest 토큰 401, `sequence` 없는 메시지 400 |
| 14 | 단계 게이팅 | 스탠드얼론 stage 1 | image-left 404, 서술자 5개 |
| 15 | linux/arm64 빌드 | `GOOS=linux GOARCH=arm64 go build` | 빌드만 성공, **실행하지 않음** |

## 4. 측정에서 드러난 Terra 쪽 제약 (설계에 반영)

1. **모듈은 SVI source로 프레임을 밀 수 없다.** 데몬이 모듈 provider를 source 없이 등록한다. 서술자(발견·상태)만 가능. 그래서 데이터는 모듈 HTTP 스냅샷으로 간다.
2. **`terra.events.v1`은 알림 전용이고 모듈이 신호를 낼 수 없다.** wics-web은 이벤트로 연결·모듈·리소스 가용성 변화를 즉시 받고(상태 폴링 대체), 센서 데이터는 보이는 탭의 리소스만 주기(지도 2 s, 스캔·위치 1 s, 영상 1~2 s)로 당긴다. **데이터 푸시 스트림은 불가능했다.** 이벤트 WS가 끊기면 3초 폴링으로 폴백한다.
3. relay는 텍스트 본문만 나른다(8번).
4. **개발 설치 후 Master 카탈로그 반영은 데몬 재시작 뒤에야 됐다**(API로 `start`만 한 경우 `hosts no module` 503이 90초 이상 지속(재시작 후에는 약 6초 만에 등재)). 배포 절차에 데몬 재시작을 넣어야 한다.
5. `terra module install --dev`는 `--state-root`를 데몬의 `modules.state_dir`로 지정해야 한다(아니면 `MODULE_VERSION_UNSELECTED`).
6. Windows에서 모듈 프로세스를 강제 종료하면 자식 어댑터가 남는다. 어댑터가 30초간 브리지에 닿지 못하면 스스로 종료하도록 했다(Linux에서는 `Pdeathsig` 추가 권장, 미구현).

## 5. 하지 않은 것 / 미검증

- **실기(RDK-X5) 미검증**: rclpy 어댑터(`--source ros`), 실제 `/estop_request` 발행, arm64 바이너리 실행, 실제 토픽 형식(QoS, 이미지 인코딩) 전부.
- 현장 Leaf(site)는 떠 있었지만 아무 모듈도 올리지 않았고 child Tree 승격도 시험하지 않았다. wics-web은 Tree를 직접 본다.
- 서버 Linux amd64 / RDK arm64 노드를 포함한 3기계 시험은 하지 않았다. 지연 수치는 모두 한 PC 안의 loopback 값이다.
- Docker "버전은 Terra, pull/run은 얇은 모듈" 옵션: 이번 범위 밖, 구현 안 함. 현재 배포 단위는 `.tmod` 프로세스다.
- 권한·감사 미구현(계약에 `node.read`/`node.control`을 선언했을 뿐 거부 동작은 시험하지 않았다; 시험은 관리자 토큰으로만 했다).
- 오프라인 E-STOP 직결 경로는 인터페이스(`DirectEstop`)만 있다. 온보드 정지는 MCU 몫.
- 부하·장시간 시험, 브라우저 호환성(내장 브라우저 1종만) 없음. `start-stack.sh`는 수동으로 한 순서를 옮긴 것이고 스크립트로 다시 돌려 보지 않았다.
- E-STOP 요청 기록은 브리지 메모리(최근 20건)와 브라우저 탭에만 있다(영속 감사 없음).

## 6. 재현

```bash
C:\hanium\wics\tools\start-stack.sh        # master + 로봇 leaf + 현장 leaf + wics-web
C:\hanium\wics\tools\deploy-bridge.sh      # 빌드·시험·pack·설치·모듈 재시작 (이후 카탈로그 반영은 로봇 데몬 재시작)
# 브라우저: http://127.0.0.1:28900  (Master 계정으로 로그인)
C:\hanium\wics\tools\snap.sh               # 브리지 신선도 + Terra 카탈로그 상태 한 줄
C:\hanium\wics\tools\stop-stack.sh
```

모듈 설정은 모듈 데이터 디렉터리의 `config.json`(어댑터 목록, stage, ingest 포트). 실기에서는 `command`를 `python3 rdk_adapter.py --resource scan --source ros` 형태로 바꾼다.
