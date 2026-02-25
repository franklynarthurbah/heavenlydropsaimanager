-- ============================================================
-- Migration 002 – Email System
-- Heavenly Drops AI Manager
-- ============================================================

-- Mail server accounts
CREATE TABLE IF NOT EXISTS mail_accounts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    role        VARCHAR(50)  NOT NULL DEFAULT 'staff',  -- admin|staff|noreply
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    password_hash VARCHAR(255),  -- SHA-512-CRYPT for Dovecot
    quota_mb    INTEGER      NOT NULL DEFAULT 2048,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Seed company accounts
INSERT INTO mail_accounts (email, display_name, role) VALUES
  ('info@workandstudyabroad.com.tr',    'Heavenly Drops Info',    'staff'),
  ('support@workandstudyabroad.com.tr', 'Heavenly Drops Support', 'staff'),
  ('sales@workandstudyabroad.com.tr',   'Heavenly Drops Sales',   'staff'),
  ('admin@workandstudyabroad.com.tr',   'Heavenly Drops Admin',   'admin'),
  ('noreply@workandstudyabroad.com.tr', 'No Reply',               'noreply')
ON CONFLICT (email) DO NOTHING;

-- Email attachment logs
CREATE TABLE IF NOT EXISTS email_attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_log_id    UUID REFERENCES email_logs(id) ON DELETE CASCADE,
    filename        VARCHAR(500)  NOT NULL,
    mime_type       VARCHAR(200)  NOT NULL,
    size_bytes      INTEGER,
    storage_path    TEXT,
    extracted_text  TEXT,
    processing_status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending|processed|failed
    automation_triggered VARCHAR(255),  -- workflow/chatbot name invoked
    lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_attachments_email_log ON email_attachments(email_log_id);
CREATE INDEX IF NOT EXISTS idx_email_attachments_lead ON email_attachments(lead_id);

-- AI vs Human detection results
CREATE TABLE IF NOT EXISTS email_ai_detection (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_log_id    UUID UNIQUE REFERENCES email_logs(id) ON DELETE CASCADE,
    is_ai_generated BOOLEAN,
    confidence      NUMERIC(4,3),  -- 0.000 – 1.000
    signals         JSONB,         -- feature scores
    model_version   VARCHAR(50),
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Form submission parsing results
CREATE TABLE IF NOT EXISTS form_submissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_log_id    UUID UNIQUE REFERENCES email_logs(id) ON DELETE CASCADE,
    form_type       VARCHAR(100),   -- contact|application|quote|newsletter
    form_source     TEXT,           -- URL or form name
    parsed_fields   JSONB,          -- key/value of extracted fields
    lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
    workflow_triggered VARCHAR(255),
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_lead ON form_submissions(lead_id);

-- SMTP/IMAP diagnostics log
CREATE TABLE IF NOT EXISTS mail_diagnostics (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_type  VARCHAR(100) NOT NULL,  -- smtp_send|imap_login|roundcube_health|ssl_cert
    status      VARCHAR(20)  NOT NULL,  -- ok|warning|error
    details     JSONB,
    error_msg   TEXT,
    duration_ms INTEGER,
    checked_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_diagnostics_time ON mail_diagnostics(checked_at DESC);

-- Auto-updater history
CREATE TABLE IF NOT EXISTS update_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component       VARCHAR(100) NOT NULL,  -- roundcube|whatsapp|instagram|backend
    previous_version VARCHAR(50),
    new_version     VARCHAR(50),
    status          VARCHAR(20)  NOT NULL,  -- pending|installing|success|failed|rolled_back
    log_output      TEXT,
    started_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

-- Update email_logs to add missing columns if they don't exist yet
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS
    is_ai_generated BOOLEAN DEFAULT NULL;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS
    ai_detection_confidence NUMERIC(4,3) DEFAULT NULL;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS
    has_attachments BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS
    attachment_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS
    form_submission BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS
    raw_headers JSONB DEFAULT NULL;

-- Dashboard refresh view
CREATE OR REPLACE VIEW email_system_dashboard AS
SELECT
    (SELECT COUNT(*) FROM email_logs WHERE created_at > now() - interval '24 hours')  AS emails_last_24h,
    (SELECT COUNT(*) FROM email_logs WHERE direction = 'inbound'
        AND created_at > now() - interval '24 hours')                                  AS inbound_last_24h,
    (SELECT COUNT(*) FROM email_logs WHERE direction = 'outbound'
        AND created_at > now() - interval '24 hours')                                  AS outbound_last_24h,
    (SELECT COUNT(*) FROM email_attachments WHERE created_at > now() - interval '24 hours') AS attachments_last_24h,
    (SELECT COUNT(*) FROM email_attachments WHERE processing_status = 'pending')       AS attachments_pending,
    (SELECT COUNT(*) FROM form_submissions WHERE processed_at > now() - interval '24 hours') AS forms_last_24h,
    (SELECT COUNT(*) FROM email_ai_detection WHERE is_ai_generated = true
        AND detected_at > now() - interval '24 hours')                                 AS ai_emails_last_24h,
    (SELECT status FROM mail_diagnostics ORDER BY checked_at DESC LIMIT 1)             AS last_diagnostic_status,
    (SELECT checked_at FROM mail_diagnostics ORDER BY checked_at DESC LIMIT 1)         AS last_diagnostic_at;
