exports.up=pgm=>pgm.sql(`
CREATE TABLE kd.player_presentation (
 player_id uuid PRIMARY KEY REFERENCES kd.player(id),
 revision integer NOT NULL CHECK(revision>0),
 preferences jsonb NOT NULL CHECK(jsonb_typeof(preferences)='object' AND octet_length(preferences::text)<=4096),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kd.match_recent_presentation (
 match_id uuid PRIMARY KEY REFERENCES kd.match(id),
 revision integer NOT NULL CHECK(revision>0),
 history jsonb NOT NULL CHECK(jsonb_typeof(history)='object' AND octet_length(history::text)<=524288),
 updated_at timestamptz NOT NULL DEFAULT now()
);
`);
exports.down=()=>{throw Error('Presentation settings and recorded public history must be preserved; use an additive correction.');};
