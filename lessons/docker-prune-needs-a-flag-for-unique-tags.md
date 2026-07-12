# `docker image prune -f` never reclaims uniquely-tagged deploy images

> Every deploy tags the API image with the commit's short SHA (plus
> `:latest`), so previous deploys' images are never "dangling" — plain
> `docker image prune -f` only removes untagged/dangling images and left
> ~2GB per old deploy sitting on disk. The web VM's 7.6GB root volume hit
> 97% used after a handful of deploys and a subsequent deploy failed
> mid-pull with "no space left on device."

**Type**: correction

**Why it mattered**: this is exactly the kind of slow leak that doesn't
show up until several deploys in, at which point it looks like an
unrelated pull/extract failure rather than an accumulation problem —
`docker system df` and `docker images` were what actually revealed three
old, unused, fully-tagged `api` images eating the disk.

**How to apply**: if a deploy pipeline tags each build uniquely (for
rollback/debugging), use `docker image prune -af` — `-a` removes every
image not referenced by a running container, tagged or not — not just
`-f`. Reserve plain `-f` only for a deploy strategy that always reuses the
same tag.
