-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authSubject" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_authSubject_key" ON "User"("authSubject");

