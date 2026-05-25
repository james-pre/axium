CREATE OR REPLACE FUNCTION add_sync_event()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO sync_events (type, id, op)
        VALUES (TG_TABLE_NAME, OLD.id, 'd');
        RETURN OLD;
        
    ELSEIF (TG_OP = 'UPDATE') THEN
        INSERT INTO sync_events (type, id, op)
        VALUES (TG_TABLE_NAME, NEW.id, 'u');
        RETURN NEW;

    ELSEIF (TG_OP = 'INSERT') THEN
        INSERT INTO sync_events (type, id, op)
        VALUES (TG_TABLE_NAME, NEW.id, 'c');
        RETURN NEW;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
