#!/bin/bash
# Runs on every boot (memory-assistant.service). The public IP changes when
# the instance is stopped and started, so the HTTPS hostname is recomputed
# here each time; Caddy then fetches a certificate for the new name.
set -euo pipefail
cd /opt/memory-assistant

TOKEN="$(curl -fsS -X PUT http://169.254.169.254/latest/api/token \
  -H 'X-aws-ec2-metadata-token-ttl-seconds: 300')"
PUBLIC_IP="$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/public-ipv4)"

echo "SITE_ADDRESS=${PUBLIC_IP}.sslip.io" > .env.site
docker compose -f docker-compose.aws.yml up -d --build
echo "Memory Assistant: https://${PUBLIC_IP}.sslip.io"
