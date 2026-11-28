exports.up=pgm=>pgm.sql(`
ALTER TABLE kd.configuration_version DROP CONSTRAINT configuration_version_domain_check;
ALTER TABLE kd.configuration_version ADD CONSTRAINT configuration_version_domain_check CHECK(domain IN('economy','shop','trading','commerce','starters','limited'));
ALTER TABLE kd.configuration_draft DROP CONSTRAINT configuration_draft_domain_check;
ALTER TABLE kd.configuration_draft ADD CONSTRAINT configuration_draft_domain_check CHECK(domain IN('economy','shop','trading','commerce','starters','limited'));
ALTER TABLE kd.reward_entitlement ADD COLUMN allocation_id text;
CREATE TABLE kd.limited_reward_outcome (
 id uuid PRIMARY KEY,entitlement_id uuid NOT NULL REFERENCES kd.reward_entitlement(id),unit_index integer NOT NULL CHECK(unit_index>=0),
 status text NOT NULL CHECK(status IN('issued','exhausted','pending')),instance_id uuid REFERENCES kd.limited_instance(id),
 reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(entitlement_id,unit_index,status)
);
CREATE TRIGGER immutable_limited_reward_outcome BEFORE UPDATE OR DELETE ON kd.limited_reward_outcome FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
CREATE FUNCTION kd.complete_limited_instance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item record;
BEGIN
 SELECT * INTO item FROM kd.limited_instance WHERE id=NEW.id;
 IF item.state='issuing' OR item.delivery IS NULL THEN RAISE EXCEPTION 'Incomplete limited issuance cannot commit';END IF;
 IF jsonb_array_length(item.definition_snapshot->'contents')<>(SELECT count(*) FROM kd.limited_component WHERE instance_id=item.id) THEN RAISE EXCEPTION 'Limited components must reconcile to the original promise';END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER limited_issuance_complete AFTER INSERT OR UPDATE ON kd.limited_instance DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION kd.complete_limited_instance();
CREATE FUNCTION kd.limited_delivery_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.state<>'issuing' AND NEW.delivery IS DISTINCT FROM OLD.delivery THEN RAISE EXCEPTION 'Original limited delivery is immutable'; END IF;
 IF NEW.owner_id<>OLD.owner_id AND NOT EXISTS(SELECT 1 FROM kd.limited_history WHERE instance_id=NEW.id AND operation='transferred' AND from_player=OLD.owner_id AND to_player=NEW.owner_id AND created_at=now()) THEN RAISE EXCEPTION 'Limited ownership transfer requires permanent history'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER limited_delivery_guard BEFORE UPDATE ON kd.limited_instance FOR EACH ROW EXECUTE FUNCTION kd.limited_delivery_immutable();
`);
exports.down=()=>{throw Error('Limited collectible integration preserves forward-only ownership and audit history.');};
