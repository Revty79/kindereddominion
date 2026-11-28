exports.up=pgm=>pgm.sql(`
CREATE TABLE kd.trading_collectible_listing (
 id uuid PRIMARY KEY,player_id uuid NOT NULL REFERENCES kd.player(id),instance_id uuid NOT NULL REFERENCES kd.limited_instance(id),
 status text NOT NULL CHECK(status IN('active','closed')),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_public_collectible_listing ON kd.trading_collectible_listing(instance_id) WHERE status='active';
CREATE INDEX collectible_listing_browse ON kd.trading_collectible_listing(status,updated_at DESC,id);
CREATE TABLE kd.trading_collectible_listing_history (
 listing_id uuid NOT NULL REFERENCES kd.trading_collectible_listing(id),revision integer NOT NULL,
 actor_id uuid NOT NULL REFERENCES kd.player(id),snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(listing_id,revision)
);
CREATE FUNCTION kd.protect_collectible_listing() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-'status'-'revision'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'revision'-'updated_at') OR NEW.revision<>OLD.revision+1
 THEN RAISE EXCEPTION 'Exact collectible listing identity and revisions are immutable';END IF;RETURN NEW;
END $$;
CREATE TRIGGER protected_collectible_listing BEFORE UPDATE ON kd.trading_collectible_listing FOR EACH ROW EXECUTE FUNCTION kd.protect_collectible_listing();
CREATE TRIGGER retained_collectible_listing BEFORE DELETE ON kd.trading_collectible_listing FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
CREATE TRIGGER immutable_collectible_listing_history BEFORE UPDATE OR DELETE ON kd.trading_collectible_listing_history FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
`);
exports.down=()=>{throw Error('Use forward recovery; collectible listing history must be retained.');};
