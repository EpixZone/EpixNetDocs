#!/usr/bin/env bash
# Build the docs and copy them into a local xite folder, ready to sign.
#
#   scripts/build-xite.sh "<data folder>/data/<xite address>"
#
# The xite's content.json is left alone: open the xite in EpixNet afterwards
# and choose Sign & Publish in the sidebar. Files that no longer exist in the
# build are removed from the xite folder, so point this at the docs xite only.
set -euo pipefail

XITE_DIR="${1:?usage: scripts/build-xite.sh <path to the xite folder>}"
if [ ! -f "$XITE_DIR/content.json" ]; then
  echo "error: $XITE_DIR has no content.json, so it does not look like a xite folder" >&2
  exit 1
fi

cd "$(dirname "$0")/.."
NO_MKDOCS_2_WARNING=1 mkdocs build --strict --clean

# Left out of the xite to keep it small for the peers that seed it:
#  - source maps (debugging aids for the theme, about 1.3 MB)
#  - search stemmers for languages other than English (about 1 MB)
#  - sitemaps, which only matter on the public web
#  - partials/, theme override sources that the theme already inlines
# content.json and the signer's cache are protected; anything else in the
# folder that is not part of the build, excluded files included, is removed.
rsync -a --delete --delete-excluded \
  --filter='P /content.json' \
  --filter='P /.sign-cache.json' \
  --exclude='*.map' \
  --exclude='/assets/javascripts/lunr/' \
  --exclude='/sitemap.xml' \
  --exclude='/sitemap.xml.gz' \
  --exclude='/partials/' \
  site/ "$XITE_DIR"/

echo "Copied the build to $XITE_DIR"
echo "Next: open the xite in EpixNet, review it, then Sign & Publish from the sidebar."
