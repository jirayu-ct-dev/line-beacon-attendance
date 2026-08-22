-- Audit rows for student self-service actions (LINE link/unlink from LIFF) have
-- no dashboard user actor, but spec §56 requires LINE_ACCOUNT_LINKED and
-- LINE_ACCOUNT_UNLINKED audit entries. Allow NULL user_id for those actors.
ALTER TABLE "audit_logs" ALTER COLUMN "user_id" DROP NOT NULL;
