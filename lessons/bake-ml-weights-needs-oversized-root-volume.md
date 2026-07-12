# Baking ML weights into a Docker image needs a bigger root EBS volume

> The on-demand pipeline VM's Ubuntu AMI defaults to an 8GB root volume —
> plenty for the always-on web VM, nowhere near enough once the pipeline
> image bakes in CLIP + ArcFace + NIMA weights. cloud-init and `docker pull`
> both wedged mid-extract with "no space left on device."

**Type**: correction

**Why it mattered**: this only shows up on a genuinely fresh instance —
local dev and CI never hit it, since neither downloads a multi-GB image
onto an 8GB disk. The failure mode was also confusing: cloud-init errors
about failed semaphore files and lock acquisition looked unrelated to disk
space until reading further down the log.

**How to apply**: whenever an EC2 instance will `docker pull` or build an
image with heavy baked-in dependencies (ML weights, large model files),
set an explicit `BlockDeviceMappings` root volume size at launch — don't
rely on the AMI's default. 40GB gp3 costs pennies for a short-lived
instance and the volume is deleted with it (`DeleteOnTermination: true`).
Size for the image's *extracted* footprint, not its compressed size on
GHCR.
