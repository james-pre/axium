CREATE OR REPLACE FUNCTION add_sync_event()
RETURNS TRIGGER AS $$
DECLARE
    event_index bigint;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO sync_events (type, id, op)
        VALUES (TG_TABLE_NAME, OLD.id, 'd')
        RETURNING "index" INTO event_index;
        PERFORM pg_notify('axium_sync', event_index::text);
        RETURN OLD;

    ELSEIF (TG_OP = 'UPDATE') THEN
        INSERT INTO sync_events (type, id, op)
        VALUES (TG_TABLE_NAME, NEW.id, 'u')
        RETURNING "index" INTO event_index;
        PERFORM pg_notify('axium_sync', event_index::text);
        RETURN NEW;

    ELSEIF (TG_OP = 'INSERT') THEN
        INSERT INTO sync_events (type, id, op)
        VALUES (TG_TABLE_NAME, NEW.id, 'c')
        RETURNING "index" INTO event_index;
        PERFORM pg_notify('axium_sync', event_index::text);
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
