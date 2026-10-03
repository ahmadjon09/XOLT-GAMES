-- Speed up cross-provider linking against existing public-player email addresses.
CREATE INDEX "User_email_idx" ON "User"("email");
