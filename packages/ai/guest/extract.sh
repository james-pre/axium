#!/bin/sh
# Extracts the image's layers from /layers onto the disk mounted at /work, applying each layer's deletions first.
set -e

for layer in /layers/*; do
	tar -tf "$layer" | grep -E '(^|/)\.wh\.' | while IFS= read -r entry; do
		entry=${entry#./}
		directory=$(dirname -- "$entry")
		name=$(basename -- "$entry")
		if [ "$name" = .wh..wh..opq ]; then
			if [ -d "/work/$directory" ]; then find "/work/$directory" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; fi
		else
			rm -rf -- "/work/$directory/${name#.wh.}"
		fi
	done
	tar -xpf "$layer" -C /work --numeric-owner --exclude='.wh.*'
done

mkdir -p /work/sandbox /work/work
