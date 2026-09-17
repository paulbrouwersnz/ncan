#!/bin/bash
# Refresh assets/facebook/posts.html from the club's two Facebook pages.
#
# Nothing is promoted into cache/*-old.json until every step has succeeded, so
# a failed run retries next time instead of recording a false success and
# leaving the stale baselines looking current.
set -euo pipefail

cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" || exit 1

RAW=./cache/ncan-fb.json
OUT=../../assets/facebook/posts.html

cleanup() {
	rm -f "$RAW" ./cache/compare.json ./cache/extracted.json
}
trap cleanup EXIT

./get-ncan-fb.sh > "$RAW"

# The Actor returns a JSON array of posts. Anything else - an error object, an
# empty body - means the run failed, and must not reach the comparison below.
if ! jq -e 'type == "array" and length > 0' "$RAW" > /dev/null 2>&1; then
	echo "action.sh: the Apify run returned no posts. First 500 bytes:" >&2
	head -c 500 "$RAW" >&2
	echo >&2
	exit 1
fi

jq -f ./config/compare-posts.jq "$RAW" > ./cache/compare.json

# compare-posts.jq deliberately drops the media thumbnails, so a rotated
# signed CDN URL on an otherwise unchanged post does not force a rebuild.
if cmp --silent ./cache/compare.json ./cache/compare-old.json; then
	echo "No change to the posts - $OUT left as it is."
	exit 0
fi

jq -f ./config/extract-posts.jq "$RAW" > ./cache/extracted.json

if ! cmp --silent ./cache/extracted.json ./cache/extracted-old.json; then
	# The page is written by build-html.py itself, not captured from stdout -
	# stdout only carries the run summary.
	./build-html.py ./cache/extracted.json "$OUT"
	cp ./cache/extracted.json ./cache/extracted-old.json
fi

cp ./cache/compare.json ./cache/compare-old.json
