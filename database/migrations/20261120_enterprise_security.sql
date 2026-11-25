-- ============================================================================
-- NEXORA ERP — ENTERPRISE SECURITY, TRACKING, AUDIT & BACKUP MIGRATION
-- Company: FunZoo Toys, Jewar, Uttar Pradesh
-- Timezone: Asia/Kolkata | Currency: INR
-- Migration: 20261120_enterprise_security.sql
-- Safe & Idempotent (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS)
-- ============================================================================

-- 1. USER LOGIN HISTORY
CREATE TABLE IF NOT EXISTS user_login_history (
  id BIGSERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(255),
  email VARCHAR(255),
  user_role VARCHAR(100),
  session_id VARCHAR(128),
  event_type VARCHAR(40) NOT NULL DEFAULT 'LOGIN'
    CHECK (event_type IN ('LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'SESSION_EXPIRED', 'FORCED_LOGOUT', 'MFA_CHALLENGE', 'MFA_FAILED')),
  login_status VARCHAR(32) NOT NULL
    CHECK (login_status IN ('SUCCESS', 'FAILED', 'LOCKED', 'BLOCKED_DEVICE', 'INACTIVE_ACCOUNT', 'MFA_REQUIRED', 'LOGGED_OUT')),
  failure_reason VARCHAR(255),
  ip_address VARCHAR(64) NOT NULL DEFAULT 'unknown',
  device_id VARCHAR(128),
  device_name VARCHAR(255),
  device_type VARCHAR(64),
  os_name VARCHAR(100),
  os_version VARCHAR(64),
  browser_name VARCHAR(100),
  browser_version VARCHAR(64),
  user_agent TEXT,
  client_source VARCHAR(32) NOT NULL DEFAULT 'browser_reported'
    CHECK (client_source IN ('browser_reported', 'verified_agent')),
  verified_machine_name VARCHAR(255),
  is_new_device BOOLEAN NOT NULL DEFAULT FALSE,
  is_suspicious BOOLEAN NOT NULL DEFAULT FALSE,
  login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logout_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ulh_user_id ON user_login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_ulh_email ON user_login_history(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_ulh_login_at ON user_login_history(login_at DESC);
CREATE INDEX IF NOT EXISTS idx_ulh_ip ON user_login_history(ip_address);
CREATE INDEX IF NOT EXISTS idx_ulh_status ON user_login_history(login_status);
CREATE INDEX IF NOT EXISTS idx_ulh_device_id ON user_login_history(device_id);
CREATE INDEX IF NOT EXISTS idx_ulh_session_id ON user_login_history(session_id);

-- 2. USER DEVICE HISTORY
CREATE TABLE IF NOT EXISTS user_device_history (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(128) NOT NULL,
  device_name VARCHAR(255) NOT NULL,
  device_type VARCHAR(64) NOT NULL DEFAULT 'Desktop',
  os_name VARCHAR(100),
  os_version VARCHAR(64),
  browser_name VARCHAR(100),
  browser_version VARCHAR(64),
  user_agent TEXT,
  client_source VARCHAR(32) NOT NULL DEFAULT 'browser_reported'
    CHECK (client_source IN ('browser_reported', 'verified_agent')),
  verified_machine_name VARCHAR(255),
  first_ip_address VARCHAR(64),
  last_ip_address VARCHAR(64),
  first_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  login_count INT NOT NULL DEFAULT 1,
  trust_status VARCHAR(32) NOT NULL DEFAULT 'trusted'
    CHECK (trust_status IN ('trusted', 'new', 'blocked', 'revoked')),
  blocked_at TIMESTAMPTZ,
  blocked_by INT REFERENCES users(id) ON DELETE SET NULL,
  block_reason VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_udh_user_id ON user_device_history(user_id);
CREATE INDEX IF NOT EXISTS idx_udh_device_id ON user_device_history(device_id);
CREATE INDEX IF NOT EXISTS idx_udh_trust_status ON user_device_history(trust_status);
CREATE INDEX IF NOT EXISTS idx_udh_last_login ON user_device_history(last_login_at DESC);

-- 3. USER SESSIONS (Server-side session control, refresh token rotation, forced revocation)
CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGSERIAL PRIMARY KEY,
  session_id VARCHAR(128) UNIQUE NOT NULL,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username VARCHAR(255),
  user_email VARCHAR(255),
  user_role VARCHAR(100),
  access_jti VARCHAR(128) UNIQUE NOT NULL,
  refresh_token_hash VARCHAR(128),
  previous_refresh_hash VARCHAR(128),
  device_id VARCHAR(128),
  device_name VARCHAR(255),
  device_type VARCHAR(64),
  os_name VARCHAR(100),
  browser_name VARCHAR(100),
  ip_address VARCHAR(64) NOT NULL DEFAULT 'unknown',
  user_agent TEXT,
  client_source VARCHAR(32) NOT NULL DEFAULT 'browser_reported',
  status VARCHAR(32) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'expired', 'logged_out', 'compromised')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by INT REFERENCES users(id) ON DELETE SET NULL,
  revoke_reason VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_us_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_us_access_jti ON user_sessions(access_jti);
CREATE INDEX IF NOT EXISTS idx_us_refresh_hash ON user_sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_us_status ON user_sessions(status);
CREATE INDEX IF NOT EXISTS idx_us_expires_at ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_us_device_id ON user_sessions(device_id);

-- 4. USER ACTIVITY LOGS (Centralized Append-Only Tamper-Evident Audit Trail)
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(255),
  user_email VARCHAR(255),
  user_role VARCHAR(100),
  module_name VARCHAR(100) NOT NULL,
  action_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id VARCHAR(128),
  http_method VARCHAR(16),
  api_endpoint VARCHAR(500),
  ip_address VARCHAR(64) NOT NULL DEFAULT 'unknown',
  device_id VARCHAR(128),
  device_name VARCHAR(255),
  browser_name VARCHAR(100),
  os_name VARCHAR(100),
  session_id VARCHAR(128),
  status VARCHAR(32) NOT NULL DEFAULT 'SUCCESS'
    CHECK (status IN ('SUCCESS', 'FAILED', 'DENIED', 'WARNING')),
  response_status_code INT,
  description TEXT,
  before_values JSONB,
  after_values JSONB,
  metadata JSONB,
  prev_hash VARCHAR(128) NOT NULL,
  entry_hash VARCHAR(128) NOT NULL,
  hmac_signature VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ual_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ual_module ON user_activity_logs(module_name);
CREATE INDEX IF NOT EXISTS idx_ual_action ON user_activity_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_ual_entity ON user_activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ual_created_at ON user_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ual_status ON user_activity_logs(status);
CREATE INDEX IF NOT EXISTS idx_ual_ip ON user_activity_logs(ip_address);

-- Append-only guard trigger on user_activity_logs (blocks UPDATE/DELETE unless retention cleanup GUC is explicitly set)
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('nexora.allow_audit_retention_purge', true) = 'on' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'user_activity_logs is append-only; UPDATE and DELETE operations are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_activity_logs_append_only ON user_activity_logs;
CREATE TRIGGER trg_user_activity_logs_append_only
  BEFORE UPDATE OR DELETE ON user_activity_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- 5. SECURITY EVENTS (Real-time threat detection & alerting ledger)
CREATE TABLE IF NOT EXISTS security_events (
  id BIGSERIAL PRIMARY KEY,
  event_code VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  severity VARCHAR(16) NOT NULL
    CHECK (severity IN ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(255),
  user_email VARCHAR(255),
  ip_address VARCHAR(64) NOT NULL DEFAULT 'unknown',
  device_id VARCHAR(128),
  device_name VARCHAR(255),
  endpoint VARCHAR(500),
  description TEXT NOT NULL,
  details JSONB,
  alert_email_sent BOOLEAN NOT NULL DEFAULT FALSE,
  alert_sent_at TIMESTAMPTZ,
  is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by INT REFERENCES users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_se_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_se_event_code ON security_events(event_code);
CREATE INDEX IF NOT EXISTS idx_se_created_at ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_se_resolved ON security_events(is_resolved);
CREATE INDEX IF NOT EXISTS idx_se_user_id ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_se_ip ON security_events(ip_address);

-- 6. DATABASE BACKUP HISTORY (Dual-Storage: PostgreSQL + JSON Store)
CREATE TABLE IF NOT EXISTS database_backup_history (
  id BIGSERIAL PRIMARY KEY,
  backup_uid VARCHAR(128) UNIQUE NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  storage_path TEXT NOT NULL,
  offsite_path TEXT,
  trigger_type VARCHAR(32) NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('manual', 'scheduled', 'pre_restore', 'cli')),
  status VARCHAR(32) NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'failed', 'verified', 'restored', 'deleted')),
  pg_status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (pg_status IN ('pending', 'completed', 'fallback_logical', 'skipped_offline', 'failed')),
  pg_engine VARCHAR(64),
  json_store_status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (json_store_status IN ('pending', 'completed', 'failed', 'missing')),
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  checksum_sha256 VARCHAR(128),
  encrypted BOOLEAN NOT NULL DEFAULT TRUE,
  encryption_algorithm VARCHAR(64) NOT NULL DEFAULT 'aes-256-gcm',
  compression_algorithm VARCHAR(32) NOT NULL DEFAULT 'gzip',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  verified_at TIMESTAMPTZ,
  verified_by INT REFERENCES users(id) ON DELETE SET NULL,
  verification_status VARCHAR(32),
  retention_until TIMESTAMPTZ,
  initiated_by INT REFERENCES users(id) ON DELETE SET NULL,
  initiated_by_email VARCHAR(255),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dbh_created_at ON database_backup_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dbh_status ON database_backup_history(status);
CREATE INDEX IF NOT EXISTS idx_dbh_trigger_type ON database_backup_history(trigger_type);
CREATE INDEX IF NOT EXISTS idx_dbh_retention ON database_backup_history(retention_until);

-- 7. SECURITY SETTINGS (Configurable governance controls & MFA state)
CREATE TABLE IF NOT EXISTS security_settings (
  setting_key VARCHAR(128) PRIMARY KEY,
  setting_value JSONB NOT NULL,
  description TEXT,
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optional Admin MFA Columns on users (Non-breaking additive schema extension)
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret_encrypted TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_recovery_codes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INT DEFAULT 0;
