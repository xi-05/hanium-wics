# 설계 메모 — 이번에 구현하지 않은 것

## 권한 (FR-USR, NFR-01/02)
- 계약에 권한 두 개를 선언했다: `node.read`(상태·센서 조회), `node.control`(E-STOP). Gateway가 호출자 권한을 판정한다.
- 예정: Admin/Operator/Viewer를 Terra 권한에 대응 — Viewer=`node.read`, Operator·Admin=`node.read`+`node.control`. E-STOP은 Operator 이상.
- wics-web의 버튼 숨김은 편의일 뿐이다. 서버(Gateway/모듈)가 거부해야 한다(NFR-02). 거부 동작은 아직 시험하지 않았다.
- 모듈은 `X-Terra-Subject`(호출 주체)를 받는다. E-STOP 요청에 이미 기록한다(`requester`).

## 감사 (NFR-04, FR-142)
- 지금 있는 것: 브리지 메모리의 E-STOP 요청 20건(seq, 시각, 전달 여부).
- 예정: E-STOP은 `security.audit.required=true`로 계약을 바꿔 Terra 감사 체인에 남긴다. 기록 항목: 주체, 사유, seq, 전달/미전달, 어댑터 ack 지연. 로봇 오프라인 중 대기열에 들어간 요청은 전달 시점을 별도 기록.

## E-STOP 3층
1. 정상: 서버→현장→Daemon→rdk-bridge→컨트롤러 어댑터(`/estop_request`, Reliable). 구현함. 반환값 `delivered`는 "어댑터가 받았다"이지 "정지했다"가 아니다.
2. 오프라인 직결: `DirectEstop` 인터페이스(`estop_direct.go`)만. 요건: 수신 확인까지 기다림, 멱등, Terra 비의존.
3. 온보드: MCU. 링크 단절은 정지를 유발하지도 막지도 않는다.
- 주의: 대기열에 쌓인 요청(`queued:true`)은 어댑터 재접속 시 전달된다. 정지 방향이라 안전하지만, 해제(resume)는 이 경로에 없다.

## Terra에 요청할 것 (이번 측정 근거)
1. 모듈이 SVI source를 제공하는 경로(프레임 푸시). 있으면 데이터도 이벤트/스트림으로 가고 wics-web 폴링이 사라진다.
2. relay의 바이너리 본문 지원 또는 명시적 오류(지금은 15초 타임아웃으로 조용히 실패).
3. 모듈 시작 직후 Master 카탈로그 즉시 반영.
4. 대안(미구현): 데몬 `net` source 선언 + 울타리 설정으로 어댑터 TCP를 SVI 자원(`net.*`)으로 올리면 handle 스트림이 relay를 탄다.

## 다음 단계 후보
- 실기: rclpy 어댑터를 RDK에서 돌려 토픽 형식·QoS 확인, `/estop_request` 수신 핸들러(로봇 컨트롤러 쪽) 연결.
- `Pdeathsig`/Job Object로 자식 어댑터 수명 묶기. 어댑터 TCP keep-alive(지금은 요청마다 연결).
- Docker 옵션(버전은 Terra, pull/run은 얇은 모듈).
- 현장 Leaf를 child Tree로 올리고 wics-web이 현장 경유로 보는 구성.
