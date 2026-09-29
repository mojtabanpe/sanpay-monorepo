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
