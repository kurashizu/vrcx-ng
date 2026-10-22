#!/bin/bash
# vrc-game-version: 9
# Start the desktop VRChat client on a saved login profile and report who it logged in as.
# usage: vrc-game <profile> [--keep] [--join <location>] [--fast] [--expect <usr_id>] [--aux]
#        vrc-game kill-main | kill-aux | alive-aux | clients
# profile 0 = default (no flag), N = --profile=N.
# Two clients can run side by side: the MAIN one (the player's, started through Steam) and the AUX one (a helper for
# temporary logins and relays: own wine prefix copy, no Steam app id, shown on the VNC display :10).
# stdout lines: "AUTH<TAB><usr_id><TAB><displayName><TAB>[steam]" (steam = signed in through Steam, not a saved login) | "NOLOGIN"
# (profile has no saved login: client left at the login screen with --keep, closed otherwise) | "FAILED". With --join, after AUTH
# one more line: "JOINED<TAB><room name>" | "LAUNCHED" (--fast) | "JOINFAIL" | "JOINTIMEOUT" | "WRONGUSER" (--expect: another account signed in).
# Exit 0 = AUTH, 3 = NOLOGIN, 1 = FAILED. On AUTH the client keeps running. Start-hang handling as vrc-testclient (restart after 25 s without "Master volume").
# kill-main / kill-aux: close that client (never the other one). alive-aux: prints ALIVE when it runs. clients: one line per running client "main|aux<TAB>profile<TAB>pid".
AUXROOT=$HOME/.local/share/vrc-aux
MAINDATA=$HOME/.local/share/Steam/steamapps/compatdata/438100
PROTON=$HOME/.local/share/Steam/compatibilitytools.d/GE-Proton11-11-x86_64/proton
GAME=$HOME/.local/share/Steam/steamapps/common/VRChat
LOGSUB=pfx/drive_c/users/steamuser/AppData/LocalLow/VRChat/VRChat

# which client a process belongs to: the wine prefix is in its environment (the aux one lives under vrc-aux)
owner() {
  local e; e=$(tr '\0' '\n' < /proc/$1/environ 2>/dev/null) || return 1
  if echo "$e" | grep -q '^\(STEAM_COMPAT_DATA_PATH\|WINEPREFIX\)=.*vrc-aux'; then echo aux
  elif echo "$e" | grep -q '^\(STEAM_COMPAT_DATA_PATH\|WINEPREFIX\)=.*compatdata/438100'; then echo main; fi
}
pids_of() { local p; for p in $(pgrep -f "$2"); do [ "$p" = $$ ] && continue; [ "$(owner $p)" = "$1" ] && echo $p; done; }
client_pids() { local p; for p in $(pgrep -x VRChat.exe); do [ "$(owner $p)" = "$1" ] && echo $p; done; }
profile_of() { tr '\0' ' ' < /proc/$1/cmdline | sed -n 's/.*--profile=\([0-9]*\).*/\1/p'; }

stop_aux() {
  local p
  for p in $(pids_of aux '[V]RChat.exe|[w]ineserver|[s]tart.exe|[p]roton runinprefix|[x]alia|[s]team.exe'); do kill -KILL $p 2>/dev/null; done
  WINEPREFIX=$AUXROOT/compatdata/pfx $(dirname $PROTON)/files/bin/wineserver -k 2>/dev/null
  sleep 2
}
stop_main() {
  local p
  for p in $(client_pids main); do kill -TERM $p; done
  for i in $(seq 1 30); do [ -z "$(client_pids main)" ] && ! pgrep -f '[A]ppId=438100' >/dev/null && break; sleep 2; done
  for p in $(client_pids main); do kill -KILL $p; done
  pkill -KILL -f '[A]ppId=438100'
  for p in $(pids_of main '[x]alia|[w]ineserver'); do kill -KILL $p 2>/dev/null; done
  sleep 9
}
case "$1" in
  kill-main) stop_main; exit 0 ;;
  kill-aux) stop_aux; exit 0 ;;
  alive-aux) [ -n "$(client_pids aux)" ] && echo ALIVE; exit 0 ;;
  clients) for w in main aux; do for p in $(client_pids $w); do printf '%s\t%s\t%s\n' $w "$(profile_of $p)" $p; done; done; exit 0 ;;
esac

N=${1:?profile}; shift; KEEP=; LOC=; FAST=; EXPECT=; AUX=
while [ $# -gt 0 ]; do case "$1" in --keep) KEEP=--keep ;; --join) LOC=$2; shift ;; --fast) FAST=1 ;; --expect) EXPECT=$2; shift ;; --aux) AUX=1 ;; esac; shift; done
if [ -n "$AUX" ]; then D=$AUXROOT/compatdata/$LOGSUB; else D=$MAINDATA/$LOGSUB; fi

stop() { if [ -n "$AUX" ]; then stop_aux; sleep 4; else stop_main; fi; }
log() { ls -t "$D"/output_log_*.txt 2>/dev/null | head -1; }

# the aux client: a copy of the main wine prefix (saved logins come along; the 30 GB asset cache does not), no Steam app id
# so Steam does not see a second VRChat, drawn on the VNC display
prepare_aux() {
  mkdir -p $AUXROOT
  if [ ! -d $AUXROOT/compatdata/pfx ]; then
    rsync -a --exclude Cache-WindowsPlayer --exclude pfx.lock $MAINDATA/ $AUXROOT/compatdata/ || return 1
    mkdir -p $AUXROOT/compatdata/$LOGSUB/Cache-WindowsPlayer
  fi
  cat > $AUXROOT/launch <<LAUNCH
#!/bin/bash
unset SteamAppId SteamGameId STEAM_COMPAT_APP_ID
export STEAM_COMPAT_CLIENT_INSTALL_PATH=$HOME/.local/share/Steam
export STEAM_COMPAT_DATA_PATH=$AUXROOT/compatdata
export DISPLAY=:10 XDG_RUNTIME_DIR=/run/user/\$(id -u) PROTON_USE_XALIA=0
cd $GAME
exec $PROTON run ./launch.exe "\$@"
LAUNCH
  chmod +x $AUXROOT/launch
}

ARGS=(--no-vr); [ "$N" != 0 ] && ARGS+=("--profile=$N")
# the client wants the raw location in the launch URL (percent-encoding sends it to the Error World)
[ -n "$LOC" ] && ARGS+=("vrchat://launch?ref=vrchat.com&id=$LOC")
[ -n "$AUX" ] && { prepare_aux || { echo FAILED; exit 1; }; }
stop
for t in 1 2 3; do
  if [ -n "$AUX" ]; then setsid nohup $AUXROOT/launch "${ARGS[@]}" >/dev/null 2>&1 < /dev/null &
  else DISPLAY=:0 nohup steam -applaunch 438100 "${ARGS[@]}" >/dev/null 2>&1 & fi
  start=$(date +%s); L=""; vol=0
  for i in $(seq 1 60); do
    sleep 2; X=$(log)
    [ -n "$X" ] && [ "$(stat -c %Y "$X")" -ge "$start" ] && L=$X
    if [ -n "$L" ] && grep -q 'User Authenticated:' "$L"; then
      # "steam": no saved login on this profile, the client signed in with the Steam account instead (the caller decides if that is who it wants)
      VIA=; grep -qE 'Trying to login with steam|Authenticated via steam' "$L" && VIA=steam
      line=$(grep 'User Authenticated:' "$L" | tail -1 | tr -d '\r' | sed 's/.*User Authenticated: //')
      id=$(echo "$line" | sed -E 's/.*\((usr_[^)]*)\)$/\1/'); name=$(echo "$line" | sed -E 's/ \(usr_[^)]*\)$//')
      printf 'AUTH\t%s\t%s\t%s\n' "$id" "$name" "$VIA"
      [ -z "$LOC" ] && exit 0
      # another account than expected signed in (the saved login changed): never join the instance as the wrong one
      [ -n "$EXPECT" ] && [ "$id" != "$EXPECT" ] && { echo WRONGUSER; exit 0; }
      WID=${LOC%%:*}
      for j in $(seq 1 60); do
        sleep 2
        grep -q 'Joining local:error' "$L" && { echo JOINFAIL; exit 0; }
        # --fast: the caller only needs the client launched into the instance (it checks the rest through the API)
        if grep -q "Joining $WID" "$L"; then
          [ -n "$FAST" ] && { echo LAUNCHED; exit 0; }
          sleep 2; printf 'JOINED\t%s\n' "$(grep 'Entering Room:' "$L" | tail -1 | tr -d '\r' | sed 's/.*Entering Room: //')"; exit 0
        fi
        # the client froze or crashed (SuspendThread loop failed): the log stops growing, start over
        [ $(( $(date +%s) - $(stat -c %Y "$L") )) -gt 25 ] && break 2
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
