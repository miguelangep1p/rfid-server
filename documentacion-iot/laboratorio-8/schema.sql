BEGIN;
CREATE SCHEMA IF NOT EXISTS access_control;
CREATE SCHEMA IF NOT EXISTS mqtt_security;
CREATE TABLE IF NOT EXISTS access_control.cards (
 uid text PRIMARY KEY CHECK (uid ~ '^([0-9A-F]{2}){4,10}$'),
 name text NOT NULL, active boolean NOT NULL DEFAULT true,
 assistance_requested boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS access_control.permissions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 uid text NOT NULL REFERENCES access_control.cards(uid),
 device_id text NOT NULL, relay smallint NOT NULL CHECK (relay IN (1,2)),
 valid_from timestamptz NOT NULL, valid_until timestamptz,
 revoked_at timestamptz,
 CHECK (valid_until IS NULL OR valid_until = valid_from + interval '3 hours')
);
CREATE INDEX IF NOT EXISTS permission_lookup ON access_control.permissions(uid,device_id);
CREATE TABLE IF NOT EXISTS access_control.events (
 event_id uuid PRIMARY KEY, uid text NOT NULL, device_id text NOT NULL,
 device_time_raw text NOT NULL, received_at timestamptz NOT NULL,
 decided_at timestamptz NOT NULL DEFAULT now(), decision text NOT NULL CHECK (decision IN ('CONCEDIDO','DENEGADO')),
 permission_id bigint REFERENCES access_control.permissions(id)
);
CREATE TABLE IF NOT EXISTS access_control.commands (
 command_id uuid PRIMARY KEY, event_id uuid UNIQUE NOT NULL REFERENCES access_control.events(event_id),
 payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending', result jsonb
);
CREATE TABLE IF NOT EXISTS access_control.notifications (
 notification_id uuid PRIMARY KEY, event_id uuid UNIQUE NOT NULL REFERENCES access_control.events(event_id),
 payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mqtt_security.mqtt_user (
 username text PRIMARY KEY, password_hash text NOT NULL, salt text NOT NULL,
 active boolean NOT NULL DEFAULT true, is_superuser boolean NOT NULL DEFAULT false CHECK (NOT is_superuser)
);
CREATE TABLE IF NOT EXISTS mqtt_security.mqtt_acl (
 username text NOT NULL REFERENCES mqtt_security.mqtt_user(username),
 permission text NOT NULL CHECK (permission IN ('allow','deny')),
 action text NOT NULL CHECK (action IN ('publish','subscribe','all')), topic text NOT NULL,
 PRIMARY KEY(username,action,topic)
);
COMMIT;
