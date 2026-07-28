-- AlterTable : sources à privilégier pour la découverte d'événements
ALTER TABLE "UserProfile" ADD COLUMN "prioritySources" TEXT;
