const fs=require('node:fs'),crypto=require('node:crypto');
exports.up=pgm=>pgm.sql(`
ALTER TABLE kd.commerce_order ADD COLUMN checkout_lease uuid,ADD COLUMN checkout_lease_until timestamptz,
 ADD CONSTRAINT complete_checkout_lease CHECK((checkout_lease IS NULL)=(checkout_lease_until IS NULL));
CREATE OR REPLACE FUNCTION kd.protect_commerce_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-ARRAY['checkout_state','payment_state','fulfillment_state','checkout_session_id','checkout_url','payment_id','receipt_url','paid_at','fulfilled_at','refunded_minor','dispute_state','error_code','updated_at','checkout_lease','checkout_lease_until']) IS DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['checkout_state','payment_state','fulfillment_state','checkout_session_id','checkout_url','payment_id','receipt_url','paid_at','fulfilled_at','refunded_minor','dispute_state','error_code','updated_at','checkout_lease','checkout_lease_until'])
 OR(OLD.checkout_session_id IS NOT NULL AND NEW.checkout_session_id IS DISTINCT FROM OLD.checkout_session_id)
 OR(OLD.payment_id IS NOT NULL AND NEW.payment_id IS DISTINCT FROM OLD.payment_id)
 OR(OLD.payment_state='paid' AND NEW.payment_state<>'paid') OR NEW.refunded_minor<OLD.refunded_minor
 THEN RAISE EXCEPTION 'Commercial identity and verified payment history are immutable'; END IF;RETURN NEW;END $$;
CREATE TABLE kd.commerce_checkout_attempt(
 id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES kd.commerce_order(id),state text NOT NULL CHECK(state IN('requesting','ready','failed')),
 session_id text,error_code text,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz
);
CREATE FUNCTION kd.protect_checkout_attempt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF(to_jsonb(NEW)-ARRAY['state','session_id','error_code','finished_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','session_id','error_code','finished_at']) OR OLD.state<>'requesting' THEN RAISE EXCEPTION 'Checkout attempt history is immutable after completion';END IF;RETURN NEW;END $$;
CREATE TRIGGER protected_checkout_attempt BEFORE UPDATE ON kd.commerce_checkout_attempt FOR EACH ROW EXECUTE FUNCTION kd.protect_checkout_attempt();
CREATE TRIGGER retained_checkout_attempt BEFORE DELETE ON kd.commerce_checkout_attempt FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
CREATE FUNCTION kd.protect_commerce_simulation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF(to_jsonb(NEW)-ARRAY['state','revision','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','revision','updated_at']) OR NEW.revision<>OLD.revision+1 OR(OLD.state IN('paid','cancelled','expired') AND NEW.state<>OLD.state) THEN RAISE EXCEPTION 'Simulation source identity and terminal payment state are immutable';END IF;RETURN NEW;END $$;
CREATE TRIGGER protected_commerce_simulation BEFORE UPDATE ON kd.commerce_simulation_session FOR EACH ROW EXECUTE FUNCTION kd.protect_commerce_simulation();
INSERT INTO kd.migration_checksum(name,sha256) VALUES('1796800000000_checkout_sessions.cjs','${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}');
`);
exports.down=()=>{throw Error('Destructive down migrations are disabled; restore a verified separate database.');};
