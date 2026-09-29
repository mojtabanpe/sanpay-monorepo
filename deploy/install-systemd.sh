#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo ./deploy/install-systemd.sh <deploy-user>" >&2
  exit 1
fi

readonly deploy_user="${1:?Usage: sudo ./deploy/install-systemd.sh <deploy-user>}"
readonly project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly service_file="/etc/systemd/system/sanpay-deploy.service"
readonly timer_file="/etc/systemd/system/sanpay-deploy.timer"

if ! id "${deploy_user}" >/dev/null 2>&1; then
  echo "User does not exist: ${deploy_user}" >&2
  exit 1
fi

sed \
  -e "s|@@DEPLOY_USER@@|${deploy_user}|g" \
  -e "s|@@PROJECT_ROOT@@|${project_root}|g" \
  "${project_root}/deploy/systemd/sanpay-deploy.service.in" >"${service_file}"
install -m 0644 "${project_root}/deploy/systemd/sanpay-deploy.timer" "${timer_file}"

systemctl daemon-reload
systemctl enable --now sanpay-deploy.timer
systemctl start sanpay-deploy.service

echo "Installed sanpay-deploy.timer for ${deploy_user} in ${project_root}"
systemctl --no-pager status sanpay-deploy.timer
