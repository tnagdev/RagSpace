-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "scheduledChangeAt" TIMESTAMP(3),
ADD COLUMN     "scheduledChangeType" TEXT,
ADD COLUMN     "scheduledPlanId" TEXT;
