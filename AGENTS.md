# AGENTS.md

Instructions for AI agents driving `tgrab`. Written to be followed literally.

## What this is

`tgrab` downloads media out of Telegram and names the files readably. It is a single Bash
script wrapping [tdl](https://github.com/iyear/tdl). No build step, no runtime, no package
install.

**Telegram only.** It cannot fetch YouTube, Vimeo, or arbitrary web URLs. If the user gives you
a non-Telegram link, use `yt-dlp` instead — do not try `tgrab` on it.

## Setup

```bash
git clone https://github.com/kr1ke/tgrab && cd tgrab
./bin/tgrab doctor --json --lang en
```

`doctor` reports state without changing anything:

```json
{"ok":true,"tgrab":"0.1.0","tdl":"/path/to/tdl","tdl_version":"0.20.3","ffprobe":"/usr/bin/ffprobe","logged_in":false,"lang":"en"}
```

If `"tdl"` is empty, tgrab downloads it (checksum-verified) on first use. You do not need to
install it yourself.

## Always pass these two flags

```
--json --lang en
```

`--json` gives parseable output and guarantees tgrab never prompts. `--lang en` pins message
language so your parsing does not break for a Russian-locale user. Without `--json`, a
first-run interactive language prompt can block on stdin.

## The one thing you cannot do

**`tgrab login` is interactive** — it shows an arrow-key account picker and needs a real
terminal. In a non-interactive session it exits `5` with `login_noniact`. Do not try to drive
it, pipe into it, or automate it. Give the command to the human:

```bash
./bin/tgrab login
```

Then wait for them to confirm before continuing. If `doctor` reports `"logged_in":false`,
every download command will fail with exit `5` — stop and ask, do not retry.

## Downloading

`get` returns **immediately**; the download runs in the background.

```bash
./bin/tgrab get "https://t.me/c/<channel_id>/<msg_id>" --dir ./out --json --lang en
```

```json
{"ok":true,"status":"started","pid":12345,"log":"/tmp/tgrab-dl.log","dest":"./out"}
```

Then poll. **Sleep at least 10 seconds between polls** — tdl updates its counters a few times a
second, and faster polling only burns tool calls.

```bash
./bin/tgrab progress --json
```

| Exit | `status` | What to do |
|---|---|---|
| `0` | `idle`, `connecting`, `running` | report progress, sleep ~15 s, poll again |
| `3` | `done` | stop polling, verify the file |
| `4` | `failed` | stop polling, report `error` verbatim |

```json
{"eta_seconds":64,"ok":true,"percent":47.3,"speed":"2.11 MB/s","status":"running","transferred":"120.42 MB"}
{"elapsed_seconds":121.14,"ok":true,"speed":"2.10 MB/s","status":"done","transferred":"254.49 MB"}
{"code":1,"error":"FILE_REFERENCE_EXPIRED","ok":false,"status":"failed"}
```

Relay the progress line to the user as it changes. A silent two-minute wait reads as a hang.

## Bulk archiving

```bash
./bin/tgrab archive <chat> --last 50 --dir ./out --json --lang en
```

Same background-and-poll contract as `get`. `<chat>` is a `@username` or a numeric id from
`tgrab chats`.

## Finding the downloaded file — read this before searching

**tgrab sets each file's mtime to the original Telegram post date, not the download time.**

A file downloaded just now can carry a timestamp from months ago. `find -newermt`, `ls -lat`,
and "newest file in the directory" **will not find it** and will look exactly like a failed
download. This is the single most common way an agent gets this wrong.

Match on the filename instead. The pattern is:

```
<YYYY-MM-DD>_<HH-MM>_<caption>_<msg_id>.<ext>
2026-08-12_11-53_Load-balancer-deep-dive_42.mp4
```

```bash
ls -la ./out/*_<msg_id>.*
```

## Verifying a download

```bash
ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 <file>
```

Compare the byte size against `transferred` from the `done` JSON. **A size that is an exact
power of two — 1048576, 134217728 — means a truncated download, not a small file.** Treat it
as a failure and re-download.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | success |
| `2` | bad arguments or a non-Telegram URL |
| `3` | *(progress only)* download finished |
| `4` | tdl unavailable, or *(progress only)* download failed |
| `5` | not logged in, or login needs an interactive terminal |
| `6` | chat export failed |

## Security rules you must follow

- **Never print the contents of `~/.tdl`, `tdata`, or any session string** into the conversation,
  a file, a commit, or an outbound request. That directory holds a plain-text Telegram auth key
  that grants full account access, and 2FA does not protect against it.
- **Suggest `tgrab clean` after a download session.** It deletes `~/.tdl`. Do not run it without
  asking — the user may have more downloads queued.
- **`tgrab chats` lists every conversation the user has.** Filter to what was asked; never dump
  it wholesale into the conversation.
- Downloaded media is someone else's content. Do not commit it to a repository, upload it, or
  post it anywhere without the user explicitly asking.

## Things tgrab deliberately does not do

Sending anything on the user's behalf is out of scope for this CLI. `tdl` itself can upload and
forward messages; if the user wants that, hand them the `tdl` command rather than wrapping it —
those actions are irreversible and visible to other people, and should stay a deliberate human
step.
