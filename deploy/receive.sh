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
#   status   print the revision deployed and the binary's version
#   deploy   read a bundle on stdin and roll it out
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
ALLOWED='^(REVISION|knoot-x86_64-linux|knoot-x86_64-linux\.sha256|deploy/|deploy/(provision\.sh|receive\.sh|Caddyfile|knoot-relay\.service))$'

[[ $EUID -eq 0 ]] || { echo "knoot-receive: must run as root (through sudo)" >&2; exit 1; }
say() { printf '\n== %s\n' "$*"; }

status() {
	echo "revision: $(cat "$STATE/DEPLOYED_REVISION" 2>/dev/null || echo unknown)"
	echo "binary:   $(/usr/local/bin/knoot --version 2>/dev/null || echo missing)"
	echo "relay:    $(systemctl is-active knoot-relay)"
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
	install -d -m 0755 "$DEPLOY_DIR"
	install -m 0755 "$work/b/deploy/provision.sh" "$work/b/deploy/receive.sh" "$DEPLOY_DIR/"
	install -m 0644 "$work/b/deploy/Caddyfile" "$work/b/deploy/knoot-relay.service" "$DEPLOY_DIR/"

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

case "${SSH_ORIGINAL_COMMAND:-}" in
	status) status ;;
	deploy) deploy ;;
	*)
		echo "knoot-receive: expected 'status' or 'deploy', got '${SSH_ORIGINAL_COMMAND:-}'" >&2
		exit 2
		;;
esac
