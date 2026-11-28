exports.up=pgm=>pgm.sql(`
-- Preserve every original immutable provenance field. Only the two newly added
-- current-license projection fields join the existing operational allow-list.
CREATE OR REPLACE FUNCTION kd.protect_cosmetic_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'restricted'-'revoked'-'current_acquisition'-'limited_projection'-'limited_current_version') IS DISTINCT FROM (to_jsonb(OLD)-'restricted'-'revoked'-'current_acquisition'-'limited_projection'-'limited_current_version')
 THEN RAISE EXCEPTION 'Cosmetic acquisition provenance is immutable';END IF;
 IF NOT OLD.limited_projection AND NEW.limited_projection THEN RAISE EXCEPTION 'An ordinary cosmetic license cannot become a limited projection';END IF;
 IF OLD.limited_projection AND NOT NEW.limited_projection AND NEW.current_acquisition IS NULL THEN RAISE EXCEPTION 'A real independent license needs its retained acquisition';END IF;
 RETURN NEW;
END $$;
`);
exports.down=()=>{throw Error('Original cosmetic provenance and independent licenses require forward-only recovery.');};
