#!/bin/sh
# Install knoot from a GitHub release.
#
#   curl -fsSL https://raw.githubusercontent.com/Ash20pk/knoot/main/install.sh | sh
#
# KNOOT_VERSION   a release tag such as v0.1.0, or `nightly` (default: latest)
# KNOOT_INSTALL   where the binary goes (default: ~/.local/bin)
#
# The checksum published beside each binary is verified before anything is
# moved into place, so a failed or tampered download leaves nothing behind.
set -eu

REPO="Ash20pk/knoot"
VERSION="${KNOOT_VERSION:-latest}"
DEST="${KNOOT_INSTALL:-$HOME/.local/bin}"

die() { echo "knoot install: $*" >&2; exit 1; }

case "$(uname -s)/$(uname -m)" in
  Linux/x86_64 | Linux/amd64) artifact=knoot-x86_64-linux ;;
  Darwin/arm64)               artifact=knoot-aarch64-macos ;;
  Darwin/x86_64)              artifact=knoot-x86_64-macos ;;
  *) die "no prebuilt binary for $(uname -s) $(uname -m); build from source with: cargo install --git https://github.com/$REPO" ;;
esac

if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL "$1" -o "$2"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -qO "$2" "$1"; }
else
  die "needs curl or wget"
fi

if command -v sha256sum >/dev/null 2>&1; then
  sha() { sha256sum "$1" | cut -d' ' -f1; }
elif command -v shasum >/dev/null 2>&1; then
  sha() { shasum -a 256 "$1" | cut -d' ' -f1; }
else
  die "needs sha256sum or shasum to verify the download"
fi

if [ "$VERSION" = latest ]; then
  base="https://github.com/$REPO/releases/latest/download"
else
  base="https://github.com/$REPO/releases/download/$VERSION"
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

echo "downloading $artifact ($VERSION)"
fetch "$base/$artifact" "$tmp/knoot" || die "download failed: $base/$artifact"
fetch "$base/$artifact.sha256" "$tmp/knoot.sha256" || die "checksum download failed"

want=$(cut -d' ' -f1 "$tmp/knoot.sha256")
got=$(sha "$tmp/knoot")
[ "$want" = "$got" ] || die "checksum mismatch: expected $want, got $got"

mkdir -p "$DEST"
chmod 0755 "$tmp/knoot"
mv "$tmp/knoot" "$DEST/knoot"
echo "installed $("$DEST/knoot" --version) to $DEST/knoot"

case ":$PATH:" in
  *":$DEST:"*) ;;
  *) echo "note: $DEST is not on PATH. Agent hooks call \`knoot\` by name, so add it:"
     echo "  export PATH=\"$DEST:\$PATH\"" ;;
esac

echo "next: run \`knoot daemon\`, then \`knoot init\` inside a repository."
