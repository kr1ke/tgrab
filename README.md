# tgrab

**English** · [Русский](README.ru.md) · [AGENTS.md](AGENTS.md)

*(tee-grab — `tg` + `grab`)*

Telegram media downloader that leaves you an actual archive. Desktop app, CLI, and an agent
skill — same engine behind all three.

![tgrab downloading](docs/screenshots/02-downloads.png)

---

## The problem

[tdl](https://github.com/iyear/tdl) is an excellent downloader. What it hands back is this:

```
1234567890_42_98765432109876.mp4
```

Channel id, message id, and Telegram's internal file id. Three numbers, no idea what the file
is. Download fifty and you have an unsearchable pile.

Its progress bar is also invisible from a script — the output buffers and you stare at a silent
terminal for two minutes.

## What tgrab does

```
2026-08-12_11-53_Load-balancer-deep-dive_42.mp4
```

Post date, post time, the caption, and the message id so a file traces back to
`t.me/c/<channel>/<msg_id>`.

- **Readable filenames** from the post date and caption, not numeric ids
- **Whole-channel archiving** in one command
- **Visible progress** — a live list in the app, a status line in the terminal
- **Any Telegram chat** — private, protected, public, groups, Saved Messages
- **English and Russian**, chosen on first run
- **Agent-friendly** — `--json` everywhere, documented exit codes

## Three ways to use it

| | For | Start here |
|---|---|---|
| **GUI** | Point and click, watch a download list | [Releases](https://github.com/kr1ke/tgrab/releases) |
| **CLI** | Terminal, scripting, servers | [`bin/tgrab`](bin/tgrab) |
| **Skill** | Claude Code and other AI agents | [`skill/tgrab/`](skill/tgrab/) |

## Repository structure

```
tgrab/
├── bin/
│   ├── tgrab              CLI — single Bash script, no build step
│   └── progress.sh        status line renderer (text and --json)
├── gui/                   Electron desktop app
│   ├── main.js            process, tdl bootstrap, download engine
│   ├── preload.js         narrow contextBridge surface
│   └── renderer/          UI — index.html, styles.css, app.js
├── skill/tgrab/
│   └── SKILL.md           agent skill: copy into .claude/skills/
├── scripts/               screenshot harness for the README
├── docs/screenshots/      the images on this page
├── .github/workflows/     cross-platform release builds
├── AGENTS.md              machine-facing contract for AI agents
└── README.md · README.ru.md
```

---

## GUI

Download for your platform from [Releases](https://github.com/kr1ke/tgrab/releases) — macOS
`.dmg`, Windows `.exe`, Linux `.AppImage` or `.deb`.

Builds are **unsigned**. macOS will warn on first launch: right-click the app → *Open* →
*Open*. Windows SmartScreen: *More info* → *Run anyway*. Signing needs paid certificates.

Paste a link, press Download. Set a custom filename per download under *Options*, or change the
template for everything in *Settings*.

<table>
<tr>
<td width="50%"><img src="docs/screenshots/03-settings.png" alt="Settings panel"></td>
<td width="50%"><img src="docs/screenshots/04-russian.png" alt="Russian interface"></td>
</tr>
<tr>
<td align="center"><em>Settings — template, threads, proxy, theme</em></td>
<td align="center"><em>Russian interface, per-download options open</em></td>
</tr>
</table>

Run it from source:

```bash
cd gui && npm install && npm start
```

## CLI

```bash
git clone https://github.com/kr1ke/tgrab
cd tgrab
./bin/tgrab doctor
```

That is the whole install — no build step, no runtime, no package manager. `tdl` is downloaded
automatically on first use with its checksum verified.

**Needs:** macOS or Linux, `bash`, `curl`, `perl` (all preinstalled), Telegram Desktop logged in.
`ffmpeg` optional, for verifying downloads.

```bash
./bin/tgrab login                                              # interactive, once
./bin/tgrab get "https://t.me/c/<channel_id>/<msg_id>" --dir ~/Videos
./bin/tgrab progress
./bin/tgrab clean                                              # delete the auth key
```

```
⏳ connecting to Telegram…
⬇  47.3% [███████████░░░░░░░░░░░░░] 120.42 MB · 2.11 MB/s · 1m03s left
✓ done — 254.49 MB in 2m01s (2.10 MB/s)
```

| Command | |
|---|---|
| `login [--passcode <code>]` | import the Telegram Desktop session (interactive) |
| `get <url> [dir]` | download media from a message link |
| `archive <chat> [--last N]` | bulk-download recent media (default 50) |
| `progress` | print the current status line |
| `chats` | list your chats with their ids |
| `doctor` | report dependency and login status |
| `clean` | delete the stored auth key |

Global options: `--lang <en\|ru>`, `--dir <path>`, `--json`, `--quiet`, `--help`, `--version`.

## Skill

For Claude Code and other agents that read `SKILL.md` files:

```bash
mkdir -p ~/.claude/skills && cp -r skill/tgrab ~/.claude/skills/
```

Then a Telegram link in the conversation is enough. The skill encodes the procedure and the
traps — most importantly that **you must not look for the downloaded file by timestamp**.

Agents driving the CLI directly should read [AGENTS.md](AGENTS.md): always `--json --lang en`,
`get` returns immediately so poll `progress --json` every ~15 s, and never try to automate
`login`.

## Language

On first run both the app and the CLI ask:

```
Choose language / Выберите язык:
  1) English
  2) Русский
```

![Language picker](docs/screenshots/01-language.png)

Saved to `~/.config/tgrab/config` (CLI) or the app's settings. Override with `--lang ru` or
`TGRAB_LANG`. With no saved choice it follows `$LANG`. `--json` never prompts.

## Filename template

```
{{ formatDate .MessageDate "2006-01-02_15-04" }}_{{ if .FileCaption }}{{ filenamify .FileCaption 60 }}_{{ end }}{{ .MessageID }}
```

The date is the **post** time, not the download time — so an archive sorts by content and a
re-download produces the same name. The caption is the only human-readable field Telegram
exposes; `.FileName` is usually an opaque number, and there is no readable channel title
available at all, only a numeric `DialogID`.

Presets in the app: date + caption, date + id, caption only, original. In the CLI, override with
`$TG_TEMPLATE`.

## Gotchas

Every one of these cost real time to find.

| Symptom | Cause |
|---|---|
| File "missing" although the download said `done` | mtime is the **post date**, not the download time — `find -newermt` and `ls -lat` will not see it. Match on the filename. |
| Size is exactly 1 MiB or 128 MiB | truncated at a buffer boundary; the file is broken, not small |
| `tgrab login` exits 5 | login is interactive and needs a real terminal |
| `brew install iyear/tap/tdl` fails | the tap was deleted upstream; tgrab fetches the release directly |
| `timeout: command not found` | macOS has no `timeout` |

## Safety

Importing the desktop session copies your Telegram **auth key** into `~/.tdl` in plain text.
Anything that can read your home directory — malware, a cloud-synced backup — gets full account
access, and **2FA does not help**, because an extracted key is already past it. Run
`tgrab clean`, or enable *delete the auth key on quit* in the app.

Verifying tdl's checksum proves the download was not tampered with in transit. It does not vouch
for the publisher, and nobody has audited the binary.

Telegram has rate-limited and banned accounts for aggressive third-party API use. A few files is
nothing; bulk scraping is where accounts get flagged.

For a single file, opening the post in Telegram Desktop and using right-click → *Save As* carries
zero additional risk. tgrab is for when that stops scaling.

## Status

**Early prototype.** The CLI is a Bash script, the GUI is Electron, both wrap `tdl`. Treat the
interfaces as unstable.

## Licensing note

`tdl` is **AGPL-3.0**. tgrab downloads and invokes it as a separate executable — mere
aggregation, which does not make tgrab a derivative work. Bundling or linking it would push the
AGPL onto everything you ship, and its network clause would apply to hosted services. That is
why it is fetched at runtime rather than vendored. Not legal advice; check it before your
architecture sets.

This repository has no license file yet, which means all rights reserved by default — probably
not what you want from a public repo.
