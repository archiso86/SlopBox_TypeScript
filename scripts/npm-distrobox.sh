#!/usr/bin/env bash
set -euo pipefail

BOX_NAME="${SLOPBOX_DISTROBOX_NAME:-slopbox-typescript-node}"
IMAGE="${SLOPBOX_DISTROBOX_IMAGE:-ubuntu:24.04}"
PACKAGES="${SLOPBOX_DISTROBOX_PACKAGES:-bash ca-certificates git nodejs npm python3 make g++ zip unzip}"
MODE="${SLOPBOX_DISTROBOX_MODE:-persistent}"
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

run_npm_command() {
	local npm_args

	npm_args="$(quote_args "$@")"
	printf 'cd %q && npm%s' "$REPO_ROOT" "$npm_args"
}

case "$MODE" in
	persistent)
		if ! "${DISTROBOX[@]}" list --no-color | awk '{print $3}' | grep -Fx "$BOX_NAME" >/dev/null 2>&1; then
			"${DISTROBOX[@]}" create \
				--yes \
				--name "$BOX_NAME" \
				--image "$IMAGE" \
				--additional-packages "$PACKAGES"
		fi

		"${DISTROBOX[@]}" enter --name "$BOX_NAME" -- bash -lc "$(run_npm_command "$@")"
		;;
	ephemeral)
		"${DISTROBOX[@]}" ephemeral \
			--image "$IMAGE" \
			--additional-packages "$PACKAGES" \
			--volume "$REPO_ROOT:$REPO_ROOT" \
			-- bash -lc "$(run_npm_command "$@")"
		;;
	*)
		printf 'Unknown SLOPBOX_DISTROBOX_MODE=%s. Use persistent or ephemeral.\n' "$MODE" >&2
		exit 2
		;;
esac
