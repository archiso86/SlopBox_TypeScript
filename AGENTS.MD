# slopbox
TypeScript music editor derived from BeepBox/JummBox/Ultrabox/SlarmoosBox/JukeeBox
Hosted on GitHub Pages
Allows saving made songs to a `.json` file

# Project map
- `./synth`: Backend music engine
- `./editor`: Editor + song playback UI
- `./player`: Music player UI
- `./website`: Website HTML/JS
  (Includes generated `*.min.js` files, exclude from file searches)

## Local Electron data
`npm-distrobox.sh run start` runs Electron using stored data and cache from `/var/home/goobadmin/.config/JukeBox`.

# Build environment
Use `scripts/npm-distrobox.sh`, NOT `npm`
Example: `./scripts/npm-distrobox.sh run build-offline`

`distrobox.ini` defines Distrobox container configuration

---
# Rules
- `build` and/or `build-offline` at the end of your turn to apply changes, only if you wrote code
- Avoid messing with internals, this is a fork of an existing project

## Debugging
- Debugging should focus on reverting or changing the most recent commits by `archiso86`.
- Do not write "Verification" notes in `MEMORY.md`
- Debug by running code and simulations, rather than guessing based on hypothetical code flow

Write `./MEMORY.md` after debugging work.
- Recommended headers:
  - `# Bug name (Described by user)`
  - `## Behavior (Described by user)`
  - `## Attempted fixes`
