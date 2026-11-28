exports.up=pgm=>pgm.sql(`
ALTER TABLE kd.cosmetic_ownership ADD COLUMN limited_current_version uuid REFERENCES kd.configuration_version(id);
ALTER TABLE kd.cosmetic_ownership ADD CONSTRAINT limited_cosmetic_projection_version CHECK(limited_projection OR limited_current_version IS NULL);
`);
exports.down=()=>{throw Error('Limited cosmetic projection histories require forward-only recovery.');};
