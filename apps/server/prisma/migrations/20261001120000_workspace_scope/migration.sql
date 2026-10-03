ALTER TABLE "conversations" ADD COLUMN "workspace_root" TEXT;
DROP INDEX "conversations_last_activity_at_id_idx";
CREATE INDEX "conversations_workspace_root_last_activity_at_id_idx" ON "conversations"("workspace_root", "last_activity_at", "id");
