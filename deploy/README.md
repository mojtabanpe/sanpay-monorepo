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
