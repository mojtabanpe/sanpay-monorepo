#!/usr/bin/env bash
set -Eeuo pipefail

readonly project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly deploy_branch="${DEPLOY_BRANCH:-master}"
readonly state_dir="${project_root}/.deploy"
readonly revision_file="${state_dir}/deployed-revision"
readonly lock_file="${state_dir}/deploy.lock"

mkdir -p "${state_dir}"
exec 9>"${lock_file}"
flock -n 9 || exit 0

cd "${project_root}"
git fetch --quiet origin "${deploy_branch}"

readonly remote_revision="$(git rev-parse FETCH_HEAD)"
deployed_revision=""
if [[ -f "${revision_file}" ]]; then
  deployed_revision="$(<"${revision_file}")"
fi

if [[ "${remote_revision}" == "${deployed_revision}" ]]; then
  exit 0
fi

echo "Deploying ${remote_revision} from origin/${deploy_branch}"
git reset --hard "${remote_revision}"
"${project_root}/deploy/deploy.sh"
printf '%s\n' "${remote_revision}" >"${revision_file}"
echo "Deployment completed: ${remote_revision}"
