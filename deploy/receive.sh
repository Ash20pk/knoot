#!/usr/bin/env bash
# The receiving end of a CI deploy, and the only thing the CI key can run.
#
# CI connects as `knoot-deploy`, whose authorized_keys entry forces
#
#   command="sudo /usr/local/sbin/knoot-receive",no-pty,no-port-forwarding,...
#
# so the key cannot open a shell, forward a port or run anything but this.
# What it asked for arrives in SSH_ORIGINAL_COMMAND, kept across sudo by
# /etc/sudoers.d/knoot-deploy:
#
#   status            print the revision deployed, the binary's version and
#                     whether an operator token rotation is in progress
#   deploy            read a bundle on stdin and roll it out
#   rotate-token [H]  rotate the operator token; the old one works H more
#                     hours (default 24). See deploy/rotate-token.sh.
#   finish-rotation   stop accepting the old operator token now
#
# The bundle is a gzipped tar of exactly these files, and nothing else:
#
#   REVISION                     the 40-character commit it was built from
#   knoot-x86_64-linux{,.sha256} the binary CI built, and its checksum
#   deploy/*                     provision.sh, Caddyfile, the unit, this file
#
# Deploy files travel with the binary on purpose. /root/deploy used to be a
# copy that changed only when someone remembered to copy it, so a re-run could
# reinstall an old Caddyfile beside a new binary.
set -euo pipefail

STATE=/var/lib/knoot
DEPLOY_DIR=/root/deploy
MAX_BYTES=$((64 * 1024 * 1024))
KEEP_SNAPSHOTS=5
# Any plain file name under deploy/ — letters, digits, dot, dash, underscore,
# not starting with a dot, no further slashes — so adding a deploy file does
# not need the receiver on the box updated by hand first. Nothing else.
ALLOWED='^(REVISION|knoot-x86_64-linux|knoot-x86_64-linux\.sha256|deploy/|deploy/[A-Za-z0-9][A-Za-z0-9._-]*)$'

[[ $EUID -eq 0 ]] || { echo "knoot-receive: must run as root (through sudo)" >&2; exit 1; }
say() { printf '\n== %s\n' "$*"; }

status() {
	echo "revision: $(cat "$STATE/DEPLOYED_REVISION" 2>/dev/null || echo unknown)"
	echo "binary:   $(/usr/local/bin/knoot --version 2>/dev/null || echo missing)"
	echo "relay:    $(systemctl is-active knoot-relay)"
	if [[ -x /usr/local/sbin/knoot-rotate-token ]]; then
		/usr/local/sbin/knoot-rotate-token status
	fi
}

deploy() {
	# One deploy at a time. CI serialises too; this holds if someone runs
	# provision.sh by hand at the same moment.
	exec 9>/run/knoot-deploy.lock
	flock -w 900 9 || { echo "another deploy is still running" >&2; exit 1; }

	work="$(mktemp -d /var/tmp/knoot-deploy.XXXXXX)"
	trap 'rm -rf "$work"' EXIT

	say "bundle"
	head -c "$((MAX_BYTES + 1))" > "$work/bundle.tgz"
	size=$(stat -c %s "$work/bundle.tgz")
	(( size > 0 && size <= MAX_BYTES )) || { echo "bundle is $size bytes; refusing" >&2; exit 1; }
	# Listed and checked before anything is extracted: a name outside the
	# allowlist — an absolute path, a `..`, a file we did not ask for — means
	# the bundle is not one of ours.
	while IFS= read -r name; do
		[[ $name =~ $ALLOWED ]] || { echo "unexpected entry in bundle: $name" >&2; exit 1; }
	done < <(tar -tzf "$work/bundle.tgz")
	mkdir "$work/b"
	tar -xzf "$work/bundle.tgz" -C "$work/b" --no-same-owner --no-same-permissions

	rev="$(tr -d '[:space:]' < "$work/b/REVISION")"
	[[ $rev =~ ^[0-9a-f]{40}$ ]] || { echo "REVISION is not a commit sha" >&2; exit 1; }
	# rotate-token.sh is optional: a rollback to a release older than it must
	# still deploy.
	for f in provision.sh receive.sh Caddyfile knoot-relay.service; do
		[[ -f "$work/b/deploy/$f" ]] || { echo "bundle is missing deploy/$f" >&2; exit 1; }
	done
	want="$(awk '{print $1}' "$work/b/knoot-x86_64-linux.sha256")"
	got="$(sha256sum "$work/b/knoot-x86_64-linux" | awk '{print $1}')"
	[[ $want == "$got" ]] || { echo "checksum mismatch: $got != $want" >&2; exit 1; }
	echo "   ${rev:0:7}, binary ${got:0:12}…, checksum ok"

	say "snapshot before deploy"
	if [[ -f $STATE/relay.db ]]; then
		snap="$STATE/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ)-${rev:0:7}.db"
		sqlite3 "$STATE/relay.db" ".backup '$snap'"
		[[ $(sqlite3 "$snap" 'PRAGMA integrity_check;') == ok ]] || { echo "snapshot failed its integrity check" >&2; exit 1; }
		chown knoot:knoot "$snap"
		echo "   $snap"
		ls -1t "$STATE"/pre-deploy-*.db 2>/dev/null | tail -n +$((KEEP_SNAPSHOTS + 1)) | xargs -r rm -f
	fi

	# What is running now, kept so a failed deploy can put it back whole:
	# binary and the deploy files it was provisioned with.
	cp -p /usr/local/bin/knoot "$work/rollback-knoot"
	rm -rf "$DEPLOY_DIR.prev"
	[[ -d $DEPLOY_DIR ]] && cp -a "$DEPLOY_DIR" "$DEPLOY_DIR.prev"
	# Replaced, not merged into: a file dropped from deploy/ must not live on
	# here, which is how the last relay's unit outlived its rename.
	rm -rf "${DEPLOY_DIR:?}"
	install -d -m 0755 "$DEPLOY_DIR"
	for f in "$work"/b/deploy/*; do
		[[ -f $f ]] || continue
		if [[ $f == *.sh ]]; then install -m 0755 "$f" "$DEPLOY_DIR/"; else install -m 0644 "$f" "$DEPLOY_DIR/"; fi
	done

	say "provision ${rev:0:7}"
	if SOURCE=file BINARY="$work/b/knoot-x86_64-linux" bash "$DEPLOY_DIR/provision.sh"; then
		echo "$rev" > "$STATE/DEPLOYED_REVISION"
		say "deployed ${rev:0:7}"
		status
		return 0
	fi

	say "deploy of ${rev:0:7} failed its checks — rolling back"
	if [[ -d $DEPLOY_DIR.prev ]]; then
		rm -rf "$DEPLOY_DIR"
		cp -a "$DEPLOY_DIR.prev" "$DEPLOY_DIR"
	fi
	if SOURCE=file BINARY="$work/rollback-knoot" bash "$DEPLOY_DIR/provision.sh"; then
		say "rolled back to $(cat "$STATE/DEPLOYED_REVISION" 2>/dev/null || echo 'the previous binary')"
	else
		say "ROLLBACK ALSO FAILED — the relay needs a person"
	fi
	status
	exit 1
}

# Matched whole, never split or evaluated: the only argument anywhere is a
# grace period, and it must be digits.
case "${SSH_ORIGINAL_COMMAND:-}" in
	status) status ;;
	deploy) deploy ;;
	rotate-token) /usr/local/sbin/knoot-rotate-token start 24 ;;
	"rotate-token "*)
		hours="${SSH_ORIGINAL_COMMAND#rotate-token }"
		[[ $hours =~ ^[0-9]{1,3}$ ]] || { echo "knoot-receive: grace must be whole hours" >&2; exit 2; }
		/usr/local/sbin/knoot-rotate-token start "$hours"
		;;
	finish-rotation) /usr/local/sbin/knoot-rotate-token finish ;;
	*)
		echo "knoot-receive: expected status, deploy, rotate-token [hours] or finish-rotation, got '${SSH_ORIGINAL_COMMAND:-}'" >&2
		exit 2
		;;
esac
