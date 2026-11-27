const fs=require('node:fs'),crypto=require('node:crypto');
exports.up=pgm=>pgm.sql(`
CREATE TABLE kd.trade_report (
 id uuid PRIMARY KEY,reporter_id uuid NOT NULL REFERENCES kd.player(id),reported_id uuid NOT NULL REFERENCES kd.player(id),
 offer_id uuid NOT NULL REFERENCES kd.trade_offer(id),version_id uuid NOT NULL REFERENCES kd.trade_offer_version(id),
 category text NOT NULL CHECK(category IN('spam','harassment','suspicious_trade','misrepresentation','other')),
 explanation text NOT NULL CHECK(length(explanation) BETWEEN 5 AND 1000),evidence jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),CHECK(reporter_id<>reported_id)
);
CREATE INDEX trade_reports_review ON kd.trade_report(created_at DESC,id);
CREATE INDEX trade_reports_reporter ON kd.trade_report(reporter_id,created_at DESC,id);
CREATE TABLE kd.trade_report_review (
 id uuid PRIMARY KEY,report_id uuid NOT NULL REFERENCES kd.trade_report(id),actor_id uuid NOT NULL REFERENCES kd.player(id),
 state text NOT NULL CHECK(state IN('investigating','resolved','dismissed')),note text NOT NULL CHECK(length(note) BETWEEN 5 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trade_report_latest ON kd.trade_report_review(report_id,created_at DESC,id);
${['trade_report','trade_report_review'].map(t=>`CREATE TRIGGER immutable_${t} BEFORE UPDATE OR DELETE ON kd.${t} FOR EACH ROW EXECUTE FUNCTION kd.reject_immutable_write();`).join('\n')}
INSERT INTO kd.migration_checksum(name,sha256) VALUES('1796600000000_trading_safety.cjs','${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}');
`);
exports.down=()=>{throw Error('Destructive down migrations are disabled; restore a verified separate database.');};
