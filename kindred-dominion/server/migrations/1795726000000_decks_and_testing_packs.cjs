const fs = require('node:fs');
const crypto = require('node:crypto');
exports.up = pgm => pgm.sql(`
ALTER TABLE kd.deck ADD COLUMN is_draft boolean NOT NULL DEFAULT false;
CREATE TABLE kd.card_pack (
  id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES kd.player(id),
  policy_id text NOT NULL,
  version_id text NOT NULL REFERENCES kd.content_version(id),
  label text NOT NULL,
  cards jsonb NOT NULL CHECK(jsonb_typeof(cards)='array' AND jsonb_array_length(cards)>0 AND jsonb_array_length(cards)<=10),
  acquisition_id uuid UNIQUE REFERENCES kd.acquisition(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  UNIQUE(player_id,policy_id),
  CHECK((opened_at IS NULL)=(acquisition_id IS NULL))
);
CREATE INDEX card_pack_player ON kd.card_pack(player_id,created_at);
INSERT INTO kd.migration_checksum(name,sha256) VALUES('1795726000000_decks_and_testing_packs.cjs','${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}');
`);
exports.down = () => { throw new Error('Destructive down migrations are disabled. Restore a verified backup into a separate database.'); };
