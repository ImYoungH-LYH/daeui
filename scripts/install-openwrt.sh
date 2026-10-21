#!/bin/sh
# Install dae + DaeUI (+ vmlinux-btf when the kernel lacks BTF) on OpenWrt 25.12 x86_64.
#
#   sh install-openwrt.sh                 (DAEUI_REPO=owner/repo to use a fork)
#
# Optional: DAEUI_TAG=v0.1.0 (default: latest release), GH_PROXY=https://ghfast.top/ (download mirror prefix).
set -eu

REPO="${DAEUI_REPO:-ImYoungH-LYH/daeui}"
TAG="${DAEUI_TAG:-latest}"
PROXY="${GH_PROXY:-}"
WORK=/tmp/daeui-install

die() { echo "ERROR: $*" >&2; exit 1; }

[ -n "$REPO" ] || die "set DAEUI_REPO=owner/repo (the GitHub repository that publishes the packages)"
[ -f /etc/openwrt_release ] || die "this is not OpenWrt"
. /etc/openwrt_release
case "${DISTRIB_RELEASE:-}" in
	25.12.*) ;;
	*) die "only OpenWrt 25.12 is supported (found ${DISTRIB_RELEASE:-unknown})" ;;
esac
[ "${DISTRIB_ARCH:-}" = x86_64 ] || die "only x86_64 is supported for now (found ${DISTRIB_ARCH:-unknown})"
command -v apk >/dev/null || die "apk not found"

KVER="$(uname -r)"
if [ "$TAG" = latest ]; then
	BASE="${PROXY}https://github.com/${REPO}/releases/latest/download"
else
	BASE="${PROXY}https://github.com/${REPO}/releases/download/${TAG}"
fi

rm -rf "$WORK"
mkdir -p "$WORK"
fetch() {
	echo "Downloading $1"
	wget -q -O "$WORK/$1" "$BASE/$1" || { rm -f "$WORK/$1"; return 1; }
}

fetch dae-x86_64.apk || die "cannot download dae-x86_64.apk from $BASE"
fetch daeui-x86_64.apk || die "cannot download daeui-x86_64.apk from $BASE"
PKGS="$WORK/dae-x86_64.apk $WORK/daeui-x86_64.apk"

if [ -e /sys/kernel/btf/vmlinux ]; then
	echo "Kernel has built-in BTF; vmlinux-btf not needed."
elif [ -e "/usr/lib/debug/boot/vmlinux-$KVER" ]; then
	echo "Detached BTF for $KVER already installed."
else
	BTF="vmlinux-btf-${KVER}-x86_64.apk"
	fetch "$BTF" || die "kernel $KVER has no BTF and $BTF is not published. Upgrade to a supported 25.12.x release or build vmlinux-btf for this kernel."
	PKGS="$PKGS $WORK/$BTF"
fi

echo "Updating package index..."
apk update || echo "WARN: apk update failed; dependency resolution may fail" >&2

echo "Installing..."
# The packages are signed by our build key, not OpenWrt's.
# shellcheck disable=SC2086
apk add --allow-untrusted $PKGS

/etc/init.d/daeui enable
/etc/init.d/daeui restart

LAN="$(uci -q get network.lan.ipaddr 2>/dev/null || echo '<router-ip>')"
LAN="${LAN%%/*}"
LISTEN="$(uci -q get daeui.main.listen 2>/dev/null || echo ':2027')"
echo
echo "Done. Open http://${LAN}:${LISTEN##*:} and set the panel password."
rm -rf "$WORK"
