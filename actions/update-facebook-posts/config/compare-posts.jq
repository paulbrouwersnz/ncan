# compare-posts.jq
#
# Usage:
#   jq -f compare-posts.jq ncanfb.json > compare.json
#
# Produces a change-detection fingerprint for the fetched posts: the same
# shape as extract-posts.jq, but WITHOUT the media thumbnails. Facebook's CDN
# links are signed and rotate on every fetch, so including them would make
# every run look like a change and rebuild the page needlessly. Comparing this
# output against the previous run tells us whether the posts themselves
# actually differ.
#
# For every post, keeps (only if present):
#   url, topLevelUrl, facebookUrl, timestamp, text, link, user.name
#
# If the post has a sharedPost, adds a trimmed `sharedPost` object keeping
# (only if present):
#   url, timestamp, user.name, user.profileUrl, text, link
#
# Result is sorted by the post's own timestamp, newest first, keeping only
# the top 3 posts.

def paths_to_keep:
  [
    ["url"],
    ["topLevelUrl"],
    ["facebookUrl"],
    ["timestamp"],
    ["text"],
    ["link"],
    ["user", "name"],

    ["sharedPost", "url"],
    ["sharedPost", "timestamp"],
    ["sharedPost", "user", "name"],
    ["sharedPost", "user", "profileUrl"],
    ["sharedPost", "text"],
    ["sharedPost", "link"]
  ];

map(
  . as $post
  | (reduce paths_to_keep[] as $p (
      {};
      if ($post | getpath($p)) != null
      then setpath($p; ($post | getpath($p)))
      else .
      end
    )) as $base
  | ($base
    )
)
| sort_by(.timestamp) | reverse
| .[0:3]

