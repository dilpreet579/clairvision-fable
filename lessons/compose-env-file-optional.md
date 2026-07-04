# docker compose env_file must be optional or fresh clones break

> `env_file: .env` makes EVERY compose command (even `config`) fail with "env file not found" until the user copies .env.example — use the `required: false` long-form.

**Type**: correction (Phase 5)

**Why it mattered**: the failure hits before any service runs, so a fresh clone
can't even validate the compose file, and the error doesn't mention the fix
(`cp .env.example .env`). Setup instructions in the README don't help someone who
runs `docker compose config` first.

**How to apply**: new services in docker-compose.yml use

```yaml
env_file:
  - path: .env
    required: false
```

(the long-form syntax; supported by current Compose). Defaults in
`clairvision_shared.config.Settings` keep everything functional without a .env for
local-dev topologies.
