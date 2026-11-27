const fs=require('node:fs'),crypto=require('node:crypto');
exports.up=pgm=>pgm.sql(`
ALTER TABLE kd.commerce_order ADD COLUMN effective_refunded_minor integer NOT NULL DEFAULT 0,
 ADD COLUMN pending_refund_minor integer NOT NULL DEFAULT 0,ADD COLUMN financial_verified_at timestamptz,
 ADD CONSTRAINT valid_current_refunds CHECK(effective_refunded_minor>=0 AND pending_refund_minor>=0 AND effective_refunded_minor+pending_refund_minor<=amount_minor);
CREATE TABLE kd.commerce_refund_state(
 order_id uuid NOT NULL REFERENCES kd.commerce_order(id),provider_refund_id text NOT NULL,payment_id text NOT NULL,
 amount_minor integer NOT NULL CHECK(amount_minor>0),currency text NOT NULL CHECK(currency='usd'),
 status text NOT NULL CHECK(status IN('pending','succeeded','failed','cancelled')),event_id uuid NOT NULL REFERENCES kd.commerce_event(id),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),observed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(order_id,provider_refund_id)
);
INSERT INTO kd.commerce_refund_state(order_id,provider_refund_id,payment_id,amount_minor,currency,status,event_id,observed_at)
 SELECT DISTINCT ON(order_id,provider_refund_id) order_id,provider_refund_id,payment_id,amount_minor,currency,status,event_id,observed_at
 FROM kd.commerce_refund_observation ORDER BY order_id,provider_refund_id,CASE status WHEN 'failed' THEN 3 WHEN 'cancelled' THEN 3 WHEN 'succeeded' THEN 2 ELSE 1 END DESC,observed_at DESC,id DESC;
CREATE OR REPLACE FUNCTION kd.protect_commerce_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-ARRAY['checkout_state','payment_state','fulfillment_state','checkout_session_id','checkout_url','payment_id','receipt_url','paid_at','fulfilled_at','refunded_minor','dispute_state','error_code','updated_at','checkout_lease','checkout_lease_until','effective_refunded_minor','pending_refund_minor','financial_verified_at']) IS DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['checkout_state','payment_state','fulfillment_state','checkout_session_id','checkout_url','payment_id','receipt_url','paid_at','fulfilled_at','refunded_minor','dispute_state','error_code','updated_at','checkout_lease','checkout_lease_until','effective_refunded_minor','pending_refund_minor','financial_verified_at'])
 OR(OLD.checkout_session_id IS NOT NULL AND NEW.checkout_session_id IS DISTINCT FROM OLD.checkout_session_id)
 OR(OLD.payment_id IS NOT NULL AND NEW.payment_id IS DISTINCT FROM OLD.payment_id)
 OR(OLD.payment_state='paid' AND NEW.payment_state<>'paid') OR NEW.refunded_minor<OLD.refunded_minor
 THEN RAISE EXCEPTION 'Commercial identity and verified payment history are immutable'; END IF;RETURN NEW;END $$;
UPDATE kd.commerce_order o SET effective_refunded_minor=(SELECT coalesce(sum(amount_minor),0)::int FROM kd.commerce_refund_state WHERE order_id=o.id AND status='succeeded'),
 pending_refund_minor=(SELECT coalesce(sum(amount_minor),0)::int FROM kd.commerce_refund_state WHERE order_id=o.id AND status='pending'),
 financial_verified_at=CASE WHEN o.refunded_minor>0 AND NOT EXISTS(SELECT 1 FROM kd.commerce_refund_state WHERE order_id=o.id) THEN NULL ELSE o.paid_at END;
CREATE FUNCTION kd.protect_refund_state() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF(to_jsonb(NEW)-ARRAY['status','event_id','revision','observed_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['status','event_id','revision','observed_at']) OR NEW.revision<>OLD.revision+1
 OR(OLD.status IN('failed','cancelled') AND NEW.status<>OLD.status) OR(OLD.status='succeeded' AND NEW.status='pending')
 THEN RAISE EXCEPTION 'Verified refund identity and forward state history are protected';END IF;RETURN NEW;END $$;
CREATE TRIGGER protected_refund_state BEFORE UPDATE ON kd.commerce_refund_state FOR EACH ROW EXECUTE FUNCTION kd.protect_refund_state();
CREATE TRIGGER retained_refund_state BEFORE DELETE ON kd.commerce_refund_state FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
CREATE OR REPLACE FUNCTION kd.protect_refund_request() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF(to_jsonb(NEW)-ARRAY['state','provider_refund_id','lease','lease_until','error_code','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','provider_refund_id','lease','lease_until','error_code','updated_at'])
 OR(OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS DISTINCT FROM OLD.provider_refund_id)
 OR(OLD.state='failed' AND NEW.state<>'failed') OR(OLD.state='succeeded' AND NEW.state NOT IN('succeeded','failed'))
 OR(OLD.state='succeeded' AND NEW.state='failed' AND NOT EXISTS(SELECT 1 FROM kd.commerce_refund_observation r WHERE r.order_id=NEW.order_id AND r.provider_refund_id=NEW.provider_refund_id AND r.status IN('failed','cancelled')))
 THEN RAISE EXCEPTION 'Refund request terms and verified financial history are protected';END IF;RETURN NEW;END $$;
CREATE OR REPLACE FUNCTION kd.protect_simulation_financial() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF(to_jsonb(NEW)-ARRAY['state','revision']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','revision']) OR NEW.revision<>OLD.revision+1
 OR(OLD.state IN('succeeded','failed','won','lost') AND NEW.state<>OLD.state AND NOT(TG_TABLE_NAME='commerce_simulation_refund' AND OLD.state='succeeded' AND NEW.state='failed'))
 THEN RAISE EXCEPTION 'Simulation financial source and verified transition history are protected';END IF;RETURN NEW;END $$;
CREATE TABLE kd.commerce_restoration(
 id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES kd.commerce_order(id),source_review_id uuid NOT NULL REFERENCES kd.commerce_review(id),actor_id uuid NOT NULL REFERENCES kd.player(id),
 idempotency_key text NOT NULL,fingerprint text NOT NULL,reason text NOT NULL,restored_aether integer NOT NULL CHECK(restored_aether>=0),assets_restored boolean NOT NULL,
 transaction_id uuid REFERENCES kd.economy_transaction(id),result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(actor_id,idempotency_key)
);
CREATE TABLE kd.commerce_restoration_link(
 id uuid PRIMARY KEY,restoration_id uuid NOT NULL REFERENCES kd.commerce_restoration(id) DEFERRABLE INITIALLY DEFERRED,
 currency_lot uuid UNIQUE REFERENCES kd.currency_lot(id),ownership_lot uuid UNIQUE REFERENCES kd.ownership_lot(id),
 cosmetic_acquisition uuid UNIQUE REFERENCES kd.cosmetic_acquisition(id),CHECK(num_nonnulls(currency_lot,ownership_lot,cosmetic_acquisition)=1)
);
${['commerce_restoration','commerce_restoration_link'].map(t=>`CREATE TRIGGER immutable_${t} BEFORE UPDATE OR DELETE ON kd.${t} FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();`).join('\n')}
INSERT INTO kd.migration_checksum(name,sha256) VALUES('1797200000000_current_refunds_and_restoration.cjs','${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}');
`);
exports.down=()=>{throw Error('Destructive down migrations are disabled; restore a verified separate database.');};
