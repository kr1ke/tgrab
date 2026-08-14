# tgrab

**English** · [Русский](README.ru.md)

*(tee-grab — `tg` + `grab`)*

Telegram media downloader that leaves you an actual archive.

---

## The problem

[tdl](https://github.com/iyear/tdl) is an excellent downloader. What it hands back is this:

```
1234567890_42_98765432109876.mp4
```

Channel id, message id, and Telegram's internal file id. Three numbers, no idea what the file
is. Download fifty of them and you have an unsearchable pile.

It also has a progress bar you will never see, because the moment you call it from a script the
output is buffered and you stare at a silent terminal for two minutes.

## What tgrab does

```
2026-08-12_11-53_Load-balancer-deep-dive_42.mp4
```

Post date, post time, the caption, and the message id so the file can always be traced back to
`t.me/c/<channel>/<msg_id>`.

- **Readable filenames** — from the original post date and caption, not numeric ids
- **Whole-channel archiving** — export a message list, fetch it in one go
- **Visible progress** — a status line you can actually watch while it runs
- **Any Telegram chat** — private, protected, public, groups, Saved Messages

## Status

**Early prototype.** Right now this is a set of shell scripts around `tdl`, extracted from a
working setup. There is no `tgrab` binary yet — the CLI and the desktop app are the plan, not
the present. Treat the interface as unstable.

## Requirements

- macOS (Linux should work; untested)
- [tdl](https://github.com/iyear/tdl) v0.20+ on your `PATH`
- `ffmpeg` (for `ffprobe`, used to verify downloads)
- Telegram Desktop, logged in — the session is imported from it

## Install

Install tdl from its GitHub releases and **verify the checksum**. Homebrew will not work: the
`iyear/tap` tap was deleted upstream.

```bash
V=$(curl -sSL https://api.github.com/repos/iyear/tdl/releases/latest | sed -n 's/.*"tag_name": "\(.*\)".*/\1/p')
cd "$(mktemp -d)"
curl -sSLO "https://github.com/iyear/tdl/releases/download/$V/tdl_MacOS_arm64.tar.gz"
curl -sSLO "https://github.com/iyear/tdl/releases/download/$V/tdl_checksums.txt"
shasum -a 256 -c tdl_checksums.txt --ignore-missing
tar xzf tdl_MacOS_arm64.tar.gz && mkdir -p ~/.local/bin && cp tdl ~/.local/bin/
```

Then clone this repo and put `bin/` wherever you like.

## Usage

**1. Log in.** Close Telegram Desktop first — tdl reads its `tdata` directory.

```bash
tdl login -T desktop
```

Pick your account, press Enter. Add `-p <passcode>` if Telegram Desktop has a local passcode.
This reuses the existing session key rather than creating a new device, so nothing new shows up
under Settings → Devices.

**2. Download.** Runs in the background and writes a log the status line reads.

```bash
./bin/dl.sh "https://t.me/c/<channel_id>/<msg_id>" ~/Videos
```

**3. Watch it.**

```bash
./bin/progress.sh
```

```
⏳ connecting to Telegram…
⬇  47.3% [███████████░░░░░░░░░░░░░] 120.42 MB · 2.11 MB/s · 1m03s left
✓ done — 254.49 MB in 2m01s (2.10 MB/s)
```

Exit codes: `0` running, `3` finished, `4` failed — so it can drive a polling loop.

**4. Clean up.** The auth key lives in `~/.tdl` in plain text.

```bash
rm -rf ~/.tdl
```

## Filename template

Set with tdl's `--template`, overridable via `$TG_TEMPLATE`:

```
{{ formatDate .MessageDate "2006-01-02_15-04" }}_{{ if .FileCaption }}{{ filenamify .FileCaption 60 }}_{{ end }}{{ .MessageID }}
```

The date is the **post** time, not the download time — so an archive sorts by content and a
re-download produces the same name. The caption is the only human-readable field Telegram
exposes; `.FileName` is usually an opaque number, and there is no readable channel title in the
template at all, only a numeric `DialogID`.

## Bulk archiving

```bash
tdl chat export -c <chat> -T last -i 50 -o export.json
tdl dl -f export.json -d ~/Videos
```

`-T` picks how `--input` is read: `time` takes a Unix timestamp range `start,end`, `id` takes a
message id range `min,max`, `last` takes a count of recent media. Filter with `-f`, e.g.
`"Media.Size > 100*1024*1024 && Media.Name endsWith '.mp4'"`. The field list is version-specific
— discover yours with `tdl chat export -c <chat> -f -`.

## Gotchas

Every one of these cost real time to find.

| Symptom | Cause |
|---|---|
| `brew install iyear/tap/tdl` → `Repository not found` | the tap was deleted; use the GitHub release |
| `tdl login` → `Error: EOF` | the account picker is interactive; it needs a real terminal |
| File "missing" although tdl said `done!` | tdl sets mtime to the **post date**, not download time — `find -newermt` and `ls -lat` will not see it. Match on the filename. |
| Size is exactly 1 MiB or 128 MiB | truncated at a buffer boundary; the file is broken, not small |
| `timeout: command not found` | macOS has no `timeout` |

## Safety

Importing the desktop session copies your Telegram **auth key** into `~/.tdl` in plain text.
Anything that can read your home directory — malware, a cloud-synced backup — gets full account
access, and **2FA does not help**, because an extracted key is already past it. Delete `~/.tdl`
when you are done.

Verifying tdl's checksum proves the download was not tampered with in transit. It does not vouch
for the publisher, and nobody has audited the binary.

Telegram has rate-limited and banned accounts for aggressive third-party API use. A few files is
nothing; bulk scraping is where accounts get flagged. Use `--delay` and a low `-l` on big jobs.

For a single file, opening the post in Telegram Desktop and using right-click → *Save As* carries
zero additional risk. tgrab is for when that stops scaling.

## Licensing note

`tdl` is **AGPL-3.0**. tgrab invokes it as a separate executable that you install yourself —
mere aggregation, which does not make this a derivative work. If you bundle or link tdl into
something, the AGPL propagates to that whole thing, and its network clause applies to hosted
services. Not legal advice; check it before your architecture sets.

This repository has no license file yet, which means all rights reserved by default. That is
probably not what you want from a public repo — pick one.
