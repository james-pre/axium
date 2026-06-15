#!/usr/bin/env sh
# Axium server installer.
#
#   curl -sS https://jamespre.dev/axium-install.sh | sh
#
#
# Environment overrides (all optional):
#   AXIUM_INSTALL_DIR  Where to install Axium (default: /var/lib/axium). The
#                      install is always a self-contained npm project here.
#   AXIUM_NONINTERACTIVE  Set to 1 to accept all defaults without prompting
#   AXIUM_PLUGINS      Space-separated plugin short names to install (skips the prompt)
#   AXIUM_NODE         Node.js binary path or command to use (overrides detection).
#                      e.g. `node-24` on Fedora with the nodejs24 package installed.
#   AXIUM_CONFIG_SCOPE Where Axium config is written:
#                        `global` -> /etc/axium/config.json
#                        `local` -> <install dir>/.axium/config.json
#
# This script is POSIX sh; it can run under `sh`, dash, etc. — not just bash.

set -eu

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Official Axium plugins, published under the @axium/ scope on npm.
# Hard-coded because they change rarely; update this list when plugins are added.
# Format: "shortname|description"
AXIUM_OFFICIAL_PLUGINS="
storage|File storage and sharing
calendar|Calendars and events
contacts|Contact management
notes|Notes
tasks|Task and to-do lists
"

DEFAULT_INSTALL_DIR="/var/lib/axium"
SERVICE_PATH="/etc/systemd/system/axium.service"
SERVICE_USER="axium"

NODEJS_V_REQUIRED=22
NODEJS_V_RECOMMENDED=24

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

# Only emit color when stdout is a terminal.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
	C_RESET=$(printf '\033[0m')
	C_BOLD=$(printf '\033[1m')
	C_DIM=$(printf '\033[2m')
	C_RED=$(printf '\033[31m')
	C_GREEN=$(printf '\033[32m')
	C_YELLOW=$(printf '\033[33m')
	C_BLUE=$(printf '\033[34m')
	C_CYAN=$(printf '\033[36m')
else
	C_RESET='' C_BOLD='' C_DIM='' C_RED='' C_GREEN='' C_YELLOW='' C_BLUE='' C_CYAN=''
fi



step()  { printf '\n%s==>%s %s%s%s\n' "${C_BLUE}${C_BOLD}" "${C_RESET}" "${C_BOLD}" "$1" "${C_RESET}"; }
info()  { printf '    %s\n' "$1"; }
ok()    { printf '%s✔%s %s\n' "${C_GREEN}" "${C_RESET}" "$1"; }
warn()  { printf '%s warning:%s %s\n' "${C_YELLOW}${C_BOLD}" "${C_RESET}" "$1" >&2; }
die()   { printf '%s error:%s %s\n' "${C_RED}${C_BOLD}" "${C_RESET}" "$1" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Prompt helpers
# ---------------------------------------------------------------------------

NONINTERACTIVE=${AXIUM_NONINTERACTIVE:-0}

# Read input from the controlling terminal even when the script body arrives on
# stdin (the `curl | sh` case). Falls back to stdin if no tty is available.
if [ -r /dev/tty ]; then
	TTY=/dev/tty
else
	TTY=/dev/stdin
	[ "$NONINTERACTIVE" = 1 ] || warn 'No terminal available; running with default answers.'
	NONINTERACTIVE=1
fi

# ask_yn "question" "default(y/n)" -> returns 0 for yes, 1 for no
ask_yn() {
	_q=$1; _def=$2
	if [ "$_def" = y ]; then _hint='[Y/n]'; else _hint='[y/N]'; fi
	if [ "$NONINTERACTIVE" = 1 ]; then
		[ "$_def" = y ] && return 0 || return 1
	fi
	while true; do
		printf '%s?%s %s %s ' "${C_CYAN}${C_BOLD}" "${C_RESET}" "$_q" "$_hint"
		IFS= read -r _ans < "$TTY" || _ans=''
		[ -z "$_ans" ] && _ans=$_def
		case $_ans in
			[Yy]*) return 0 ;;
			[Nn]*) return 1 ;;
			*) warn 'Please answer y or n.' ;;
		esac
	done
}

# ask "question" "default" -> echoes the answer
ask() {
	_q=$1; _def=$2
	if [ "$NONINTERACTIVE" = 1 ]; then printf '%s' "$_def"; return; fi
	if [ -n "$_def" ]; then
		printf '%s?%s %s %s(%s)%s ' "${C_CYAN}${C_BOLD}" "${C_RESET}" "$_q" "${C_DIM}" "$_def" "${C_RESET}" >/dev/tty
	else
		printf '%s?%s %s ' "${C_CYAN}${C_BOLD}" "${C_RESET}" "$_q" >/dev/tty
	fi
	IFS= read -r _ans < "$TTY" || _ans=''
	[ -z "$_ans" ] && _ans=$_def
	printf '%s' "$_ans"
}

# ---------------------------------------------------------------------------
# Privilege helpers
# ---------------------------------------------------------------------------

if [ "$(id -u)" = 0 ]; then
	SUDO=''
else
	if command -v sudo >/dev/null 2>&1; then
		SUDO='sudo'
	else
		die 'This installer needs root privileges and sudo was not found. Re-run as root.'
	fi
fi

# The human running the installer. When invoked via sudo, $(id -un) is root, so
# prefer $SUDO_USER. Used to grant group access to the install/config for manual
# administration later. Empty if we genuinely started as root with no SUDO_USER.
INVOKING_USER=${SUDO_USER:-}
[ -z "$INVOKING_USER" ] && [ "$(id -u)" != 0 ] && INVOKING_USER=$(id -un)

run_root() {
	if [ -n "$SUDO" ]; then $SUDO "$@"; else "$@"; fi
}

# Run a command as a specific user. Works whether the script runs as root
# (uses `sudo -u`/`runuser`) or as a normal user with sudo available.
run_as() {
	_user=$1; shift
	if [ "$(id -u)" = 0 ]; then
		runuser -u "$_user" -- "$@"
	else
		sudo -u "$_user" -- "$@"
	fi
}

# Where Axium config is written.
# `global` -> /etc/axium/config.json
# `local` -> <install dir>/.axium/config.json
CONFIG_SCOPE=${AXIUM_CONFIG_SCOPE:-global}
case $CONFIG_SCOPE in
	global|local) ;;
	*) die "Invalid AXIUM_CONFIG_SCOPE: ${CONFIG_SCOPE} (expected 'global' or 'local')." ;;
esac
# Flag passed to `axium config set`: global writes to /etc/axium, local to the
# install dir's config (dirs.at(-1) at runtime, i.e. <install dir>/.axium).
[ "$CONFIG_SCOPE" = global ] && CONFIG_SET_FLAG='--global' || CONFIG_SET_FLAG=''

# State shared across the install flow below.
NODE=${AXIUM_NODE:-node}   # resolved Node.js command; may be retargeted on Fedora
INSTALL_DIR=''             # self-contained npm project dir; always used
USE_GIT=0                  # whether to `git init` the install dir
SELECTED_PLUGINS=''        # space-separated plugin short names
SERVICE_INSTALLED=0
SERVICE_ENABLED=0

# Scratch space for passing data out of subshelled loops.
TMP_SEL=$(mktemp 2>/dev/null || echo /tmp/axium-sel.$$)
trap 'rm -f "$TMP_SEL" 2>/dev/null || true' EXIT INT TERM

# ===========================================================================
# Detect distribution
# ===========================================================================

if [ -r /etc/os-release ]; then
	# shellcheck disable=SC1091
	. /etc/os-release
	DISTRO_ID=${ID:-unknown}
	DISTRO_LIKE=${ID_LIKE:-}
	DISTRO_NAME=${PRETTY_NAME:-$DISTRO_ID}
else
	die 'Cannot detect your distribution (no /etc/os-release).'
fi

# Normalize into a package-manager family.
case " $DISTRO_ID $DISTRO_LIKE " in
	*" fedora "*|*" rhel "*|*" centos "*) PKG_FAMILY=rhel ;;
	*" debian "*|*" ubuntu "*)            PKG_FAMILY=debian ;;
	*" arch "*)                           PKG_FAMILY=arch ;;
	*)
		case $DISTRO_ID in
			fedora|rhel|centos|rocky|almalinux) PKG_FAMILY=rhel ;;
			debian|ubuntu|pop|linuxmint)        PKG_FAMILY=debian ;;
			arch|manjaro|endeavouros)           PKG_FAMILY=arch ;;
			*) die "Unsupported distribution: ${DISTRO_NAME}. Supported families: Fedora/RHEL, Debian/Ubuntu, Arch." ;;
		esac
		;;
esac

info "Detected: ${C_BOLD}${DISTRO_NAME}${C_RESET} (${PKG_FAMILY} family)"

# ===========================================================================
# Choose install location & source control
# ===========================================================================
#
# Every install is a real npm project (a directory with package.json + node_modules)
# so that plugin specifiers resolve from a sibling node_modules
# and the systemd unit's `%Y/../../..` walk-up lands on a real project root.
# Git tracking is an orthogonal choice (whether to `git init` the dir).

step 'Install location'
printf '\n'

INSTALL_DIR=$(ask 'Where should Axium be installed?' "${AXIUM_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}")

# Refuse to clobber an existing install.
if [ -e "$INSTALL_DIR/package.json" ] || [ -d "$INSTALL_DIR/node_modules/@axium" ]; then
	die "An Axium install already exists at ${INSTALL_DIR}. Remove it first or choose another location."
fi
ok "Installing to ${INSTALL_DIR}"

printf '\n'
info 'Tracking the instance with git records configuration history and makes upgrades and rollbacks easier to manage.'
if ask_yn 'Track your Axium instance with source control (git)?' y; then
	command -v git >/dev/null 2>&1 || die 'git was requested but is not installed.'
	USE_GIT=1
	ok 'Git tracking enabled'
fi

# ===========================================================================
# Choose plugins
# ===========================================================================

step 'Plugins'
info 'Select which official Axium plugins to install.'
printf '\n'

if [ -n "${AXIUM_PLUGINS:-}" ]; then
	SELECTED_PLUGINS=$AXIUM_PLUGINS
	ok "Plugins from AXIUM_PLUGINS: ${SELECTED_PLUGINS:-none}"
elif [ "$NONINTERACTIVE" = 1 ]; then
	# Default to the full official set in non-interactive mode.
	SELECTED_PLUGINS=$(printf '%s\n' "$AXIUM_OFFICIAL_PLUGINS" | while IFS='|' read -r name desc; do
		[ -n "$name" ] && printf '%s ' "$name"
	done)
	ok "Installing all plugins: ${SELECTED_PLUGINS}"
else
	printf '%s\n' "$AXIUM_OFFICIAL_PLUGINS" | while IFS='|' read -r name desc; do
		[ -z "$name" ] && continue
		printf '      %s%-10s%s %s%s%s\n' "${C_BOLD}" "$name" "${C_RESET}" "${C_DIM}" "$desc" "${C_RESET}"
	done
	printf '\n'

	# The loop runs in a subshell (pipe), so accumulate selections in a temp file.
	printf '%s\n' "$AXIUM_OFFICIAL_PLUGINS" | { _sel=''; while IFS='|' read -r name desc; do
		[ -z "$name" ] && continue
		if ask_yn "Install ${C_BOLD}${name}${C_RESET}?" y; then
			_sel="$_sel $name"
		fi
	done
	printf '%s' "$_sel" > "$TMP_SEL"; }
	SELECTED_PLUGINS=$(cat "$TMP_SEL")

	if [ -z "$SELECTED_PLUGINS" ]; then
		info 'No plugins selected.'
	else
		ok "Selected:${SELECTED_PLUGINS}"
	fi
fi

# ===========================================================================
# Install system dependencies
# ===========================================================================
#
# Axium needs: Node.js (>= NODEJS_V_REQUIRED), PostgreSQL (server + `psql` client), and libvips (sharp's image backend).
# build-essential is pulled in case a native dependency needs to compile.
#
# Node.js is resolved first so an already installed, sufficiently new
# interpreter can be reused instead of forcing a package install.

step "Installing system dependencies for ${DISTRO_NAME}"

# --- Node.js ---

# Print the major version of a node command, or 0 if it can't be run.
node_major() {
	"$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0
}

if [ -n "${AXIUM_NODE:-}" ]; then
	# An explicit override short-circuits detection entirely.
	command -v "$AXIUM_NODE" >/dev/null 2>&1 || die "AXIUM_NODE=${AXIUM_NODE} was not found on PATH."
	NODE=$AXIUM_NODE
	_major=$(node_major "$NODE")
	[ "$_major" -ge "$NODEJS_V_REQUIRED" ] 2>/dev/null \
		|| warn "AXIUM_NODE (${NODE}) is Node.js v${_major}, below the required v${NODEJS_V_REQUIRED}. Proceeding as requested."
	ok "Using Node.js v${_major} from AXIUM_NODE (${NODE})"
	_node_ready=1
else
	_node_ready=0
	# Reuse an existing interpreter if it is new enough.
	if command -v node >/dev/null 2>&1; then
		_major=$(node_major node)
		if [ "$_major" -lt "$NODEJS_V_REQUIRED" ] 2>/dev/null; then
			warn "Detected Node.js v${_major}, below the required v${NODEJS_V_REQUIRED}."
			warn 'A newer Node.js will be installed; you may need to point the service at it'
			warn 'afterwards (re-run with AXIUM_NODE=<path> or set the node binary in the unit).'
		elif [ "$_major" -lt "$NODEJS_V_RECOMMENDED" ] 2>/dev/null; then
			warn "Detected Node.js v${_major}. Axium recommends v${NODEJS_V_RECOMMENDED} or newer."
			if ask_yn "Use the existing Node.js v${_major} instead of installing v${NODEJS_V_RECOMMENDED}?" y; then
				ok "Using existing Node.js v${_major}"
				_node_ready=1
			fi
		else
			ok "Using existing Node.js v${_major}"
			_node_ready=1
		fi
	fi
fi

if [ "$_node_ready" = 0 ]; then
	case $PKG_FAMILY in
		rhel)
			# Fedora ships npm as part of the nodejs package, so installing
			# `nodejs` alone keeps npm as a dependency (install reason isn't
			# `user`), which avoids it being flagged as orphaned later.
			# A versioned stream (e.g. nodejs24) may offer a newer major; prefer
			# it when it beats the default `nodejs` package.
			_versioned="nodejs${NODEJS_V_RECOMMENDED}"
			if dnf list --available "$_versioned" >/dev/null 2>&1 || dnf list --installed "$_versioned" >/dev/null 2>&1; then
				info "Installing ${_versioned}"
				run_root dnf install -y "$_versioned"
				# The versioned package installs `node-NN` alongside any default node.
				# Also symlinks to that unversioned node/npm/npx work
				if command -v "node-${NODEJS_V_RECOMMENDED}" >/dev/null 2>&1; then
					NODE="node-${NODEJS_V_RECOMMENDED}"
					for _bin in node npm npx; do
						_target="/usr/bin/${_bin}-${NODEJS_V_RECOMMENDED}"
						command -v "$_bin" >/dev/null 2>&1 && continue
						[ -e "$_target" ] || continue
						run_root ln -sf "$_target" "/usr/local/bin/${_bin}" \
							&& ok "Linked /usr/local/bin/${_bin} -> ${_target}"
					done
					command -v node >/dev/null 2>&1 && NODE=node
				fi
			else
				info 'Installing nodejs'
				run_root dnf install -y nodejs
			fi
			;;
		debian)
			# On Debian/Ubuntu npm is a separate package; install it as a
			# dependency so it isn't marked manually-installed.
			run_root apt-get update
			run_root env DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs npm
			;;
		arch)
			run_root pacman -Sy --needed --noconfirm nodejs npm
			;;
	esac

	command -v "$NODE" >/dev/null 2>&1 || NODE=node
	command -v "$NODE" >/dev/null 2>&1 || die 'Node.js was not installed correctly.'

	_major=$(node_major "$NODE")
	if [ "$_major" -lt "$NODEJS_V_REQUIRED" ] 2>/dev/null; then
		warn "Installed Node.js is v${_major}, still below the required v${NODEJS_V_REQUIRED}."
		warn 'Your distro may not package a new enough Node.js; consider nodesource or nvm,'
		warn 'then re-run with AXIUM_NODE=<path-to-node>.'
	else
		ok "Node.js v${_major} ready (${NODE})"
	fi
fi

# --- PostgreSQL, libvips, toolchain ---

enable_postgres() {
	info 'Enabling and starting PostgreSQL'
	run_root systemctl enable --now postgresql >/dev/null 2>&1 \
		|| warn 'Could not start PostgreSQL via systemd; ensure it is running before continuing.'
}

case $PKG_FAMILY in
	rhel)
		run_root dnf install -y \
			postgresql-server postgresql \
			vips \
			gcc-c++ make
		if [ ! -s /var/lib/pgsql/data/PG_VERSION ]; then
			info 'Initializing PostgreSQL database cluster'
			run_root postgresql-setup --initdb >/dev/null 2>&1 \
				|| run_root /usr/bin/postgresql-setup --initdb >/dev/null 2>&1 \
				|| warn 'Could not auto-initialize PostgreSQL; you may need to run postgresql-setup --initdb manually.'
		fi
		enable_postgres
		;;
	debian)
		run_root apt-get update
		run_root env DEBIAN_FRONTEND=noninteractive apt-get install -y \
			postgresql postgresql-client \
			libvips42 \
			build-essential \
			ca-certificates curl
		# Debian's postgresql package initializes and starts the cluster itself.
		;;
	arch)
		run_root pacman -Sy --needed --noconfirm \
			postgresql \
			libvips \
			base-devel
		if [ ! -s /var/lib/postgres/data/PG_VERSION ]; then
			info 'Initializing PostgreSQL database cluster'
			run_root -u postgres initdb -D /var/lib/postgres/data >/dev/null 2>&1 \
				|| warn 'Could not auto-initialize PostgreSQL; you may need to run initdb as the postgres user.'
		fi
		enable_postgres
		;;
esac

ok 'System dependencies installed'

# ===========================================================================
# Create the service user
# ===========================================================================
#
# The `axium` system user the daemon runs as. It gets a real login shell (so
# admins can `su - axium` to manage the instance) and its home set to the
# install dir, falling back to `/` if that is somehow unset.

if [ -n "$INSTALL_DIR" ]; then _home=$INSTALL_DIR; else _home=/; fi
# Prefer a real login shell, falling back to sh if bash is absent.
if [ -x /bin/bash ]; then _shell=/bin/bash; else _shell=/bin/sh; fi

if id "$SERVICE_USER" >/dev/null 2>&1; then
	# Already exists: make sure home points at the install dir.
	run_root usermod --home "$_home" "$SERVICE_USER" 2>/dev/null || true
	info "Note: reusing system user '${SERVICE_USER}' (home set to ${_home})."
else
	step "Creating system user '${SERVICE_USER}'"
	# --no-create-home: the install dir is created/owned separately; don't
	# scaffold a skeleton home over it (and `/` must never be touched).
	run_root useradd --system --no-create-home --home-dir "$_home" --shell "$_shell" "$SERVICE_USER" 2>/dev/null \
		|| run_root useradd -r -d "$_home" -s "$_shell" "$SERVICE_USER" 2>/dev/null \
		|| warn "Could not create '${SERVICE_USER}' user; create it manually if the service fails to start."
	ok "Created system user '${SERVICE_USER}' (home: ${_home}, shell: ${_shell})"
fi

# Add the invoking user to the axium group so they can read/manage the install
# and config later (config dirs are made group-writable below).
if [ -n "$INVOKING_USER" ] && [ "$INVOKING_USER" != "$SERVICE_USER" ]; then
	run_root usermod -aG "$SERVICE_USER" "$INVOKING_USER" 2>/dev/null \
		&& ok "Added '${INVOKING_USER}' to the '${SERVICE_USER}' group (effective on next login)" \
		|| warn "Could not add '${INVOKING_USER}' to the '${SERVICE_USER}' group."
fi

# ===========================================================================
# Install Axium
# ===========================================================================

step 'Installing Axium'

info "Setting up Axium in ${INSTALL_DIR}"
run_root mkdir -p "$INSTALL_DIR"
# Own the dir as the invoking user during setup so npm/git run without root;
# ownership is handed to the axium service user once everything is in place.
run_root chown "$(id -un):$(id -gn)" "$INSTALL_DIR"

# A minimal package.json makes this a real npm project so local installs and
# package resolution (for plugins) work as expected.
if [ ! -e "$INSTALL_DIR/package.json" ]; then
	cat > "$INSTALL_DIR/package.json" <<-EOF
	{
	  "name": "axium-instance",
	  "private": true,
	  "type": "module",
	  "description": "Axium server instance"
	}
	EOF
fi

[ "$CONFIG_SCOPE" = local ] && mkdir -p "$INSTALL_DIR/.axium"

if [ "$USE_GIT" = 1 ] && [ ! -d "$INSTALL_DIR/.git" ]; then
	( cd "$INSTALL_DIR" && git init -q )
	cat > "$INSTALL_DIR/.gitignore" <<-EOF
	node_modules/
	build/
	*.log
	EOF
fi

info 'Installing the Axium server and selected plugins'

# Expand selected plugin short names to fully-qualified npm package names.
plugin_packages() {
	for _p in $SELECTED_PLUGINS; do
		printf '@axium/%s ' "$_p"
	done
}

# All packages go in one local node_modules tree, so plugin resolution against
# @axium/server (a peer of every plugin) works correctly.
( cd "$INSTALL_DIR" && npm install --no-fund --no-audit @axium/server $(plugin_packages) )

# Also install the server globally so a system-wide `axium` binary exists
# Used for root-only steps like `ports enable`, and convenient for admins.
info 'Symlinking the global axium CLI'

_axium_bin_target="$INSTALL_DIR/node_modules/@axium/server/dist/main.js"		
run_root ln -sf "$_axium_bin_target" "/usr/local/bin/axium" \
	&& ok "Linked /usr/local/bin/axium -> ${_axium_bin_target}"
					
run_root chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
if [ "$CONFIG_SCOPE" = global ]; then
	run_root mkdir -p /etc/axium
	run_root chown -R "$SERVICE_USER:$SERVICE_USER" /etc/axium
fi

ok "Axium installed in ${INSTALL_DIR}"

# Run the axium CLI as the service user from the install dir
axium_cli() {
	( cd "$INSTALL_DIR" && run_root npx axium "$@" < "$TTY" )
}

# ===========================================================================
# Enable plugins
# ===========================================================================
#
# Register the selected plugins in the config, before `axium init` so it sets up
# their DB tables in one pass. The specifier form depends on the config scope:
#   global -> ABSOLUTE paths into the install dir's node_modules. A bare name
#             would be resolved by Node relative to /etc/axium, which can't see
#             the install dir's node_modules.
#   local  -> bare specifiers (@axium/storage). The config lives in the install
#             dir's .axium, so Node resolves them from the sibling node_modules.

if [ -n "$SELECTED_PLUGINS" ]; then
	step 'Enabling plugins'

	_json='['
	_first=1
	for _p in $SELECTED_PLUGINS; do
		[ "$_first" = 1 ] || _json="$_json,"
		if [ "$CONFIG_SCOPE" = global ]; then
			_json="$_json\"$INSTALL_DIR/node_modules/@axium/$_p\""
		else
			_json="$_json\"@axium/$_p\""
		fi
		_first=0
	done
	_json="$_json]"

	axium_cli config set plugins "$_json" --json $CONFIG_SET_FLAG >/dev/null
	ok "Registered plugins:${SELECTED_PLUGINS}"
fi

# ===========================================================================
# Initialize Axium
# ===========================================================================

step 'Initializing Axium'
axium_cli init -y
ok 'Axium initialized'

# ===========================================================================
# Configuration
# ===========================================================================

# Prompt for a config value, defaulting to its current (possibly default) value.
# Only writes via `axium config set` when the user actually supplies a value, so
# unchanged keys stay unset in the config file and continue to track the default.
# Echoes the effective value (from `axium config get`).
configure_value() {
	_key=$1; _prompt=$2
	_current=$(axium_cli config get "$_key" 2>/dev/null || true)
	_answer=$(ask "$_prompt" "$_current")
	# Only persist when the user changed it from the current value.
	if [ -n "$_answer" ] && [ "$_answer" != "$_current" ]; then
		axium_cli config set "$_key" "$_answer" $CONFIG_SET_FLAG >/dev/null
	fi
	# Report the effective value as Axium parses/normalizes it.
	ok "${_key} = $(axium_cli config get "$_key" 2>/dev/null)"
}

step 'Configuration'

# Preset config values
axium_cli config set web.build "$INSTALL_DIR/build/handler.js" $CONFIG_SET_FLAG >/dev/null

configure_value origin 'Public origin (the URL users will visit)'
case "$(axium_cli config get origin 2>/dev/null)" in
	http:*) warn 'Origin uses regular http, passkeys/WebAuthn require HTTPS (or localhost). Set up SSL or a TLS-terminating proxy.' ;;
esac

configure_value web.port 'Port to listen on'

printf '\n'
warn 'SSL/TLS is not configured automatically.'
info 'If Axium is exposed directly to the internet, set web.ssl_cert and'
info 'web.ssl_key to your certificate paths (e.g. from certbot/Let'\''s Encrypt).'
info 'If you sit behind a reverse proxy that terminates TLS (Cloudflare, nginx,'
info 'Caddy, Traefik, ...), you can disable Axium-level TLS with:'
info "    ${C_DIM}axium config set web.secure false${C_RESET}"

step 'Building'
axium_cli build
ok 'Finished build'

# ===========================================================================
# Normalize permissions
# ===========================================================================
#
# The config steps above ran the CLI as root, which may have created files owned by root.
# Hand everything back to the axium user before the commit and before the daemon starts.

step 'Finalizing permissions'
run_root chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
[ "$CONFIG_SCOPE" = global ] && run_root chown -R "$SERVICE_USER:$SERVICE_USER" /etc/axium

if [ "$CONFIG_SCOPE" = global ]; then _cfg=/etc/axium; else _cfg="$INSTALL_DIR/.axium"; fi
if [ -d "$_cfg" ]; then
	# g+s on dirs so files created later by either the daemon or a group member keep the axium group.
	run_root find "$_cfg" -type d -exec chmod g+ws {} + 2>/dev/null || true
	run_root find "$_cfg" -type f -exec chmod g+w {} + 2>/dev/null || true
fi
ok "Ownership normalized to '${SERVICE_USER}'"

# ===========================================================================
# Commit the initial instance
# ===========================================================================
#
# The install tree (and config, for local scope) is owned by the service user,
# so git must run as that user.
if [ "$USE_GIT" = 1 ] && ask_yn 'Commit the initial Axium instance to git?' y; then
	# -c safe.directory avoids git's "dubious ownership" refusal when run as the
	# service user; -c user.* provides an identity in case git has none configured.
	if run_as "$SERVICE_USER" git -C "$INSTALL_DIR" -c safe.directory="$INSTALL_DIR" add -A \
		&& run_as "$SERVICE_USER" git -C "$INSTALL_DIR" -c safe.directory="$INSTALL_DIR" \
			-c user.name='Axium Installer' -c user.email='axium@localhost' \
			commit -q -m 'Initial Axium instance'
	then
		ok 'Committed initial instance'
	else
		warn 'Could not create the initial commit.'
	fi
fi

# ===========================================================================
# Install the systemd service
# ===========================================================================

step 'systemd service'

if ! command -v systemctl >/dev/null 2>&1; then
	warn 'systemd not detected; skipping service installation.'
elif ! ask_yn 'Install the Axium systemd service?' y; then
	info 'Skipping systemd service.'
else
	# The unit ships inside @axium/server and is installed as a *symlink* into
	# /etc/systemd/system (via `systemctl link`). This is load-bearing: the unit
	# uses %Y (the directory of the resolved fragment), and for a symlinked unit
	# systemd resolves that to the real file's location — i.e. the package dir.
	# The unit then walks `%Y/../../..` out of node_modules to the install root
	# for `npx --prefix`. The real path is owned by the service user (above).
	_unit_src="$INSTALL_DIR/node_modules/@axium/server/axium.service"
	if [ ! -f "$_unit_src" ]; then
		warn 'Could not locate the axium.service unit; skipping service installation.'
	else
		# Re-runs: drop any stale link first.
		if [ -e "$SERVICE_PATH" ] || [ -L "$SERVICE_PATH" ]; then
			run_root rm -f "$SERVICE_PATH"
			run_root systemctl daemon-reload
		fi

		info "Linking service unit from ${_unit_src}"
		run_root systemctl link "$_unit_src"
		run_root systemctl daemon-reload
		SERVICE_INSTALLED=1
		ok 'systemd service installed'

		if ask_yn 'Enable the service (start automatically on boot)?' y; then
			run_root systemctl enable axium >/dev/null 2>&1 && SERVICE_ENABLED=1
			ok 'Service enabled'
		fi
	fi
fi

# ===========================================================================
# Start the service
# ===========================================================================

if [ "$SERVICE_INSTALLED" = 1 ] && ask_yn 'Start the Axium daemon now?' y; then
	step 'Starting Axium'
	if run_root systemctl start axium; then
		ok 'Axium daemon started'
	else
		warn 'Failed to start the daemon. Check: journalctl -u axium -e'
	fi
fi

# ===========================================================================
# Done
# ===========================================================================

step 'Done'

info "Installation directory: ${C_BOLD}${INSTALL_DIR}${C_RESET}"
info "Node.js in use: ${C_DIM}$(command -v $NODE), $(node --version)${C_RESET}"
info "Use ${C_DIM}axium help${C_RESET} for more information"

if [ "$SERVICE_INSTALLED" = 1 ]; then
	info "    Manage the daemon: ${C_DIM}systemctl {start,stop,status} axium${C_RESET}"
	info "    View logs:         ${C_DIM}journalctl -t axium -f${C_RESET}"
fi

printf '\n'
step 'Status'
axium_cli status || true
