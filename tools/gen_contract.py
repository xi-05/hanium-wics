"""Generates contracts/api/terra-api.json for lab.hanium.rdk-bridge from a compact table."""
import json, pathlib
MOD = "lab.hanium.rdk-bridge"
root = pathlib.Path(__file__).resolve().parents[1] / "modules/leaf" / MOD
path = root / "contracts/api/terra-api.json"
d = json.loads(path.read_text(encoding="utf8"))
base = d["operations"][MOD + ".status.get"]

def op(name, title, summary, method, route, perm, risk, out_schema, out_ex, in_schema=None, binary=False, stage=1):
    o = json.loads(json.dumps(base))
    o["title"], o["summary"] = title, summary
    o["description"] = summary + (" (2단계)" if stage == 2 else "")
    o["tags"] = ["ros", name]
    o["category"] = "ros"
    o["authoring"] = {"studioVisible": False, "functionNode": False, "group": "RDK", "recommendedLabel": title, "keywords": ["rdk", name]}
    o["bindings"] = [{"type": "gateway-http", "method": method, "path": f"/api/modules/{MOD}/v1/{route}", "successStatus": 200}]
    o["security"]["permissions"] = [perm]
    o["execution"]["risk"] = risk
    o["input"] = {"schema": in_schema or {"type": "object", "additionalProperties": False}, "examples": [{"name": "기본", "value": {}}]}
    o["output"] = {"mode": "immediate", "schema": out_schema, "examples": [{"name": "예", "value": out_ex}]}
    o["semantics"]["processing"] = [{"id": "read", "description": summary, "transaction": "none"}]
    o["errors"] = ["RDK_BRIDGE_UNAVAILABLE"]
    o["execution"]["timeoutMs"] = {"default": 3000, "maximum": 8000}
    o["authoring"]["outputPorts"] = []
    return o

ops = {}
obj = {"type": "object"}
ex = {"resource": "x", "state": "fresh"}
for n, title in [("status","상태"),("scan","LiDAR 스캔"),("map","지도"),("pose","위치"),("imu","IMU")]:
    ops[f"{MOD}.{n}.get"] = op(n, title, f"{title} 스냅샷과 신선도 판정을 반환합니다.", "GET", n, "node.read", "read", obj, ex)
for n, title in [("image-left","좌측 카메라"),("depth","깊이")]:
    ops[f"{MOD}.{n}.get"] = op(n, title, f"{title} 프레임을 9093 바이너리 패킷(uint32 LE 헤더길이 + JSON 헤더 + 픽셀) 그대로 반환합니다. 신선하지 않으면 503.", "GET", n, "node.read", "read",
        {"type": "object"}, {"packet_b64": "..."}, in_schema={"type": "object", "properties": {"format": {"type": "string", "enum": ["packet", "json"], "description": "packet: 9093 바이너리 그대로(로컬 Gateway). json: 같은 패킷을 packet_b64로 감싸 반환(Master relay는 바이너리 본문을 나르지 못한다)."}}, "additionalProperties": False}, binary=True, stage=2)
estop_in = {"type": "object", "properties": {"reason": {"type": "string", "maxLength": 200}}, "additionalProperties": False}
e = op("estop", "긴급 정지 요청", "정지 요청을 로봇 컨트롤러 어댑터로 전달하고 수신 확인(ack)을 반환합니다. 정지 실행은 MCU 몫입니다.", "POST", "estop", "node.control", "dangerous", obj,
       {"seq": 1, "delivered": True, "queued": False}, in_schema=estop_in)
e["execution"]["idempotency"] = {"mode": "safe"}
e["execution"]["retry"] = {"mode": "never", "maximumAttempts": 1}
e["execution"]["timeoutMs"] = {"default": 5000, "maximum": 8000}
ops[f"{MOD}.estop.post"] = e
for k, v in ops.items():
    v["version"] = "1.0.0"; v["status"] = "stable"
d["permissions"] = {"node.read": {"title": "노드 조회", "description": "센서 스냅샷과 상태를 읽습니다. 부수효과가 없습니다.", "risk": "read"}, "node.control": {"title": "노드 제어", "description": "긴급 정지 요청을 로봇 컨트롤러로 전달합니다.", "risk": "dangerous"}}
d["operations"] = ops
d["title"] = "RDK Bridge API"
d["summary"] = "탐사 로봇 ROS 2 센서를 Terra 리소스로 노출하고 E-STOP 요청을 전달합니다."
path.write_text(json.dumps(d, indent=2, ensure_ascii=False), encoding="utf8")
print(len(ops), "operations")
