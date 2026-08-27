CREATE OR REPLACE FUNCTION notify_sync_event()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('axium_sync', NEW."index"::text);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
