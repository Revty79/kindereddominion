exports.up=pgm=>pgm.sql(`
CREATE TABLE kd.cosmetic_preferences (
 player_id uuid PRIMARY KEY REFERENCES kd.player(id), revision integer NOT NULL CHECK(revision>0),
 card_back text REFERENCES kd.cosmetic_identity(id), battlefield text REFERENCES kd.cosmetic_identity(id),
 treatment text REFERENCES kd.cosmetic_identity(id), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(player_id,card_back) REFERENCES kd.cosmetic_ownership(player_id,cosmetic_id),
 FOREIGN KEY(player_id,battlefield) REFERENCES kd.cosmetic_ownership(player_id,cosmetic_id),
 FOREIGN KEY(player_id,treatment) REFERENCES kd.cosmetic_ownership(player_id,cosmetic_id)
);
CREATE TABLE kd.starting_cosmetic_grant (
 player_id uuid NOT NULL REFERENCES kd.player(id), slot text NOT NULL CHECK(slot IN('card_back','battlefield')),
 kindred text NOT NULL, cosmetic_id text NOT NULL REFERENCES kd.cosmetic_identity(id),
 shop_version uuid NOT NULL REFERENCES kd.configuration_version(id),
 purchase_id uuid NOT NULL REFERENCES kd.shop_purchase(id), snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(player_id,slot)
);
CREATE TABLE kd.match_cosmetic_presentation (
 match_id uuid PRIMARY KEY REFERENCES kd.match(id), presentation jsonb NOT NULL
 CHECK(jsonb_typeof(presentation)='object' AND octet_length(presentation::text)<=16384),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_starting_cosmetic_grant BEFORE UPDATE OR DELETE ON kd.starting_cosmetic_grant
 FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
CREATE TRIGGER immutable_match_cosmetic_presentation BEFORE UPDATE OR DELETE ON kd.match_cosmetic_presentation
 FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
`);
exports.down=()=>{throw Error('Cosmetic ownership and historical appearance must be preserved; use an additive correction.');};
