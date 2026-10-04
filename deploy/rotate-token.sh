#!/usr/bin/env bash
# Rotate the relay's operator token without cutting anything off.
#
#   knoot-rotate-token start [GRACE_HOURS]   new token now; the old one still
#                                            works for GRACE_HOURS (default 24)
#   knoot-rotate-token finish                stop accepting the old one
#   knoot-rotate-token status                is a rotation in progress
#
# What it does and does not touch. The operator token is the relay's original
# shared secret: it opens the built-in `root` identity and nothing else. Team
# and device keys are stored as hashes of themselves, not derived from it, so
# rotating it leaves every user's key working. Only something configured with
# the operator token itself — a laptop set up with `knoot login --token`, a
# script — has to move, and the grace period is for that: the relay logs each
# use of the old token, so `journalctl -u knoot-relay | grep previous` lists
# what has not moved yet.
#
# Installed as /usr/local/sbin/knoot-rotate-token by provision.sh. CI can run
# it through knoot-receive (the `rotate-token` workflow). The token is printed
# only to a terminal, never into a log.
set -euo pipefail

ENV_FILE=/etc/knoot/relay.env
FINISH_UNIT=knoot-token-rotation-finish
RELAY=http://127.0.0.1:7420

[[ $EUID -eq 0 ]] || { echo "knoot-rotate-token: run as root" >&2; exit 1; }

value() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -1; }

# Rewrite the env file with KEY set to VALUE (or removed when VALUE is empty),
# every other line kept, atomically and 0600 throughout.
set_var() {
	local key=$1 val=$2 tmp
	tmp=$(mktemp "$ENV_FILE.XXXXXX")
	chmod 0600 "$tmp"
	grep -v "^$key=" "$ENV_FILE" > "$tmp" || true
	if [[ -n $val ]]; then
		printf '%s=%s\n' "$key" "$val" >> "$tmp"
	fi
	mv "$tmp" "$ENV_FILE"
}

code() {  # HTTP status of an operator-only call, with an optional token
	if [[ -n ${1:-} ]]; then
		curl -s -o /dev/null -m 10 -w '%{http_code}' -H "Authorization: Bearer $1" "$RELAY/api/repos"
	else
		curl -s -o /dev/null -m 10 -w '%{http_code}' "$RELAY/api/repos"
	fi
}

restart_and_wait() {
	systemctl restart knoot-relay
	for _ in $(seq 1 30); do
		curl -s -m 2 "$RELAY/api/health" | grep -q '"status":"ok"' && return 0
		sleep 1
	done
	echo "the relay did not come back healthy" >&2
	return 1
}

show_token() {
	if [[ -t 1 ]]; then
		echo "   new operator token: $1"
	else
		echo "   new operator token: in $ENV_FILE (not printed: output is not a terminal)"
	fi
}

start() {
	local grace=${1:-24} old new backup
	[[ $grace =~ ^[0-9]+$ ]] && (( grace >= 1 && grace <= 720 )) \
		|| { echo "grace must be 1–720 hours, got '$grace'" >&2; exit 2; }
	[[ -z $(value KNOOT_RELAY_TOKEN_PREVIOUS) ]] \
		|| { echo "a rotation is already in its grace period — run 'knoot-rotate-token finish' first" >&2; exit 1; }
	old=$(value KNOOT_RELAY_TOKEN)
	[[ -n $old ]] || { echo "no KNOOT_RELAY_TOKEN in $ENV_FILE to rotate" >&2; exit 1; }

	backup=$(mktemp "$ENV_FILE.before-rotation.XXXXXX")
	cp -p "$ENV_FILE" "$backup"
	new=$(openssl rand -hex 24)
	set_var KNOOT_RELAY_TOKEN "$new"
	set_var KNOOT_RELAY_TOKEN_PREVIOUS "$old"

	if restart_and_wait && [[ $(code "$new") == 200 && $(code "$old") == 200 && $(code) == 401 ]]; then
		rm -f "$backup"
	else
		echo "the relay did not accept the new token as expected — putting the old file back" >&2
		mv "$backup" "$ENV_FILE"
		restart_and_wait || true
		exit 1
	fi

	# The old token stops working on its own when the grace period ends, even
	# if nobody remembers to come back.
	systemctl stop "$FINISH_UNIT.timer" 2>/dev/null || true
	systemctl reset-failed "$FINISH_UNIT.service" "$FINISH_UNIT.timer" 2>/dev/null || true
	systemd-run --quiet --unit="$FINISH_UNIT" --on-active="${grace}h" \
		--description="Finish the knoot operator token rotation" \
		/usr/local/sbin/knoot-rotate-token finish

	echo "rotated: the new token works, the old one works for ${grace}h more, untokened is refused"
	show_token "$new"
	echo "   the old one is dropped automatically at the end of the grace period (or now: knoot-rotate-token finish)"
	echo "   anything still using it shows up in: journalctl -u knoot-relay | grep 'previous operator token'"
}

finish() {
	local old new
	old=$(value KNOOT_RELAY_TOKEN_PREVIOUS)
	new=$(value KNOOT_RELAY_TOKEN)
	if [[ -z $old ]]; then
		echo "no rotation in progress"
		return 0
	fi
	set_var KNOOT_RELAY_TOKEN_PREVIOUS ""
	restart_and_wait
	systemctl stop "$FINISH_UNIT.timer" 2>/dev/null || true
	if [[ $(code "$old") == 401 && $(code "$new") == 200 ]]; then
		echo "rotation finished: the old token is refused, the new one works"
	else
		echo "rotation finish did not verify (old: $(code "$old"), new: $(code "$new"))" >&2
		exit 1
	fi
}

status() {
	if [[ -n $(value KNOOT_RELAY_TOKEN_PREVIOUS) ]]; then
		echo "rotation: in grace period — the old token is still accepted"
		systemctl list-timers "$FINISH_UNIT.timer" --no-pager --no-legend 2>/dev/null \
			| awk '{print "   old token dropped at: " $1, $2, $3}'
	else
		echo "rotation: none in progress"
	fi
}

case "${1:-status}" in
	start) start "${2:-24}" ;;
	finish) finish ;;
	status) status ;;
	*) echo "usage: knoot-rotate-token start [GRACE_HOURS] | finish | status" >&2; exit 2 ;;
esac
