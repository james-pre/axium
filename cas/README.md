# Axium CAS

This is a Content Addressable Storage (CAS) plugin for Axium, which provides a way to store and retrieve data based on its hash.

## Usage

Update the configuration to include the CAS data directory:

```json
{
	"cas": {
		"data": "/path/to/cas/data"
	}
}
```

Also, make sure to run `axium db init --skip` to add the necessary database tables for the CAS plugin.
