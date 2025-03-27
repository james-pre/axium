# Axium

> [!WARNING]
> This is a work in progress and under active development!

Axium is a platform for anything.
Building a self-hosted productively app?
The next big tech start-up?
Axium provides a foundation for you to work off of.

## Server

### Database

When setting up the database, you will need to add the following lines to `pg_hba.conf` (usually in `/var/lib/pgsql/data`) _before_ the lines containing `all all`:

```
local axium axium md5
host  axium axium 127.0.0.1/32 md5
host  axium axium ::1/128 md5
```

Then, you can run `axium db init`.
