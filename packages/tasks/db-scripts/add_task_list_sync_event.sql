CREATE OR REPLACE FUNCTION add_task_list_sync_event()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO sync_events (type, id, op)
        VALUES ('task_lists', OLD."listId", 'u');
        RETURN OLD;
    END IF;

    INSERT INTO sync_events (type, id, op)
    VALUES ('task_lists', NEW."listId", 'u');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
