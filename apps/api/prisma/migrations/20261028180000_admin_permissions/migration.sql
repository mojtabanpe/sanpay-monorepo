ALTER TABLE "Admin" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Preserve existing managers' access while allowing explicit restrictions.
UPDATE "Admin" SET "permissions" = ARRAY['overview:read','companies:read','companies:write','employees:read','employees:write','wallets:read','wallets:write','stores:read','stores:write','payments:read','gateway-payments:read','upg-review:read','upg-review:write','gateways:read','settlements:read','settlements:write','bookings:read','flight-bookings:read','tourism-split:read']::TEXT[] WHERE "role" = 'ADMIN';
