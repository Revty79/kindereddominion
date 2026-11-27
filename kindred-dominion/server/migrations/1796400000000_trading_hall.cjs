const fs=require('node:fs'),crypto=require('node:crypto');
exports.up=pgm=>pgm.sql(`
CREATE TABLE kd.trading_listing (
 id uuid PRIMARY KEY,player_id uuid NOT NULL REFERENCES kd.player(id),card_id text NOT NULL REFERENCES kd.card_identity(id),
 quantity integer NOT NULL CHECK(quantity>0 AND quantity<=1000),wanted jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('active','closed')),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_card_listing ON kd.trading_listing(player_id,card_id) WHERE status='active';
CREATE INDEX trading_listing_browse ON kd.trading_listing(status,updated_at DESC,id);
CREATE TABLE kd.trading_listing_history (
 listing_id uuid NOT NULL REFERENCES kd.trading_listing(id),revision integer NOT NULL,
 actor_id uuid NOT NULL REFERENCES kd.player(id),snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(listing_id,revision)
);
CREATE TABLE kd.trading_wish (
 player_id uuid NOT NULL REFERENCES kd.player(id),card_id text NOT NULL REFERENCES kd.card_identity(id),
 quantity integer NOT NULL CHECK(quantity>0 AND quantity<=1000),priority integer NOT NULL CHECK(priority BETWEEN 1 AND 5),
 status text NOT NULL CHECK(status IN ('active','completed')),visibility text NOT NULL CHECK(visibility IN ('private','public')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(player_id,card_id)
);
CREATE INDEX public_trading_wishes ON kd.trading_wish(card_id,priority DESC,updated_at DESC) WHERE status='active' AND visibility='public';
CREATE TABLE kd.trading_wish_history (
 player_id uuid NOT NULL,card_id text NOT NULL,revision integer NOT NULL,snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(player_id,card_id,revision),FOREIGN KEY(player_id,card_id) REFERENCES kd.trading_wish(player_id,card_id)
);
CREATE TABLE kd.trading_hall_request (
 player_id uuid NOT NULL REFERENCES kd.player(id),idempotency_key text NOT NULL,operation text NOT NULL,
 fingerprint text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(player_id,idempotency_key)
);
ALTER TABLE kd.trade_offer ADD COLUMN source_listing uuid REFERENCES kd.trading_listing(id);
CREATE INDEX trade_offer_second_participant ON kd.trade_offer(player_b,updated_at DESC,id);
CREATE INDEX trade_settlement_first_player ON kd.trade_settlement(player_a,created_at);
CREATE INDEX trade_settlement_second_player ON kd.trade_settlement(player_b,created_at);
CREATE FUNCTION kd.protect_trading_listing() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF(to_jsonb(NEW)-'quantity'-'wanted'-'status'-'revision'-'updated_at') IS DISTINCT FROM(to_jsonb(OLD)-'quantity'-'wanted'-'status'-'revision'-'updated_at') OR NEW.revision<>OLD.revision+1
 THEN RAISE EXCEPTION 'Listing identity and monotone revisions are preserved'; END IF;RETURN NEW;
END $$;
CREATE FUNCTION kd.protect_trading_wish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF(to_jsonb(NEW)-'quantity'-'priority'-'status'-'visibility'-'revision'-'updated_at') IS DISTINCT FROM(to_jsonb(OLD)-'quantity'-'priority'-'status'-'visibility'-'revision'-'updated_at') OR NEW.revision<>OLD.revision+1
 THEN RAISE EXCEPTION 'Wish identity and monotone revisions are preserved'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER protected_trading_listing BEFORE UPDATE ON kd.trading_listing FOR EACH ROW EXECUTE FUNCTION kd.protect_trading_listing();
CREATE TRIGGER protected_trading_wish BEFORE UPDATE ON kd.trading_wish FOR EACH ROW EXECUTE FUNCTION kd.protect_trading_wish();
${['trading_listing','trading_wish'].map(t=>`CREATE TRIGGER retained_${t} BEFORE DELETE ON kd.${t} FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();`).join('\n')}
${['trading_listing_history','trading_wish_history','trading_hall_request'].map(t=>`CREATE TRIGGER immutable_${t} BEFORE UPDATE OR DELETE ON kd.${t} FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();`).join('\n')}
INSERT INTO kd.migration_checksum(name,sha256) VALUES('1796400000000_trading_hall.cjs','${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}');
`);
exports.down=()=>{throw Error('Destructive down migrations are disabled; restore a verified separate database.');};
