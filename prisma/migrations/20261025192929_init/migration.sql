-- CreateEnum
CREATE TYPE "Network" AS ENUM ('demo', 'testnet', 'mainnet');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('owner', 'developer');

-- CreateEnum
CREATE TYPE "ApiKeyMode" AS ENUM ('test', 'live');

-- CreateEnum
CREATE TYPE "TrustLevel" AS ENUM ('simulated', 'verified_testnet', 'verified_mainnet');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('created', 'awaiting_payment', 'payment_detected', 'confirming', 'confirmed', 'expired', 'cancelled', 'failed', 'underpaid', 'overpaid', 'verification_required');

-- CreateEnum
CREATE TYPE "ShieldedPool" AS ENUM ('orchard', 'sapling', 'transparent');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'delivering', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultNetwork" "Network" NOT NULL DEFAULT 'demo',
    "testnetConfirmations" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_member" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_member_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "api_key" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "ApiKeyMode" NOT NULL,
    "secretHash" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_request" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "network" "Network" NOT NULL,
    "trustLevel" "TrustLevel" NOT NULL,
    "amountZatoshis" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZEC',
    "destination" TEXT NOT NULL,
    "description" TEXT,
    "externalReference" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "status" "PaymentStatus" NOT NULL,
    "paymentUri" TEXT,
    "qrPayload" TEXT NOT NULL,
    "confirmationsObserved" INTEGER,
    "confirmationsRequired" INTEGER,
    "amountReceivedZatoshis" BIGINT,
    "transactionId" TEXT,
    "diversifierIndex" DECIMAL(39,0),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payment_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_event" (
    "paymentRequestId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "evidence" TEXT NOT NULL,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_event_pkey" PRIMARY KEY ("paymentRequestId","seq")
);

-- CreateTable
CREATE TABLE "payment_observation" (
    "id" TEXT NOT NULL,
    "paymentRequestId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "network" "Network" NOT NULL,
    "txid" TEXT NOT NULL,
    "pool" "ShieldedPool" NOT NULL,
    "outputIndex" INTEGER NOT NULL,
    "valueZatoshis" BIGINT NOT NULL,
    "blockHeight" INTEGER,
    "blockHash" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invalidatedAt" TIMESTAMP(3),

    CONSTRAINT "payment_observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "viewing_key" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "network" "Network" NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "nextDiversifierIndex" DECIMAL(39,0) NOT NULL DEFAULT 0,
    "birthdayHeight" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "viewing_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_record" (
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "responseCode" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_record_pkey" PRIMARY KEY ("projectId","key")
);

-- CreateTable
CREATE TABLE "webhook_endpoint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "secretEncrypted" TEXT NOT NULL,
    "eventTypes" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_endpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_event" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "paymentRequestId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_delivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_attempt" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "statusCode" INTEGER,
    "error" TEXT,

    CONSTRAINT "webhook_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_bucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limit_bucket_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "project_member_userId_idx" ON "project_member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "api_key_secretHash_key" ON "api_key"("secretHash");

-- CreateIndex
CREATE INDEX "api_key_projectId_idx" ON "api_key"("projectId");

-- CreateIndex
CREATE INDEX "payment_request_projectId_createdAt_id_idx" ON "payment_request"("projectId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "payment_request_projectId_status_idx" ON "payment_request"("projectId", "status");

-- CreateIndex
CREATE INDEX "payment_request_projectId_externalReference_idx" ON "payment_request"("projectId", "externalReference");

-- CreateIndex
CREATE INDEX "payment_request_status_expiresAt_idx" ON "payment_request"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_request_projectId_network_diversifierIndex_key" ON "payment_request"("projectId", "network", "diversifierIndex");

-- CreateIndex
CREATE INDEX "payment_observation_paymentRequestId_idx" ON "payment_observation"("paymentRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_observation_network_txid_pool_outputIndex_key" ON "payment_observation"("network", "txid", "pool", "outputIndex");

-- CreateIndex
CREATE UNIQUE INDEX "viewing_key_projectId_network_key" ON "viewing_key"("projectId", "network");

-- CreateIndex
CREATE INDEX "idempotency_record_expiresAt_idx" ON "idempotency_record"("expiresAt");

-- CreateIndex
CREATE INDEX "webhook_endpoint_projectId_idx" ON "webhook_endpoint"("projectId");

-- CreateIndex
CREATE INDEX "webhook_event_projectId_createdAt_idx" ON "webhook_event"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "webhook_event_paymentRequestId_idx" ON "webhook_event"("paymentRequestId");

-- CreateIndex
CREATE INDEX "webhook_delivery_status_nextAttemptAt_idx" ON "webhook_delivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "webhook_delivery_projectId_createdAt_idx" ON "webhook_delivery"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_delivery_eventId_endpointId_key" ON "webhook_delivery"("eventId", "endpointId");

-- CreateIndex
CREATE INDEX "webhook_attempt_deliveryId_idx" ON "webhook_attempt"("deliveryId");

-- CreateIndex
CREATE INDEX "audit_event_projectId_createdAt_idx" ON "audit_event"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "rate_limit_bucket_windowStart_idx" ON "rate_limit_bucket"("windowStart");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_request" ADD CONSTRAINT "payment_request_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_event" ADD CONSTRAINT "payment_event_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "payment_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_observation" ADD CONSTRAINT "payment_observation_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "payment_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viewing_key" ADD CONSTRAINT "viewing_key_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "webhook_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "webhook_endpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_attempt" ADD CONSTRAINT "webhook_attempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "webhook_delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
