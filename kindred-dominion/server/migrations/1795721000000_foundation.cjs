const fs = require('node:fs');
const crypto = require('node:crypto');
exports.up = pgm => pgm.sql(`
CREATE TABLE kd.environment_guard (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  environment text NOT NULL, instance_id text NOT NULL, disposable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kd.migration_checksum (name text PRIMARY KEY, sha256 text NOT NULL);
CREATE TABLE kd.player (
  id uuid PRIMARY KEY, username text NOT NULL UNIQUE CHECK(username=lower(username)),
  display_name text NOT NULL, password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'player' CHECK(role IN ('player','developer','administrator')),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  starting_kindred text, default_deck_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kd.session (
  token_hash text PRIMARY KEY, player_id uuid REFERENCES kd.player(id) ON DELETE CASCADE,
  csrf text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX session_expiry ON kd.session(expires_at);
CREATE TABLE kd.invite (
  token_hash text PRIMARY KEY, max_uses integer NOT NULL CHECK(max_uses>0), uses integer NOT NULL DEFAULT 0 CHECK(uses>=0 AND uses<=max_uses),
  expires_at timestamptz NOT NULL, created_by uuid REFERENCES kd.player(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kd.rate_bucket (key text PRIMARY KEY, window_at timestamptz NOT NULL, attempts integer NOT NULL CHECK(attempts>0));
CREATE TABLE kd.content_version (
  id text PRIMARY KEY, digest text NOT NULL, engine_version text NOT NULL,
  channel text NOT NULL CHECK(channel IN ('official','archived','development')),
  pack jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kd.content_selection (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), version_id text NOT NULL REFERENCES kd.content_version(id));
CREATE TABLE kd.card_identity (
  id text PRIMARY KEY, collectible_number text UNIQUE, prefix text, serial text,
  kindred text NOT NULL, set_id text NOT NULL, expansion_id text NOT NULL,
  retired boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((collectible_number IS NULL AND prefix IS NULL AND serial IS NULL) OR (collectible_number ~ '^[A-Z]+[0-9]{3,}$' AND prefix ~ '^[A-Z]+$' AND serial ~ '^[1-9][0-9]*$'))
);
CREATE TABLE kd.card_revision (
  version_id text NOT NULL REFERENCES kd.content_version(id), card_id text NOT NULL REFERENCES kd.card_identity(id),
  definition_revision integer NOT NULL CHECK(definition_revision>0), display_name text NOT NULL,
  definition jsonb NOT NULL, metadata jsonb NOT NULL, PRIMARY KEY(version_id,card_id)
);
CREATE TABLE kd.edition (
  id text PRIMARY KEY, card_id text NOT NULL REFERENCES kd.card_identity(id), edition text NOT NULL,
  UNIQUE(card_id,edition), UNIQUE(id,card_id)
);
CREATE TABLE kd.inventory (
  player_id uuid NOT NULL REFERENCES kd.player(id), edition_id text NOT NULL REFERENCES kd.edition(id),
  quantity integer NOT NULL CHECK(quantity>=0), acquired_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(player_id,edition_id)
);
CREATE TABLE kd.acquisition (
  id uuid PRIMARY KEY, player_id uuid NOT NULL REFERENCES kd.player(id), idempotency_key text NOT NULL,
  fingerprint text NOT NULL, source text NOT NULL, initiated_by uuid REFERENCES kd.player(id),
  result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(player_id,idempotency_key)
);
CREATE TABLE kd.inventory_entry (
  id bigserial PRIMARY KEY, acquisition_id uuid NOT NULL REFERENCES kd.acquisition(id),
  edition_id text NOT NULL REFERENCES kd.edition(id), delta integer NOT NULL CHECK(delta<>0),
  resulting_quantity integer NOT NULL CHECK(resulting_quantity>=0), UNIQUE(acquisition_id,edition_id)
);
CREATE TABLE kd.deck (
  id uuid PRIMARY KEY, player_id uuid NOT NULL REFERENCES kd.player(id), name text NOT NULL,
  version_id text NOT NULL REFERENCES kd.content_version(id), config jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0), testing_access boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
ALTER TABLE kd.player ADD CONSTRAINT player_default_deck FOREIGN KEY(default_deck_id) REFERENCES kd.deck(id);
CREATE TABLE kd.deck_card (
  deck_id uuid NOT NULL REFERENCES kd.deck(id), slot integer NOT NULL CHECK(slot>=0 AND slot<100),
  card_id text NOT NULL REFERENCES kd.card_identity(id), edition_id text,
  PRIMARY KEY(deck_id,slot), FOREIGN KEY(edition_id,card_id) REFERENCES kd.edition(id,card_id)
);
CREATE TABLE kd.deck_history (
  deck_id uuid NOT NULL REFERENCES kd.deck(id), revision integer NOT NULL,
  snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(deck_id,revision)
);
CREATE INDEX player_decks ON kd.deck(player_id) WHERE deleted_at IS NULL;
CREATE TABLE kd.match (
  id uuid PRIMARY KEY, player_id uuid NOT NULL REFERENCES kd.player(id), opponent_type text NOT NULL CHECK(opponent_type='computer'),
  version_id text NOT NULL REFERENCES kd.content_version(id), engine_version text NOT NULL,
  config jsonb NOT NULL, decks jsonb NOT NULL, seed bigint NOT NULL, starting_player integer NOT NULL CHECK(starting_player IN (0,1)),
  state jsonb NOT NULL, record jsonb NOT NULL, revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
  status text NOT NULL CHECK(status IN ('mulligan','playing','finished')), testing_access boolean NOT NULL DEFAULT false,
  result jsonb, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX player_matches ON kd.match(player_id,created_at DESC);
CREATE TABLE kd.match_action (
  match_id uuid NOT NULL REFERENCES kd.match(id), sequence integer NOT NULL,
  request_id text NOT NULL, action jsonb NOT NULL, signature text NOT NULL,
  PRIMARY KEY(match_id,sequence)
);
CREATE TABLE kd.match_request (
  match_id uuid NOT NULL REFERENCES kd.match(id), request_id text NOT NULL, fingerprint text NOT NULL,
  revision integer NOT NULL, PRIMARY KEY(match_id,request_id)
);
CREATE TABLE kd.match_completion (
  match_id uuid PRIMARY KEY REFERENCES kd.match(id), player_id uuid NOT NULL REFERENCES kd.player(id),
  scoring text NOT NULL, kindreds jsonb NOT NULL, outcome text NOT NULL CHECK(outcome IN ('win','loss','draw')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kd.progression_extension (
  player_id uuid PRIMARY KEY REFERENCES kd.player(id), achievements jsonb NOT NULL DEFAULT '[]',
  experience bigint NOT NULL DEFAULT 0 CHECK(experience>=0), level integer NOT NULL DEFAULT 1 CHECK(level>0),
  currency bigint NOT NULL DEFAULT 0 CHECK(currency>=0)
);
CREATE TABLE kd.studio_workspace (
  player_id uuid PRIMARY KEY REFERENCES kd.player(id), revision integer NOT NULL CHECK(revision>=0),
  workspace jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kd.local_import (
  player_id uuid NOT NULL REFERENCES kd.player(id), fingerprint text NOT NULL,
  classification text NOT NULL DEFAULT 'untrusted-development', summary jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(player_id,fingerprint)
);
CREATE TABLE kd.audit_event (
  id bigserial PRIMARY KEY, actor_id uuid REFERENCES kd.player(id), operation text NOT NULL,
  target_id text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO kd.migration_checksum(name,sha256) VALUES('1795721000000_foundation.cjs','${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}');
`);
exports.down = () => { throw new Error('Destructive down migrations are disabled. Restore a verified backup into a separate database.'); };
