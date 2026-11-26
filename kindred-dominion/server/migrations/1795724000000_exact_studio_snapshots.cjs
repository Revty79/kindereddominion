const fs=require('node:fs'),crypto=require('node:crypto');
exports.up=pgm=>pgm.sql(`
DO $$ BEGIN IF EXISTS(SELECT FROM kd.studio_workspace) OR EXISTS(SELECT FROM kd.studio_workspace_history) THEN RAISE EXCEPTION 'Exact snapshot conversion requires a new installation; retain and review existing private records first'; END IF; END $$;
ALTER TABLE kd.studio_workspace ALTER COLUMN workspace TYPE json USING workspace::json;
ALTER TABLE kd.studio_workspace_history ALTER COLUMN workspace TYPE json USING workspace::json;
INSERT INTO kd.migration_checksum(name,sha256) VALUES('1795724000000_exact_studio_snapshots.cjs','${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}');
`);
exports.down=()=>{throw Error('Destructive down migrations are disabled; use a verified isolated restore.');};
