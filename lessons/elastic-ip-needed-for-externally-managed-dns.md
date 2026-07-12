# No Elastic IP + externally-managed DNS = any instance stop breaks the domain

> Resizing an EC2 instance type requires stopping it first. Without an
> Elastic IP, stopping releases the public IP and a new random one gets
> assigned on start — silently breaking `api.percepta.codes` until the DNS
> record is updated. Made worse here because DNS is at name.com, not
> Route53, so nothing AWS-side can fix it automatically.

**Type**: correction

**Why it mattered**: this wasn't hit until the very first time an instance
type change was actually needed (the t3.micro → t3.small resize), months
after the original provisioning — a gap that's completely invisible until
that specific operation is needed, unlike most infra mistakes which surface
immediately.

**How to apply**: any EC2 instance that's the target of a DNS A record
(especially with DNS hosted outside AWS) should get an Elastic IP at
provisioning time, not retrofitted later under pressure. The one-time DNS
update to point at the EIP is cheap; every future stop/resize/reboot then
never touches DNS again. `infra/aws/provision-ec2.sh` now does this by
default.
