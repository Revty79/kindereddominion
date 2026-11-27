exports.up=pgm=>pgm.sql(`
ALTER TABLE kd.deck ADD CONSTRAINT deck_identity_owner UNIQUE(id,player_id);
CREATE TABLE kd.deck_workspace (
 deck_id uuid PRIMARY KEY, player_id uuid NOT NULL REFERENCES kd.player(id),
 base_revision integer NOT NULL CHECK(base_revision>0), revision integer NOT NULL CHECK(revision>0),
 document jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(deck_id,player_id) REFERENCES kd.deck(id,player_id)
);
CREATE INDEX deck_workspace_owner ON kd.deck_workspace(player_id);
`);
exports.down=()=>{throw Error('Recoverable player deck edits must be preserved; use an additive correction.');};
