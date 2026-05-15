#!/usr/bin/env bash
set -euo pipefail

BOX_NAME="${SLOPBOX_DISTROBOX_NAME:-slopbox-typescript-node}"
IMAGE="${SLOPBOX_DISTROBOX_IMAGE:-ubuntu:24.04}"
AUDIO_PACKAGES="libpulse0 libasound2-plugins pulseaudio-utils"
PACKAGES="${SLOPBOX_DISTROBOX_PACKAGES:-bash ca-certificates git nodejs npm python3 make g++ zip unzip libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgtk-3-0 libgbm1 libasound2t64 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libpango-1.0-0 libcairo2 $AUDIO_PACKAGES}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DISTROBOX=(env -u LD_LIBRARY_PATH -u LD_PRELOAD distrobox)

if ! command -v distrobox >/dev/null 2>&1; then
	printf 'distrobox not found. Install distrobox plus podman or docker on host.\n' >&2
	exit 127
fi

quote_args() {
	local out=''
	local arg

	for arg in "$@"; do
		printf -v arg '%q' "$arg"
		out+=" ${arg}"
	done

	printf '%s' "$out"
}

run_node_command() {
	local node_args

	node_args="$(quote_args "$@")"
	printf 'cd %q && node%s' "$REPO_ROOT" "$node_args"
}

if ! "${DISTROBOX[@]}" list --no-color | awk '{print $3}' | grep -Fx "$BOX_NAME" >/dev/null 2>&1; then
	"${DISTROBOX[@]}" create \
		--yes \
		--name "$BOX_NAME" \
		--image "$IMAGE" \
		--additional-packages "$PACKAGES"
fi

"${DISTROBOX[@]}" enter --name "$BOX_NAME" -- bash -lc "$(run_node_command "$@")"
