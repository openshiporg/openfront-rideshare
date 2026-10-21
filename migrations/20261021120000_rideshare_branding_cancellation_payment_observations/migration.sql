-- AlterTable
ALTER TABLE "Fleet" ADD COLUMN     "logoColor" TEXT NOT NULL DEFAULT '0',
ADD COLUMN     "logoIcon" TEXT NOT NULL DEFAULT '<svg xmlns="http://www.w3.org/2000/svg" fill="none" height="100%" width="100%" viewBox="0 0 42 48"><path fill="#155eef" fill-rule="evenodd" d="m22.102 20.86 9.9-9.9L29.88 8.84l-7.339 7.339V3h-3v13.178l-7.339-7.34-2.121 2.122 9.9 9.9 1.06 1.06zm2.12 2.121 9.9-9.9 2.121 2.122-7.339 7.339H42v3H28.904l7.34 7.339L34.121 35l-9.9-9.899-1.06-1.06zM7.96 35.001l9.9-9.899 1.06-1.06-1.06-1.061-9.9-9.9-2.121 2.122 7.339 7.339H.002v3h13.176l-7.34 7.339zm12.02-7.777-9.9 9.9 2.122 2.12 7.339-7.338V45h3V31.906l7.339 7.338L32 37.124l-9.9-9.9-1.06-1.061z" clip-rule="evenodd"/></svg>';

-- CreateTable
CREATE TABLE "FleetBrandingChange" (
    "id" TEXT NOT NULL,
    "fleet" TEXT,
    "actor" TEXT,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "command" JSONB DEFAULT '{}',
    "result" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "FleetBrandingChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestCancellationCommand" (
    "id" TEXT NOT NULL,
    "request" TEXT,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "command" JSONB DEFAULT '{}',
    "result" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "RequestCancellationCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentObservation" (
    "id" TEXT NOT NULL,
    "payment" TEXT,
    "refund" TEXT,
    "observationKey" TEXT NOT NULL DEFAULT '',
    "details" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FleetBrandingChange_idempotencyKey_key" ON "FleetBrandingChange"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FleetBrandingChange_fleet_idx" ON "FleetBrandingChange"("fleet");

-- CreateIndex
CREATE INDEX "FleetBrandingChange_actor_idx" ON "FleetBrandingChange"("actor");

-- CreateIndex
CREATE INDEX "FleetBrandingChange_createdAt_idx" ON "FleetBrandingChange"("createdAt");

-- CreateIndex
CREATE INDEX "FleetBrandingChange_updatedAt_idx" ON "FleetBrandingChange"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RequestCancellationCommand_idempotencyKey_key" ON "RequestCancellationCommand"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RequestCancellationCommand_request_idx" ON "RequestCancellationCommand"("request");

-- CreateIndex
CREATE INDEX "RequestCancellationCommand_createdAt_idx" ON "RequestCancellationCommand"("createdAt");

-- CreateIndex
CREATE INDEX "RequestCancellationCommand_updatedAt_idx" ON "RequestCancellationCommand"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentObservation_observationKey_key" ON "PaymentObservation"("observationKey");

-- CreateIndex
CREATE INDEX "PaymentObservation_payment_idx" ON "PaymentObservation"("payment");

-- CreateIndex
CREATE INDEX "PaymentObservation_refund_idx" ON "PaymentObservation"("refund");

-- CreateIndex
CREATE INDEX "PaymentObservation_createdAt_idx" ON "PaymentObservation"("createdAt");

-- CreateIndex
CREATE INDEX "PaymentObservation_updatedAt_idx" ON "PaymentObservation"("updatedAt");

-- AddForeignKey
ALTER TABLE "FleetBrandingChange" ADD CONSTRAINT "FleetBrandingChange_fleet_fkey" FOREIGN KEY ("fleet") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetBrandingChange" ADD CONSTRAINT "FleetBrandingChange_actor_fkey" FOREIGN KEY ("actor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestCancellationCommand" ADD CONSTRAINT "RequestCancellationCommand_request_fkey" FOREIGN KEY ("request") REFERENCES "RideRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentObservation" ADD CONSTRAINT "PaymentObservation_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentObservation" ADD CONSTRAINT "PaymentObservation_refund_fkey" FOREIGN KEY ("refund") REFERENCES "Refund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

