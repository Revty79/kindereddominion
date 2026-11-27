const fs=require('node:fs'),crypto=require('node:crypto');
exports.up=pgm=>pgm.sql(`
DO $$ DECLARE t text; n text; BEGIN
 FOREACH t IN ARRAY ARRAY['commerce_refund_observation','commerce_dispute_observation'] LOOP
  SELECT conname INTO n FROM pg_constraint WHERE conrelid=format('kd.%I',t)::regclass AND contype='u';
  IF n IS NULL THEN RAISE EXCEPTION 'Expected financial observation uniqueness is missing'; END IF;
  EXECUTE format('ALTER TABLE kd.%I DROP CONSTRAINT %I',t,n);
 END LOOP;
END $$;
ALTER TABLE kd.commerce_refund_observation ADD CONSTRAINT refund_observation_versions UNIQUE(event_id,provider_refund_id,status);
ALTER TABLE kd.commerce_dispute_observation ADD CONSTRAINT dispute_observation_versions UNIQUE(event_id,provider_dispute_id,status);
INSERT INTO kd.migration_checksum(name,sha256) VALUES('1797100000000_financial_observation_versions.cjs','${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}');
`);
exports.down=()=>{throw Error('Destructive down migrations are disabled; restore a verified separate database.');};
