#!/bin/sh
# Cron entry point on Hostinger, deployed as hbuilds/current/nodejs/haunting-cron.sh.
# The cron command is just: /bin/sh <path to this file>   (no &&, >> or ~ for the cron form to mangle).
# Logs a start line first, so the log shows whether cron reached this script at all.
LOG=/home/u604643782/haunting-refresh.log
HB=/home/u604643782/domains/perky-mediumvioletred-giraffe-73.hostingersite.com/hbuilds
echo "=== $(date -u '+%Y-%m-%dT%H:%M:%SZ') cron start" >> "$LOG"
cd "$HB" || { echo "=== cannot cd to $HB" >> "$LOG"; exit 1; }
/opt/alt/alt-nodejs24/root/bin/node --env-file=config/.env current/nodejs/haunting-refresh.cjs >> "$LOG" 2>&1
status=$?
echo "=== $(date -u '+%Y-%m-%dT%H:%M:%SZ') cron end, exit $status" >> "$LOG"
exit $status
