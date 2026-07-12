#!/usr/bin/env bash
# One-time IAM provisioning for the pipeline-VM automation: two EC2
# instance roles (web VM, pipeline VM) plus a narrowly-scoped IAM user for
# the GitHub Actions safety-net workflow. Review every policy below before
# running — these grant real, standing AWS permissions. Requires the `aws`
# CLI authenticated (`aws sts get-caller-identity` should succeed) and
# provision-faiss-bucket.sh already run (this script reads that bucket's
# name).
#
# Re-running is safe — every create-* call here is guarded by an existence
# check, matching provision-ec2.sh's key-pair guard pattern.
set -euo pipefail

REGION="ap-south-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET_NAME="clairvision-faiss-${ACCOUNT_ID}"
BUCKET_ARN="arn:aws:s3:::${BUCKET_NAME}"
SSM_PARAM_NAME="/clairvision/pipeline-env"
SSM_PARAM_ARN="arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter${SSM_PARAM_NAME}"

WEB_ROLE_NAME="clairvision-web-role"
WEB_PROFILE_NAME="clairvision-web-profile"
PIPELINE_ROLE_NAME="clairvision-pipeline-role"
PIPELINE_PROFILE_NAME="clairvision-pipeline-profile"
SAFETY_NET_USER_NAME="clairvision-safety-net"

EC2_TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {"Effect": "Allow", "Principal": {"Service": "ec2.amazonaws.com"}, "Action": "sts:AssumeRole"}
  ]
}'

create_role_if_absent() {
  local role_name="$1" trust_policy="$2"
  if ! aws iam get-role --role-name "$role_name" >/dev/null 2>&1; then
    aws iam create-role --role-name "$role_name" \
      --assume-role-policy-document "$trust_policy" >/dev/null
    echo "Created role: $role_name"
  else
    echo "Role already exists: $role_name"
  fi
}

create_profile_if_absent() {
  local profile_name="$1" role_name="$2"
  if ! aws iam get-instance-profile --instance-profile-name "$profile_name" >/dev/null 2>&1; then
    aws iam create-instance-profile --instance-profile-name "$profile_name" >/dev/null
    aws iam add-role-to-instance-profile \
      --instance-profile-name "$profile_name" --role-name "$role_name" >/dev/null
    echo "Created instance profile: $profile_name (role: $role_name)"
  else
    echo "Instance profile already exists: $profile_name"
  fi
}

# ═══════════════════════════════════════════════════════════════════════
# clairvision-web-role — attached to the ALREADY-RUNNING web VM (live,
# no-reboot attach — see the associate-iam-instance-profile command this
# script prints at the end). Launches the pipeline VM and reads its
# published FAISS output.
# ═══════════════════════════════════════════════════════════════════════
create_role_if_absent "$WEB_ROLE_NAME" "$EC2_TRUST_POLICY"

# PassRole is scoped to the pipeline role's EXACT ARN, never "*" — an
# unscoped grant would let anything running on the web VM launch an
# instance with an arbitrary (e.g. admin) role and then reach it.
WEB_POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LaunchAndInspectPipelineVM",
      "Effect": "Allow",
      "Action": [
        "ec2:RunInstances", "ec2:DescribeInstances", "ec2:CreateTags",
        "ec2:DescribeImages"
      ],
      "Resource": "*",
      "Condition": {"StringEquals": {"aws:RequestedRegion": "${REGION}"}}
    },
    {
      "Sid": "PassPipelineRoleOnly",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::${ACCOUNT_ID}:role/${PIPELINE_ROLE_NAME}"
    },
    {
      "Sid": "ReadFaissIndexes",
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "${BUCKET_ARN}/*"
    },
    {
      "Sid": "SyncPipelineEnv",
      "Effect": "Allow",
      "Action": "ssm:PutParameter",
      "Resource": "${SSM_PARAM_ARN}"
    }
  ]
}
JSON
)
aws iam put-role-policy --role-name "$WEB_ROLE_NAME" \
  --policy-name "clairvision-web-policy" --policy-document "$WEB_POLICY"
create_profile_if_absent "$WEB_PROFILE_NAME" "$WEB_ROLE_NAME"

# ═══════════════════════════════════════════════════════════════════════
# clairvision-pipeline-role — attached to each on-demand pipeline VM at
# launch (via api/clairvision_api/services/pipeline_vm_service.py). Reads
# its own env from SSM, publishes its FAISS output to S3, terminates
# itself when idle.
# ═══════════════════════════════════════════════════════════════════════
create_role_if_absent "$PIPELINE_ROLE_NAME" "$EC2_TRUST_POLICY"

# ec2:TerminateInstances is condition-scoped to the Role=clairvision-pipeline
# tag — a compromised/buggy pipeline VM can only ever terminate instances
# tagged as itself, never the web VM or anything else in the account.
PIPELINE_POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublishFaissIndexes",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "${BUCKET_ARN}/*"
    },
    {
      "Sid": "SelfTerminateOnly",
      "Effect": "Allow",
      "Action": "ec2:TerminateInstances",
      "Resource": "*",
      "Condition": {"StringEquals": {"ec2:ResourceTag/Role": "clairvision-pipeline"}}
    },
    {
      "Sid": "ReadOwnEnvFromSSM",
      "Effect": "Allow",
      "Action": "ssm:GetParameter",
      "Resource": "${SSM_PARAM_ARN}"
    },
    {
      "Sid": "DecryptEnvSecureString",
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "*",
      "Condition": {"StringEquals": {"kms:ViaService": "ssm.${REGION}.amazonaws.com"}}
    }
  ]
}
JSON
)
aws iam put-role-policy --role-name "$PIPELINE_ROLE_NAME" \
  --policy-name "clairvision-pipeline-policy" --policy-document "$PIPELINE_POLICY"
create_profile_if_absent "$PIPELINE_PROFILE_NAME" "$PIPELINE_ROLE_NAME"

# ═══════════════════════════════════════════════════════════════════════
# clairvision-safety-net — an IAM USER (not role: GitHub Actions runners
# have no OIDC federation set up in this repo, matching the existing
# SSH-secrets convention) for the force-terminate cost-ceiling workflow.
# Same tag-scoped terminate condition as the pipeline role itself.
# ═══════════════════════════════════════════════════════════════════════
if ! aws iam get-user --user-name "$SAFETY_NET_USER_NAME" >/dev/null 2>&1; then
  aws iam create-user --user-name "$SAFETY_NET_USER_NAME" >/dev/null
  echo "Created user: $SAFETY_NET_USER_NAME"
else
  echo "User already exists: $SAFETY_NET_USER_NAME"
fi

SAFETY_NET_POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InspectPipelineInstances",
      "Effect": "Allow",
      "Action": "ec2:DescribeInstances",
      "Resource": "*"
    },
    {
      "Sid": "ForceTerminateStalePipelineVMs",
      "Effect": "Allow",
      "Action": "ec2:TerminateInstances",
      "Resource": "*",
      "Condition": {"StringEquals": {"ec2:ResourceTag/Role": "clairvision-pipeline"}}
    }
  ]
}
JSON
)
aws iam put-user-policy --user-name "$SAFETY_NET_USER_NAME" \
  --policy-name "clairvision-safety-net-policy" --policy-document "$SAFETY_NET_POLICY"

# Only create a new access key if this user doesn't already have one —
# access keys can't be idempotently re-fetched (the secret is shown once,
# at creation, only), so re-running this script must not silently
# invalidate a key already in use in GitHub Secrets.
EXISTING_KEYS=$(aws iam list-access-keys --user-name "$SAFETY_NET_USER_NAME" \
  --query 'length(AccessKeyMetadata)' --output text)
if [ "$EXISTING_KEYS" = "0" ]; then
  read -r ACCESS_KEY_ID SECRET_ACCESS_KEY <<< "$(aws iam create-access-key \
    --user-name "$SAFETY_NET_USER_NAME" \
    --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)"
  echo ""
  echo "Created access key for $SAFETY_NET_USER_NAME — shown ONCE, save it now:"
  echo "  -> AWS_SAFETY_NET_ACCESS_KEY_ID secret:     $ACCESS_KEY_ID"
  echo "  -> AWS_SAFETY_NET_SECRET_ACCESS_KEY secret: $SECRET_ACCESS_KEY"
else
  echo ""
  echo "$SAFETY_NET_USER_NAME already has an access key — not creating a"
  echo "second one. If you've lost the secret, delete the old key first"
  echo "(aws iam list-access-keys --user-name $SAFETY_NET_USER_NAME) then re-run."
fi

echo ""
echo "IAM setup done. Bucket: $BUCKET_NAME | SSM param: $SSM_PARAM_NAME"
echo ""
echo "Next steps:"
echo "  1. Run provision-pipeline-sg.sh (creates the pipeline security"
echo "     group + opens the web SG's 5432/6379 to it)."
echo "  2. Attach the web role to the EXISTING, already-running web VM"
echo "     (live, no-reboot — find its instance ID first):"
echo "       aws ec2 describe-instances --region $REGION \\"
echo "         --filters Name=tag:Name,Values=clairvision-web Name=instance-state-name,Values=running \\"
echo "         --query 'Reservations[0].Instances[0].InstanceId' --output text"
echo "       aws ec2 associate-iam-instance-profile --region $REGION \\"
echo "         --instance-id <INSTANCE-ID-FROM-ABOVE> \\"
echo "         --iam-instance-profile Name=$WEB_PROFILE_NAME"
echo "  -> PIPELINE_INSTANCE_PROFILE_NAME secret/env value: $PIPELINE_PROFILE_NAME"
