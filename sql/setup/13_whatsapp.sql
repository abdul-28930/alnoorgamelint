-- Noor Gaming Lab DB setup - WhatsApp notifications
-- Idempotent. Run after 01_tables.sql. Everything here is used by the server only (service role).

-- which approved WhatsApp template each event uses, and whether the event sends at all
CREATE TABLE IF NOT EXISTS whatsapp_templates (
    event          TEXT PRIMARY KEY,
    template_name  TEXT NOT NULL CHECK (template_name ~ '^[a-z0-9_]{1,255}$'),
    enabled        BOOLEAN NOT NULL DEFAULT true,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- one row per message: what was sent, to whom, and what the provider said
CREATE TABLE IF NOT EXISTS notification_log (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event              TEXT NOT NULL,
    dedupe_key         TEXT UNIQUE,                       -- the same event for the same thing is never sent twice
    recipient_phone    TEXT,
    recipient_name     TEXT,
    user_id            UUID,
    booking_id         UUID,
    tournament_id      UUID,
    entrant_id         UUID,
    template_name      TEXT,
    send_args          JSONB,                             -- everything needed to send it again
    status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'sent', 'failed', 'unconfirmed', 'skipped')),
    attempts           INTEGER NOT NULL DEFAULT 0,
    last_error         TEXT,
    provider_response  TEXT,
    sent_by            UUID,                              -- staff member for manual sends
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notification_log_created ON notification_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_status  ON notification_log (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_tournament ON notification_log (tournament_id, event);

-- members can switch WhatsApp messages off (the screen for it comes later; the server already respects it)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT true;

-- no policies: the browser can read and write nothing here
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log   ENABLE ROW LEVEL SECURITY;

INSERT INTO whatsapp_templates (event, template_name) VALUES
    ('reservation_received',         'reservation_received'),
    ('booking_confirmed',            'booking_confirmed'),
    ('receipt_ready',                'receipt_ready'),
    ('tournament_registered',        'tournament_registered'),
    ('tournament_waitlist_moved_up', 'tournament_waitlist_moved_up'),
    ('tournament_update',            'tournament_update'),
    ('match_call',                   'match_call')
ON CONFLICT (event) DO NOTHING;

NOTIFY pgrst, 'reload schema';
