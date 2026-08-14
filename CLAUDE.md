# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

`tgrab` — a Telegram media archiver, shipped three ways from one repo:

| Path | What it is |
|---|---|
| `bin/tgrab` | CLI. Single Bash script, **no build step**, Bash 3.2 compatible (macOS ships 3.2 — no associative arrays, no `${x^^}`) |
| `bin/progress.sh` | Status-line renderer, text and `--json`. Called by the CLI, usable alone |
| `gui/` | Electron app — `main.js` (process, tdl bootstrap, download + ffmpeg engines), `preload.js` (contextBridge), `renderer/` (UI) |
| `skill/tgrab/SKILL.md` | Agent skill, copied into `.claude/skills/` |
| `AGENTS.md` | Machine-facing contract for AI agents driving the CLI |
| `scripts/` | `shoot.js` (screenshots), `make-icon.js` (app icon) — both render the real UI through Electron |

All three wrap [tdl](https://github.com/iyear/tdl), which is **downloaded at runtime, never
vendored**. See [Licensing](#licensing-this-is-load-bearing).

## Hard rules

- **Never automate `tdl login` without a PTY.** It is a TUI: a plain pipe gets `Error: EOF`.
  The GUI drives it through `node-pty`; the CLI hands the command to the user.
- **`tdl login` asks two questions.** The second is *"Do you want to logout existing desktop
  session? (y/N)"* — answering `y` **signs the user out of Telegram Desktop**. Any automation
  must answer `n` explicitly, never by letting a default fall through.
- **Never collect a Telegram login code or cloud password.** If tdl asks for one, hand the user
  back to a terminal (`login:openTerminal`). The app must not have a field for it.
- **Never print `~/.tdl`, `tdata`, or a session string** into chat, a file, a commit, or an
  outbound request. That is a plain-text auth key with full account access; 2FA does not help.
- **`timeout` does not exist on macOS.** Do not wrap commands in it.
- **Downloaded media never enters the repo.** `.gitignore` covers the extensions; a 250 MB video
  also exceeds GitHub's 100 MB file limit and is someone else's content.
- **Keep personal data out of the public repo** — no real channel ids, no `/Users/<name>` paths,
  no personal email. The `.deb` maintainer is deliberately a GitHub noreply address.

## Screenshots — regenerate on every UI change

`README.md` and `README.ru.md` embed `docs/screenshots/*.png`. **Any change to
`gui/renderer/` invalidates them.** Stale screenshots are worse than none: they show a product
that no longer exists.

```bash
cd gui
for s in 01-language 02-downloads 03-settings 04-russian 06-light 07-signin; do
  SHOT=$s npx electron ../scripts/shoot.js
done
```

One Electron process per shot — reusing one races the window loader and only the first
shot lands. `scripts/shoot.js` loads the **real** `renderer/index.html` through a stub preload
(`shoot-preload.js`) that seeds example records, so the pixels are genuine UI, not a mockup.
When adding a UI state worth showing, add it to `SHOTS` in `shoot.js` and to the stub preload if
it needs a new API method.

Never hand-draw or fake a screenshot.

After changing the app mark, also regenerate the icon:

```bash
cd gui && npx electron ../scripts/make-icon.js
```

## Releasing

Builds happen **only in CI**. macOS cannot cross-compile Windows or Linux — never claim a local
build produced them.

1. Bump the version in **three** places, they are not linked:
   - `gui/package.json` → `version`
   - `bin/tgrab` → `TGRAB_VERSION`
   - `gui/renderer/index.html` → `#about-version`
2. Regenerate screenshots if the UI moved.
3. Commit and push to `main`.
4. Tag and push — the tag is what triggers `.github/workflows/release.yml`:

```bash
git tag -a v0.3.0 -m "v0.3.0 — summary" && git push origin v0.3.0
```

5. Watch it, and read the result rather than assuming:

```bash
gh run watch "$(gh run list --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
```

To re-run a tag after a fix, delete and recreate it:

```bash
git push --delete origin v0.3.0 && git tag -d v0.3.0
```

The workflow produces `.dmg`/`.zip` (macOS, arm64 + x64), `.exe` (NSIS + portable),
`.AppImage`/`.deb`, and `tgrab-cli.tar.gz`, all attached to the release.

**Verify the CLI tarball by downloading it from the release and running it** — it is the one
artefact that can be checked locally.

### CI failures already hit once — check these first

| Error | Fix |
|---|---|
| `Cannot detect repository by .git/config` | `repository` field in `gui/package.json`, plus `build.publish: null` |
| `Please specify author 'email'` | `build.linux.maintainer` |
| `default Electron icon is used` | `gui/build/icon.png` must exist |
| Native module fails at `require()` | the `electron-builder install-app-deps` step must run after `npm ci` |

Builds are **unsigned** — macOS Gatekeeper and Windows SmartScreen will warn. Signing needs paid
certificates; say so rather than implying the warning is a bug.

## Licensing — this is load-bearing

`tdl` is **AGPL-3.0**. tgrab downloads it at first use and runs it as a **separate executable**.
That is mere aggregation, so the AGPL does not reach this codebase.

**Bundling or linking tdl would push AGPL-3.0 onto the whole app, permanently.** The user asked
for it to be bundled once; it was not, for this reason. Do not vendor the binary without raising
this again. Runtime download also keeps the installer small and the tdl version current.

`ffmpeg` *is* bundled (`ffmpeg-static`) — different situation: no interactive step, and asking a
GUI user to install it separately would defeat the point.

There is still no `LICENSE` file, which means all rights reserved by default.

## Conventions

- Comments explain **why**, not what — especially where behaviour is counter-intuitive.
- Both languages, always: any user-visible string needs an `en` and a `ru` entry, in
  `bin/tgrab` (`msg_en`/`msg_ru`) and `gui/renderer/app.js` (`I18N`).
- The CLI's `--json` output is a contract used by agents. Changing a field or an exit code is a
  breaking change — update `AGENTS.md` and `skill/tgrab/SKILL.md` in the same commit.
- Exit codes: `0` ok · `2` bad args · `3` progress-finished · `4` tdl unavailable / failed ·
  `5` not logged in · `6` export failed.
- Colours live in CSS custom properties in `:root` and the `prefers-color-scheme: dark` block.
  Never hardcode a colour in a component rule — it will be wrong in one theme.

## The trap that keeps catching people

**tdl stamps every downloaded file with the original Telegram post date, not the download
time.** `find -newermt`, `ls -lat`, and "newest file in the folder" will not find a file you
just downloaded, and the failure looks exactly like a download that never happened.

Match on the filename instead — `<date>_<time>_<caption>_<msg_id>.<ext>`:

```bash
ls -la <dir>/*_<msg_id>.*
```

A file size that is an exact power of two (1048576, 134217728) is a truncated download, not a
small file.
