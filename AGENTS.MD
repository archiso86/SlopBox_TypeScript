# slopbox
TypeScript music editor derived from BeepBox/JummBox/Ultrabox/SlarmoosBox/JukeeBox
Allows saving made songs to a `.json` file

---
# Build Environment
Use `scripts/npm-distrobox.sh`, NOT `npm`
Creates/reuses persistent Distrobox `slopbox-typescript-node` from `ubuntu:24.04`
`distrobox.ini` defines `slopbox-typescript-node`

```sh
./scripts/npm-distrobox.sh install
./scripts/npm-distrobox.sh run build
./scripts/npm-distrobox.sh run build-offline
```

# Rules
Always `build-offline` at the end of your turn
