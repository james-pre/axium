# Axium Storage

This is a plugin for allowing users to store data on an Axium server.

## Usage

Update the configuration to include the files data directory:

```json
{
	"storage": {
		"data": "/path/to/storage/data"
	}
}
```

Also, make sure to run `axium plugin init @axium/storage` to add the necessary database tables for the plugin.
