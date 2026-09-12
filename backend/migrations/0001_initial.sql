CREATE TABLE users (
 id UUID PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE auth_sessions (
 token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE destinations (
 id UUID PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('youtube','facebook','custom')),
 enabled BOOLEAN NOT NULL DEFAULT false, url TEXT NOT NULL,
 encrypted_key TEXT, title TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE stream_sessions (
 id UUID PRIMARY KEY, start_time TIMESTAMPTZ NOT NULL DEFAULT now(), end_time TIMESTAMPTZ,
 duration BIGINT, input_bitrate DOUBLE PRECISION, resolution TEXT, fps DOUBLE PRECISION,
 destinations JSONB NOT NULL DEFAULT '[]', status TEXT NOT NULL
);
CREATE TABLE system_events (
 id BIGSERIAL PRIMARY KEY, timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
 level TEXT NOT NULL, source TEXT NOT NULL, message TEXT NOT NULL
);
CREATE INDEX events_timestamp ON system_events(timestamp DESC);
CREATE TABLE settings (id BOOLEAN PRIMARY KEY DEFAULT true CHECK(id), value JSONB NOT NULL);
