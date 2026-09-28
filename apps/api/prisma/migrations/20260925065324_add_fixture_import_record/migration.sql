-- CreateTable
CREATE TABLE "FixtureImportRecord" (
    "id" TEXT NOT NULL,
    "fixtureType" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "internalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixtureImportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FixtureImportRecord_fixtureType_fixtureId_key" ON "FixtureImportRecord"("fixtureType", "fixtureId");
