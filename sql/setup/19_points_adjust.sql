-- Noor Gaming Lab DB setup - staff add or remove a customer's points
-- Idempotent. Run after 01_tables.sql and 02_functions.sql.
--
-- adjust_user_points(user, change, reason, staff): changes points_balance and writes one points_transactions row,
-- in one transaction. A positive change is logged as 'earned', a negative one as 'redeemed'.
--   USER_NOT_FOUND / INVALID_POINTS (zero, or more than 100000) / REASON_REQUIRED
--   INSUFFICIENT_POINTS  the balance would go below zero (the message carries the current balance)

ALTER TABLE points_transactions ADD COLUMN IF NOT EXISTS adjusted_by TEXT;

CREATE OR REPLACE FUNCTION adjust_user_points(p_user_id UUID, p_delta INTEGER, p_reason TEXT, p_staff TEXT)
RETURNS JSON AS $$
DECLARE
    v_balance INTEGER;
    v_new     INTEGER;
BEGIN
    IF p_delta IS NULL OR p_delta = 0 OR abs(p_delta) > 100000 THEN RAISE EXCEPTION 'INVALID_POINTS'; END IF;
    IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

    SELECT COALESCE(points_balance, 0) INTO v_balance FROM user_profiles WHERE user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;

    v_new := v_balance + p_delta;
    IF v_new < 0 THEN RAISE EXCEPTION 'INSUFFICIENT_POINTS:%', v_balance; END IF;

    UPDATE user_profiles SET points_balance = v_new WHERE user_id = p_user_id;
    INSERT INTO points_transactions (user_id, type, points, description, adjusted_by)
    VALUES (p_user_id, CASE WHEN p_delta > 0 THEN 'earned' ELSE 'redeemed' END, p_delta,
            'Staff adjustment: ' || left(btrim(p_reason), 200), NULLIF(btrim(p_staff), ''));

    RETURN json_build_object('balance', v_new, 'previous', v_balance, 'change', p_delta);
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    REVOKE ALL ON FUNCTION adjust_user_points(uuid,integer,text,text) FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON FUNCTION adjust_user_points(uuid,integer,text,text) FROM anon; END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON FUNCTION adjust_user_points(uuid,integer,text,text) FROM authenticated; END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN GRANT EXECUTE ON FUNCTION adjust_user_points(uuid,integer,text,text) TO service_role; END IF;
END $$;

NOTIFY pgrst, 'reload schema';
