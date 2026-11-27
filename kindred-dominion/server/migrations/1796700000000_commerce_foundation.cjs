const fs=require('node:fs'),crypto=require('node:crypto');
exports.up=pgm=>pgm.sql(`
CREATE TABLE kd.commerce_identity(id text PRIMARY KEY,type text NOT NULL CHECK(type IN('aether','assets')));
CREATE TABLE kd.commerce_product_snapshot(
 config_version uuid NOT NULL REFERENCES kd.configuration_version(id),product_id text NOT NULL REFERENCES kd.commerce_identity(id),
 economy_version uuid NOT NULL REFERENCES kd.configuration_version(id),shop_version uuid REFERENCES kd.configuration_version(id),
 content_version text NOT NULL REFERENCES kd.content_version(id),snapshot jsonb NOT NULL,digest text NOT NULL,
 PRIMARY KEY(config_version,product_id)
);
CREATE TABLE kd.commerce_quote(
 id uuid PRIMARY KEY,player_id uuid NOT NULL REFERENCES kd.player(id),config_version uuid NOT NULL,product_id text NOT NULL,
 amount_minor integer NOT NULL CHECK(amount_minor>0 AND amount_minor<=100000000),currency text NOT NULL CHECK(currency='usd'),
 snapshot jsonb NOT NULL,digest text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,
 FOREIGN KEY(config_version,product_id) REFERENCES kd.commerce_product_snapshot(config_version,product_id),CHECK(expires_at>created_at)
);
CREATE TABLE kd.commerce_order(
 id uuid PRIMARY KEY,player_id uuid NOT NULL REFERENCES kd.player(id),quote_id uuid NOT NULL UNIQUE REFERENCES kd.commerce_quote(id),
 config_version uuid NOT NULL,product_id text NOT NULL,amount_minor integer NOT NULL CHECK(amount_minor>0 AND amount_minor<=100000000),
 currency text NOT NULL CHECK(currency='usd'),provider text NOT NULL CHECK(provider IN('simulation','stripe')),provider_account text NOT NULL,
 environment text NOT NULL CHECK(environment IN('dev','integration','test')),sandbox boolean NOT NULL CHECK(sandbox),
 snapshot jsonb NOT NULL,digest text NOT NULL,checkout_state text NOT NULL DEFAULT 'created' CHECK(checkout_state IN('created','ready','failed','expired')),
 payment_state text NOT NULL DEFAULT 'unpaid' CHECK(payment_state IN('unpaid','pending','paid','failed','cancelled','expired')),
 fulfillment_state text NOT NULL DEFAULT 'not_ready' CHECK(fulfillment_state IN('not_ready','pending','fulfilled','needs_review','reversed')),
 checkout_session_id text,checkout_url text,payment_id text,receipt_url text,paid_at timestamptz,fulfilled_at timestamptz,
 refunded_minor integer NOT NULL DEFAULT 0 CHECK(refunded_minor>=0 AND refunded_minor<=amount_minor),
 dispute_state text NOT NULL DEFAULT 'none' CHECK(dispute_state IN('none','open','won','lost')),error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(config_version,product_id) REFERENCES kd.commerce_product_snapshot(config_version,product_id),
 UNIQUE(provider,provider_account,checkout_session_id),UNIQUE(provider,provider_account,payment_id)
);
CREATE INDEX commerce_order_history ON kd.commerce_order(player_id,created_at DESC,id);
CREATE TABLE kd.commerce_request(
 actor_id uuid NOT NULL REFERENCES kd.player(id),idempotency_key text NOT NULL,operation text NOT NULL,fingerprint text NOT NULL,
 order_id uuid REFERENCES kd.commerce_order(id),result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor_id,idempotency_key)
);
CREATE TABLE kd.commerce_provider_product(
 provider text NOT NULL CHECK(provider IN('simulation','stripe')),provider_account text NOT NULL,config_version uuid NOT NULL,product_id text NOT NULL,
 provider_product_id text NOT NULL,provider_price_id text NOT NULL,digest text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(provider,provider_account,config_version,product_id),FOREIGN KEY(config_version,product_id) REFERENCES kd.commerce_product_snapshot(config_version,product_id)
);
CREATE TABLE kd.commerce_event(
 id uuid PRIMARY KEY,provider text NOT NULL CHECK(provider IN('simulation','stripe')),provider_account text NOT NULL,event_id text NOT NULL,
 order_id uuid REFERENCES kd.commerce_order(id),kind text NOT NULL,provider_created bigint,snapshot jsonb NOT NULL,digest text NOT NULL,
 livemode boolean NOT NULL CHECK(NOT livemode),processing_state text NOT NULL DEFAULT 'pending' CHECK(processing_state IN('pending','processed','ignored','rejected','retry')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),error_code text,processed_at timestamptz,received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,provider_account,event_id)
);
CREATE INDEX commerce_event_pending ON kd.commerce_event(processing_state,received_at,id);
CREATE TABLE kd.commerce_payment(
 order_id uuid PRIMARY KEY REFERENCES kd.commerce_order(id),provider text NOT NULL,provider_account text NOT NULL,payment_id text NOT NULL,
 checkout_session_id text NOT NULL,event_id uuid NOT NULL REFERENCES kd.commerce_event(id),amount_minor integer NOT NULL CHECK(amount_minor>0),
 currency text NOT NULL CHECK(currency='usd'),livemode boolean NOT NULL CHECK(NOT livemode),verified_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,provider_account,payment_id)
);
CREATE TABLE kd.commerce_fulfillment(
 order_id uuid PRIMARY KEY REFERENCES kd.commerce_payment(order_id),event_id uuid NOT NULL REFERENCES kd.commerce_event(id),
 transaction_id uuid NOT NULL UNIQUE REFERENCES kd.economy_transaction(id),result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kd.commerce_asset_link(
 id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES kd.commerce_fulfillment(order_id) DEFERRABLE INITIALLY DEFERRED,
 currency_lot uuid UNIQUE REFERENCES kd.currency_lot(id),ownership_lot uuid UNIQUE REFERENCES kd.ownership_lot(id),
 cosmetic_acquisition uuid UNIQUE REFERENCES kd.cosmetic_acquisition(id),pack_id uuid UNIQUE REFERENCES kd.shop_pack(id),
 CHECK(num_nonnulls(currency_lot,ownership_lot,cosmetic_acquisition,pack_id)=1)
);
ALTER TABLE kd.shop_purchase ADD COLUMN commercial_order_id uuid REFERENCES kd.commerce_order(id);
CREATE TABLE kd.commerce_simulation_session(
 session_id text PRIMARY KEY,order_id uuid NOT NULL UNIQUE REFERENCES kd.commerce_order(id),provider_account text NOT NULL,
 amount_minor integer NOT NULL,currency text NOT NULL CHECK(currency='usd'),payment_id text NOT NULL UNIQUE,
 state text NOT NULL CHECK(state IN('open','pending','paid','declined','cancelled','expired')),revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION kd.protect_commerce_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-ARRAY['checkout_state','payment_state','fulfillment_state','checkout_session_id','checkout_url','payment_id','receipt_url','paid_at','fulfilled_at','refunded_minor','dispute_state','error_code','updated_at']) IS DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['checkout_state','payment_state','fulfillment_state','checkout_session_id','checkout_url','payment_id','receipt_url','paid_at','fulfilled_at','refunded_minor','dispute_state','error_code','updated_at'])
 OR(OLD.checkout_session_id IS NOT NULL AND NEW.checkout_session_id IS DISTINCT FROM OLD.checkout_session_id)
 OR(OLD.payment_id IS NOT NULL AND NEW.payment_id IS DISTINCT FROM OLD.payment_id)
 OR(OLD.payment_state='paid' AND NEW.payment_state<>'paid') OR NEW.refunded_minor<OLD.refunded_minor
 THEN RAISE EXCEPTION 'Commercial identity and verified payment history are immutable'; END IF;RETURN NEW;END $$;
CREATE TRIGGER protected_commerce_order BEFORE UPDATE ON kd.commerce_order FOR EACH ROW EXECUTE FUNCTION kd.protect_commerce_order();
CREATE FUNCTION kd.protect_commerce_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF(to_jsonb(NEW)-ARRAY['processing_state','attempts','error_code','processed_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['processing_state','attempts','error_code','processed_at']) OR NEW.attempts<OLD.attempts THEN RAISE EXCEPTION 'Verified provider event source is immutable';END IF;RETURN NEW;END $$;
CREATE TRIGGER protected_commerce_event BEFORE UPDATE ON kd.commerce_event FOR EACH ROW EXECUTE FUNCTION kd.protect_commerce_event();
${['commerce_identity','commerce_product_snapshot','commerce_quote','commerce_request','commerce_provider_product','commerce_payment','commerce_fulfillment','commerce_asset_link'].map(t=>`CREATE TRIGGER immutable_${t} BEFORE UPDATE OR DELETE ON kd.${t} FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();`).join('\n')}
${['commerce_order','commerce_event','commerce_simulation_session'].map(t=>`CREATE TRIGGER retained_${t} BEFORE DELETE ON kd.${t} FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();`).join('\n')}
INSERT INTO kd.migration_checksum(name,sha256) VALUES('1796700000000_commerce_foundation.cjs','${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}');
`);
exports.down=()=>{throw Error('Destructive down migrations are disabled; restore a verified separate database.');};
