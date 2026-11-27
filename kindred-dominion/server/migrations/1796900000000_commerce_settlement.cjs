const fs=require('node:fs'),crypto=require('node:crypto');
exports.up=pgm=>pgm.sql(`
ALTER TABLE kd.commerce_event ADD COLUMN lease uuid,ADD COLUMN lease_until timestamptz,
 ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
 ADD CONSTRAINT complete_event_lease CHECK((lease IS NULL)=(lease_until IS NULL));
CREATE OR REPLACE FUNCTION kd.protect_commerce_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF(to_jsonb(NEW)-ARRAY['processing_state','attempts','error_code','processed_at','lease','lease_until','next_attempt_at']) IS DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['processing_state','attempts','error_code','processed_at','lease','lease_until','next_attempt_at']) OR NEW.attempts<OLD.attempts
 THEN RAISE EXCEPTION 'Verified provider event source is immutable';END IF;RETURN NEW;END $$;
CREATE TABLE kd.commerce_notification(
 id uuid PRIMARY KEY,player_id uuid NOT NULL REFERENCES kd.player(id),order_id uuid NOT NULL REFERENCES kd.commerce_order(id),
 event_id uuid NOT NULL REFERENCES kd.commerce_event(id),kind text NOT NULL,title text NOT NULL,body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz,UNIQUE(player_id,order_id,kind,event_id)
);
CREATE TRIGGER protected_commerce_notification BEFORE UPDATE ON kd.commerce_notification FOR EACH ROW EXECUTE FUNCTION kd.protect_player_notification();
CREATE TRIGGER retained_commerce_notification BEFORE DELETE ON kd.commerce_notification FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
CREATE INDEX commerce_notification_inbox ON kd.commerce_notification(player_id,created_at DESC,id);
CREATE INDEX commerce_purchase_order ON kd.shop_purchase(commercial_order_id) WHERE commercial_order_id IS NOT NULL;
INSERT INTO kd.migration_checksum(name,sha256) VALUES('1796900000000_commerce_settlement.cjs','${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}');
`);
exports.down=()=>{throw Error('Destructive down migrations are disabled; restore a verified separate database.');};
