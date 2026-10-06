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
