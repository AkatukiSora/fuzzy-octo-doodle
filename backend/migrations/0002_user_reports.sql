CREATE TABLE user_reports (
  id varchar(36) PRIMARY KEY,
  reporter_id varchar(36) NOT NULL REFERENCES users(id),
  target_user_id varchar(36) NOT NULL REFERENCES users(id),
  reason_type varchar(32) NOT NULL CHECK (reason_type IN ('harassment', 'spam', 'inappropriate', 'other')),
  reason_detail varchar(1000) NOT NULL,
  idempotency_key varchar(36) NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT user_reports_request_unique UNIQUE (reporter_id, idempotency_key),
  CONSTRAINT user_reports_not_self CHECK (reporter_id <> target_user_id)
);
CREATE INDEX user_reports_target_created ON user_reports(target_user_id, created_at);
