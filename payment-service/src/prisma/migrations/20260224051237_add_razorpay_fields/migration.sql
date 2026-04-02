/*
  Warnings:

  - A unique constraint covering the columns `[razorpayOrderId]` on the table `payment_history` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[razorpayPlanId]` on the table `plans` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[razorpaySubscriptionId]` on the table `subscriptions` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "payment_history" ADD COLUMN     "razorpayOrderId" TEXT,
ADD COLUMN     "razorpayPaymentId" TEXT;

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "razorpayPlanId" TEXT;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "razorpayCustomerId" TEXT,
ADD COLUMN     "razorpaySubscriptionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payment_history_razorpayOrderId_key" ON "payment_history"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "plans_razorpayPlanId_key" ON "plans"("razorpayPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_razorpaySubscriptionId_key" ON "subscriptions"("razorpaySubscriptionId");
