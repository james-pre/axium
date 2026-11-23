# Axium Office

This is a plugin for editing office documents (docx, xlsx, pptx, odt, ods, odp) stored in Axium's Files, in the browser.
Editing happens using any document server which supports the OnlyOffice Docs API, like [Euro-Office](https://github.com/euro-office).

## Deploying the document server

Axium patches the document server for better theming and other UX:

```sh
axium office patch-image                      # tags axium-documentserver
axium office patch-image --tag documents:9.3.8 ghcr.io/euro-office/documentserver:v9.3.8
```

Then run it. This example is for Docker Compose:

```yaml
services:
    documentserver:
        image: axium-documentserver
        restart: unless-stopped
        ports:
            - 127.0.0.1:8080:80
            - '[::1]:8080:80'
        environment:
            JWT_SECRET: ${OFFICE_SECRET} # the plugin's `secret`
        volumes:
            - ./documentserver/data:/var/www/euro-office/Data:z
            - logs:/var/log/euro-office/documentserver
            - cache:/var/lib/euro-office/documentserver
            - database:/var/lib/postgresql
            - ./fonts:/usr/share/fonts/truetype/custom:ro,z
        # Only if `internal_url` points at this host rather than Axium's public origin
        # extra_hosts:
        #     - host.docker.internal:host-gateway

volumes:
    logs:
    cache:
    database:
```

- **Secret:** `JWT_SECRET` must equal the plugin's `secret`. Generate one with `openssl rand -hex 32`.
- **Volumes:**
    - `Data` holds the server's generated secrets.
    - `cache` holds the files of open sessions.
    - `database` holds the session state that lets editing survive a restart.
    - `logs` is for troubleshooting.
    - `logs`, `cache` and `database` must be named volumes. Docker fills a named volume with the directories the image has at that path (the Postgres cluster, each service's log directory, the converter's working directories), while an empty bind mount hides them and the server exits at startup.
    - `:z` relabels bind mounts for SELinux. Without it, hosts that enforce SELinux deny the container's writes and it exits at startup.
- **Ports:** `localhost` may resolve to `::1` first, e.g. in `cloudflared`, so the port is published on both loopback addresses.
- **Fonts:** fonts in `/usr/share/fonts/truetype/custom` are indexed when the container starts. Documents whose fonts are missing are laid out with substitutes, so lines and pages break differently; e.g. Palatino Linotype is not included. Add the fonts your documents use (licensed copies, or metric-compatible ones such as TeX Gyre Pagella or URW P052 for Palatino).
- **Autosave:** the image saves open documents with changes every 5 minutes, not only when the last editor closes or someone presses Save.

### TLS and URLs

- **Cloudflare Tunnel:** route a hostname such as `documents.example.com` to `http://localhost:8080` and set `server_url` to `https://documents.example.com`. TLS ends at Cloudflare, and the container serves plain HTTP. The tunnel forwards `X-Forwarded-Proto: https` and the public `Host`, which the server uses for the absolute URLs it generates, so no setting is needed.
- **Other reverse proxies** must forward `Host` (or `X-Forwarded-Host`) and `X-Forwarded-Proto`. To serve the server under a path, the proxy strips the path and sends it as `X-Forwarded-Prefix`, and `server_url` includes it. A hostname of its own is simpler.
- **TLS in the container:** mount a certificate and key, set `SSL_CERTIFICATE_PATH` and `SSL_KEY_PATH` to their paths, and publish port 443, e.g. `8443:443` for the default `server_url`.
- **`server_internal_url`:** where Axium downloads saved documents from the document server; it defaults to `server_url`. Set it to a local address, e.g. `http://localhost:8080`, when requests from Axium to `server_url` would be blocked or slowed, as Cloudflare's bot protection does.
- **`internal_url`:** the container can reach Axium through its public origin, the default, which goes through the tunnel and needs no host mapping. Or it can use a local address, e.g. `https://host.docker.internal` with the `extra_hosts` entry above. That address needs a certificate the server trusts, or set `USE_UNAUTHORIZED_STORAGE=true`. Local Axium addresses also need `ALLOW_PRIVATE_IP_ADDRESS=true`.
