-- AlterTable : réseaux préférés du profil (descriptions par réseau)
ALTER TABLE "UserProfile" ADD COLUMN "preferredNetworks" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable : descriptions par réseau sur chaque événement
ALTER TABLE "Event" ADD COLUMN "networkDescriptions" JSONB;
