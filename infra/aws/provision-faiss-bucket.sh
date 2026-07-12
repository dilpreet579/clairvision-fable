#!/usr/bin/env bash
# One-time S3 bucket provisioning for the pipeline-VM FAISS index handoff
# (see production.yml / the pipeline-VM automation in
# api/clairvision_api/services/pipeline_vm_service.py). Review before
# running — creates a real, billed (trivial cost) AWS resource. Requires
# the `aws` CLI authenticated (`aws sts get-caller-identity` should
# succeed).
#
# Re-running this script is safe — every step here is idempotent (bucket
# creation/config calls no-op or fail harmlessly if already applied), unlike
# provision-ec2.sh's run-instances step.
set -euo pipefail

REGION="ap-south-1"                # Mumbai — matches provision-ec2.sh
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET_NAME="clairvision-faiss-${ACCOUNT_ID}"

# ── Bucket ───────────────────────────────────────────────────────────
# FAISS indexes here are explicitly a derived, rebuildable accelerator
# (pgvector is the source of truth — see faiss_index/builder.py's own
# comment) — no versioning, no lifecycle expiry. A TTL-based expiry could
# silently break search for an event nobody remembered to touch; cleanup
# is instead explicit, via delete_face_index() on event/index deletion.
if ! aws s3api head-bucket --bucket "$BUCKET_NAME" --region "$REGION" 2>/dev/null; then
  aws s3api create-bucket \
    --bucket "$BUCKET_NAME" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION"
  echo "Created bucket: $BUCKET_NAME"
else
  echo "Bucket already exists: $BUCKET_NAME"
fi

# ── Block all public access ─────────────────────────────────────────
aws s3api put-public-access-block --bucket "$BUCKET_NAME" --region "$REGION" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# ── Default SSE-S3 encryption ───────────────────────────────────────
aws s3api put-bucket-encryption --bucket "$BUCKET_NAME" --region "$REGION" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

echo ""
echo "Bucket ready: $BUCKET_NAME"
echo "  -> S3_FAISS_BUCKET secret/env value: $BUCKET_NAME"
echo ""
echo "Next: run provision-iam.sh (references this bucket's ARN in the"
echo "web/pipeline role policies)."
