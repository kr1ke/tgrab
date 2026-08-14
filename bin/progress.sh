#!/usr/bin/env bash
# Render one clean status line from a tdl log written by dl.sh.
# Safe to call at any time: prints something sensible before, during and after a download.
#
#   usage: progress.sh [logfile]        (default: $TG_LOG, else /tmp/tgrab-dl.log)
#
# Exit codes let a caller poll in a loop:  0 = in progress, 3 = finished, 4 = failed

LOG="${1:-${TG_LOG:-/tmp/tgrab-dl.log}}"

exec perl -e '
my $log = shift;
unless (-e $log) { print "⏳ waiting to start…\n"; exit 0 }

open(my $fh, "<", $log) or do { print "⏳ waiting to start…\n"; exit 0 };
local $/; my $c = <$fh>; close $fh;

$c =~ s/\e\[[0-9;?]*[a-zA-Z]//g;   # strip ANSI colour / cursor codes
$c =~ s/\r/\n/g;

# --- terminal states -------------------------------------------------------
if ($c =~ /^FATAL:\s*(.+)$/m)  { print "✖ $1\n"; exit 4 }
my ($rc) = $c =~ /EXIT=(\d+)/;

# --- last progress record --------------------------------------------------
my $pct;   $pct  = $1 while $c =~ /([\d.]+)%/g;
my ($done, $el, $spd);
while ($c =~ /\[\s*([\d.]+\s*[KMGT]?i?B)\s+in\s+([\dhms.]+)\s*;\s*([\d.]+\s*[KMGT]?i?B\/s)\s*\]/g) {
  ($done, $el, $spd) = ($1, $2, $3);
}

sub secs {
  my $s = shift // return 0; my $t = 0;
  $t += $1 * 3600 if $s =~ /([\d.]+)h/;
  $t += $1 * 60   if $s =~ /([\d.]+)m/;
  $t += $1        if $s =~ /([\d.]+)s/;
  return $t;
}
sub human {
  my $t = shift;
  return "—" if !defined $t || $t < 0 || $t > 86400;
  return sprintf("%dh%02dm", int($t/3600), int(($t%3600)/60)) if $t >= 3600;
  return sprintf("%dm%02ds", int($t/60), int($t)%60)          if $t >= 60;
  return sprintf("%ds", int($t + 0.5));
}
sub bar {
  my ($p, $w) = @_;
  my $f = int($p * $w / 100 + 0.5); $f = $w if $f > $w; $f = 0 if $f < 0;
  return "█" x $f . "░" x ($w - $f);
}

# --- finished --------------------------------------------------------------
if (defined $rc) {
  if ($rc == 0 || $c =~ /done!/) {
    printf("✓ done — %s in %s (%s)\n", $done // "?", human(secs($el)), $spd // "?");
    exit 3;
  }
  my ($err) = $c =~ /(?:Error|error):\s*(.+)/;
  print "✖ failed (code $rc)" . ($err ? ": $err" : "") . "\n";
  exit 4;
}

# --- still running ---------------------------------------------------------
unless (defined $pct) { print "⏳ connecting to Telegram…\n"; exit 0 }

my $e   = secs($el);
my $eta = ($pct > 1 && $e > 0) ? $e * (100 - $pct) / $pct : undef;

printf("⬇ %5.1f%% [%s] %s · %s · %s left\n",
  $pct, bar($pct, 24), $done // "—", $spd // "—", human($eta));
exit 0;
' "$LOG"
