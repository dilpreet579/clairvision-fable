#!/usr/bin/env bash
# One-time EC2 provisioning for the ClairVision always-on host (db, redis,
# api, caddy — see production.yml). Review every value below before
# running — this creates real, billed AWS resources. Requires the `aws`
# CLI authenticated (`aws sts get-caller-identity` should succeed).
#
# Re-running this script is NOT idempotent for run-instances — it will
# launch a second instance. It's meant as a record of how the current
# instance was created, and a starting point if it's ever rebuilt.
set -euo pipefail

REGION="ap-south-1"                # Mumbai
KEY_NAME="clairvision-deploy"
INSTANCE_TYPE="t3.small"           # bumped from the free-tier t3.micro after
                                    # a real deploy (~2GB image pull/extract)
                                    # made the box unresponsive for 11 minutes,
                                    # and gallery thumbnail bursts OOM-killed
                                    # the api container — 913MB just wasn't
                                    # enough headroom alongside db/redis/caddy.

AMI_ID=$(aws ec2 describe-images --owners 099720109477 --region "$REGION" \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
            "Name=state,Values=available" \
  --query 'sort_by(Images,&CreationDate)[-1].ImageId' --output text)

echo "AMI: $AMI_ID"

# ── Key pair (only if you don't already have one) ──────────────────────
if ! aws ec2 describe-key-pairs --key-names "$KEY_NAME" --region "$REGION" >/dev/null 2>&1; then
  aws ec2 create-key-pair --key-name "$KEY_NAME" --region "$REGION" \
    --query 'KeyMaterial' --output text > "${KEY_NAME}.pem"
  chmod 400 "${KEY_NAME}.pem"
  echo "Saved ${KEY_NAME}.pem — this PEM's contents go into the EC2_SSH_KEY secret."
fi

# ── Security group: SSH, HTTP/HTTPS all from anywhere ───────────────────
# Only Caddy (80/443) is internet-facing for real traffic — api itself has
# no published port in production.yml, reached only via Caddy's reverse
# proxy over the compose network. SSH (22) is open to 0.0.0.0/0 rather
# than a single IP because deploy.yml's ssh-action connects from GitHub
# Actions' runner IPs, which aren't a small enough published range to
# allowlist narrowly (tried $MY_IP-only first; every deploy timed out).
# Security rests on key-only auth (password auth is off by default on
# this AMI), not on the source IP.
SG_ID=$(aws ec2 create-security-group \
  --group-name clairvision-web \
  --description "ClairVision always-on web host" \
  --region "$REGION" --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --region "$REGION" \
  --protocol tcp --port 22 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --region "$REGION" \
  --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --region "$REGION" \
  --protocol tcp --port 443 --cidr 0.0.0.0/0

# ── User data: Docker + Compose plugin, deploy directory ───────────────
cat > /tmp/clairvision-userdata.sh <<'EOF'
#!/bin/bash
set -e
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
usermod -aG docker ubuntu
mkdir -p /opt/clairvision
chown ubuntu:ubuntu /opt/clairvision
EOF

# ── Launch ───────────────────────────────────────────────────────────
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --security-group-ids "$SG_ID" \
  --user-data file:///tmp/clairvision-userdata.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=clairvision-web}]' \
  --metadata-options HttpTokens=required,HttpPutResponseHopLimit=2 \
  --region "$REGION" \
  --query 'Instances[0].InstanceId' --output text)
# Hop-limit 2, not the default 1: the api container is one network hop
# further from 169.254.169.254 than the host itself, and any boto3 call
# it makes (launching the pipeline VM, reading S3) needs to reach IMDS for
# the instance role's credentials. Discovered by a live timeout the first
# time this mattered — see pipeline_vm_service.py's matching comment.

echo "Launched $INSTANCE_ID — waiting for it to be running..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$REGION"

# Elastic IP: without one, the public IP is released on every stop (a
# resize like the t3.micro->t3.small bump above requires a stop) and a new
# random one is assigned on start, silently breaking DNS. Added after
# exactly that friction the first time an instance type change was needed.
ALLOC_ID=$(aws ec2 allocate-address --region "$REGION" --domain vpc \
  --query 'AllocationId' --output text)
aws ec2 associate-address --region "$REGION" --instance-id "$INSTANCE_ID" \
  --allocation-id "$ALLOC_ID" >/dev/null
PUBLIC_IP=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" --region "$REGION" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

echo ""
echo "Instance up: $PUBLIC_IP (Elastic IP, allocation $ALLOC_ID — stable"
echo "across future stops/resizes, no DNS update needed again)"
echo "  -> Point api.percepta.codes (A record) at this IP"
echo "  -> EC2_HOST secret:     $PUBLIC_IP"
echo "  -> EC2_SSH_USER secret: ubuntu"
echo "  -> EC2_SSH_KEY secret:  contents of ${KEY_NAME}.pem"
echo ""
echo "Give it ~30-60s for the user-data script to finish installing Docker"
echo "before the first deploy. Caddy needs the DNS record live and"
echo "propagated before it can get a Let's Encrypt cert on first boot."
