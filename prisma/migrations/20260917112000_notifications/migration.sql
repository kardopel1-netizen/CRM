-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "inquiryId" TEXT,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'STUB',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "toAddress" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "error" TEXT,
    "providerRef" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Notification_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_patientId_createdAt_idx" ON "Notification"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_appointmentId_idx" ON "Notification"("appointmentId");
