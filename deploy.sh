#!/usr/bin/env bash
#
# One-command deploy for the Random Lunch stack (FastAPI + React/Nginx + MySQL).
# Run from the project root on the target server, e.g. /opt/random-lunch.
#
#   chmod +x deploy.sh && ./deploy.sh
#
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Checking prerequisites"
command -v docker >/dev/null 2>&1 || { echo "ERROR: docker is not installed."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "ERROR: docker compose plugin is not installed."; exit 1; }

# Host-side data dirs. These are NOT in Git; they hold the real database, uploaded
# images, and the first-run SQL dump. `git pull` never touches them.
echo "==> Ensuring host data directories exist"
mkdir -p data/mysql data/uploads data/db-init

# The SQL dump is only consumed on the very first start (when data/mysql is empty).
# If the DB has never been initialized AND no dump is present, warn loudly.
DB_INITIALIZED=false
[ -d data/mysql ] && [ -n "$(ls -A data/mysql 2>/dev/null)" ] && DB_INITIALIZED=true
DUMP_PRESENT=false
ls data/db-init/*.sql >/dev/null 2>&1 && DUMP_PRESENT=true

if [ "$DB_INITIALIZED" = false ] && [ "$DUMP_PRESENT" = false ]; then
  echo
  echo "  !! No database yet and no SQL dump found in ./data/db-init/"
  echo "     The stack will start with an EMPTY database (backend auto-creates tables,"
  echo "     but your existing rows and image records will be missing)."
  echo
  echo "     To restore your data, upload your dump first, e.g. from your PC:"
  echo "       scp db_backups\\random_lunch_20260611_234528.sql \\"
  echo "           root@121.40.198.70:/opt/random-lunch/data/db-init/01_restore.sql"
  echo "     then re-run ./deploy.sh"
  echo
  read -r -p "  Continue with an empty database anyway? [y/N] " ans
  case "$ans" in
    y|Y) echo "  Continuing with empty database." ;;
    *)   echo "  Aborted. Upload the dump and re-run."; exit 1 ;;
  esac
elif [ "$DB_INITIALIZED" = true ]; then
  echo "==> Existing database detected in ./data/mysql (dump is ignored on later runs)"
elif [ "$DUMP_PRESENT" = true ]; then
  echo "==> First run: SQL dump in ./data/db-init/ will auto-import on MySQL startup"
fi

# Create .env from the template on first run and generate real secrets.
if [ ! -f .env ]; then
  echo "==> .env not found, generating one from .env.example"
  cp .env.example .env
  if command -v openssl >/dev/null 2>&1; then
    AUTH_SECRET="$(openssl rand -hex 32)"
    MYSQL_PW="$(openssl rand -hex 16)"
    sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=${AUTH_SECRET}|" .env
    sed -i "s|^MYSQL_ROOT_PASSWORD=.*|MYSQL_ROOT_PASSWORD=${MYSQL_PW}|" .env
    echo "    Generated random AUTH_SECRET and MYSQL_ROOT_PASSWORD into .env"
  else
    echo "    WARNING: openssl not found. Edit .env and set real secrets before continuing."
    read -r -p "    Press Enter once .env is ready..." _
  fi
fi

echo "==> Building and starting containers"
docker compose up -d --build

echo "==> Waiting for services to become healthy"
sleep 5
docker compose ps

echo
echo "==> Done. Quick checks:"
echo "    curl http://127.0.0.1/api/health"
echo "    open http://121.40.198.70"
