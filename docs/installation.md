# Installation

Continuity is a command-line tool. It requires Node.js 20 or newer.

## Global install

Installs the `continuity` command for use in any directory:

```bash
npm install -g continuity
continuity
```

Verify it works:

```bash
continuity --version
continuity            # shows the home screen / getting-started
```

## npx usage

Run it once without installing:

```bash
npx continuity
npx continuity init
```

npx downloads the package on demand and runs it. Good for trying it out.

## Local development install

To work on Continuity itself, or to run it from a clone:

```bash
git clone https://github.com/Noctilucenty/Continuity.git
cd Continuity
npm install      # also builds via the prepare script
npm run build    # compile TypeScript to dist/
npm link         # expose the `continuity` command globally
```

After `npm link`, `continuity` runs your local build. Re-run `npm run build`
(or `npm run dev` for watch mode) after changes.

Without linking, run any command directly:

```bash
node dist/cli.js status
```

## Updating

Global install:

```bash
npm update -g continuity
# or reinstall the latest
npm install -g continuity@latest
```

From source:

```bash
git pull
npm install
npm run build
```

## Uninstalling

```bash
npm uninstall -g continuity   # global install
npm unlink -g continuity      # if you used npm link from source
```

Your project data lives in each project's `.continuity/` directory and is never
touched by uninstalling — delete those folders manually if you want them gone.

## Troubleshooting

### The `continuity` command is not found

- Make sure global npm binaries are on your `PATH`. Find the directory with
  `npm bin -g` (or `npm prefix -g`) and ensure it is in `PATH`.
- On Windows, restart the terminal after a global install so `PATH` is
  refreshed.

### Windows notes

- Global npm installs create a `continuity.cmd` shim; run `continuity` from a
  fresh terminal so the new `PATH` entry is picked up.
- Clipboard support uses the built-in `clip` command, which ships with Windows.

### macOS notes

- Clipboard support uses the built-in `pbcopy` command.

### Linux notes

Clipboard support tries these tools in order, using whichever is installed:

- `xclip`
- `xsel`
- `wl-copy` (Wayland)

Install one if `--copy` reports it could not copy, for example:

```bash
sudo apt-get install xclip
```

### Clipboard fallback behavior

The `--copy` flag (on `handoff`, `resume`, `pack`, `ask`) never fails the
command. If no clipboard tool is available, Continuity prints the content
instead so you can copy it manually. Clipboard content is always plain text with
terminal colors stripped out.
