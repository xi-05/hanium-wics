#!/usr/bin/env bash
# Private local 3-node stack (Tree/Master + robot Leaf + site Leaf) on ports 280xx-282xx, plus wics-web on 28900.
# Binaries come from "C:\Claude Dev\stack\bin" (Terra dev build, windows-amd64). Nothing in that folder is modified.
R=/c/hanium/wics; B="/c/Claude Dev/stack/bin"; mkdir -p $R/stack/logs
(cd $R/stack/master && nohup "$B/terra-master.exe" --config "C:/hanium/wics/stack/master/master.json" > $R/stack/logs/master.log 2>&1 &); sleep 4
for l in leaf-a leaf-b; do (nohup "$B/terra-daemon.exe" --config "C:/hanium/wics/stack/$l/config.json" > $R/stack/logs/$l.log 2>&1 &); done
NODE=$(python -c "import json;print(json.load(open('$R/stack/leaf-a/registration.json'))['node_id'])")
(cd $R/wics-web && ROBOT_NODE=$NODE nohup node server.mjs > $R/run/web.log 2>&1 &)
echo "master :28080  gateway :28788  robot-leaf :28101/:28201  site-leaf :28102/:28202  wics-web http://127.0.0.1:28900"
