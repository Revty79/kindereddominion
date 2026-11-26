const fs=require('node:fs'),crypto=require('node:crypto');
exports.up=pgm=>pgm.sql(`
-- JSONB reorders object keys. Existing engine replay signatures deliberately
-- preserve historical serialization order, so exact engine snapshots use JSON.
DO $$ BEGIN IF EXISTS(SELECT FROM kd.match) THEN RAISE EXCEPTION 'Match storage conversion requires an empty new installation; retain and review existing records first'; END IF; END $$;
ALTER TABLE kd.match ALTER COLUMN state TYPE json USING state::json;
ALTER TABLE kd.match ALTER COLUMN record TYPE json USING record::json;
ALTER TABLE kd.card_identity ADD CONSTRAINT canonical_collectible_number CHECK(collectible_number IS NULL OR collectible_number=prefix||lpad(serial,greatest(length(serial),3),'0'));
ALTER TABLE kd.deck ADD CONSTRAINT deck_player_identity UNIQUE(id,player_id);
ALTER TABLE kd.player DROP CONSTRAINT player_default_deck;
ALTER TABLE kd.player ADD CONSTRAINT player_default_deck FOREIGN KEY(default_deck_id,id) REFERENCES kd.deck(id,player_id);
CREATE FUNCTION kd.reject_immutable_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable history cannot be updated or deleted'; END $$;
CREATE TRIGGER immutable_content BEFORE UPDATE OR DELETE ON kd.content_version FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
CREATE TRIGGER immutable_card_revision BEFORE UPDATE OR DELETE ON kd.card_revision FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
CREATE TRIGGER immutable_acquisition BEFORE UPDATE OR DELETE ON kd.acquisition FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
CREATE TRIGGER immutable_inventory_entry BEFORE UPDATE OR DELETE ON kd.inventory_entry FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
CREATE TRIGGER immutable_match_action BEFORE UPDATE OR DELETE ON kd.match_action FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
CREATE TRIGGER immutable_match_completion BEFORE UPDATE OR DELETE ON kd.match_completion FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
CREATE FUNCTION kd.protect_card_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Permanent card identities cannot be deleted'; END IF;
  IF NEW.id<>OLD.id OR NEW.collectible_number IS DISTINCT FROM OLD.collectible_number OR NEW.kindred<>OLD.kindred OR NEW.set_id<>OLD.set_id OR NEW.prefix IS DISTINCT FROM OLD.prefix OR NEW.serial IS DISTINCT FROM OLD.serial OR (OLD.retired AND NOT NEW.retired) THEN RAISE EXCEPTION 'Permanent or retired collectible assignment cannot be changed'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER permanent_card_identity BEFORE UPDATE OR DELETE ON kd.card_identity FOR EACH ROW EXECUTE FUNCTION kd.protect_card_identity();
INSERT INTO kd.migration_checksum(name,sha256) VALUES('1795723000000_immutable_records.cjs','${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}');
`);
exports.down=()=>{throw Error('Destructive down migrations are disabled; use a verified isolated restore.');};
