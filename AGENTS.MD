# slopbox
TypeScript music editor derived from BeepBox/JummBox/Ultrabox/SlarmoosBox/JukeeBox
Allows saving made songs to a `.json` file

# Project map
- `./synth`: Backend music engine
- `./editor`: Editor + song playback UI
- `./player`: Music player UI
- `./website`: Website HTML/JS

# Build environment
Use `scripts/npm-distrobox.sh`, NOT `npm`
Creates/reuses persistent Distrobox `slopbox-typescript-node` from `ubuntu:24.04`
`distrobox.ini` defines `slopbox-typescript-node`

```sh
./scripts/npm-distrobox.sh install
./scripts/npm-distrobox.sh run build
./scripts/npm-distrobox.sh run build-offline
```

---
# Memory
Write MEMORY.md after debugging work.
- Do not write "Verification" notes in MEMORY.md

# Rules
- Always `build-offline` at the end of your turn
- Avoid messing with internals, this is a fork of an existing project
- Debug by running code, rather than guessing based on hypothetical code flow
