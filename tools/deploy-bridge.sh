#!/usr/bin/env bash
# Rebuild rdk-bridge, pack it and (re)install it into the private robot Leaf (stack/leaf-a), then restart the module.
set -e
ROOT=/c/hanium/wics; M=$ROOT/modules/leaf/lab.hanium.rdk-bridge; T="/c/Claude Dev/stack/bin/terra.exe"
L=$ROOT/stack/leaf-a; TOK=$(cat $L/local_api.token); API=http://127.0.0.1:28101
(cd $M/src && go vet ./... && go test ./... >/dev/null && go build -o ../bin/windows-amd64/terra-rdk-bridge.exe . && GOOS=linux GOARCH=arm64 go build -o ../bin/linux-arm64/terra-rdk-bridge .)
rm -f $M/bin/windows-amd64/*~
"$T" contract validate $M >/dev/null
curl -s -X POST -H "Authorization: Bearer $TOK" $API/modules/lab.hanium.rdk-bridge/stop >/dev/null || true; sleep 3
"$T" module pack $M --out $ROOT/dist/rdk-bridge.tmod --target windows-amd64 --target linux-arm64 >/dev/null
"$T" module install $ROOT/dist/rdk-bridge.tmod --root C:/hanium/wics/stack/leaf-a/modules --state-root C:/hanium/wics/stack/leaf-a/module-state --dev --force >/dev/null
curl -s -X POST -H "Authorization: Bearer $TOK" $API/modules/scan >/dev/null
curl -s -X POST -H "Authorization: Bearer $TOK" $API/modules/lab.hanium.rdk-bridge/start >/dev/null
echo deployed
