const fs=require('node:fs'),crypto=require('node:crypto');
exports.up=pgm=>pgm.sql(`
CREATE TABLE kd.shop_identity (
 kind text NOT NULL CHECK(kind IN ('product','collection','format')), id text NOT NULL,
 semantic jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(kind,id)
);
CREATE TABLE kd.cosmetic_identity (
 id text PRIMARY KEY, card_id text REFERENCES kd.card_identity(id), type text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kd.shop_quote (
 id uuid PRIMARY KEY, player_id uuid NOT NULL REFERENCES kd.player(id), product_id text NOT NULL,
 shop_version uuid NOT NULL REFERENCES kd.configuration_version(id), economy_version uuid NOT NULL REFERENCES kd.configuration_version(id),
 content_version text NOT NULL REFERENCES kd.content_version(id), fingerprint text NOT NULL,
 currency_id text NOT NULL, price bigint NOT NULL CHECK(price>=0), terms jsonb NOT NULL,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shop_quotes_player ON kd.shop_quote(player_id,created_at DESC);
CREATE TABLE kd.shop_purchase (
 id uuid PRIMARY KEY, player_id uuid NOT NULL REFERENCES kd.player(id), idempotency_key text NOT NULL,
 fingerprint text NOT NULL, quote_id uuid UNIQUE REFERENCES kd.shop_quote(id), product_id text NOT NULL,
 shop_version uuid NOT NULL REFERENCES kd.configuration_version(id), economy_version uuid NOT NULL REFERENCES kd.configuration_version(id),
 content_version text NOT NULL REFERENCES kd.content_version(id), environment text NOT NULL,
 source text NOT NULL CHECK(source IN ('wallet','reward','commercial','sandbox')), source_reference text,
 currency_id text, price bigint NOT NULL DEFAULT 0 CHECK(price>=0),
 transaction_id uuid REFERENCES kd.economy_transaction(id), reward_id uuid REFERENCES kd.reward_grant(id),
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(player_id,idempotency_key),
 CHECK(source<>'wallet' OR (quote_id IS NOT NULL AND transaction_id IS NOT NULL AND currency_id IS NOT NULL))
);
CREATE INDEX shop_purchase_history ON kd.shop_purchase(player_id,created_at DESC,id);
CREATE INDEX shop_purchase_limits ON kd.shop_purchase(player_id,product_id,created_at);
CREATE TABLE kd.shop_pack (
 id uuid PRIMARY KEY, player_id uuid NOT NULL REFERENCES kd.player(id),
 purchase_id uuid NOT NULL REFERENCES kd.shop_purchase(id) DEFERRABLE INITIALLY DEFERRED,
 product_id text NOT NULL, shop_version uuid NOT NULL REFERENCES kd.configuration_version(id),
 content_version text NOT NULL REFERENCES kd.content_version(id), label text NOT NULL,
 cards jsonb NOT NULL, slot_results jsonb NOT NULL, acquisition_id uuid REFERENCES kd.acquisition(id),
 reveal_count integer NOT NULL DEFAULT 0 CHECK(reveal_count>=0 AND reveal_count<=jsonb_array_length(cards)),
 revealed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shop_pack_player ON kd.shop_pack(player_id,created_at DESC,id);
CREATE TABLE kd.cosmetic_ownership (
 player_id uuid NOT NULL REFERENCES kd.player(id), cosmetic_id text NOT NULL REFERENCES kd.cosmetic_identity(id),
 acquired_version uuid NOT NULL REFERENCES kd.configuration_version(id), origin text NOT NULL,
 environment text NOT NULL, sandbox boolean NOT NULL, restricted boolean NOT NULL DEFAULT false,
 revoked boolean NOT NULL DEFAULT false, current_acquisition uuid,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(player_id,cosmetic_id)
);
CREATE TABLE kd.cosmetic_acquisition (
 id uuid PRIMARY KEY, player_id uuid NOT NULL REFERENCES kd.player(id), cosmetic_id text NOT NULL REFERENCES kd.cosmetic_identity(id),
 purchase_id uuid NOT NULL REFERENCES kd.shop_purchase(id) DEFERRABLE INITIALLY DEFERRED,
 config_version uuid NOT NULL REFERENCES kd.configuration_version(id), origin text NOT NULL,
 operation text NOT NULL CHECK(operation IN ('grant','revoke')), reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kd.cosmetic_equipment (
 player_id uuid NOT NULL, card_id text NOT NULL REFERENCES kd.card_identity(id), cosmetic_id text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(player_id,card_id),
 FOREIGN KEY(player_id,cosmetic_id) REFERENCES kd.cosmetic_ownership(player_id,cosmetic_id)
);
ALTER TABLE kd.cosmetic_ownership ADD CONSTRAINT cosmetic_current_acquisition
 FOREIGN KEY(current_acquisition) REFERENCES kd.cosmetic_acquisition(id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE kd.deck_eligibility (
 deck_id uuid PRIMARY KEY REFERENCES kd.deck(id), format_id text NOT NULL,
 config_version uuid REFERENCES kd.configuration_version(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kd.match_shop_context (
 match_id uuid PRIMARY KEY REFERENCES kd.match(id), shop_version uuid NOT NULL REFERENCES kd.configuration_version(id),
 format_id text NOT NULL, eligibility jsonb NOT NULL, cosmetics jsonb NOT NULL, rarities jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kd.reward_product_snapshot (
 economy_version uuid NOT NULL REFERENCES kd.configuration_version(id), type text NOT NULL,
 definition_id text NOT NULL, shop_version uuid NOT NULL REFERENCES kd.configuration_version(id),
 content_version text NOT NULL REFERENCES kd.content_version(id), snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(economy_version,type,definition_id)
);
CREATE TABLE kd.shop_compensation (
 id uuid PRIMARY KEY, purchase_id uuid NOT NULL UNIQUE REFERENCES kd.shop_purchase(id),
 player_id uuid NOT NULL REFERENCES kd.player(id), actor_id uuid NOT NULL REFERENCES kd.player(id),
 idempotency_key text NOT NULL, fingerprint text NOT NULL, reason text NOT NULL,
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(actor_id,idempotency_key)
);
CREATE TABLE kd.currency_return (
 compensation_id uuid NOT NULL REFERENCES kd.shop_compensation(id) DEFERRABLE INITIALLY DEFERRED,
 original_lot uuid NOT NULL REFERENCES kd.currency_lot(id), returned_lot uuid NOT NULL REFERENCES kd.currency_lot(id),
 quantity bigint NOT NULL CHECK(quantity>0), PRIMARY KEY(compensation_id,original_lot,returned_lot)
);
CREATE FUNCTION kd.protect_shop_pack() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-'reveal_count'-'revealed_at') IS DISTINCT FROM (to_jsonb(OLD)-'reveal_count'-'revealed_at')
 THEN RAISE EXCEPTION 'Settled pack results are immutable'; END IF;
 IF NEW.reveal_count<OLD.reveal_count OR (OLD.revealed_at IS NOT NULL AND NEW.revealed_at IS DISTINCT FROM OLD.revealed_at)
 THEN RAISE EXCEPTION 'Pack reveal progress is monotone'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER immutable_shop_pack_result BEFORE UPDATE ON kd.shop_pack FOR EACH ROW EXECUTE FUNCTION kd.protect_shop_pack();
CREATE TRIGGER retained_shop_packs BEFORE DELETE ON kd.shop_pack FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
CREATE FUNCTION kd.protect_cosmetic_provenance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-'restricted'-'revoked'-'current_acquisition') IS DISTINCT FROM (to_jsonb(OLD)-'restricted'-'revoked'-'current_acquisition')
 THEN RAISE EXCEPTION 'Cosmetic acquisition provenance is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER immutable_cosmetic_provenance BEFORE UPDATE ON kd.cosmetic_ownership FOR EACH ROW EXECUTE FUNCTION kd.protect_cosmetic_provenance();
CREATE TRIGGER retained_cosmetic_ownership BEFORE DELETE ON kd.cosmetic_ownership FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
${['shop_identity','cosmetic_identity','shop_quote','shop_purchase','cosmetic_acquisition','match_shop_context','reward_product_snapshot','shop_compensation','currency_return'].map(table=>`CREATE TRIGGER immutable_${table} BEFORE UPDATE OR DELETE ON kd.${table} FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();`).join('\n')}
INSERT INTO kd.migration_checksum(name,sha256) VALUES('1796100000000_shop_acquisition.cjs','${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}');
`);
exports.down=()=>{throw Error('Destructive down migrations are disabled; restore a verified separate database.');};
