-- AlterTable : ajoute l'effort de réflexion optionnel au fournisseur IA
ALTER TABLE "AiProvider" ADD COLUMN "reasoningEffort" TEXT;
