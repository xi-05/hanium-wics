#!/usr/bin/env bash
# One line: bridge freshness (via robot leaf gateway) + Terra catalog status (via Master) for the sensor resources.
R=/c/hanium/wics; TOK=$(cat $R/run/master.token); NODE=${NODE:-node_1791685981913_54fd10b1ddd0c7c5}
s=$(curl -s -H "Authorization: Bearer $TOK" http://127.0.0.1:28201/api/modules/lab.hanium.rdk-bridge/v1/status | python -c "
import sys,json;d=json.load(sys.stdin);print(d['mode'],' '.join(f'{k}={v[\"state\"]}' for k,v in d['resources'].items()))")
c=$(curl -s -H "Authorization: Bearer $TOK" "http://127.0.0.1:28080/api/v1/svi/resources?node_id=$NODE" | python -c "
import sys,json;print(' '.join(r['resource_id'].split('.')[-1]+'='+r['status'] for r in json.load(sys.stdin)['data']['items'] if r['kind'] in ('ros.depth','ros.image')))")
echo "[$(date +%T)] bridge: $s | catalog: $c"
