# Axium

> [!NOTE]
> This is a work in progress and under active development!

Axium is a composable platform for building applications.
Axium provides a foundation for you to work off of.

## Getting Started

### Installation script

```sh
curl -LsS https://jamespre.dev/axium-install.sh | bash # or whatever shell you use
```

### Manual installation

At the moment Axium only runs on Linux systems.

Make sure postgresql and Node.js are installed and set up. For postgres make sure to run `postgresql-setup --initdb`.

Then, install Axium and any plugins you want. Note that you may want to link the `axium` executable to `/usr/local/bin` so you can use it from anywhere and don't need to prefix commands with `npx`.

By default, Axium does not come with a home page. You can enable a testing/debug home page by setting `debug_home` to `true` in the configuration.

You can initialize Axium with a single command:

```sh
sudo axium init
```

Which is equivalent to running the various setup commands individually:

```sh
sudo axium ports enable # enables using :443 and :80, only needed if you want to change the port
sudo axium database init # also `... db init`, this adds Axium to the postgres config and sets up the database
```

After that you can use `axium status` to see if Axium is working correctly.

### systemd services

Axium ships two units, installed by symlinking the file out of its npm package
with `systemctl link`:

- **`axium.service`** (`@axium/server`) — the server daemon. It is a **system**
  unit, runs as the dedicated `axium` user, and binds privileged ports, so it is
  installed system-wide:

    ```sh
    sudo systemctl link  /path/to/node_modules/@axium/server/axium.service
    sudo systemctl enable --now axium
    ```

- **`axium-client.service`** (`@axium/client`) — the client daemon. It is
  per-user (its config/cache live under `~/.config/axium` and `~/.cache/axium`),
  so it is installed as a **user** unit and needs no root:

    ```sh
    systemctl --user link  /path/to/node_modules/@axium/client/axium-client.service
    systemctl --user enable --now axium-client
    # to keep it running when you are not logged in:
    loginctl enable-linger "$USER"
    ```

Both units locate their package's `node_modules` via the `%Y` specifier (the
directory of the resolved unit fragment) and run the daemon from there, so the
symlink installation is load-bearing — don't copy the unit elsewhere.

### Troubleshooting

#### `Unit axium.service not found` on SELinux systems

This affects the **system** unit (`axium.service`). Because it is installed with
`systemctl link`, the unit in `/etc/systemd/system` is a symlink to the real file
in your install directory. On SELinux-enforcing systems (e.g. Fedora/RHEL) that real
file keeps the label of wherever it lives (e.g. `user_home_t` for a clone under
your home directory, or `var_lib_t` under `/var/lib`). systemd runs as `init_t`
and is denied read access to such files, so it reports the unit as not found even
though the symlink exists.

The installer handles this automatically. If you linked a unit by hand, relabel
the real file as a systemd unit file:

```sh
# Persist the label (survives reboots and restorecon), then apply it now:
sudo semanage fcontext -a -t systemd_unit_file_t '/path/to/axium.service'
sudo restorecon -v '/path/to/axium.service'
sudo systemctl daemon-reload
```

You can confirm the denial with `sudo ausearch -m AVC -ts recent | grep axium`.

The **client** unit (`axium-client.service`) runs under `systemctl --user`, whose
manager is not `init_t`, so it is not subject to this denial.

#### `npm error 404 ... axium-client` when the client daemon starts

The client unit runs its bin (`axium-client`) out of the local `node_modules`.
If that resolution fails, `npx` falls back to the npm registry and 404s, because
there is no published package literally named `axium-client` (the bin comes from
`@axium/client`). Make sure the client package is actually installed at the
install root (`node_modules/@axium/client`) and that you linked the unit shipped
with your installed version rather than an older copy.

## Architecture

Axium is split up into three main components:

#### @axium/core

This includes schemas and types shared between the client and server.
It also includes cross-platform functions that can be used in both environments.

#### @axium/server

The server is the primary package for working with Axium. The package includes:

- Database functions and schemas
- The `axium` CLI for managing the server
- Built-in pages and API endpoints
- Authentication and authorization
- Routing
- Plugin APIs
- Configuration handling
- Sending email (via a relay or directly to the recipient's mail server)

#### @axium/client

The client provides a few things:

- The `axium-client`/`axc` client CLI
- Svelte UI components
- Utility functions

## Plugins

One of the key features of Axium is its plugin system.
Plugins allow you to extend the functionality of Axium by adding new API endpoints, GUI applications and routes, database models, and more.
Below you'll find descriptions of the official plugins maintained in this repository.

#### @axium/storage

The storage plugin, at a high level, is a cloud storage application.
It is similar to the cloud storage offered by large tech companies.
Unlike widely-used solutions, you can self-host it and always have full control over your data.
This plugin includes the Files app along with significant code infrastructure for managing files.

#### @axium/calendar

A calendar app for managing events. Still a work in progress.

#### @axium/contacts

Manage your contacts. This plugin adds the Contacts app and APIs to Axium.

#### @axium/tasks

Create to-do lists with ease. The tasks plugins adds the Tasks app and APIs to Axium.

#### @axium/notes

Take and manage notes. This plugin adds the Notes app and APIs to Axium.

#### @axium/email

A Gmail-like email experience. Users get an address based on their username and the server's domain,
with a built-in SMTP listener for receiving external mail and internal delivery between local users.

#### @axium/sysadmin

Administer your computers through Axium. Still a work in progress.
