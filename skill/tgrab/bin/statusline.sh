#!/usr/bin/env bash
# Claude Code status line for this project.
#
# Shows the live tdl download bar while a download is in flight, and a compact
# project/model line the rest of the time. Claude Code pipes session JSON on stdin
# and renders the first line of stdout.
#
# Wired up via .claude/settings.json -> statusLine.command

LOG="${TGRAB_LOG:-/tmp/tgrab-dl.log}"
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

payload="$(cat 2>/dev/null)"

# --- session context (best-effort; never fail the status line on parse issues) ---
ctx="$(printf '%s' "$payload" | perl -0777 -ne '
  my ($m) = /"display_name"\s*:\s*"([^"]*)"/;
  my ($d) = /"current_dir"\s*:\s*"([^"]*)"/;
  $d ||= ""; $d =~ s{.*/}{};
  print(($d || "tg-video"), "\t", ($m || ""));
' 2>/dev/null)"

dir="${ctx%%$'\t'*}"
model="${ctx##*$'\t'}"
[ -n "$dir" ] || dir="tg-video"

left="📁 ${dir}"
[ -n "$model" ] && left="${left} · ${model}"

# --- active download? -----------------------------------------------------------
# Active = log exists, has no EXIT= marker yet, and was touched in the last 2 minutes.
if [ -f "$LOG" ] && ! grep -q '^EXIT=' "$LOG" 2>/dev/null; then
  now=$(date +%s)
  mtime=$(stat -f %m "$LOG" 2>/dev/null || echo 0)
  if [ $((now - mtime)) -lt 120 ]; then
    line="$("$HERE/../../../bin/progress.sh" "$LOG" 2>/dev/null | head -1)"
    if [ -n "$line" ]; then
      printf '%s │ %s\n' "$left" "$line"
      exit 0
    fi
  fi
fi

printf '%s\n' "$left"
