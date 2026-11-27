const fs = require('node:fs');
const crypto = require('node:crypto');
exports.up = pgm => pgm.sql(`
ALTER TABLE kd.invite ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX invite_public_id ON kd.invite(id);
ALTER TABLE kd.invite ADD COLUMN revoked_at timestamptz;
ALTER TABLE kd.invite ADD COLUMN reason text NOT NULL DEFAULT 'Existing operator invitation';
ALTER TABLE kd.invite ADD COLUMN request_key text;
ALTER TABLE kd.invite ADD COLUMN request_fingerprint text;
CREATE UNIQUE INDEX invite_request ON kd.invite(created_by,request_key) WHERE request_key IS NOT NULL;
INSERT INTO kd.migration_checksum(name,sha256) VALUES('1795800000000_hosted_administration.cjs','${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}');
`);
exports.down = () => { throw new Error('Destructive down migrations are disabled. Restore into a separate database.'); };
