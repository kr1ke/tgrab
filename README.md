# tgrab

**English** · [Русский](README.ru.md) · [AGENTS.md](AGENTS.md)

Telegram media downloader that leaves you an actual archive. **Downloads from private channels,
protected channels with saving switched off, groups and direct chats** — anything your own
account can already see. Desktop app, CLI, and an agent skill, one engine behind all three.

![tgrab downloading](docs/screenshots/02-downloads.png)

## Why

[tdl](https://github.com/iyear/tdl) is an excellent downloader. What it hands back is
`1234567890_42_98765432109876.mp4` — channel id, message id, internal file id. Fifty of those
and you have an unsearchable pile. Its progress bar is also invisible from a script.

tgrab gives you `2026-08-12_11-53_Load-balancer-deep-dive_42.mp4` and a progress line you can
watch.

## Features

> ### 🔒 Downloads from private and protected channels
> This is the point. Closed channels you are a member of, channels with saving disabled,
> restricted groups — tgrab pulls media out of all of them, because it signs in as **you**, with
> your own Telegram session imported from Telegram Desktop. No bot, no channel admin rights, no
> public link needed. If you can see it in your Telegram, you can archive it.

**Sources** — private channels · protected channels with content-saving off · public channels ·
groups and supergroups · forum topics · direct chats · Saved Messages

**Downloading**
- Single message by link, or a whole channel in one command
- Custom name per download, or a template for everything
- Resume interrupted transfers, skip files already on disk
- Multi-threaded, with concurrency and proxy you control
- Albums pulled whole when a link points at one item

**Naming** — files land as `date_time_caption_id`, from the original post, so an archive sorts
by content and a re-download never duplicates.

**After the download** — one click each, always to a new file, never overwriting the original:
- **Audio only** — strip the video, keep an `.m4a`
- **Compress** — 720p, much smaller, still watchable
- **Speed up** — 1.25× · 1.5× · 2×, audio pitch-corrected
- **Trim** — from/to in `mm:ss`, instant

**Interface** — English and Russian, light and dark, live progress with speed and ETA,
`--json` on every CLI command for agents.

> **In Russia, Telegram is blocked.** Turn on a VPN, or set a proxy in Settings / pass
> `--proxy`, before downloading.

## Install

| | For | |
|---|---|---|
| **App** | point and click | [Releases](https://github.com/kr1ke/tgrab/releases) — `.dmg` · `.exe` · `.AppImage` · `.deb` |
| **CLI** | terminal, scripting | `git clone https://github.com/kr1ke/tgrab && cd tgrab && ./bin/tgrab doctor` |
| **Skill** | Claude Code, agents | `cp -r skill/tgrab ~/.claude/skills/` |

`tdl` downloads itself on first use, checksum-verified. Nothing else to install.

> Builds are **unsigned**. macOS: right-click → *Open* → *Open*. Windows SmartScreen:
> *More info* → *Run anyway*. Signing needs paid certificates.

## Use

```bash
./bin/tgrab login                                    # interactive, once
./bin/tgrab get "https://t.me/c/<channel>/<msg_id>" --dir ~/Videos
./bin/tgrab progress
./bin/tgrab clean                                    # delete the auth key
```

```
⬇  47.3% [███████████░░░░░░░░░░░░░] 120.42 MB · 2.11 MB/s · 1m03s left
```

`login` · `get` · `archive <chat> --last N` · `progress` · `chats` · `doctor` · `clean`.
Options: `--lang <en|ru>` `--dir <path>` `--json` `--quiet` `--help`.

<table>
<tr>
<td width="50%"><img src="docs/screenshots/03-settings.png" alt="Settings"></td>
<td width="50%"><img src="docs/screenshots/06-light.png" alt="Sign in"></td>
</tr>
<tr>
<td align="center"><em>Template, threads, proxy, theme</em></td>
<td align="center"><em>Sign-in — no code, no password</em></td>
</tr>
</table>

## The one trap

**File timestamps are the original Telegram post date, not the download time.** A file fetched
seconds ago can carry a months-old mtime, so `find -newermt`, `ls -lat` and "newest file in the
folder" **will not find it** — and it looks exactly like a failed download. Match the filename
instead: `<date>_<time>_<caption>_<msg_id>.<ext>`.

```bash
ls -la ~/Videos/*_<msg_id>.*
```

## Security

Importing the desktop session copies your Telegram **auth key** into `~/.tdl` in plain text.
Anything that can read your home directory gets full account access, and **2FA does not help** —
an extracted key is already past it. Run `tgrab clean`, or enable *delete on quit* in the app.

Checksum verification proves the tdl download was not tampered with in transit. It does not
vouch for the publisher, and nobody has audited the binary.

<details>
<summary><b>Repository layout</b></summary>

```
bin/tgrab              CLI — single Bash script, no build step
bin/progress.sh        status line renderer (text and --json)
gui/                   Electron app — main.js, preload.js, renderer/
skill/tgrab/SKILL.md   agent skill
scripts/               screenshot and icon generators
.github/workflows/     macOS / Windows / Linux release builds
AGENTS.md              machine-facing contract for AI agents
```
</details>

<details>
<summary><b>Filename template</b></summary>

```
{{ formatDate .MessageDate "2006-01-02_15-04" }}_{{ if .FileCaption }}{{ filenamify .FileCaption 60 }}_{{ end }}{{ .MessageID }}
```

The date is the **post** time, so an archive sorts by content and a re-download produces the
same name. The caption is the only human-readable field Telegram exposes — `.FileName` is
usually an opaque number, and no readable channel title exists in the template at all, only a
numeric `DialogID`.

Presets in the app; `$TG_TEMPLATE` in the CLI.
</details>

<details>
<summary><b>Bulk archiving and other gotchas</b></summary>

```bash
./bin/tgrab archive @channel --last 100 --dir ~/Videos
```

Under the hood: `tdl chat export` then `tdl dl -f`. For finer control call tdl directly — `-T`
decides how `--input` reads (`time` a timestamp range, `id` a message-id range, `last` a count),
and `-f` filters, e.g. `"Media.Size > 100*1024*1024"`. Field lists are version-specific:
`tdl chat export -c <chat> -f -`.

| Symptom | Cause |
|---|---|
| Size is exactly 1 MiB or 128 MiB | truncated at a buffer boundary — the file is broken, not small |
| `tgrab login` exits 5 | login is interactive and needs a real terminal |
| `brew install iyear/tap/tdl` fails | the tap was deleted upstream; tgrab fetches the release directly |
| `timeout: command not found` | macOS has no `timeout` |

Telegram has rate-limited accounts for aggressive third-party API use. A few files is nothing;
bulk scraping is where accounts get flagged.
</details>

## Status and licence

**Early prototype** — CLI is Bash, GUI is Electron, both wrap `tdl`. Interfaces are unstable.

`tdl` is **AGPL-3.0**. tgrab fetches and runs it as a separate executable — mere aggregation, so
the AGPL does not reach this code. Bundling it would push AGPL onto everything you ship. Not
legal advice.

No licence file yet, which means all rights reserved by default.
