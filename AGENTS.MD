# SlopBox
TypeScript music editor derived from BeepBox/JummBox/Ultrabox/SlarmoosBox/JukeeBox.

---
# Build Environment
Use `scripts/npm-distrobox.sh`, NOT `npm`

Default mode creates/reuses persistent Distrobox `slopbox-typescript-node` from `ubuntu:24.04`.

```sh
./scripts/npm-distrobox.sh install
./scripts/npm-distrobox.sh run build
./scripts/npm-distrobox.sh run build-editor
```

For disposable runs:

```sh
SLOPBOX_DISTROBOX_MODE=ephemeral ./scripts/npm-distrobox.sh --version
```

`distrobox-ephemeral` removes container when command exits. Podman/Docker image layers may remain cached by container engine, but installed packages inside temporary container do not persist. Persistent mode avoids reinstalling Node/npm package set every run.

# Distrobox Config
`distrobox.ini` defines `slopbox-typescript-node` with:

- `ubuntu:24.04`
- `nodejs`
- `npm`
- build basics: `git`, `python3`, `make`, `g++`, `zip`, `unzip`

Create from config manually:

```sh
distrobox assemble create --file distrobox.ini
```
