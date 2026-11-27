const fs=require('node:fs'),crypto=require('node:crypto');
exports.up=pgm=>pgm.sql(`
CREATE TABLE kd.configuration_version (
 id uuid PRIMARY KEY, domain text NOT NULL CHECK(domain IN ('economy','shop','trading','commerce')),
 document jsonb NOT NULL, digest text NOT NULL, created_by uuid REFERENCES kd.player(id),
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,domain)
);
CREATE TABLE kd.configuration_draft (
 id uuid PRIMARY KEY, domain text NOT NULL CHECK(domain IN ('economy','shop','trading','commerce')),
 document jsonb NOT NULL, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid NOT NULL REFERENCES kd.player(id), updated_at timestamptz NOT NULL DEFAULT now(),
 published_version uuid REFERENCES kd.configuration_version(id)
);
CREATE TABLE kd.configuration_selection (
 domain text PRIMARY KEY, version_id uuid NOT NULL, activated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(version_id,domain) REFERENCES kd.configuration_version(id,domain)
);
CREATE TABLE kd.configuration_publication (
 id bigserial PRIMARY KEY, domain text NOT NULL, version_id uuid NOT NULL REFERENCES kd.configuration_version(id),
 previous_id uuid REFERENCES kd.configuration_version(id), actor_id uuid REFERENCES kd.player(id),
 reason text NOT NULL, operation text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kd.economy_account (
 player_id uuid PRIMARY KEY REFERENCES kd.player(id), sandbox boolean NOT NULL DEFAULT false,
 rewards_restricted boolean NOT NULL DEFAULT false, restriction_reason text,
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO kd.economy_account(player_id) SELECT id FROM kd.player;
CREATE TABLE kd.economy_transaction (
 id uuid PRIMARY KEY, player_id uuid NOT NULL REFERENCES kd.player(id), idempotency_key text NOT NULL,
 fingerprint text NOT NULL, type text NOT NULL, reason text NOT NULL, origin text NOT NULL,
 environment text NOT NULL, config_version uuid NOT NULL REFERENCES kd.configuration_version(id),
 reference_id text, actor_id uuid REFERENCES kd.player(id), result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(player_id,idempotency_key)
);
CREATE TABLE kd.wallet_balance (
 player_id uuid NOT NULL REFERENCES kd.player(id), currency_id text NOT NULL, origin text NOT NULL,
 balance bigint NOT NULL DEFAULT 0 CHECK(balance>=0 AND balance<=9007199254740991),
 held bigint NOT NULL DEFAULT 0 CHECK(held>=0 AND held<=balance), PRIMARY KEY(player_id,currency_id,origin)
);
CREATE TABLE kd.currency_entry (
 id bigserial PRIMARY KEY, transaction_id uuid NOT NULL REFERENCES kd.economy_transaction(id),
 player_id uuid NOT NULL REFERENCES kd.player(id), currency_id text NOT NULL, origin text NOT NULL,
 delta bigint NOT NULL CHECK(delta<>0), resulting_balance bigint NOT NULL CHECK(resulting_balance>=0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX currency_history ON kd.currency_entry(player_id,id DESC);
CREATE TABLE kd.currency_lot (
 id uuid PRIMARY KEY, player_id uuid NOT NULL REFERENCES kd.player(id), currency_id text NOT NULL,
 origin text NOT NULL, transaction_id uuid NOT NULL REFERENCES kd.economy_transaction(id),
 initial_quantity bigint NOT NULL CHECK(initial_quantity>0), remaining bigint NOT NULL CHECK(remaining>=0 AND remaining<=initial_quantity),
 held bigint NOT NULL DEFAULT 0 CHECK(held>=0 AND held<=remaining), source_reference text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX currency_available ON kd.currency_lot(player_id,currency_id,created_at,id);
CREATE TABLE kd.currency_consumption (
 transaction_id uuid NOT NULL REFERENCES kd.economy_transaction(id), lot_id uuid NOT NULL REFERENCES kd.currency_lot(id),
 quantity bigint NOT NULL CHECK(quantity>0), PRIMARY KEY(transaction_id,lot_id)
);
CREATE TABLE kd.xp_balance (
 player_id uuid NOT NULL REFERENCES kd.player(id), axis text NOT NULL,
 xp bigint NOT NULL DEFAULT 0 CHECK(xp>=0 AND xp<=9007199254740991), level integer NOT NULL DEFAULT 1 CHECK(level>0),
 PRIMARY KEY(player_id,axis)
);
CREATE TABLE kd.xp_entry (
 id bigserial PRIMARY KEY, transaction_id uuid NOT NULL REFERENCES kd.economy_transaction(id),
 player_id uuid NOT NULL REFERENCES kd.player(id), axis text NOT NULL, amount bigint NOT NULL CHECK(amount>0),
 resulting_xp bigint NOT NULL, config_version uuid NOT NULL REFERENCES kd.configuration_version(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(transaction_id,axis)
);
CREATE TABLE kd.level_reward (
 player_id uuid NOT NULL REFERENCES kd.player(id), axis text NOT NULL, level integer NOT NULL,
 config_version uuid NOT NULL REFERENCES kd.configuration_version(id), transaction_id uuid NOT NULL REFERENCES kd.economy_transaction(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(player_id,axis,level)
);
CREATE TABLE kd.reward_grant (
 id uuid PRIMARY KEY, player_id uuid NOT NULL REFERENCES kd.player(id), source text NOT NULL, source_id text NOT NULL,
 config_version uuid NOT NULL REFERENCES kd.configuration_version(id), bundle jsonb NOT NULL,
 transaction_id uuid NOT NULL REFERENCES kd.economy_transaction(id), result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(player_id,source,source_id)
);
CREATE TABLE kd.economy_event (
 id uuid PRIMARY KEY, player_id uuid NOT NULL REFERENCES kd.player(id), event_key text NOT NULL,
 type text NOT NULL, evidence jsonb NOT NULL, config_version uuid NOT NULL REFERENCES kd.configuration_version(id),
 occurred_at timestamptz NOT NULL DEFAULT now(), UNIQUE(player_id,event_key)
);
CREATE TABLE kd.objective_progress (
 id uuid PRIMARY KEY, player_id uuid NOT NULL REFERENCES kd.player(id), objective_id text NOT NULL,
 period_key text NOT NULL, config_version uuid NOT NULL REFERENCES kd.configuration_version(id),
 definition jsonb NOT NULL, progress bigint NOT NULL DEFAULT 0 CHECK(progress>=0), distinct_values jsonb NOT NULL DEFAULT '[]', completed_at timestamptz,
 claim_until timestamptz, claimed_at timestamptz, reward_id uuid REFERENCES kd.reward_grant(id),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(player_id,objective_id,period_key)
);
CREATE TABLE kd.economy_match_context (
 match_id uuid PRIMARY KEY REFERENCES kd.match(id), config_version uuid NOT NULL REFERENCES kd.configuration_version(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kd.match_reward (
 match_id uuid PRIMARY KEY REFERENCES kd.match(id), player_id uuid NOT NULL REFERENCES kd.player(id),
 config_version uuid REFERENCES kd.configuration_version(id), status text NOT NULL CHECK(status IN ('granted','denied','pending')),
 reason text NOT NULL, evidence jsonb NOT NULL, reward_id uuid REFERENCES kd.reward_grant(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kd.reward_entitlement (
 id uuid PRIMARY KEY, player_id uuid NOT NULL REFERENCES kd.player(id), type text NOT NULL,
 definition_id text NOT NULL, quantity integer NOT NULL CHECK(quantity>0), reward_id uuid NOT NULL REFERENCES kd.reward_grant(id),
 fulfilled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kd.ownership_lot (
 id uuid PRIMARY KEY, player_id uuid NOT NULL REFERENCES kd.player(id), edition_id text NOT NULL REFERENCES kd.edition(id),
 acquisition_id uuid REFERENCES kd.acquisition(id), origin text NOT NULL, environment text NOT NULL,
 initial_quantity integer NOT NULL CHECK(initial_quantity>0), remaining integer NOT NULL CHECK(remaining>=0 AND remaining<=initial_quantity),
 reserved integer NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=remaining),
 tradeable boolean NOT NULL DEFAULT false, sandbox boolean NOT NULL DEFAULT false,
 restricted boolean NOT NULL DEFAULT false, hold_until timestamptz,
 config_version uuid REFERENCES kd.configuration_version(id), source_lot uuid REFERENCES kd.ownership_lot(id),
 source_reference text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ownership_available ON kd.ownership_lot(player_id,edition_id,created_at,id);
CREATE TABLE kd.ownership_consumption (
 acquisition_id uuid NOT NULL REFERENCES kd.acquisition(id), lot_id uuid NOT NULL REFERENCES kd.ownership_lot(id),
 quantity integer NOT NULL CHECK(quantity>0), PRIMARY KEY(acquisition_id,lot_id)
);
CREATE TABLE kd.lifetime_card (
 player_id uuid NOT NULL REFERENCES kd.player(id), card_id text NOT NULL REFERENCES kd.card_identity(id),
 first_acquisition uuid REFERENCES kd.acquisition(id), legacy boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(player_id,card_id)
);
CREATE TABLE kd.legacy_inventory_baseline (
 player_id uuid NOT NULL REFERENCES kd.player(id), edition_id text NOT NULL REFERENCES kd.edition(id),
 quantity integer NOT NULL CHECK(quantity>=0), inventory_entry_cutoff bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(player_id,edition_id)
);
INSERT INTO kd.legacy_inventory_baseline(player_id,edition_id,quantity,inventory_entry_cutoff)
 SELECT player_id,edition_id,quantity,(SELECT coalesce(max(id),0) FROM kd.inventory_entry) FROM kd.inventory;
-- Preserve quantities without inferring provenance from old aggregate rows.
INSERT INTO kd.ownership_lot(id,player_id,edition_id,origin,environment,initial_quantity,remaining)
 SELECT gen_random_uuid(),i.player_id,i.edition_id,'legacy_unknown',g.environment,i.quantity,i.quantity
 FROM kd.inventory i CROSS JOIN kd.environment_guard g WHERE i.quantity>0;
INSERT INTO kd.lifetime_card(player_id,card_id,legacy)
 SELECT DISTINCT i.player_id,e.card_id,true FROM kd.inventory i JOIN kd.edition e ON e.id=i.edition_id WHERE i.quantity>0
 ON CONFLICT DO NOTHING;
INSERT INTO kd.lifetime_card(player_id,card_id,first_acquisition,legacy)
 SELECT DISTINCT ON(a.player_id,e.card_id) a.player_id,e.card_id,a.id,true
 FROM kd.inventory_entry l JOIN kd.acquisition a ON a.id=l.acquisition_id JOIN kd.edition e ON e.id=l.edition_id
 WHERE l.delta>0 ORDER BY a.player_id,e.card_id,a.created_at,a.id ON CONFLICT DO NOTHING;
CREATE TABLE kd.competitive_rating (
 player_id uuid NOT NULL REFERENCES kd.player(id), format_id text NOT NULL, season_id text NOT NULL,
 rating integer NOT NULL, PRIMARY KEY(player_id,format_id,season_id)
);
CREATE TABLE kd.rating_entry (
 id uuid PRIMARY KEY, player_id uuid NOT NULL REFERENCES kd.player(id), format_id text NOT NULL, season_id text NOT NULL,
 match_id uuid NOT NULL REFERENCES kd.match(id), previous_rating integer NOT NULL, resulting_rating integer NOT NULL,
 config_version uuid NOT NULL REFERENCES kd.configuration_version(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(player_id,match_id,format_id,season_id)
);
CREATE INDEX economy_history ON kd.economy_transaction(player_id,created_at DESC,id);
CREATE INDEX xp_history ON kd.xp_entry(player_id,id DESC);
CREATE INDEX reward_history ON kd.match_reward(player_id,created_at DESC);
CREATE INDEX objective_history ON kd.objective_progress(player_id,updated_at DESC);
CREATE FUNCTION kd.protect_economy_account() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.sandbox AND NOT NEW.sandbox THEN RAISE EXCEPTION 'Sandbox accounts cannot become ordinary accounts'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER immutable_sandbox_scope BEFORE UPDATE ON kd.economy_account FOR EACH ROW EXECUTE FUNCTION kd.protect_economy_account();
CREATE FUNCTION kd.protect_ownership_provenance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-'remaining'-'reserved'-'restricted'-'hold_until') IS DISTINCT FROM (to_jsonb(OLD)-'remaining'-'reserved'-'restricted'-'hold_until')
 THEN RAISE EXCEPTION 'Ownership provenance is immutable; use recorded transfers'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER immutable_ownership_provenance BEFORE UPDATE ON kd.ownership_lot FOR EACH ROW EXECUTE FUNCTION kd.protect_ownership_provenance();
CREATE TRIGGER retained_ownership_lots BEFORE DELETE ON kd.ownership_lot FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
CREATE FUNCTION kd.protect_currency_provenance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-'remaining'-'held') IS DISTINCT FROM (to_jsonb(OLD)-'remaining'-'held') THEN RAISE EXCEPTION 'Currency provenance is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER immutable_currency_provenance BEFORE UPDATE ON kd.currency_lot FOR EACH ROW EXECUTE FUNCTION kd.protect_currency_provenance();
CREATE TRIGGER retained_currency_lots BEFORE DELETE ON kd.currency_lot FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();
${['configuration_version','configuration_publication','economy_transaction','currency_entry','currency_consumption','xp_entry','level_reward','reward_grant','economy_event','lifetime_card','legacy_inventory_baseline','ownership_consumption','rating_entry'].map(t=>`CREATE TRIGGER immutable_${t} BEFORE UPDATE OR DELETE ON kd.${t} FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();`).join('\n')}
INSERT INTO kd.migration_checksum(name,sha256) VALUES('1796000000000_economy_foundation.cjs','${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}');
`);
exports.down=()=>{throw Error('Destructive down migrations are disabled; restore a verified separate database.');};
