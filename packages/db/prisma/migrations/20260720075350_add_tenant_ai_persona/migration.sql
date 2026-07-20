-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "ai_persona_description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ai_persona_tone" TEXT NOT NULL DEFAULT 'friendly';
