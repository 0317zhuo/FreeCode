-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('system', 'user', 'assistant');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('running', 'completed', 'failed', 'cancelled', 'interrupted');

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "title" TEXT,
    "next_message_seq" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversation_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" "MessageRole" NOT NULL,
    "parts" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_runs" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "request_id" TEXT NOT NULL,
    "input_message_id" TEXT NOT NULL,
    "output_message_id" TEXT,
    "status" "GenerationStatus" NOT NULL DEFAULT 'running',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "finish_reason" TEXT,
    "error" JSONB,
    "usage" JSONB,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeat_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),

    CONSTRAINT "generation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_last_activity_at_id_idx" ON "conversations"("last_activity_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_seq_key" ON "messages"("conversation_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_id_key" ON "messages"("conversation_id", "id");

-- CreateIndex
CREATE INDEX "generation_runs_conversation_id_input_message_id_idx" ON "generation_runs"("conversation_id", "input_message_id");

-- CreateIndex
CREATE INDEX "generation_runs_conversation_id_started_at_idx" ON "generation_runs"("conversation_id", "started_at");

-- CreateIndex
CREATE INDEX "generation_runs_status_heartbeat_at_idx" ON "generation_runs"("status", "heartbeat_at");

-- CreateIndex
CREATE UNIQUE INDEX "generation_runs_conversation_id_request_id_key" ON "generation_runs"("conversation_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "generation_runs_conversation_id_output_message_id_key" ON "generation_runs"("conversation_id", "output_message_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_conversation_id_input_message_id_fkey" FOREIGN KEY ("conversation_id", "input_message_id") REFERENCES "messages"("conversation_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_conversation_id_output_message_id_fkey" FOREIGN KEY ("conversation_id", "output_message_id") REFERENCES "messages"("conversation_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Prisma schema 无法表达的业务约束，后续迁移必须保留。
CREATE UNIQUE INDEX "generation_runs_one_running_per_conversation"
ON "generation_runs"("conversation_id") WHERE "status" = 'running';
ALTER TABLE "messages" ADD CONSTRAINT "messages_positive_seq" CHECK ("seq" > 0);
ALTER TABLE "messages" ADD CONSTRAINT "messages_parts_array" CHECK (jsonb_typeof("parts") = 'array');
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_terminal_time"
CHECK (("status" = 'running' AND "ended_at" IS NULL) OR ("status" <> 'running' AND "ended_at" IS NOT NULL));
