exports.up=pgm=>pgm.sql(`
CREATE TABLE kd.limited_edition (
 id text PRIMARY KEY, core jsonb NOT NULL, max_supply bigint NOT NULL CHECK(max_supply>0 AND max_supply<=9007199254740991),
 issued bigint NOT NULL DEFAULT 0 CHECK(issued>=0 AND issued<=max_supply), serialized boolean NOT NULL,
 definition jsonb NOT NULL, config_version uuid NOT NULL REFERENCES kd.configuration_version(id),
 shop_version uuid NOT NULL REFERENCES kd.configuration_version(id), content_version text NOT NULL REFERENCES kd.content_version(id), published_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kd.limited_card_edition (
 edition_id text NOT NULL REFERENCES kd.limited_edition(id),card_id text NOT NULL REFERENCES kd.card_identity(id),
 inventory_edition text NOT NULL UNIQUE REFERENCES kd.edition(id),exclusive_gameplay boolean NOT NULL DEFAULT false,
 PRIMARY KEY(edition_id,card_id)
);
CREATE TABLE kd.limited_reservation (
 id uuid PRIMARY KEY,edition_id text NOT NULL REFERENCES kd.limited_edition(id),player_id uuid NOT NULL REFERENCES kd.player(id),
 method text NOT NULL,allocation_id text,reference text NOT NULL,fingerprint text NOT NULL,
 state text NOT NULL CHECK(state IN('held','fulfilling','fulfilled','expired','cancelled')) DEFAULT 'held',
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(edition_id,reference),UNIQUE(reference)
);
CREATE INDEX limited_reservation_active ON kd.limited_reservation(edition_id,state,expires_at);
CREATE TABLE kd.limited_instance (
 id uuid PRIMARY KEY,edition_id text NOT NULL REFERENCES kd.limited_edition(id),ordinal bigint NOT NULL CHECK(ordinal>0),serial bigint,
 reservation_id uuid NOT NULL UNIQUE REFERENCES kd.limited_reservation(id),original_owner uuid NOT NULL REFERENCES kd.player(id),owner_id uuid NOT NULL REFERENCES kd.player(id),
 state text NOT NULL CHECK(state IN('issuing','active','retired')) DEFAULT 'issuing',restricted boolean NOT NULL DEFAULT false,
 delivery jsonb,method text NOT NULL,allocation_id text,original_provenance jsonb NOT NULL,definition_snapshot jsonb NOT NULL,
 purchase_id uuid REFERENCES kd.shop_purchase(id) DEFERRABLE INITIALLY DEFERRED,commercial_order_id uuid REFERENCES kd.commerce_order(id),
 issued_at timestamptz NOT NULL DEFAULT now(),retired_at timestamptz,retirement_reason text,
 UNIQUE(edition_id,ordinal),UNIQUE(edition_id,serial)
);
CREATE INDEX limited_instance_owner ON kd.limited_instance(owner_id,edition_id,state);
CREATE TABLE kd.limited_component (
 instance_id uuid NOT NULL REFERENCES kd.limited_instance(id),kind text NOT NULL CHECK(kind IN('card','cosmetic')),identity_id text NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0),inventory_edition text REFERENCES kd.edition(id),
 original_acquisition uuid REFERENCES kd.acquisition(id),current_lot uuid REFERENCES kd.ownership_lot(id),
 PRIMARY KEY(instance_id,kind,identity_id)
);
CREATE TABLE kd.limited_history (
 id uuid PRIMARY KEY,instance_id uuid NOT NULL REFERENCES kd.limited_instance(id),operation text NOT NULL,
 from_player uuid REFERENCES kd.player(id),to_player uuid REFERENCES kd.player(id),actor_id uuid REFERENCES kd.player(id),
 reference text NOT NULL,reason text NOT NULL,details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(instance_id,operation,reference)
);
CREATE TABLE kd.limited_hold (
 instance_id uuid PRIMARY KEY REFERENCES kd.limited_instance(id),version_id uuid NOT NULL REFERENCES kd.trade_offer_version(id),
 owner_id uuid NOT NULL REFERENCES kd.player(id),expires_at timestamptz NOT NULL,released_at timestamptz
);
CREATE TABLE kd.limited_financial_hold (
 instance_id uuid NOT NULL REFERENCES kd.limited_instance(id),order_id uuid NOT NULL REFERENCES kd.commerce_order(id),
 reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),released_at timestamptz,PRIMARY KEY(instance_id,order_id)
);
CREATE TABLE kd.limited_physical_reference (
 namespace text NOT NULL,physical_identity text NOT NULL,instance_id uuid REFERENCES kd.limited_instance(id),
 edition_id text NOT NULL REFERENCES kd.limited_edition(id),metadata jsonb NOT NULL DEFAULT '{}',
 PRIMARY KEY(namespace,physical_identity)
);
ALTER TABLE kd.cosmetic_ownership ADD COLUMN limited_projection boolean NOT NULL DEFAULT false;
CREATE FUNCTION kd.guard_limited_edition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Published limited edition identity cannot be deleted'; END IF;
 IF NEW.id<>OLD.id OR NEW.core<>OLD.core OR NEW.max_supply<>OLD.max_supply OR NEW.serialized<>OLD.serialized OR NEW.published_at<>OLD.published_at THEN RAISE EXCEPTION 'Published limited edition promise is immutable'; END IF;
 IF NEW.issued<OLD.issued OR NEW.issued<>(SELECT count(*) FROM kd.limited_instance WHERE edition_id=NEW.id) THEN RAISE EXCEPTION 'Lifetime issuance must reconcile to immutable instances'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER limited_edition_immutable BEFORE UPDATE OR DELETE ON kd.limited_edition FOR EACH ROW EXECUTE FUNCTION kd.guard_limited_edition();
CREATE FUNCTION kd.guard_limited_instance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e kd.limited_edition;r kd.limited_reservation;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Limited issuance history cannot be deleted'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT * INTO e FROM kd.limited_edition WHERE id=NEW.edition_id FOR UPDATE;
  SELECT * INTO r FROM kd.limited_reservation WHERE id=NEW.reservation_id FOR UPDATE;
  IF e.id IS NULL OR r.id IS NULL OR r.edition_id<>e.id OR r.player_id<>NEW.original_owner OR r.state<>'fulfilling' OR e.issued>=e.max_supply THEN RAISE EXCEPTION 'Limited issuance requires an allocated reservation within supply'; END IF;
  NEW.ordinal=e.issued+1;NEW.serial=CASE WHEN e.serialized THEN NEW.ordinal ELSE NULL END;
 ELSE
  IF ROW(NEW.id,NEW.edition_id,NEW.ordinal,NEW.serial,NEW.reservation_id,NEW.original_owner,NEW.original_provenance,NEW.definition_snapshot,NEW.purchase_id,NEW.commercial_order_id,NEW.issued_at,NEW.method,NEW.allocation_id) IS DISTINCT FROM ROW(OLD.id,OLD.edition_id,OLD.ordinal,OLD.serial,OLD.reservation_id,OLD.original_owner,OLD.original_provenance,OLD.definition_snapshot,OLD.purchase_id,OLD.commercial_order_id,OLD.issued_at,OLD.method,OLD.allocation_id) THEN RAISE EXCEPTION 'Original serial and issuance provenance are immutable'; END IF;
  IF OLD.state='retired' AND NEW.state<>'retired' THEN RAISE EXCEPTION 'Retired serials cannot be reissued'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER limited_instance_immutable BEFORE INSERT OR UPDATE OR DELETE ON kd.limited_instance FOR EACH ROW EXECUTE FUNCTION kd.guard_limited_instance();
CREATE FUNCTION kd.count_limited_instance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN UPDATE kd.limited_edition SET issued=issued+1 WHERE id=NEW.edition_id;RETURN NEW;END $$;
CREATE TRIGGER limited_count AFTER INSERT ON kd.limited_instance FOR EACH ROW EXECUTE FUNCTION kd.count_limited_instance();
CREATE TRIGGER immutable_limited_history BEFORE UPDATE OR DELETE ON kd.limited_history FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
CREATE TRIGGER immutable_limited_card_edition BEFORE UPDATE OR DELETE ON kd.limited_card_edition FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
`);
exports.down=()=>{throw Error('Limited edition identities, serials and provenance require forward-only recovery.');};
