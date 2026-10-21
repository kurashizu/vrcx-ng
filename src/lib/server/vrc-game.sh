#!/bin/bash
# vrc-game-version: 2
# Start the desktop VRChat client on a saved login profile and report who it logged in as.
# usage: vrc-game <profile> [--keep] [--join <location>]     profile 0 = default (no flag), N = --profile=N
# stdout lines: "AUTH<TAB><usr_id><TAB><displayName>" | "NOLOGIN" (profile has no saved login: client left at
# the login screen with --keep, closed otherwise) | "FAILED". With --join, after AUTH one more line:
# "JOINED<TAB><room name>" | "JOINFAIL" (client fell into the Error World) | "JOINTIMEOUT".
# Exit 0 = AUTH, 3 = NOLOGIN, 1 = FAILED. On AUTH the client keeps running. Same start-hang handling as vrc-testclient (restart after 25 s without "Master volume").
N=${1:?profile}; shift; KEEP=; LOC=
while [ $# -gt 0 ]; do case "$1" in --keep) KEEP=--keep ;; --join) LOC=$2; shift ;; esac; shift; done
D=$HOME/.local/share/Steam/steamapps/compatdata/438100/pfx/drive_c/users/steamuser/AppData/LocalLow/VRChat/VRChat
PAT='[V]RChat.exe|[A]ppId=438100|[x]alia|[w]ineserver|[s]team -applaunch'
stop() {
  pkill -TERM -x VRChat.exe
  for i in $(seq 1 30); do pgrep -f "$PAT" >/dev/null || break; sleep 2; done
  pgrep -f "$PAT" >/dev/null && { pkill -KILL -f '[V]RChat.exe|[x]alia|[w]ineserver'; sleep 3; }
  sleep 6
}
log() { ls -t "$D"/output_log_*.txt 2>/dev/null | head -1; }
ARGS=(--no-vr); [ "$N" != 0 ] && ARGS+=("--profile=$N")
# the client wants the raw location in the launch URL (percent-encoding sends it to the Error World)
[ -n "$LOC" ] && ARGS+=("vrchat://launch?ref=vrchat.com&id=$LOC")
stop
for t in 1 2 3; do
  DISPLAY=:0 nohup steam -applaunch 438100 "${ARGS[@]}" >/dev/null 2>&1 &
  start=$(date +%s); L=""; vol=0
  for i in $(seq 1 60); do
    sleep 2; X=$(log)
    [ -n "$X" ] && [ "$(stat -c %Y "$X")" -ge "$start" ] && L=$X
    if [ -n "$L" ] && grep -q 'User Authenticated:' "$L"; then
      line=$(grep 'User Authenticated:' "$L" | tail -1 | tr -d '\r' | sed 's/.*User Authenticated: //')
      id=$(echo "$line" | sed -E 's/.*\((usr_[^)]*)\)$/\1/'); name=$(echo "$line" | sed -E 's/ \(usr_[^)]*\)$//')
      printf 'AUTH\t%s\t%s\n' "$id" "$name"
      [ -z "$LOC" ] && exit 0
      WID=${LOC%%:*}
      for j in $(seq 1 60); do
        sleep 2
        grep -q 'Joining local:error' "$L" && { echo JOINFAIL; exit 0; }
        if grep -q "Joining $WID" "$L"; then
          sleep 2; printf 'JOINED\t%s\n' "$(grep 'Entering Room:' "$L" | tail -1 | tr -d '\r' | sed 's/.*Entering Room: //')"; exit 0
        fi
      done
      echo JOINTIMEOUT; exit 0
    fi
    [ -n "$L" ] && grep -qE 'Fatal error' "$L" && break
    if [ -n "$L" ] && grep -q 'Master volume' "$L"; then
      [ "$vol" = 0 ] && vol=$(date +%s)
      # started fine but no login after 30 s: this profile has no saved login (login screen)
      if [ $(( $(date +%s) - vol )) -gt 30 ]; then echo NOLOGIN; [ "$KEEP" = --keep ] || stop; exit 3; fi
    elif [ $(( $(date +%s) - start )) -gt 25 ]; then break; fi
  done
  stop
done
echo FAILED; exit 1
