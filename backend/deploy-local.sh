#!/usr/bin/env bash
# Release the committed platform or integration build behind the existing Cloudflare origin.
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"
case "$(git branch --show-current)" in taufiq|dev|integration/*) ;; *) exit 1 ;; esac
git diff --quiet HEAD -- backend web
test -r "$HOME/.config/kira/env"
release_id="$(git rev-parse --short=12 HEAD)"
runtime_dir="$HOME/.local/share/kira-build"
release_dir="$runtime_dir/releases/$release_id"
unit_dir="$HOME/.config/systemd/user/kira.service.d"
mkdir -p "$runtime_dir/data" "$runtime_dir/backups" "$release_dir"
previous_override=""
if test -e "$unit_dir/taufiq.conf"; then
  previous_override="$runtime_dir/backups/taufiq-$(date +%Y%m%d-%H%M%S).conf"
  cp "$unit_dir/taufiq.conf" "$previous_override"
fi
git archive HEAD | tar -x -C "$release_dir"
uv sync --project "$release_dir/backend" --frozen
uv run --project "$release_dir/backend" pytest "$release_dir/backend/tests" -q
if test -f "$release_dir/web/package.json"; then
  npm --prefix "$release_dir/web" ci --no-audit --no-fund
  npm --prefix "$release_dir/web" test
  node --experimental-strip-types --test "$release_dir/web/src/kira/protocol.test.mjs"
  npm --prefix "$release_dir/web" run build
else
  npm --prefix "$release_dir/web/src/kira" ci --no-audit --no-fund
  npm --prefix "$release_dir/web/src/kira" run typecheck
  npm --prefix "$release_dir/web/src/kira" test
  npm --prefix "$release_dir/web/src/kira" run build
fi
mkdir -p "$unit_dir"
printf 'KIRA_DATABASE_URL=sqlite:///%s/data/kira.db\nKIRA_USER=Taufiq\n' "$runtime_dir" > "$runtime_dir/runtime.env"
chmod 600 "$runtime_dir/runtime.env"
cat > "$unit_dir/taufiq.conf" <<EOF
[Service]
WorkingDirectory=$release_dir/backend
EnvironmentFile=$runtime_dir/runtime.env
ExecStart=
ExecStart=$release_dir/backend/.venv/bin/uvicorn kira.api.app:app --host 127.0.0.1 --port 4174 --proxy-headers --forwarded-allow-ips=127.0.0.1
EOF
systemctl --user daemon-reload
systemctl --user restart kira.service || true
for attempt in {1..15}; do
  if curl -fsS http://127.0.0.1:4174/api/me >/dev/null; then
    printf 'KIRA release %s is running. Verify https://kira.madgun.us before finishing.\n' "$release_id"
    exit 0
  fi
  sleep 1
done
printf 'KIRA did not start. Check journalctl --user -u kira.service.\n' >&2
if test -n "$previous_override"; then
  cp "$previous_override" "$unit_dir/taufiq.conf"
else
  rm "$unit_dir/taufiq.conf"
fi
systemctl --user daemon-reload
systemctl --user restart kira.service
exit 1
