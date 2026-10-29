#!/usr/bin/env python3
"""Per-sensor adapter: one OS process per resource, posts to the rdk-bridge ingest port.

  --source mock : synthetic ROS-shaped data (used for verification without a robot)
  --source ros  : real rclpy subscription (RDK-X5, ROS 2 Humble)  ** NOT VERIFIED ON HARDWARE **

Wire format to the bridge (see docs/01-ros2-terra-boundary.md):
  JSON resources  -> body is JSON with "sequence" and "stamp":{"sec","nanosec"}
  image/depth     -> 9093 packet: uint32 LE header length + UTF-8 JSON header + pixels
The adapter owns `sequence` (counted per run) and copies the ROS header stamp when
there is one; it never fabricates progress: a frozen source keeps its old stamp.
"""
import argparse, base64, json, math, os, struct, sys, time, urllib.request, urllib.error

INGEST = os.environ.get("RDK_BRIDGE_INGEST", "http://127.0.0.1:19400")
TOKEN = os.environ.get("RDK_BRIDGE_TOKEN", "")
NAME = os.environ.get("RDK_ADAPTER_NAME", "")


_last_ok = time.monotonic()
ORPHAN_AFTER_S = float(os.environ.get("RDK_ADAPTER_ORPHAN_S", "30"))


def post(path, body, ctype="application/json"):
    """POST to the bridge. If the bridge has not accepted anything for ORPHAN_AFTER_S the
    adapter exits: its parent died (a killed parent does not take children with it on
    Windows) and a restarted bridge will spawn a fresh adapter with a new token."""
    global _last_ok
    if time.monotonic() - _last_ok > ORPHAN_AFTER_S:
        print(f"[{NAME}] bridge unreachable for {ORPHAN_AFTER_S}s, exiting", file=sys.stderr, flush=True)
        os._exit(4)
    req = urllib.request.Request(INGEST + path, data=body, method="POST",
                                 headers={"Content-Type": ctype, "X-Rdk-Token": TOKEN, "X-Rdk-Adapter": NAME})
    try:
        with urllib.request.urlopen(req, timeout=3) as r:
            _last_ok = time.monotonic()
            return r.status
    except (urllib.error.URLError, OSError) as e:
        print(f"[{NAME}] post {path} failed: {e}", file=sys.stderr, flush=True)
        return None


def now_stamp():
    t = time.time()
    return {"sec": int(t), "nanosec": int((t % 1) * 1e9)}


def packet(header, pixels):
    h = json.dumps(header, separators=(",", ":")).encode()
    return struct.pack("<I", len(h)) + h + pixels


# ---------------------------------------------------------------- mock world
ROOM = 3.0  # half-size of a square room (m)


def robot_pose(t):
    r = 1.2
    w = 0.25
    return r * math.cos(w * t), r * math.sin(w * t), (w * t + math.pi / 2) % (2 * math.pi)


def raycast(x, y, a):
    best = 1e9
    c, s = math.cos(a), math.sin(a)
    for wall, d, comp in ((ROOM, c, x), (-ROOM, c, x), (ROOM, s, y), (-ROOM, s, y)):
        if abs(d) > 1e-9:
            k = (wall - comp) / d
            if k > 0:
                best = min(best, k)
    return best


def mock_scan(seq, t):
    x, y, yaw = robot_pose(t)
    rs = []
    for i in range(360):
        d = raycast(x, y, yaw + math.radians(i))
        d += 0.01 * math.sin(i * 7 + t)
        rs.append(None if i % 97 == 0 else round(d, 3))  # a few invalid returns -> null
    return {"sequence": seq, "stamp": now_stamp(), "frame_id": "laser_frame", "angle_min": 0.0,
            "angle_max": 2 * math.pi, "angle_increment": math.radians(1), "range_min": 0.15, "range_max": 12.0, "ranges": rs}


MAP_N = 140
RES = 0.05


def mock_map(seq, t):
    """Occupancy grid (int8, 255 == -1 unknown) discovered progressively while the robot circles."""
    n, grid = MAP_N, bytearray()
    ox = -n * RES / 2
    cover = min(1.0, t / 40.0)
    reach = 0.4 + cover * 4.5
    for j in range(n):
        for i in range(n):
            wx, wy = ox + (i + .5) * RES, ox + (j + .5) * RES
            wall = abs(abs(wx) - ROOM) < RES or abs(abs(wy) - ROOM) < RES
            known = math.hypot(wx, wy) < reach
            grid.append(255 if not known else (100 if wall else 0))
    return {"sequence": seq, "stamp": now_stamp(), "frame_id": "map", "width": n, "height": n, "resolution": RES,
            "origin": {"x": ox, "y": ox}, "encoding": "int8-b64", "data": base64.b64encode(bytes(grid)).decode()}


def mock_pose(seq, t):
    x, y, yaw = robot_pose(t)
    return {"sequence": seq, "stamp": now_stamp(), "frame_id": "map", "x": round(x, 4), "y": round(y, 4),
            "yaw": round(yaw, 4), "cov": [0.01, 0.01, 0.02]}


def mock_imu(seq, t):
    return {"sequence": seq, "stamp": now_stamp(),
            "orientation": {"roll": 0.01 * math.sin(t), "pitch": 0.02 * math.cos(t), "yaw": robot_pose(t)[2]},
            "angular_velocity": {"x": 0.0, "y": 0.0, "z": 0.25}, "linear_acceleration": {"x": 0.0, "y": 0.3, "z": 9.81}}


def mock_status(seq, t):
    return {"sequence": seq, "stamp": now_stamp(), "mode": "explore", "controller": "ok",
            "battery_pct": max(5, round(100 - t / 60, 1))}


W, H = 640, 352


def mock_image(seq, t):
    row = bytes(((x + int(t * 40)) & 255) for x in range(W))
    y_plane = b"".join(row if (r // 16) % 2 == 0 else row[::-1] for r in range(H))
    uv = bytes([128, 128]) * (W * H // 4)
    hdr = {"topic": "/image_left_raw", "sequence": seq, "width": W, "height": H, "encoding": "nv12", "is_bigendian": 0,
           "step": W, "frame_id": "camera_left", "stamp": now_stamp(), "source_hz": 10.0}
    return packet(hdr, y_plane + uv)


def mock_depth(seq, t):
    row = struct.pack("<%dH" % W, *[1000 + (x * 5 + int(t * 100)) % 3000 for x in range(W)])
    hdr = {"topic": "/StereoNetNode/stereonet_depth", "sequence": seq, "width": W, "height": H, "encoding": "mono16",
           "is_bigendian": 0, "step": W * 2, "frame_id": "camera_left", "stamp": now_stamp(), "source_hz": 10.0}
    return packet(hdr, row * H)


RATES = {"scan": 5, "map": 0.5, "pose": 5, "imu": 5, "status": 1, "image_left": 2, "depth": 2}


def run_mock(a):
    born = time.time()
    seq = 0
    frozen = None
    last = None
    while True:
        t = time.time() - born
        if a.die_after and t > a.die_after:
            print(f"[{NAME}] mock death after {a.die_after}s", file=sys.stderr, flush=True)
            os._exit(3)
        seq += 1
        if a.freeze_after and t > a.freeze_after and last is not None:
            # a hung / republishing source: same sequence+stamp forever (the topic "exists", nothing is new)
            frozen = frozen or last
            body, ctype = frozen
        else:
            r = a.resource
            if r == "scan": body = json.dumps(mock_scan(seq, t)).encode()
            elif r == "map": body = json.dumps(mock_map(seq, t)).encode()
            elif r == "pose": body = json.dumps(mock_pose(seq, t)).encode()
            elif r == "imu": body = json.dumps(mock_imu(seq, t)).encode()
            elif r == "status": body = json.dumps(mock_status(seq, t)).encode()
            elif r == "image_left": body = mock_image(seq, t)
            elif r == "depth": body = mock_depth(seq, t)
            else: sys.exit("unknown resource " + r)
            ctype = "application/octet-stream" if r in ("image_left", "depth") else "application/json"
            last = (body, ctype)
        post("/ingest/" + a.resource, body, ctype)
        time.sleep(1.0 / (a.rate or RATES[a.resource]))


# ------------------------------------------------------------- estop adapter
def run_estop(a):
    """Long-polls the bridge for stop requests and forwards them to the controller.
    mock: logs + acks.   ros: publishes std_msgs/Bool on /estop_request (QoS Reliable)."""
    global _last_ok
    publish = None
    if a.source == "ros":
        import rclpy
        from rclpy.qos import QoSProfile, ReliabilityPolicy, DurabilityPolicy
        from std_msgs.msg import Bool
        rclpy.init()
        node = rclpy.create_node("rdk_estop_adapter")
        pub = node.create_publisher(Bool, "/estop_request", QoSProfile(
            depth=10, reliability=ReliabilityPolicy.RELIABLE, durability=DurabilityPolicy.TRANSIENT_LOCAL))

        def publish(req):
            msg = Bool()
            msg.data = True
            pub.publish(msg)
            return True, "published /estop_request"
    after = 0
    while True:
        try:
            q = urllib.request.Request(INGEST + f"/cmd/estop/wait?after={after}&timeout=20", headers={"X-Rdk-Token": TOKEN})
            with urllib.request.urlopen(q, timeout=30) as r:
                _last_ok = time.monotonic()
                if r.status == 204:
                    continue
                req = json.loads(r.read())
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            print(f"[{NAME}] estop poll: {e}", file=sys.stderr, flush=True)
            if time.monotonic() - _last_ok > ORPHAN_AFTER_S:
                os._exit(4)
            time.sleep(1)
            continue
        after = req["seq"]
        ok, detail = publish(req) if publish else (True, "mock controller received stop (not a real robot)")
        print(f"[{NAME}] STOP seq={req['seq']} reason={req.get('reason')} -> {detail}", flush=True)
        post("/cmd/estop/ack", json.dumps({"seq": req["seq"], "ok": ok, "detail": detail}).encode())


# ---------------------------------------------------------------- real ROS 2
def run_ros(a):  # requires a ROS 2 Humble environment; NOT VERIFIED ON HARDWARE
    import rclpy
    from rclpy.node import Node
    from rclpy.qos import qos_profile_sensor_data
    r = a.resource
    rclpy.init()
    node = Node(f"rdk_adapter_{r}")
    state = {"seq": 0, "last": 0.0}
    cap = 1.0 / RATES[r]

    def stamp_of(h):
        return {"sec": int(h.stamp.sec), "nanosec": int(h.stamp.nanosec)}

    def gate():
        n = time.monotonic()
        if n - state["last"] < cap:
            return False
        state["last"] = n
        return True

    if r == "scan":
        from sensor_msgs.msg import LaserScan

        def cb(m):
            if not gate():
                return
            state["seq"] += 1
            rs = [None if (not math.isfinite(v)) else round(v, 3) for v in m.ranges]
            post("/ingest/scan", json.dumps({
                "sequence": state["seq"], "stamp": stamp_of(m.header), "frame_id": m.header.frame_id,
                "angle_min": m.angle_min, "angle_max": m.angle_max, "angle_increment": m.angle_increment,
                "range_min": m.range_min, "range_max": m.range_max, "ranges": rs}).encode())
        node.create_subscription(LaserScan, "/scan", cb, qos_profile_sensor_data)
    elif r == "map":
        from nav_msgs.msg import OccupancyGrid
        from rclpy.qos import QoSProfile, DurabilityPolicy, ReliabilityPolicy

        def cb(m):
            if not gate():
                return
            state["seq"] += 1
            raw = bytes((v & 0xFF) for v in m.data)
            post("/ingest/map", json.dumps({
                "sequence": state["seq"], "stamp": stamp_of(m.header), "frame_id": m.header.frame_id,
                "width": m.info.width, "height": m.info.height, "resolution": m.info.resolution,
                "origin": {"x": m.info.origin.position.x, "y": m.info.origin.position.y},
                "encoding": "int8-b64", "data": base64.b64encode(raw).decode()}).encode())
        node.create_subscription(OccupancyGrid, "/map", cb, QoSProfile(
            depth=1, reliability=ReliabilityPolicy.RELIABLE, durability=DurabilityPolicy.TRANSIENT_LOCAL))
    elif r == "pose":
        from geometry_msgs.msg import PoseWithCovarianceStamped

        def cb(m):
            if not gate():
                return
            state["seq"] += 1
            p, q = m.pose.pose.position, m.pose.pose.orientation
            yaw = math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))
            c = m.pose.covariance
            post("/ingest/pose", json.dumps({
                "sequence": state["seq"], "stamp": stamp_of(m.header), "frame_id": m.header.frame_id,
                "x": p.x, "y": p.y, "yaw": yaw, "cov": [c[0], c[7], c[35]]}).encode())
        node.create_subscription(PoseWithCovarianceStamped, "/pose", cb, 10)
    elif r == "imu":
        from sensor_msgs.msg import Imu

        def cb(m):
            if not gate():
                return
            state["seq"] += 1
            q = m.orientation
            roll = math.atan2(2 * (q.w * q.x + q.y * q.z), 1 - 2 * (q.x * q.x + q.y * q.y))
            pitch = math.asin(max(-1, min(1, 2 * (q.w * q.y - q.z * q.x))))
            yaw = math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))
            post("/ingest/imu", json.dumps({
                "sequence": state["seq"], "stamp": stamp_of(m.header),
                "orientation": {"roll": roll, "pitch": pitch, "yaw": yaw},
                "angular_velocity": {"x": m.angular_velocity.x, "y": m.angular_velocity.y, "z": m.angular_velocity.z},
                "linear_acceleration": {"x": m.linear_acceleration.x, "y": m.linear_acceleration.y,
                                        "z": m.linear_acceleration.z}}).encode())
        node.create_subscription(Imu, "/imu/left/data_calibrated", cb, qos_profile_sensor_data)
    elif r in ("image_left", "depth"):
        from sensor_msgs.msg import Image
        topic = "/image_left_raw" if r == "image_left" else "/StereoNetNode/stereonet_depth"

        def cb(m):
            if not gate():
                return
            state["seq"] += 1
            hdr = {"topic": topic, "sequence": state["seq"], "width": m.width, "height": m.height,
                   "encoding": m.encoding, "is_bigendian": int(m.is_bigendian), "step": m.step,
                   "frame_id": m.header.frame_id, "stamp": stamp_of(m.header), "source_hz": 0.0}
            post("/ingest/" + r, packet(hdr, bytes(m.data)), "application/octet-stream")
        node.create_subscription(Image, topic, cb, qos_profile_sensor_data)
    else:
        sys.exit("no ros source for " + r)
    rclpy.spin(node)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--resource", required=True, help="scan|map|pose|imu|status|image_left|depth|estop")
    ap.add_argument("--source", default="mock", choices=["mock", "ros"])
    ap.add_argument("--rate", type=float, default=0)
    ap.add_argument("--die-after", type=float, default=0, help="mock: exit(3) after N s (adapter crash test)")
    ap.add_argument("--freeze-after", type=float, default=0, help="mock: repeat the last message forever after N s (hung publisher test)")
    args = ap.parse_args()
    NAME = NAME or args.resource
    if args.resource == "estop":
        run_estop(args)
    elif args.source == "ros":
        run_ros(args)
    else:
        run_mock(args)
