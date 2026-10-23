-- Noor Gaming Lab DB setup - private storage for receipts sent on WhatsApp
-- Idempotent. The server saves each receipt PDF here and sends the customer a temporary (7 day) link.
-- The bucket is PRIVATE and has no policies: only the server (service role) can read or write it.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('receipts', 'receipts', false, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880, allowed_mime_types = ARRAY['application/pdf'];

NOTIFY pgrst, 'reload schema';
