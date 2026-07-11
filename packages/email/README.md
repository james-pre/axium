# Axium Email

This is a plugin for sending and receiving email using Axium.

Users get an address based on their username and the configured domain (e.g. `jane@example.com`),
derived from the server's `origin`. Mail between users on the same server is delivered internally.
External mail is received by the plugin's built-in SMTP listener.

Outbound delivery is handled by `@axium/server`: mail is sent using a configured relay,
or delivered directly to the recipient's mail server if no relay is configured.

## Setup

1. Generate a DKIM key: `axium dkim-keygen` (writes to `email.dkim.key_file`, or pass `--out`).
2. Create the DNS records printed by `axium email dns` (MX, SPF, DKIM, DMARC).
3. Make sure port 25 is reachable from the internet for receiving.
4. If your host can't send on port 25 directly (most residential and many cloud IPs), configure `email.relay` in the main config.

## Configuration

Outbound sending is configured in the main Axium config under `email`:

```jsonc
{
	"email": {
		"enabled": true,
		// If no host is set, mail is delivered directly to the recipient's MX
		"relay": { "host": "", "port": 587, "user": "", "pass": "", "secure": false },
		"dkim": { "selector": "axium", "key_file": "" },
	},
}
```

Inbound receiving is configured on the plugin (`@axium/email`):

```jsonc
{
	"inbound": {
		"enabled": true,
		"port": 25,
		"max_size": 25000, // in KB
		// Override the web SSL certificate for STARTTLS
		"ssl_key": "",
		"ssl_cert": "",
	},
}
```

## CLI

- `axium dkim-keygen`: generate a DKIM signing key.
- `axium email dns`: print the DNS records you need to create.
- `axium email queue`: inspect the outbound queue (`--retry` to retry failed messages).
