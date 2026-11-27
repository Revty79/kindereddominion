const fs=require('node:fs'),crypto=require('node:crypto');
exports.up=pgm=>pgm.sql(`
CREATE TABLE kd.commerce_refund_request(
 id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES kd.commerce_order(id),actor_id uuid NOT NULL REFERENCES kd.player(id),
 idempotency_key text NOT NULL,fingerprint text NOT NULL,request jsonb NOT NULL,amount_minor integer NOT NULL CHECK(amount_minor>0),reason text NOT NULL,
 state text NOT NULL DEFAULT 'requested' CHECK(state IN('requested','pending','succeeded','failed','ambiguous')),
 provider_refund_id text,lease uuid,lease_until timestamptz,error_code text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(actor_id,idempotency_key),CHECK((lease IS NULL)=(lease_until IS NULL))
);
CREATE FUNCTION kd.protect_refund_request() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF(to_jsonb(NEW)-ARRAY['state','provider_refund_id','lease','lease_until','error_code','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','provider_refund_id','lease','lease_until','error_code','updated_at'])
 OR(OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS DISTINCT FROM OLD.provider_refund_id)
 OR(OLD.state IN('succeeded','failed') AND NEW.state<>OLD.state) THEN RAISE EXCEPTION 'Refund request terms and terminal history are immutable';END IF;RETURN NEW;END $$;
CREATE TRIGGER protected_refund_request BEFORE UPDATE ON kd.commerce_refund_request FOR EACH ROW EXECUTE FUNCTION kd.protect_refund_request();
CREATE TRIGGER retained_refund_request BEFORE DELETE ON kd.commerce_refund_request FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
CREATE TABLE kd.commerce_refund_observation(
 id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES kd.commerce_order(id),event_id uuid NOT NULL REFERENCES kd.commerce_event(id),
 provider_refund_id text NOT NULL,payment_id text NOT NULL,amount_minor integer NOT NULL CHECK(amount_minor>0),currency text NOT NULL CHECK(currency='usd'),
 status text NOT NULL CHECK(status IN('pending','succeeded','failed','cancelled')),observed_at timestamptz NOT NULL DEFAULT now(),UNIQUE(event_id,provider_refund_id)
);
CREATE TABLE kd.commerce_dispute_observation(
 id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES kd.commerce_order(id),event_id uuid NOT NULL REFERENCES kd.commerce_event(id),
 provider_dispute_id text NOT NULL,payment_id text NOT NULL,amount_minor integer NOT NULL CHECK(amount_minor>0),currency text NOT NULL CHECK(currency='usd'),
 status text NOT NULL CHECK(status IN('open','won','lost')),observed_at timestamptz NOT NULL DEFAULT now(),UNIQUE(event_id,provider_dispute_id)
);
CREATE TABLE kd.commerce_source_hold(
 id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES kd.commerce_order(id),currency_lot uuid REFERENCES kd.currency_lot(id),
 ownership_lot uuid REFERENCES kd.ownership_lot(id),cosmetic_acquisition uuid REFERENCES kd.cosmetic_acquisition(id),
 quantity bigint NOT NULL DEFAULT 0 CHECK(quantity>=0),reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),released_at timestamptz,
 CHECK(num_nonnulls(currency_lot,ownership_lot,cosmetic_acquisition)=1)
);
CREATE UNIQUE INDEX commerce_hold_money ON kd.commerce_source_hold(order_id,currency_lot) WHERE released_at IS NULL;
CREATE UNIQUE INDEX commerce_hold_cards ON kd.commerce_source_hold(order_id,ownership_lot) WHERE released_at IS NULL;
CREATE UNIQUE INDEX commerce_hold_cosmetics ON kd.commerce_source_hold(order_id,cosmetic_acquisition) WHERE released_at IS NULL;
CREATE FUNCTION kd.protect_commerce_hold() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF(to_jsonb(NEW)-'released_at') IS DISTINCT FROM(to_jsonb(OLD)-'released_at') OR OLD.released_at IS NOT NULL THEN RAISE EXCEPTION 'Commercial hold source and release history are immutable';END IF;RETURN NEW;END $$;
CREATE TRIGGER protected_commerce_hold BEFORE UPDATE ON kd.commerce_source_hold FOR EACH ROW EXECUTE FUNCTION kd.protect_commerce_hold();
CREATE TRIGGER retained_commerce_hold BEFORE DELETE ON kd.commerce_source_hold FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
CREATE TABLE kd.commerce_review(
 id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES kd.commerce_order(id),actor_id uuid NOT NULL REFERENCES kd.player(id),
 idempotency_key text NOT NULL,fingerprint text NOT NULL,operation text NOT NULL CHECK(operation IN('note','continue_hold','retain_assets','reverse_original')),
 reason text NOT NULL,confirmed_refunded_minor integer NOT NULL CHECK(confirmed_refunded_minor>=0),reversed_aether integer NOT NULL DEFAULT 0 CHECK(reversed_aether>=0),
 transaction_id uuid REFERENCES kd.economy_transaction(id),result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(actor_id,idempotency_key)
);
CREATE TABLE kd.commerce_simulation_refund(
 id text PRIMARY KEY,request_id uuid NOT NULL UNIQUE REFERENCES kd.commerce_refund_request(id),order_id uuid NOT NULL REFERENCES kd.commerce_order(id),
 payment_id text NOT NULL,amount_minor integer NOT NULL CHECK(amount_minor>0),currency text NOT NULL CHECK(currency='usd'),
 state text NOT NULL CHECK(state IN('pending','succeeded','failed')),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kd.commerce_simulation_dispute(
 id text PRIMARY KEY,order_id uuid NOT NULL UNIQUE REFERENCES kd.commerce_order(id),payment_id text NOT NULL,
 amount_minor integer NOT NULL CHECK(amount_minor>0),currency text NOT NULL CHECK(currency='usd'),state text NOT NULL CHECK(state IN('open','won','lost')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION kd.protect_simulation_financial() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF(to_jsonb(NEW)-ARRAY['state','revision']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','revision']) OR NEW.revision<>OLD.revision+1
 OR(OLD.state IN('succeeded','failed','won','lost') AND NEW.state<>OLD.state) THEN RAISE EXCEPTION 'Simulation financial source and terminal history are immutable';END IF;RETURN NEW;END $$;
${['commerce_simulation_refund','commerce_simulation_dispute'].map(t=>`CREATE TRIGGER protected_${t} BEFORE UPDATE ON kd.${t} FOR EACH ROW EXECUTE FUNCTION kd.protect_simulation_financial(); CREATE TRIGGER retained_${t} BEFORE DELETE ON kd.${t} FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();`).join('\n')}
${['commerce_refund_observation','commerce_dispute_observation','commerce_review'].map(t=>`CREATE TRIGGER immutable_${t} BEFORE UPDATE OR DELETE ON kd.${t} FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();`).join('\n')}
INSERT INTO kd.migration_checksum(name,sha256) VALUES('1797000000000_commerce_reversals.cjs','${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}');
`);
exports.down=()=>{throw Error('Destructive down migrations are disabled; restore a verified separate database.');};
