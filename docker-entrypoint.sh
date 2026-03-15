#!/bin/sh
set -e

IGNORE_CERT_ERRORS=""

if [ "$(echo "$ALLOW_UNSECURE_CERT" | tr '[:upper:]' '[:lower:]')" = "true" ]
then
    export IGNORE_CERT_ERRORS="--unsafely-ignore-certificate-errors"
fi

exec deno run --allow-net --allow-env $IGNORE_CERT_ERRORS /app/adapter.ts
