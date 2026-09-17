# extract-posts.jq
#
# Usage:
#   jq -f extract-posts.jq ncanfb.json > extracted.json
#
# For every post, keeps (only if present):
#   url, topLevelUrl, facebookUrl, timestamp, text, link, user.name,
#   media[0].thumbnail
#
# If the post has a sharedPost, adds a trimmed `sharedPost` object keeping
# (only if present):
#   url, timestamp, user.name, user.profileUrl, text, media[0].thumbnail, link
#
# For both media arrays: if media[0] carries a `mediaset_token` property, it's
# a gallery header rather than a real photo (and has no thumbnail of its
# own), so media[1] is used instead.
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

# Picks the right media item's thumbnail: media[1] if media[0] has a
# mediaset_token, otherwise media[0]. Returns null if there's no usable item.
def media_thumbnail:
  if (. == null or length == 0) then null
  else
    (if (.[0] | type == "object" and has("mediaset_token")) then .[1] else .[0] end) as $item
    | if $item == null then null else $item.thumbnail end
  end;

map(
  . as $post
  | (reduce paths_to_keep[] as $p (
      {};
      if ($post | getpath($p)) != null
      then setpath($p; ($post | getpath($p)))
      else .
      end
    )) as $base
  | ($post.media | media_thumbnail) as $thumb
  | ($post.sharedPost.media | media_thumbnail) as $sp_thumb
  | ($base
      | if $thumb != null then setpath(["media", 0, "thumbnail"]; $thumb) else . end
      | if $sp_thumb != null then setpath(["sharedPost", "media", 0, "thumbnail"]; $sp_thumb) else . end
    )
)
| sort_by(.timestamp) | reverse
| .[0:3]

