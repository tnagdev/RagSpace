-- CreateTable
CREATE TABLE "pending_checkouts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "razorpaySubscriptionId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_checkouts_razorpaySubscriptionId_key" ON "pending_checkouts"("razorpaySubscriptionId");

-- CreateIndex
CREATE INDEX "pending_checkouts_userId_idx" ON "pending_checkouts"("userId");

-- CreateIndex
CREATE INDEX "pending_checkouts_expiresAt_idx" ON "pending_checkouts"("expiresAt");
