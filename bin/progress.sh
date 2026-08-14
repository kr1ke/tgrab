#!/usr/bin/env bash
# Render one status line from a tdl log written by `tgrab get` / `tgrab archive`.
# Safe to call at any time: prints something sensible before, during and after a download.
#
#   usage: progress.sh [logfile] [--json]
#   env:   TGRAB_LOG   default log path (/tmp/tgrab-dl.log)
#          TGRAB_LANG  en | ru  (text mode only; JSON is language-neutral)
#
# Exit codes, so a caller can poll in a loop:
#   0 = in progress (or idle)   3 = finished   4 = failed

LOG=""
JSON=0
for a in "$@"; do
  case "$a" in
    --json) JSON=1 ;;
    -*)     ;;
    *)      [ -z "$LOG" ] && LOG="$a" ;;
  esac
done
LOG="${LOG:-${TGRAB_LOG:-/tmp/tgrab-dl.log}}"
LANG_CODE="${TGRAB_LANG:-en}"
case "$LANG_CODE" in ru) : ;; *) LANG_CODE="en" ;; esac

exec perl -e '
my ($log, $json, $lang) = @ARGV;

my %T = (
  en => { wait=>"waiting to start…", conn=>"connecting to Telegram…", idle=>"no download in progress.",
          done=>"done", eta=>"%s left", inw=>"in", fail=>"failed",
          h=>"h", m=>"m", s=>"s" },
  ru => { wait=>"ожидание запуска…", conn=>"соединение с Telegram…", idle=>"активных загрузок нет.",
          done=>"готово", eta=>"осталось %s", inw=>"за", fail=>"ошибка",
          h=>"ч", m=>"м", s=>"с" },
);
my $t = $T{$lang} || $T{en};

sub out_json { my (%f) = @_; my @p;
  for my $k (sort keys %f) {
    my $v = $f{$k};
    if (!defined $v)            { push @p, "\"$k\":null" }
    elsif ($v =~ /^-?[\d.]+$/)  { push @p, "\"$k\":$v" }
    elsif ($v eq "true" || $v eq "false") { push @p, "\"$k\":$v" }
    else { my $s=$v; $s =~ s/(["\\])/\\$1/g; push @p, "\"$k\":\"$s\"" }
  }
  print "{", join(",", @p), "}\n";
}

unless (-e $log) {
  $json ? out_json(ok=>"true", status=>"idle") : print "⏳ $t->{wait}\n";
  exit 0;
}
open(my $fh, "<", $log) or do {
  $json ? out_json(ok=>"true", status=>"idle") : print "⏳ $t->{wait}\n"; exit 0 };
local $/; my $c = <$fh>; close $fh;

$c =~ s/\e\[[0-9;?]*[a-zA-Z]//g;   # strip ANSI colour / cursor codes
$c =~ s/\r/\n/g;

if ($c =~ /^FATAL:\s*(.+)$/m) {
  my $e = $1;
  $json ? out_json(ok=>"false", status=>"failed", error=>$e) : print "✖ $e\n";
  exit 4;
}
my ($rc) = $c =~ /EXIT=(\d+)/;

my $pct; $pct = $1 while $c =~ /([\d.]+)%/g;
my ($done, $el, $spd);
while ($c =~ /\[\s*([\d.]+\s*[KMGT]?i?B)\s+in\s+([\dhms.]+)\s*;\s*([\d.]+\s*[KMGT]?i?B\/s)\s*\]/g) {
  ($done, $el, $spd) = ($1, $2, $3);
}

sub secs { my $s = shift // return 0; my $x = 0;
  $x += $1*3600 if $s =~ /([\d.]+)h/; $x += $1*60 if $s =~ /([\d.]+)m/; $x += $1 if $s =~ /([\d.]+)s/; $x }
sub human { my $x = shift;
  return "—" if !defined $x || $x < 0 || $x > 86400;
  return sprintf("%d%s%02d%s", int($x/3600), $t->{h}, int(($x%3600)/60), $t->{m}) if $x >= 3600;
  return sprintf("%d%s%02d%s", int($x/60), $t->{m}, int($x)%60, $t->{s}) if $x >= 60;
  sprintf("%d%s", int($x+0.5), $t->{s}) }
sub bar { my ($p,$w)=@_; my $f=int($p*$w/100+0.5); $f=$w if $f>$w; $f=0 if $f<0;
  "█" x $f . "░" x ($w-$f) }

if (defined $rc) {
  if ($rc == 0 || $c =~ /done!/) {
    if ($json) { out_json(ok=>"true", status=>"done", transferred=>$done, elapsed_seconds=>secs($el), speed=>$spd) }
    else { printf("✓ %s — %s %s %s (%s)\n", $t->{done}, $done // "?", $t->{inw}, human(secs($el)), $spd // "?") }
    exit 3;
  }
  my ($err) = $c =~ /(?:Error|error):\s*(.+)/;
  if ($json) { out_json(ok=>"false", status=>"failed", code=>$rc, error=>($err // "")) }
  else { print "✖ $t->{fail} ($rc)" . ($err ? ": $err" : "") . "\n" }
  exit 4;
}

unless (defined $pct) {
  $json ? out_json(ok=>"true", status=>"connecting") : print "⏳ $t->{conn}\n";
  exit 0;
}

my $e = secs($el);
my $eta = ($pct > 1 && $e > 0) ? $e * (100 - $pct) / $pct : undef;

if ($json) {
  out_json(ok=>"true", status=>"running", percent=>$pct, transferred=>$done,
           speed=>$spd, eta_seconds=>(defined $eta ? int($eta+0.5) : undef));
} else {
  printf("⬇ %5.1f%% [%s] %s · %s · %s\n",
    $pct, bar($pct,24), $done // "—", $spd // "—", sprintf($t->{eta}, human($eta)));
}
exit 0;
' "$LOG" "$JSON" "$LANG_CODE"
