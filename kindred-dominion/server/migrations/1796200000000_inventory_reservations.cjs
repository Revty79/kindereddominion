const fs=require('node:fs'),crypto=require('node:crypto');
exports.up=pgm=>pgm.sql(`
CREATE TABLE kd.trading_account (
 player_id uuid PRIMARY KEY REFERENCES kd.player(id), restricted boolean NOT NULL DEFAULT false,
 restriction_until timestamptz, reason text NOT NULL, actor_id uuid NOT NULL REFERENCES kd.player(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kd.reservation_scope (
 id uuid PRIMARY KEY, player_id uuid NOT NULL REFERENCES kd.player(id), purpose text NOT NULL,
 reference_id uuid NOT NULL, fingerprint text NOT NULL, requested jsonb NOT NULL,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(player_id,purpose,reference_id), CHECK(expires_at>created_at)
);
CREATE TABLE kd.inventory_reservation (
 id uuid PRIMARY KEY, scope_id uuid NOT NULL REFERENCES kd.reservation_scope(id),
 player_id uuid NOT NULL REFERENCES kd.player(id), lot_id uuid NOT NULL REFERENCES kd.ownership_lot(id),
 quantity integer NOT NULL CHECK(quantity>0), expires_at timestamptz NOT NULL,
 released_at timestamptz, release_reason text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(scope_id,lot_id), CHECK((released_at IS NULL)=(release_reason IS NULL))
);
CREATE INDEX inventory_reservation_active ON kd.inventory_reservation(player_id,expires_at,id) WHERE released_at IS NULL;
CREATE TABLE kd.legacy_reservation_anchor (
 lot_id uuid PRIMARY KEY REFERENCES kd.ownership_lot(id), quantity integer NOT NULL CHECK(quantity>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Preserve any preexisting unknown reservation counters without inventing an
-- offer or releasing protected assets. Resolution requires an audited workflow.
INSERT INTO kd.legacy_reservation_anchor(lot_id,quantity) SELECT id,reserved FROM kd.ownership_lot WHERE reserved>0;
CREATE FUNCTION kd.protect_inventory_reservation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-'released_at'-'release_reason') IS DISTINCT FROM (to_jsonb(OLD)-'released_at'-'release_reason')
 OR OLD.released_at IS NOT NULL OR NEW.released_at IS NULL OR NEW.release_reason IS NULL
 THEN RAISE EXCEPTION 'Reservation terms are immutable and release is final'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER immutable_reservation_terms BEFORE UPDATE ON kd.inventory_reservation FOR EACH ROW EXECUTE FUNCTION kd.protect_inventory_reservation();
CREATE TRIGGER retained_inventory_reservation BEFORE DELETE ON kd.inventory_reservation FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
CREATE TRIGGER immutable_reservation_scope BEFORE UPDATE OR DELETE ON kd.reservation_scope FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
CREATE TRIGGER immutable_legacy_reservation_anchor BEFORE UPDATE OR DELETE ON kd.legacy_reservation_anchor FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
INSERT INTO kd.migration_checksum(name,sha256) VALUES('1796200000000_inventory_reservations.cjs','${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}');
`);
exports.down=()=>{throw Error('Destructive down migrations are disabled; restore a verified separate database.');};
