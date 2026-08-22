-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "token_lookup" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_lookup_key" ON "refresh_tokens"("token_lookup");

