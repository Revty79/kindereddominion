const fs=require('node:fs'),crypto=require('node:crypto');
exports.up=pgm=>pgm.sql(`
CREATE TABLE kd.trading_block (
 blocker_id uuid NOT NULL REFERENCES kd.player(id), blocked_id uuid NOT NULL REFERENCES kd.player(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(blocker_id,blocked_id),CHECK(blocker_id<>blocked_id)
);
CREATE TABLE kd.trade_offer (
 id uuid PRIMARY KEY, player_a uuid NOT NULL REFERENCES kd.player(id), player_b uuid NOT NULL REFERENCES kd.player(id),
 current_version uuid NOT NULL, status text NOT NULL CHECK(status IN ('draft','pending','countered','accepted','settled','declined','cancelled','expired','invalidated')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), CHECK(player_a<>player_b)
);
CREATE INDEX trade_offer_parties ON kd.trade_offer(player_a,player_b,status,updated_at DESC);
CREATE TABLE kd.trade_offer_version (
 id uuid PRIMARY KEY, offer_id uuid NOT NULL REFERENCES kd.trade_offer(id) DEFERRABLE INITIALLY DEFERRED,
 sequence integer NOT NULL CHECK(sequence>0), author_id uuid NOT NULL REFERENCES kd.player(id),
 recipient_id uuid NOT NULL REFERENCES kd.player(id), offered jsonb NOT NULL,requested jsonb NOT NULL,
 expires_at timestamptz NOT NULL, consented_at timestamptz,
 config_version uuid NOT NULL REFERENCES kd.configuration_version(id), content_version text NOT NULL REFERENCES kd.content_version(id),
 shop_version uuid REFERENCES kd.configuration_version(id), snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(offer_id,sequence),CHECK(author_id<>recipient_id),CHECK(expires_at>created_at)
);
ALTER TABLE kd.trade_offer ADD CONSTRAINT current_trade_version FOREIGN KEY(current_version) REFERENCES kd.trade_offer_version(id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE kd.trade_event (
 id uuid PRIMARY KEY, offer_id uuid NOT NULL REFERENCES kd.trade_offer(id),version_id uuid NOT NULL REFERENCES kd.trade_offer_version(id),
 type text NOT NULL, actor_id uuid REFERENCES kd.player(id), details jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(offer_id,version_id,type)
);
CREATE INDEX trade_events_ordered ON kd.trade_event(created_at,id);
CREATE TABLE kd.trade_settlement (
 id uuid PRIMARY KEY, offer_id uuid NOT NULL UNIQUE REFERENCES kd.trade_offer(id),version_id uuid NOT NULL UNIQUE REFERENCES kd.trade_offer_version(id),
 player_a uuid NOT NULL REFERENCES kd.player(id),player_b uuid NOT NULL REFERENCES kd.player(id),
 config_version uuid NOT NULL REFERENCES kd.configuration_version(id), result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),CHECK(player_a<>player_b)
);
CREATE INDEX trade_settlement_daily ON kd.trade_settlement(created_at,player_a,player_b);
CREATE TABLE kd.trade_transfer (
 id uuid PRIMARY KEY, settlement_id uuid NOT NULL REFERENCES kd.trade_settlement(id) DEFERRABLE INITIALLY DEFERRED,
 from_player uuid NOT NULL REFERENCES kd.player(id),to_player uuid NOT NULL REFERENCES kd.player(id),
 edition_id text NOT NULL REFERENCES kd.edition(id),quantity integer NOT NULL CHECK(quantity>0),
 source_lot uuid NOT NULL REFERENCES kd.ownership_lot(id),destination_lot uuid NOT NULL UNIQUE REFERENCES kd.ownership_lot(id),
 root_lot uuid NOT NULL REFERENCES kd.ownership_lot(id),outgoing_acquisition uuid NOT NULL REFERENCES kd.acquisition(id),incoming_acquisition uuid NOT NULL REFERENCES kd.acquisition(id),
 created_at timestamptz NOT NULL DEFAULT now(),CHECK(from_player<>to_player),UNIQUE(settlement_id,source_lot,to_player)
);
CREATE TABLE kd.trade_request (
 actor_id uuid NOT NULL REFERENCES kd.player(id), idempotency_key text NOT NULL,operation text NOT NULL,
 fingerprint text NOT NULL,offer_id uuid NOT NULL REFERENCES kd.trade_offer(id),result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,idempotency_key)
);
CREATE INDEX trade_request_rate ON kd.trade_request(actor_id,created_at);
CREATE FUNCTION kd.protect_trade_head() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE next_version record; previous_sequence integer; BEGIN
 IF (to_jsonb(NEW)-'status'-'current_version'-'revision'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'current_version'-'revision'-'updated_at')
 OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Trade participants and monotone revisions are immutable'; END IF;
 IF OLD.status IN ('settled','declined','cancelled','expired','invalidated') THEN RAISE EXCEPTION 'Completed trade history cannot be rewritten'; END IF;
 IF OLD.status='accepted' AND NEW.status<>'settled' THEN RAISE EXCEPTION 'An accepted transfer must settle atomically'; END IF;
 IF NEW.current_version<>OLD.current_version THEN
  SELECT offer_id,sequence INTO next_version FROM kd.trade_offer_version WHERE id=NEW.current_version;
  SELECT sequence INTO previous_sequence FROM kd.trade_offer_version WHERE id=OLD.current_version;
  IF next_version.offer_id IS DISTINCT FROM OLD.id OR next_version.sequence<>previous_sequence+1 THEN RAISE EXCEPTION 'A trade requires a new exact successive version'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER protected_trade_head BEFORE UPDATE ON kd.trade_offer FOR EACH ROW EXECUTE FUNCTION kd.protect_trade_head();
CREATE TRIGGER retained_trade_heads BEFORE DELETE ON kd.trade_offer FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
CREATE FUNCTION kd.check_trade_commit() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE h record;v record;s record; BEGIN
 IF TG_TABLE_NAME='trade_offer' THEN SELECT * INTO h FROM kd.trade_offer WHERE id=NEW.id;
 ELSE SELECT * INTO h FROM kd.trade_offer WHERE id=NEW.offer_id; END IF;
 SELECT * INTO v FROM kd.trade_offer_version WHERE id=h.current_version;
 IF v.offer_id IS DISTINCT FROM h.id OR NOT((v.author_id=h.player_a AND v.recipient_id=h.player_b) OR(v.author_id=h.player_b AND v.recipient_id=h.player_a))
 THEN RAISE EXCEPTION 'Exact trade version must belong to its immutable participants'; END IF;
 IF h.status IN ('pending','countered','accepted','settled') AND v.consented_at IS NULL THEN RAISE EXCEPTION 'Unsubmitted drafts cannot authorize settlement'; END IF;
 SELECT * INTO s FROM kd.trade_settlement WHERE offer_id=h.id;
 IF h.status='accepted' OR(h.status='settled' AND(s.id IS NULL OR s.version_id<>h.current_version)) OR(h.status<>'settled' AND s.id IS NOT NULL)
 THEN RAISE EXCEPTION 'Consent and bilateral settlement must commit atomically'; END IF; RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER consistent_trade_commit AFTER INSERT OR UPDATE ON kd.trade_offer DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION kd.check_trade_commit();
CREATE CONSTRAINT TRIGGER consistent_settlement_commit AFTER INSERT ON kd.trade_settlement DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION kd.check_trade_commit();
${['trade_offer_version','trade_event','trade_settlement','trade_transfer','trade_request'].map(t=>`CREATE TRIGGER immutable_${t} BEFORE UPDATE OR DELETE ON kd.${t} FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();`).join('\n')}
INSERT INTO kd.migration_checksum(name,sha256) VALUES('1796300000000_trade_settlement.cjs','${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}');
`);
exports.down=()=>{throw Error('Destructive down migrations are disabled; restore a verified separate database.');};
