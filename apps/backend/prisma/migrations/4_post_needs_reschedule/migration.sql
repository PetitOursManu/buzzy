-- AlterTable : publication dont l'événement lié est daté hors de la plage du
-- calendrier, en attente d'une date attribuée manuellement.
ALTER TABLE "Post" ADD COLUMN "needsReschedule" BOOLEAN NOT NULL DEFAULT false;
