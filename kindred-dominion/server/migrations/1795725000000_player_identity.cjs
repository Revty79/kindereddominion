const fs = require('node:fs');
const crypto = require('node:crypto');
exports.up = pgm => pgm.sql(`
ALTER TABLE kd.player ADD COLUMN email text;
ALTER TABLE kd.player ADD CONSTRAINT player_email_normalized CHECK(email IS NULL OR (email=lower(email) AND length(email)<=254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'));
CREATE UNIQUE INDEX player_email_unique ON kd.player(email) WHERE email IS NOT NULL;
CREATE TABLE kd.password_recovery (
  token_hash text PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES kd.player(id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_recovery_player ON kd.password_recovery(player_id);
INSERT INTO kd.migration_checksum(name,sha256) VALUES('1795725000000_player_identity.cjs','${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}');
`);
exports.down = () => { throw new Error('Destructive down migrations are disabled. Restore a verified backup into a separate database.'); };
