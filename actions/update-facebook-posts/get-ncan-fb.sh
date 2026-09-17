#!/bin/bash
# ${FB_API_KEY} is an Apify API token provided by the GitHub actions secrets. It is used to run the Apify Actor that fetches the Facebook posts.
set -euo pipefail

: "${FB_API_KEY:?FB_API_KEY is not set - add it to the GitHub Actions secrets}"

cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" || exit 1

# The token goes in the Authorization header rather than the query string: a
# URL ends up in proxy logs, CI transcripts and error messages, a header does not.
#
# --fail-with-body: a non-2xx response is an error, but still print the body so
# the caller can report why the run was rejected.
curl -sS --fail-with-body "https://api.apify.com/v2/actors/KoJrdxJCTtpon81KY/run-sync-get-dataset-items" \
  -X POST \
  -d @config/api-input.json \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${FB_API_KEY}"
