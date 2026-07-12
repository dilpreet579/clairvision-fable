# IMDSv2's default hop-limit (1) breaks AWS SDK calls from inside a container

> The web VM's `api` container timed out on every boto3 call trying to launch
> the pipeline VM — not a permissions issue, a network one. EC2 instances
> default to `HttpPutResponseHopLimit=1`, which only reaches
> `169.254.169.254` from the host itself. A process inside a Docker
> container is one network hop further out (through the bridge/NAT), and
> the IMDSv2 token PUT never got a response before timing out.

**Type**: correction

**Why it mattered**: this was silent and looked like a permissions or
connectivity problem — the traceback was just a `TimeoutError` deep inside
`urllib3`, nothing pointing at "hop limit." Cost real debugging time before
recognizing the classic AWS+Docker gotcha. It would have broken *every*
boto3 call any containerized process made on either VM (the web VM's own
`ensure_pipeline_worker_running`, and the pipeline VM's `upload_face_index`
/ self-terminate) — not just one call site.

**How to apply**: any EC2 instance that runs AWS SDK calls from inside a
container (not a bare host process) needs
`--metadata-options HttpTokens=required,HttpPutResponseHopLimit=2` (or
higher) at launch time — `aws ec2 modify-instance-metadata-options` for an
already-running instance, no reboot needed. The default of 1 works fine for
host-level tooling and is invisible until something containerized tries to
use the instance role's credentials.
