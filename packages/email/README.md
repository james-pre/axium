# Axium Email

This is a plugin for sending and receiving email using Axium.

Users get an address based on their username and the configured domain (e.g. `jane@example.com`).
Mail between users on the same server is delivered internally.
External mail is received by the plugin's built-in SMTP listener and sent using a configured relay,
or delivered directly to the recipient's mail server if no relay is configured.

## Setup

1. Generate a DKIM key: `axium email dkim-keygen` (set `outbound.dkim.key_file` first, or pass `--out`).
2. Create the DNS records printed by `axium email dns` (MX, SPF, DKIM, DMARC).
3. Make sure port 25 is reachable from the internet for receiving.
4. If your host can't send on port 25 directly (most residential and many cloud IPs), configure `outbound.relay`.

## Configuration

```jsonc
{
	// If set, overrides the main config's `origin`
	"domain": "example.com",
	"inbound": {
		"enabled": true,
		"port": 25,
		"max_size": 25000, // in KB
	},
	"outbound": {
		// If no host is set, mail is delivered directly to the recipient's MX
		"relay": { "host": "", "port": 587, "user": "", "pass": "", "secure": false },
		"dkim": { "selector": "axium", "key_file": "" },
	},
}
```

## CLI

- `axium email dns` — print the DNS records you need to create.
- `axium email dkim-keygen` — generate a DKIM signing key.
- `axium email queue` — inspect the outbound queue (`--retry` to retry failed messages).
