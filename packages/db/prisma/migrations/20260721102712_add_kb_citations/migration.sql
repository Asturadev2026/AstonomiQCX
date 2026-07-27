-- AlterTable
ALTER TABLE "kb_articles" ADD COLUMN     "cited_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "sources" TEXT[] DEFAULT ARRAY[]::TEXT[];
