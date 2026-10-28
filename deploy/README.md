# Sanpay production deployment

The production server polls `origin/master` over its outbound connection. A new
revision is built locally and started with Docker Compose. No inbound SSH or
GitHub webhook is required.

## Server prerequisites

- Linux with systemd
- Git
- Docker Engine with the Compose plugin
- Outbound access to GitHub and container registries
- A dedicated unprivileged user that can run Docker

## First installation

Clone the repository into a dedicated deployment checkout, create
`.env.production` from `.env.production.example`, verify a manual deployment,
then install the timer:

```bash
ssh -T git@github.com
docker pull hello-world
cp .env.production.example .env.production
chmod 600 .env.production
./deploy/deploy.sh
sudo ./deploy/install-systemd.sh "$(whoami)"
```

For a private repository, add a read-only GitHub deploy key to the server before
cloning. Generate passwords as URL-safe hexadecimal values, for example with
`openssl rand -hex 32`, because the database password is also used in
`DATABASE_URL`.

## Operations

```bash
systemctl list-timers sanpay-deploy.timer
sudo systemctl status sanpay-deploy.service
sudo journalctl -u sanpay-deploy.service -n 200 --no-pager
sudo systemctl start sanpay-deploy.service
docker compose --env-file .env.production -f compose.production.yml ps
```

The current successful revision is stored in `.deploy/deployed-revision`.

## Database backup before deployment

Every deployment builds the images, then takes a PostgreSQL custom-format backup
before replacing any application container or running migrations. A failed,
empty, or unreadable backup stops deployment. The archive is checked in full
with `pg_restore` without connecting to a destination database or executing SQL.

Backups are stored on the deployment host in `.deploy/backups/`, with UTC time,
the target Git revision, and a unique suffix in each filename. The directory is
private (mode `700`), files are private (mode `600`), and deployment state and
backups are excluded from Git. Failed temporary files are removed; successful
backups are kept without automatic deletion. Monitor disk usage. Set the host
environment variable `SANPAY_BACKUP_DIR` to use a different backup directory.

The script uses the existing PostgreSQL container without recreating it. If it
is stopped, it is started first. If it does not exist, the PostgreSQL service
alone is started using its persistent volume. On a first installation, the
backup therefore contains the initial database before application migrations.

A standalone backup can also be created from the deployment checkout:

```bash
./deploy/backup-database.sh
```

These backups cover the application database only. They do not include database
roles, uploaded files, or an off-server copy, and they do not implement automatic
rollback. A failed deployment leaves the verified backup available for recovery.

Deployment checks (also run in CI) and the opt-in PostgreSQL restore test:

```bash
pnpm nx run api:test-deploy
pnpm nx run api:test-deploy-integration
```

The integration test creates its own temporary PostgreSQL container, restores
the archive into a separate test database, and removes only that container.

To create a dashboard super admin after deployment, run this command in an
interactive terminal from the deployment checkout:

```bash
docker compose --env-file .env.production -f compose.production.yml exec api pnpm admin:create-super
```

Enter the username and password when prompted. The password is hidden, and
the command creates only the super admin account; it does not run the sample
data seed. An existing username is left unchanged.

## Domains

The Compose `gateway` service is the only public HTTP entry point and routes by
hostname:

- `sanpayco.com` and `www.sanpayco.com` to the employee app
- `admin.sanpayco.com` to the admin dashboard
- `store.sanpayco.com` to the store panel

All names must have DNS records pointing to the server. By default the gateway
only listens on `127.0.0.1:8080`, so the host reverse proxy can terminate HTTPS
and forward all three hostnames to that single address. The original `Host`
header must be preserved so this gateway can select the correct application.

The gateway uses Docker's DNS resolver to refresh frontend service addresses.
Deployment validates and reloads the gateway configuration after replacing
containers. This prevents stale container addresses from routing a hostname to
the wrong frontend when Docker reuses an old IP address.

## Store location map

The dashboard requests visible map tiles from `/map-tiles/{z}/{x}/{y}.png` on
its own origin. The frontend Nginx container fetches them from the canonical
`https://tile.openstreetmap.org` endpoint, identifies Sanpay, and caches successful
responses according to upstream cache headers (seven days when unspecified).
The production server needs outbound HTTPS access to this host. No map API key
is required. Only numeric tile paths are proxied; this is not a general proxy.

If the map remains gray, inspect a `/map-tiles/` request in browser Network tools
and the dashboard container's Nginx logs. An upstream timeout means the server
also cannot reach OpenStreetMap. The map displays a retry control when image
requests fail. Local dashboard development uses the equivalent route in
`apps/dashboard/proxy.conf.json`.

## Testing one store settlement with Toman staging

Corporate settlement uses `TOMAN_*`, independently of the `TOMAN_IPG_*`
settings. To call the staging service, use `TOMAN_MODE=live`,
`TOMAN_API_URL=https://dbank-staging.qcluster.org/api/v1` and
`TOMAN_AUTH_URL=https://auth.qbitpay.org/oauth2/token/`, with the corporate
credentials issued by Toman. Keep `TOMAN_SETTLEMENTS_ENABLED=false` while
manually testing; this stops the scheduled run and scheduled polling.

In the dashboard's settlements page, select one active test store with an IBAN
and unsettled purchases. Open the preview, check the beneficiary, IBAN, purchase
count, total in toman and service URL, then confirm. The preview expires after
five minutes and must be refreshed if purchases, the account or configuration
change. The manual run includes only this store, with no hotel supplier
settlements. Repeated submission of the same approval reuses its batch.

Use **استعلام وضعیت** on that batch until the transfer reaches its final status.
Inquiry remains available when the scheduler is disabled and does not submit
another transfer. Only Toman's successful final transfer status marks purchases
settled. Inspect errors and the follow-up code; a pending transfer is not success.

Finish reconciling staging batches before replacing the configuration with
production credentials and URLs. Existing batches do not store their Toman
environment, so they must not be queried or retried against a different endpoint.
Use dedicated test purchases: a successful staging response also marks their
local settlement records successful. `TOMAN_MODE=mock` simulates transfers
without contacting Toman and does not validate staging connectivity.

Local regression tests use a local PostgreSQL database and a fake Toman client:

```bash
pnpm nx run api:test-settlements
pnpm nx run dashboard:test
```
