CREATE TABLE IF NOT EXISTS shixu_users (
 id uuid PRIMARY KEY,
 email text NOT NULL UNIQUE,
 display_name text NOT NULL,
 password_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shixu_sessions (
 token_hash text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES shixu_users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shixu_sessions_expiry ON shixu_sessions(expires_at);
CREATE TABLE IF NOT EXISTS shixu_plans (
 user_id uuid PRIMARY KEY REFERENCES shixu_users(id) ON DELETE CASCADE,
 revision integer NOT NULL DEFAULT 0,
 state_json jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shixu_ai_usage (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES shixu_users(id) ON DELETE CASCADE,
 model text NOT NULL,
 outcome text NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending','success','error','rejected')),
 http_status integer,
 duration_ms integer,
 provider_called boolean NOT NULL DEFAULT false,
 prompt_tokens integer,
 completion_tokens integer,
 total_tokens integer,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shixu_ai_usage_user_created ON shixu_ai_usage(user_id,created_at DESC);
-- v0.5: WeChat identity, closed beta access and future subscription entitlements.
ALTER TABLE shixu_users ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'legacy';
ALTER TABLE shixu_users ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active';
ALTER TABLE shixu_sessions ADD COLUMN IF NOT EXISTS client_type text NOT NULL DEFAULT 'web';
CREATE TABLE IF NOT EXISTS shixu_wechat_identities (
 app_id text NOT NULL, open_id text NOT NULL,
 user_id uuid NOT NULL REFERENCES shixu_users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(app_id,open_id), UNIQUE(app_id,user_id)
);
CREATE TABLE IF NOT EXISTS shixu_entitlements (
 user_id uuid PRIMARY KEY REFERENCES shixu_users(id) ON DELETE CASCADE,
 plan_code text NOT NULL DEFAULT 'internal', source text NOT NULL,
 starts_at timestamptz NOT NULL DEFAULT now(), ends_at timestamptz NOT NULL,
 daily_ai_limit integer NOT NULL CHECK(daily_ai_limit BETWEEN 0 AND 1000),
 status text NOT NULL DEFAULT 'active', updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shixu_invites (
 id uuid PRIMARY KEY, code_hash text NOT NULL UNIQUE,
 max_uses integer NOT NULL CHECK(max_uses BETWEEN 1 AND 1000),
 used_count integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL,
 grant_days integer NOT NULL CHECK(grant_days BETWEEN 1 AND 366),
 daily_ai_limit integer NOT NULL CHECK(daily_ai_limit BETWEEN 0 AND 1000),
 revoked boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shixu_invite_redemptions (
 invite_id uuid NOT NULL REFERENCES shixu_invites(id),
 user_id uuid NOT NULL REFERENCES shixu_users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(invite_id,user_id)
);
CREATE TABLE IF NOT EXISTS shixu_link_tickets (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES shixu_users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, consumed_at timestamptz
);
CREATE TABLE IF NOT EXISTS shixu_daily_ai (
 user_id uuid NOT NULL REFERENCES shixu_users(id) ON DELETE CASCADE,
 day date NOT NULL, used_count integer NOT NULL DEFAULT 0, PRIMARY KEY(user_id,day)
);
