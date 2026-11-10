import type { Insertable, Selectable } from "kysely";

/**
 * テーブル定義の型。DB 製品に依存しない形で書く。
 * - ID は文字列（UUID を varchar(36) で保持）。アプリ側で採番する
 * - 日時は Date。DB 側は UTC で保存・取得する前提（MySQL 系は接続の timezone を "Z" にする）
 * - 真偽値は MySQL 系で 0/1 が返るため boolean | number。読み出しは mappers の flag() を通す
 */
export type Flag = boolean | number;

export interface UsersTable {
  id: string;
  nickname: string;
  created_at: Date;
  updated_at: Date;
}

export interface FriendshipsTable {
  id: string;
  /** 2人の ID を辞書順に並べた組。順序に依存しないペア一意制約のために保持する */
  user_low_id: string;
  user_high_id: string;
  requester_id: string;
  receiver_id: string;
  status: string;
  blocked_by: string | null;
  requested_at: Date;
  accepted_at: Date | null;
}

export interface FriendInvitesTable {
  id: string;
  inviter_id: string;
  token: string;
  is_active: Flag;
  created_at: Date;
}

export interface TasksTable {
  id: string;
  user_id: string;
  original_task_id: string | null;
  title: string;
  achievement_condition: string;
  evidence_method: string;
  deadline_at: Date;
  penalty_amount: number;
  is_penalty_public: Flag;
  status: string;
  review_round: number;
  review_deadline_at: Date | null;
  additional_evidence_deadline_at: Date | null;
  completed_at: Date | null;
  finalized_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface TaskEvidencesTable {
  id: string;
  task_id: string;
  submission_type: string;
  comment: string | null;
  submitted_at: Date;
}

export interface EvidencePhotosTable {
  id: string;
  evidence_id: string;
  storage_path: string;
  display_order: number;
}

export interface EvidenceUploadSessionsTable {
  id: string;
  task_id: string;
  user_id: string;
  submission_type: string;
  started_at: Date;
  upload_expires_at: Date;
  status: string;
  completed_at: Date | null;
}

export interface TaskObjectionsTable {
  id: string;
  task_id: string;
  user_id: string;
  review_round: number;
  reason_type: string;
  reason_detail: string;
  created_at: Date;
  withdrawn_at: Date | null;
}

export interface PostsTable {
  id: string;
  task_id: string;
  user_id: string;
  post_type: string;
  created_at: Date;
}

export interface ReactionsTable {
  id: string;
  post_id: string;
  user_id: string;
  reaction_type: string;
  created_at: Date;
  updated_at: Date;
}

export interface NotificationsTable {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  related_task_id: string | null;
  read_at: Date | null;
  created_at: Date;
  deduplication_key: string;
}

export interface IdempotencyRequestsTable {
  id: string;
  user_id: string;
  operation: string;
  idempotency_key: string;
  request_hash: string;
  response_status: number | null;
  /** JSON 文字列。JSON 型は製品差が大きいため text で保持する */
  response_body: string | null;
  created_at: Date;
}

export interface UserReportsTable {
  id: string;
  reporter_id: string;
  target_user_id: string;
  reason_type: string;
  reason_detail: string;
  idempotency_key: string;
  created_at: Date;
}

export interface Database {
  auth_users: AuthUsersTable;
  auth_sessions: AuthSessionsTable;
  auth_accounts: AuthAccountsTable;
  auth_verifications: AuthVerificationsTable;
  user_reports: UserReportsTable;
  users: UsersTable;
  friendships: FriendshipsTable;
  friend_invites: FriendInvitesTable;
  tasks: TasksTable;
  task_evidences: TaskEvidencesTable;
  evidence_photos: EvidencePhotosTable;
  evidence_upload_sessions: EvidenceUploadSessionsTable;
  task_objections: TaskObjectionsTable;
  posts: PostsTable;
  reactions: ReactionsTable;
  notifications: NotificationsTable;
  idempotency_requests: IdempotencyRequestsTable;
}

export type Row<T> = Selectable<T>;
export type NewRow<T> = Insertable<T>;

export interface AuthUsersTable {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
  termsAccepted: boolean;
  termsAcceptedAt: Date;
  termsVersion: string;
  privacyVersion: string;
}

export interface AuthSessionsTable {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthAccountsTable {
  id: string;
  userId: string;
  accountId: string;
  providerId: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scope: string | null;
  password: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthVerificationsTable {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
