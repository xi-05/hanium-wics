#!/usr/bin/env bash
for p in 28080 28101 28102 28900 28788 28201 28202 29400; do
  for pid in $(netstat -ano | grep ":$p .*LISTENING" | awk '{print $5}' | sort -u); do taskkill //F //PID $pid >/dev/null 2>&1; done
done
echo stopped
