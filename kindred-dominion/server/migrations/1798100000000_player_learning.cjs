exports.up=pgm=>pgm.sql(`
CREATE TABLE kd.player_learning (
 player_id uuid PRIMARY KEY REFERENCES kd.player(id),
 revision integer NOT NULL CHECK(revision>0),
 progress jsonb NOT NULL CHECK(jsonb_typeof(progress)='object'),
 updated_at timestamptz NOT NULL DEFAULT now()
);
`);
exports.down=()=>{throw Error('Use forward recovery; retain player learning preferences.');};
