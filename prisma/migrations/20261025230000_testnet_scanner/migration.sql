-- AlterEnum
ALTER TYPE "ShieldedPool" ADD VALUE 'ironwood';

-- CreateTable
CREATE TABLE "chain_cursor" (
    "network" "Network" NOT NULL,
    "height" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "observedThrough" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "lockOwner" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chain_cursor_pkey" PRIMARY KEY ("network")
);

-- CreateTable
CREATE TABLE "chain_block" (
    "network" "Network" NOT NULL,
    "height" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "prevHash" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chain_block_pkey" PRIMARY KEY ("network","height")
);

