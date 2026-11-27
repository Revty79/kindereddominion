exports.up=pgm=>pgm.sql(`
ALTER TABLE kd.configuration_version DROP CONSTRAINT configuration_version_domain_check;
ALTER TABLE kd.configuration_version ADD CONSTRAINT configuration_version_domain_check CHECK(domain IN('economy','shop','trading','commerce','starters'));
ALTER TABLE kd.configuration_draft DROP CONSTRAINT configuration_draft_domain_check;
ALTER TABLE kd.configuration_draft ADD CONSTRAINT configuration_draft_domain_check CHECK(domain IN('economy','shop','trading','commerce','starters'));
CREATE TABLE kd.starter_recipe(id text PRIMARY KEY, semantic jsonb NOT NULL, digest text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE kd.starter_upgrade_grant(
 player_id uuid NOT NULL REFERENCES kd.player(id), upgrade_id text NOT NULL CHECK(upgrade_id='founding-starter-40'),
 config_version uuid NOT NULL REFERENCES kd.configuration_version(id), recipe_version text NOT NULL REFERENCES kd.starter_recipe(id),
 kindred text NOT NULL, acquisition_id uuid NOT NULL UNIQUE REFERENCES kd.acquisition(id),
 actor_id uuid REFERENCES kd.player(id), context text NOT NULL CHECK(context IN('new_player','backfill')),
 snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(player_id,upgrade_id)
);
`);
exports.down=()=>{throw Error('Starter ownership history is additive and must be preserved.');};
