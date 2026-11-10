-- Better Auth 1.7: authentication is separate from the existing application users.
-- UUID strings and ALL existing foreign keys remain unchanged.
CREATE TABLE auth_users (
  id varchar(36) PRIMARY KEY REFERENCES users(id),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  "termsAccepted" boolean NOT NULL CHECK ("termsAccepted" = true),
  "termsAcceptedAt" timestamptz NOT NULL,
  "termsVersion" text NOT NULL,
  "privacyVersion" text NOT NULL
);

-- Provision the application profile in the SAME transaction as Better Auth's
-- user/account creation. Never attach a new signup to a pre-existing profile.
CREATE FUNCTION provision_auth_user_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO users (id, nickname, created_at, updated_at)
  VALUES (NEW.id, NEW.name, NEW."createdAt", NEW."updatedAt");
  RETURN NEW;
END;
$$;
CREATE TRIGGER auth_user_profile BEFORE INSERT ON auth_users
FOR EACH ROW EXECUTE FUNCTION provision_auth_user_profile();

CREATE TABLE auth_sessions (
  id varchar(36) PRIMARY KEY,
  "userId" varchar(36) NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  "expiresAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL
);
CREATE INDEX auth_sessions_user ON auth_sessions("userId");

CREATE TABLE auth_accounts (
  id varchar(36) PRIMARY KEY,
  "userId" varchar(36) NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  UNIQUE ("providerId", "accountId")
);
CREATE INDEX auth_accounts_user ON auth_accounts("userId");

CREATE TABLE auth_verifications (
  id varchar(36) PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL
);
CREATE INDEX auth_verifications_identifier ON auth_verifications(identifier);
