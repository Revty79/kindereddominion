const fs=require('node:fs'),crypto=require('node:crypto');
exports.up=pgm=>pgm.sql(`
CREATE TABLE kd.player_notification (
 id uuid PRIMARY KEY,player_id uuid NOT NULL REFERENCES kd.player(id),
 trade_event_id uuid NOT NULL REFERENCES kd.trade_event(id),offer_id uuid NOT NULL REFERENCES kd.trade_offer(id),
 version_id uuid NOT NULL REFERENCES kd.trade_offer_version(id),kind text NOT NULL,title text NOT NULL,body text NOT NULL,
 version_sequence integer NOT NULL,event_rank integer NOT NULL,created_at timestamptz NOT NULL,read_at timestamptz,
 UNIQUE(player_id,trade_event_id)
);
CREATE INDEX player_notification_inbox ON kd.player_notification(player_id,created_at DESC,version_sequence DESC,event_rank DESC,id);
CREATE INDEX player_notification_unread ON kd.player_notification(player_id) WHERE read_at IS NULL;
CREATE FUNCTION kd.protect_player_notification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'read_at') IS DISTINCT FROM (to_jsonb(OLD)-'read_at') OR
 (OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at) THEN
 RAISE EXCEPTION 'Notification source and read history are immutable'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER protected_player_notification BEFORE UPDATE ON kd.player_notification FOR EACH ROW EXECUTE FUNCTION kd.protect_player_notification();
CREATE TRIGGER retained_player_notification BEFORE DELETE ON kd.player_notification FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
INSERT INTO kd.migration_checksum(name,sha256) VALUES('1796500000000_player_notifications.cjs','${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}');
`);
exports.down=()=>{throw Error('Destructive down migrations are disabled; restore a verified separate database.');};
