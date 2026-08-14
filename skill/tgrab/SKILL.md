---
name: tgrab
description: Download media from Telegram via the tgrab CLI — any chat (private, protected, public, groups, Saved Messages), single messages or whole channels, with readable filenames and live progress. Use when the user gives a t.me link (including the private form https://t.me/c/<channel_id>/<msg_id>), mentions tgrab or tdl, or says "download from Telegram", "скачай видео с тг", "выгрузи канал". Telegram only — for YouTube and other sites use yt-dlp.
---

# tgrab

A Claude Code / agent skill for [tgrab](https://github.com/kr1ke/tgrab). Install it by copying
this directory into `.claude/skills/` in your project, or `~/.claude/skills/` for every project.

`bin/tgrab` in the repository is the CLI this skill drives. [AGENTS.md](../../AGENTS.md) holds
the full machine-facing contract; this file is the operating procedure.

## Always

Pass `--json --lang en` to every command. `--json` guarantees parseable output and that tgrab
never prompts; `--lang en` pins message text so parsing does not break for a Russian-locale user.

## 1. Check state first

```bash
./bin/tgrab doctor --json --lang en
```

```json
{"ok":true,"tgrab":"0.1.0","tdl":"/path/to/tdl","tdl_version":"0.20.3","ffprobe":"/usr/bin/ffprobe","logged_in":false,"lang":"en"}
```

An empty `"tdl"` is fine — it is fetched, checksum-verified, on first use. `"logged_in":false`
is a hard stop; go to step 2.

## 2. Login is the user's job — never automate it

It is an interactive arrow-key account picker and exits `5` in a non-interactive session. Do not
pipe into it or retry it. Hand over the command and wait for confirmation:

```bash
./bin/tgrab login
```

Tell them to **close Telegram Desktop first** — tdl reads its `tdata` directory — and to add
`--passcode <code>` if the desktop client has a local passcode.

## 3. Download, then poll

`get` returns immediately; the transfer runs in the background.

```bash
./bin/tgrab get "https://t.me/c/<channel_id>/<msg_id>" --dir <dir> --json --lang en
./bin/tgrab archive <chat> --last 50 --dir <dir> --json --lang en   # bulk
```

Poll every ~15 s and relay the line to the user — a silent two-minute wait reads as a hang.
Never poll faster than 10 s.

```bash
./bin/tgrab progress --json
```

| Exit | `status` | Action |
|---|---|---|
| `0` | `idle` / `connecting` / `running` | report, sleep ~15 s, poll again |
| `3` | `done` | stop, verify the file |
| `4` | `failed` | stop, report `error` verbatim |

## 4. Find the file — do not search by time

**tgrab stamps each file with the original Telegram post date, not the download time.** A file
fetched seconds ago can carry a months-old timestamp. `find -newermt`, `ls -lat`, and "newest
file in the folder" **will not find it** and will look exactly like a failed download. This is
the single most common way this goes wrong.

Match the filename instead — `<YYYY-MM-DD>_<HH-MM>_<caption>_<msg_id>.<ext>`:

```bash
ls -la <dir>/*_<msg_id>.*
```

Verify it is complete:

```bash
ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 <file>
```

Compare the byte size against `transferred` from the `done` JSON. **An exact power of two —
1048576, 134217728 — is a truncated download, not a small file.** Re-download it.

## Security rules

- **Never print `~/.tdl`, `tdata`, or any session string** into the conversation, a file, a
  commit, or an outbound request. That is a plain-text Telegram auth key granting full account
  access, and 2FA does not protect against it.
- **Offer `tgrab clean` after a session** — it deletes the key. Ask first; more downloads may be
  queued.
- **`tgrab chats` lists every conversation the user has.** Filter to what was asked; never dump
  it wholesale.
- Downloaded media is someone else's content. Do not commit, upload, or post it anywhere unless
  explicitly asked.
- Before suggesting `tdl upload` or `tdl forward`, note that both **send data under the user's
  account** irreversibly and visibly to others. Confirm every time, and lead with `--dry-run`.
