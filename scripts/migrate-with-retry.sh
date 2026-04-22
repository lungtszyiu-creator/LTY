#!/usr/bin/env bash
# Retry `prisma migrate deploy` up to 3 times with exponential backoff.
# Exists because Neon's serverless Postgres cold-starts can take 5-10s,
# and the advisory lock used by `migrate deploy` times out if Neon is
# still waking up — killing the Vercel build needlessly. A retry after
# the first request woke the DB almost always succeeds.
set -e
MAX_ATTEMPTS=3
ATTEMPT=1
DELAY=5
while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
  echo "[migrate-with-retry] attempt $ATTEMPT of $MAX_ATTEMPTS"
  if npx prisma migrate deploy; then
    echo "[migrate-with-retry] success on attempt $ATTEMPT"
    exit 0
  fi
  if [ $ATTEMPT -lt $MAX_ATTEMPTS ]; then
    echo "[migrate-with-retry] failed; sleeping ${DELAY}s and retrying"
    sleep $DELAY
    DELAY=$((DELAY * 2))
  fi
  ATTEMPT=$((ATTEMPT + 1))
done
echo "[migrate-with-retry] exhausted retries" >&2
exit 1
