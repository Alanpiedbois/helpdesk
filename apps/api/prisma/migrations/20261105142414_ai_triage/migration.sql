-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "aiSuggestedPriority" "TicketPriority",
ADD COLUMN     "aiSummary" TEXT,
ADD COLUMN     "triagedAt" TIMESTAMP(3);
