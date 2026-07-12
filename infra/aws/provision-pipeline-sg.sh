#!/usr/bin/env bash
# One-time security-group provisioning for the on-demand pipeline VM.
# Discovers the existing web VM's VPC/subnet (provision-ec2.sh never
# pinned one explicitly, relying on the default VPC) and creates a
# dedicated pipeline security group in the SAME VPC — security-group-
# referenced access only works within one VPC. Review before running.
# Requires the `aws` CLI authenticated and the web VM already running.
#
# Re-running is safe — security-group/rule creation calls are guarded by
# existence checks.
set -euo pipefail

REGION="ap-south-1"

WEB_INSTANCE_ID=$(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=tag:Name,Values=clairvision-web" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)

if [ "$WEB_INSTANCE_ID" = "None" ] || [ -z "$WEB_INSTANCE_ID" ]; then
  echo "Could not find a running instance tagged Name=clairvision-web in $REGION." >&2
  echo "Run this after the web VM (provision-ec2.sh) is up." >&2
  exit 1
fi

VPC_ID=$(aws ec2 describe-instances --instance-ids "$WEB_INSTANCE_ID" --region "$REGION" \
  --query 'Reservations[0].Instances[0].VpcId' --output text)
SUBNET_ID=$(aws ec2 describe-instances --instance-ids "$WEB_INSTANCE_ID" --region "$REGION" \
  --query 'Reservations[0].Instances[0].SubnetId' --output text)
WEB_SG_ID=$(aws ec2 describe-security-groups --region "$REGION" \
  --filters "Name=group-name,Values=clairvision-web" "Name=vpc-id,Values=${VPC_ID}" \
  --query 'SecurityGroups[0].GroupId' --output text)

echo "Web VM: $WEB_INSTANCE_ID | VPC: $VPC_ID | Subnet: $SUBNET_ID | Web SG: $WEB_SG_ID"

# ── Pipeline security group ─────────────────────────────────────────
# Only 22 (debug SSH) is inbound, matching the web SG's existing posture —
# short-lived instance bounds the exposure window. No inbound rule is
# needed the other direction: the pipeline VM only ever initiates
# connections (to Postgres/Redis on the web VM, to S3/SSM, to GHCR) —
# egress is allow-all by default on a new security group, nothing to add.
PIPELINE_SG_ID=$(aws ec2 describe-security-groups --region "$REGION" \
  --filters "Name=group-name,Values=clairvision-pipeline" "Name=vpc-id,Values=${VPC_ID}" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo "None")

if [ "$PIPELINE_SG_ID" = "None" ] || [ -z "$PIPELINE_SG_ID" ]; then
  PIPELINE_SG_ID=$(aws ec2 create-security-group \
    --group-name clairvision-pipeline \
    --description "ClairVision on-demand pipeline worker" \
    --vpc-id "$VPC_ID" --region "$REGION" --query 'GroupId' --output text)
  aws ec2 authorize-security-group-ingress --group-id "$PIPELINE_SG_ID" --region "$REGION" \
    --protocol tcp --port 22 --cidr 0.0.0.0/0
  echo "Created pipeline SG: $PIPELINE_SG_ID"
else
  echo "Pipeline SG already exists: $PIPELINE_SG_ID"
fi

# ── Open the web SG's Postgres/Redis to ONLY the pipeline SG ───────────
# Security-group-referenced (not IP-based) ingress: only instances that
# are themselves members of clairvision-pipeline can ever reach 5432/6379
# on the web VM, regardless of the port binding in production.yml.
for PORT in 5432 6379; do
  ALREADY_AUTHORIZED=$(aws ec2 describe-security-groups --group-ids "$WEB_SG_ID" --region "$REGION" \
    --query "SecurityGroups[0].IpPermissions[?FromPort==\`${PORT}\`].UserIdGroupPairs[?GroupId=='${PIPELINE_SG_ID}']" \
    --output text)
  if [ -z "$ALREADY_AUTHORIZED" ]; then
    aws ec2 authorize-security-group-ingress --group-id "$WEB_SG_ID" --region "$REGION" \
      --protocol tcp --port "$PORT" --source-group "$PIPELINE_SG_ID"
    echo "Authorized web SG port $PORT from pipeline SG"
  else
    echo "Web SG port $PORT already authorized from pipeline SG"
  fi
done

echo ""
echo "Pipeline SG ready."
echo "  -> PIPELINE_SECURITY_GROUP_ID secret/env value: $PIPELINE_SG_ID"
echo "  -> PIPELINE_SUBNET_ID secret/env value:          $SUBNET_ID"
echo ""
echo "Only now is it safe to deploy the production.yml db/redis port"
echo "change (via the normal deploy.yml push) — the security group is"
echo "what actually restricts access, not the port binding itself."
