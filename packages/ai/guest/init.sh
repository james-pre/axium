#!/bin/sh
# Prepares the guest, then runs /sandbox/command in /work as the sandbox user, or as root when SANDBOX_USER=root.
set -e

mount -t tmpfs -o nosuid,nodev,mode=1777,size="${SANDBOX_TMP:-256m}" tmpfs /tmp
mount -t tmpfs -o nosuid,nodev,noexec,mode=755 tmpfs /run
if [ -n "$SANDBOX_WORK" ]; then mount -t ext4 -o nosuid,nodev "$SANDBOX_WORK" /work; fi

if [ -f /sandbox/forward ]; then
	setpriv --reuid=65534 --regid=65534 --clear-groups --no-new-privs -- python3 -I /sandbox/forward &
	tries=0
	until [ -e /tmp/.proxy-ready ] || [ "$tries" -ge 50 ]; do
		sleep 0.05
		tries=$((tries + 1))
	done
fi

shell=/bin/sh
if [ -x /bin/bash ]; then shell=/bin/bash; fi

cd /work
status=0
if [ "$SANDBOX_USER" = root ]; then
	"$shell" /sandbox/command || status=$?
else
	export PATH="$HOME/.local/bin:$PATH"
	setpriv --reuid="$SANDBOX_UID" --regid="$SANDBOX_UID" --clear-groups --inh-caps=-all --bounding-set=-all --no-new-privs -- "$shell" /sandbox/command || status=$?
fi

# libkrun loses the exit code when the root is a disk, so it goes to the host through a share only root can reach.
mkdir -m 700 /run/host
mount -t virtiofs -o nosuid,nodev,noexec exit /run/host
echo "$status" > /run/host/status
umount /run/host
exit "$status"
