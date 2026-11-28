exports.up=pgm=>pgm.sql(`
ALTER TABLE kd.reward_entitlement ADD COLUMN fulfillment_context jsonb;
CREATE FUNCTION kd.guard_limited_pins() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.shop_version<>OLD.shop_version OR NEW.content_version<>OLD.content_version THEN RAISE EXCEPTION 'Original limited content and artwork publications are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER limited_publication_pins BEFORE UPDATE ON kd.limited_edition FOR EACH ROW EXECUTE FUNCTION kd.guard_limited_pins();
CREATE FUNCTION kd.guard_limited_component() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Original limited components cannot be deleted';END IF;
 IF ROW(NEW.instance_id,NEW.kind,NEW.identity_id,NEW.quantity,NEW.inventory_edition,NEW.original_acquisition) IS DISTINCT FROM ROW(OLD.instance_id,OLD.kind,OLD.identity_id,OLD.quantity,OLD.inventory_edition,OLD.original_acquisition) THEN RAISE EXCEPTION 'Original limited components are immutable';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER limited_component_identity BEFORE UPDATE OR DELETE ON kd.limited_component FOR EACH ROW EXECUTE FUNCTION kd.guard_limited_component();
CREATE FUNCTION kd.guard_limited_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.state<>'issuing' AND NEW.state='issuing' OR OLD.state='retired' AND NEW.owner_id<>OLD.owner_id THEN RAISE EXCEPTION 'Limited lifecycle cannot revert or transfer retired instances';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER limited_lifecycle BEFORE UPDATE ON kd.limited_instance FOR EACH ROW EXECUTE FUNCTION kd.guard_limited_lifecycle();
CREATE INDEX limited_owner_inspection ON kd.limited_instance(owner_id,issued_at DESC,id);
CREATE INDEX limited_purchase_sources ON kd.limited_instance(purchase_id) WHERE purchase_id IS NOT NULL;
CREATE INDEX limited_commercial_sources ON kd.limited_instance(commercial_order_id) WHERE commercial_order_id IS NOT NULL;
CREATE INDEX limited_pending_supply ON kd.limited_reservation(edition_id,allocation_id) WHERE state='held';
`);
exports.down=()=>{throw Error('Limited history safeguards require forward-only recovery.');};
