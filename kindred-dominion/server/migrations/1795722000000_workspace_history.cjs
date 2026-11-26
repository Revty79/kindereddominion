const fs=require('node:fs'),crypto=require('node:crypto');
exports.up=pgm=>pgm.sql(`
CREATE TABLE kd.studio_workspace_history (
  player_id uuid NOT NULL REFERENCES kd.player(id), revision integer NOT NULL,
  workspace jsonb NOT NULL, saved_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(player_id,revision)
);
INSERT INTO kd.migration_checksum(name,sha256) VALUES('1795722000000_workspace_history.cjs','${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}');
`);
exports.down=()=>{throw Error('Destructive down migrations are disabled; use a verified isolated restore.');};
