"""On-demand launch of the pipeline worker's EC2 instance.

There is no poller — the always-on API is the only process running when a
new event needs processing, so it triggers the pipeline VM directly, right
after enqueueing the orchestration task that VM will pick up.

Credentials never go into UserData: UserData is a persistent, inspectable
instance attribute (readable via DescribeInstanceAttribute, often
cached/logged), not a secret store. Instead this module `put_parameter`s
the pipeline container's entire env file to a fixed SSM parameter
(`/clairvision/pipeline-env`, SecureString) built fresh from the API's own
settings, and the pipeline VM's user-data fetches it at boot using its own
IAM role — the only credential-bearing artifact on disk lives on the
short-lived, self-terminating pipeline VM itself, never persisted in any
instance metadata field.
"""
import logging
from urllib.parse import urlsplit, urlunsplit

import boto3
import requests

from clairvision_shared.config import Settings, get_settings

logger = logging.getLogger(__name__)

_ROLE_TAG_VALUE = "clairvision-pipeline"
_SSM_PARAMETER_NAME = "/clairvision/pipeline-env"

_IMDS_TOKEN_URL = "http://169.254.169.254/latest/api/token"
_IMDS_PRIVATE_IP_URL = "http://169.254.169.254/latest/meta-data/local-ipv4"
_IMDS_TOKEN_TTL_SECONDS = "21600"

_UBUNTU_JAMMY_OWNER = "099720109477"
_UBUNTU_JAMMY_NAME_FILTER = "ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"


def ensure_pipeline_worker_running() -> None:
    """Launches the pipeline EC2 worker if none is already pending/running.

    Runs as a FastAPI `BackgroundTask` after event creation, so it must
    never raise or slow down the response — the whole body is wrapped in
    a catch-all that logs and returns on any failure (boto3 error, IMDS
    error, whatever)."""
    try:
        settings = get_settings()
        ec2 = boto3.client("ec2", region_name=settings.aws_region)

        existing = ec2.describe_instances(
            Filters=[
                {"Name": "tag:Role", "Values": [_ROLE_TAG_VALUE]},
                {"Name": "instance-state-name", "Values": ["pending", "running"]},
            ]
        )
        running_ids = [
            instance["InstanceId"]
            for reservation in existing.get("Reservations", [])
            for instance in reservation.get("Instances", [])
        ]
        if running_ids:
            logger.info(
                "pipeline worker already pending/running (%s) — not launching another",
                ", ".join(running_ids),
            )
            return

        _sync_pipeline_env_to_ssm()

        ami_id = _resolve_ubuntu_ami(ec2)
        response = ec2.run_instances(
            ImageId=ami_id,
            InstanceType=settings.pipeline_instance_type,
            KeyName=settings.pipeline_key_name,
            SecurityGroupIds=[settings.pipeline_security_group_id],
            SubnetId=settings.pipeline_subnet_id,
            IamInstanceProfile={"Name": settings.pipeline_instance_profile_name},
            MinCount=1,
            MaxCount=1,
            UserData=_build_user_data(settings),
            # Default hop-limit (1) only reaches IMDS from the host itself —
            # every boto3 call this instance makes (S3 upload, self-terminate)
            # happens inside standalone-entrypoint.sh's Docker container, one
            # network hop further out, and would otherwise time out trying to
            # fetch the instance role's credentials. Learned the hard way on
            # the web VM's own api container.
            MetadataOptions={"HttpTokens": "required", "HttpPutResponseHopLimit": 2},
            # The Ubuntu jammy AMI's default root volume is 8GB — plenty for
            # the web VM, nowhere near enough for the pipeline image (CLIP +
            # ArcFace + NIMA weights baked in, several GB once extracted).
            # Learned live: cloud-init and the docker pull both wedged
            # mid-extract with "no space left on device". gp3 costs pennies
            # for the VM's short lifetime and the volume is deleted with it.
            BlockDeviceMappings=[
                {
                    "DeviceName": "/dev/sda1",
                    "Ebs": {
                        "VolumeSize": 40,
                        "VolumeType": "gp3",
                        "DeleteOnTermination": True,
                    },
                }
            ],
            TagSpecifications=[
                {
                    "ResourceType": "instance",
                    "Tags": [
                        {"Key": "Name", "Value": "clairvision-pipeline"},
                        {"Key": "Role", "Value": _ROLE_TAG_VALUE},
                    ],
                }
            ],
        )
        instance_id = response["Instances"][0]["InstanceId"]
        logger.info("launched pipeline worker instance %s", instance_id)
    except Exception:
        logger.exception(
            "ensure_pipeline_worker_running failed — event creation proceeds "
            "without a freshly-launched worker"
        )


def _sync_pipeline_env_to_ssm() -> None:
    """Builds the pipeline container's env-file content from this API's own
    `get_settings()` (already populated from `PROD_ENV_FILE`) and
    idempotently overwrites the fixed SSM parameter the pipeline VM's
    user-data reads at boot. Always in sync with current prod config — no
    manual sync step, no staleness across e.g. a DB password rotation.

    Postgres/Redis/Celery hostnames are rewritten from their local
    Docker-Compose hostnames (`db`, `redis`) to this web VM's own private
    IP, since the pipeline VM reaches them over the private network, not
    Compose's internal DNS."""
    settings = get_settings()
    own_ip = _own_private_ip()

    env_lines = [
        f"POSTGRES_HOST={own_ip}",
        f"POSTGRES_PORT={settings.postgres_port}",
        f"POSTGRES_DB={settings.postgres_db}",
        f"POSTGRES_USER={settings.postgres_user}",
        f"POSTGRES_PASSWORD={settings.postgres_password}",
        f"REDIS_URL={_with_host(settings.redis_url, own_ip)}",
        f"CELERY_BROKER_URL={_with_host(settings.celery_broker_url, own_ip)}",
        f"CELERY_RESULT_BACKEND={_with_host(settings.celery_result_backend, own_ip)}",
        f"CLIP_MODEL={settings.clip_model}",
        f"ARCFACE_MODEL={settings.arcface_model}",
        f"NIMA_WEIGHTS_PATH={settings.nima_weights_path}",
        f"BLUR_LAPLACIAN_THRESHOLD={settings.blur_laplacian_threshold}",
        f"BLUR_NIMA_THRESHOLD={settings.blur_nima_threshold}",
        f"DUPLICATE_SIMILARITY_THRESHOLD={settings.duplicate_similarity_threshold}",
        f"DUPLICATE_BEST_FRAME_NIMA_WEIGHT={settings.duplicate_best_frame_nima_weight}",
        f"DUPLICATE_BEST_FRAME_LAPLACIAN_WEIGHT={settings.duplicate_best_frame_laplacian_weight}",
        f"DUPLICATE_FACE_CONFIDENCE_BONUS={settings.duplicate_face_confidence_bonus}",
        f"DUPLICATE_FACE_BONUS_CONFIDENCE_FLOOR={settings.duplicate_face_bonus_confidence_floor}",
        f"FACE_MIN_SIZE={settings.face_min_size}",
        f"MTCNN_THRESHOLDS={settings.mtcnn_thresholds}",
        f"MTCNN_KEEP_ALL={settings.mtcnn_keep_all}",
        f"FACE_MIN_CONFIDENCE={settings.face_min_confidence}",
        f"FACE_MAX_ASPECT_RATIO={settings.face_max_aspect_ratio}",
        f"FAISS_NLIST={settings.faiss_nlist}",
        f"FAISS_NPROBE={settings.faiss_nprobe}",
        f"FAISS_INDEX_PATH={settings.faiss_index_path}",
        f"AWS_REGION={settings.aws_region}",
        f"S3_FAISS_BUCKET={settings.s3_faiss_bucket}",
        f"PIPELINE_IDLE_GRACE_SECONDS={settings.pipeline_idle_grace_seconds}",
        f"PIPELINE_IDLE_POLL_SECONDS={settings.pipeline_idle_poll_seconds}",
    ]
    content = "\n".join(env_lines) + "\n"

    ssm = boto3.client("ssm", region_name=settings.aws_region)
    ssm.put_parameter(
        Name=_SSM_PARAMETER_NAME,
        Value=content,
        Type="SecureString",
        Overwrite=True,
    )
    logger.info("synced pipeline env to SSM parameter %s", _SSM_PARAMETER_NAME)


def _with_host(url: str, host: str) -> str:
    """Swaps the hostname of a `redis://` URL for `host`, leaving
    scheme/credentials/port/db-index untouched.

    Redis AUTH URLs are password-only (`redis://:pw@host`) — an empty
    username. Gating on `parts.username` alone silently dropped the
    password on rewrite, so the pipeline VM booted with a credential-less
    broker URL and every task hung on NOAUTH. Preserve creds whenever a
    username OR password is present."""
    parts = urlsplit(url)
    netloc = host if not parts.port else f"{host}:{parts.port}"
    if parts.username or parts.password:
        user = parts.username or ""
        creds = f"{user}:{parts.password}" if parts.password else user
        netloc = f"{creds}@{netloc}"
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


def _own_private_ip() -> str:
    """This process (the API) runs on the web VM itself — IMDSv2 lookup of
    its own private IP, which is what the pipeline VM should target for
    Postgres/Redis (security-group-scoped, same-VPC access) instead of a
    hardcoded, driftable setting."""
    token_resp = requests.put(
        _IMDS_TOKEN_URL,
        headers={"X-aws-ec2-metadata-token-ttl-seconds": _IMDS_TOKEN_TTL_SECONDS},
        timeout=5,
    )
    token_resp.raise_for_status()
    token = token_resp.text

    ip_resp = requests.get(
        _IMDS_PRIVATE_IP_URL,
        headers={"X-aws-ec2-metadata-token": token},
        timeout=5,
    )
    ip_resp.raise_for_status()
    return ip_resp.text.strip()


def _resolve_ubuntu_ami(ec2_client) -> str:
    """Dynamic Ubuntu jammy AMI lookup done fresh on every call (mirrors
    `infra/aws/provision-ec2.sh`'s AWS-CLI lookup, via boto3 instead) rather
    than caching an AMI id in a setting that would silently go stale."""
    images = ec2_client.describe_images(
        Owners=[_UBUNTU_JAMMY_OWNER],
        Filters=[
            {"Name": "name", "Values": [_UBUNTU_JAMMY_NAME_FILTER]},
            {"Name": "state", "Values": ["available"]},
        ],
    )["Images"]
    newest = sorted(images, key=lambda image: image["CreationDate"])[-1]
    return newest["ImageId"]


def _build_user_data(settings: Settings) -> str:
    """Bash user-data: installs Docker CE + the AWS CLI (same apt-get
    sequence as `provision-ec2.sh`'s user-data, copied verbatim — it's
    already tested), fetches the pipeline env file from SSM at boot (never
    embedded in this script), then runs the pipeline container."""
    return rf"""#!/bin/bash
set -e
apt-get update
apt-get install -y ca-certificates curl gnupg unzip
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
usermod -aG docker ubuntu

if ! command -v aws >/dev/null 2>&1; then
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
  unzip -q /tmp/awscliv2.zip -d /tmp
  /tmp/aws/install
fi

aws ssm get-parameter --name {_SSM_PARAMETER_NAME} --with-decryption \
  --region {settings.aws_region} --query Parameter.Value --output text \
  > /opt/clairvision-pipeline.env

docker run -d --name clairvision-pipeline --env-file /opt/clairvision-pipeline.env \
  {settings.pipeline_ghcr_image} /app/standalone-entrypoint.sh
"""
