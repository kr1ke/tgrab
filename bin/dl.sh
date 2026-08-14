#!/usr/bin/env bash
# Launch a tdl download, streaming its raw output to a log that progress.sh can parse.
# Run it in the background so progress.sh can be polled while it works.
#
#   usage: dl.sh <t.me URL> [dest_dir]
#   env:   TGRAB_DIR    default destination      (default: current directory)
#          TG_LOG       progress log path        (default: /tmp/tgrab-dl.log)
#          TG_TEMPLATE  tdl file name template   (default below)
#          TDL          path to the tdl binary   (default: tdl on PATH, then ~/.local/bin/tdl)

set -uo pipefail

URL="${1:?usage: dl.sh <t.me URL> [dest_dir]}"
DEST="${2:-${TGRAB_DIR:-$PWD}}"
LOG="${TG_LOG:-/tmp/tgrab-dl.log}"

TDL="${TDL:-$(command -v tdl 2>/dev/null || echo "$HOME/.local/bin/tdl")}"

# Readable names: post date + time, the post caption, and the message id for traceability.
#   2026-08-12_11-53_Load-balancer-deep-dive_42.mp4
# .MessageDate is the ORIGINAL post time, not the download time — an archive should sort by
# content, and a re-download should produce the same name. The caption is dropped when the
# post has none, leaving date + message id.
DEFAULT_TEMPLATE='{{ formatDate .MessageDate "2006-01-02_15-04" }}_{{ if .FileCaption }}{{ filenamify .FileCaption 60 }}_{{ end }}{{ .MessageID }}'
TEMPLATE="${TG_TEMPLATE:-$DEFAULT_TEMPLATE}"

[ -x "$TDL" ] || { echo "FATAL: tdl not found (looked for '$TDL')" >"$LOG"; exit 127; }
mkdir -p "$DEST" || { echo "FATAL: cannot write to $DEST" >"$LOG"; exit 1; }

: >"$LOG"
echo "START url=$URL dest=$DEST" >>"$LOG"

# tdl emits its progress bar even when stdout is not a TTY, so piping preserves the
# percentage/speed records that progress.sh reads.
"$TDL" dl -u "$URL" -d "$DEST" --template "$TEMPLATE" >>"$LOG" 2>&1
rc=$?

echo "EXIT=$rc" >>"$LOG"
exit "$rc"
