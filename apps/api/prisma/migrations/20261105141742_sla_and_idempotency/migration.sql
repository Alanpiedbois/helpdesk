-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "firstResponseAt" TIMESTAMP(3),
ADD COLUMN     "slaBreachedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProcessedEvent" (
    "eventId" TEXT NOT NULL,
    "consumer" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedEvent_pkey" PRIMARY KEY ("eventId","consumer")
);
