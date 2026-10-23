#!/usr/bin/env bash
set -euo pipefail
if [ -f .env ]; then
  echo '.env da ton tai; khong ghi de mat khau cu.'
  exit 0
fi
python3 - <<'PY'
from pathlib import Path
import secrets
p=Path('.env.example').read_text(encoding='utf-8')
for key in ['POSTGRES_PASSWORD','APP_DB_PASSWORD','MONITOR_DB_PASSWORD','PGADMIN_PASSWORD','GRAFANA_PASSWORD','APP_PASSWORD']:
    marker=f'{key}=CHANGEME_'
    lines=p.splitlines()
    for i, line in enumerate(lines):
        if line.startswith(marker):
            lines[i]=f'{key}={secrets.token_urlsafe(28)}'
    p='\n'.join(lines)+'\n'
Path('.env').write_text(p,encoding='utf-8')
PY
chmod 600 .env
echo 'Da tao .env va mat khau manh. Khong commit .env len GitHub.'
