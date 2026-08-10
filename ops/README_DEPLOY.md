# Recoil Crew production deployment

The deployment workflow builds both clients from one Git commit. It deploys the
authoritative Node release first, verifies `/healthz`, and only then publishes
the matching GitHub Pages client. Deployments remain inert until the repository
variable `DEPLOY_ENABLED` is exactly `true`.

## Current production environment

The Lightsail infrastructure is already provisioned outside GitHub Actions:

- Region: AWS Lightsail Seoul
- Public application domain: `recoilcrew.pangyostonefist.org`
- SSH account: `deploy`
- Application root: `/opt/recoilcrew`
- Release root: `/opt/recoilcrew/releases`
- Active release link: `/opt/recoilcrew/current`
- Node.js: Node 24 LTS at `/usr/local/bin/node`
- Caddy: installed, running, and holding a valid certificate
- Reverse proxy target: `127.0.0.1:8080`
- Cloudflare: in front of the public domain
- Primary environment file: `/etc/recoilcrew.env`

The static server IP is intentionally not recorded in this repository. Store
the SSH destination only in the GitHub Secret `PROD_HOST`. The workflow only
builds and transfers application releases; it does not provision or modify AWS,
Lightsail, Cloudflare, DNS, certificates, or Caddy.

## Runtime layout

```text
/opt/recoilcrew/
  releases/
    <git-sha>/
      dist/
      dist-server/
      content/
      node_modules/
      package.json
      package-lock.json
      .release-env
  current -> releases/<git-sha>
```

Caddy owns public ports 80 and 443 and proxies the site and `/ws` to Node on
`127.0.0.1:8080`. The private frontend uses same-origin WebSocket resolution.
The GitHub Pages frontend receives the same authoritative endpoint through
`PROD_WS_URL` at build time.

## Server checks still required

The infrastructure exists, but verify these application deployment prerequisites
before enabling the workflow:

1. Confirm `deploy` owns `/opt/recoilcrew` and `/opt/recoilcrew/releases` and
   can create release directories there.
2. Confirm the CI SSH public key is present in
   `/home/deploy/.ssh/authorized_keys`. Keep its private key only in GitHub
   Secrets.
3. Verify `/etc/recoilcrew.env` contains the production runtime settings:

   ```dotenv
   NODE_ENV=production
   HOST=127.0.0.1
   PORT=8080
   STATIC_DIR=dist
   CONTENT_DIR=content
   GAME_MODE=mode.mainStage
   ALLOWED_ORIGINS=https://mwl313.github.io,https://recoilcrew.pangyostonefist.org
   ```

   A browser Origin never includes the GitHub Pages `/RecoilCrewDS/` path.
4. Copy `ops/recoilcrew.service` to
   `/etc/systemd/system/recoilcrew.service`, then run:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable recoilcrew
   ```

   The service may remain stopped until the first release creates `current`.
5. Permit the deployment account to restart only this service. Verify the
   `systemctl` path with `command -v systemctl`, then use
   `visudo -f /etc/sudoers.d/recoilcrew-deploy` to install:

   ```sudoers
   deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart recoilcrew
   ```

6. Confirm the existing Caddy configuration still proxies the production
   hostname to `127.0.0.1:8080`. No Caddy change is made by the workflow.

## GitHub repository configuration

In **Settings → Secrets and variables → Actions**, create these Variables:

| Variable | Required value | Purpose |
| --- | --- | --- |
| `DEPLOY_ENABLED` | `false` initially | Exact deployment gate |
| `PROD_USER` | `deploy` | SSH account |
| `PROD_WS_URL` | `wss://recoilcrew.pangyostonefist.org/ws` | GitHub Pages multiplayer endpoint |

Create these Secrets:

| Secret | Value |
| --- | --- |
| `PROD_HOST` | Production SSH hostname or static IPv4 address |
| `PROD_SSH_KEY` | Private key matching the deploy user's authorized key |
| `PROD_KNOWN_HOSTS` | Trusted `known_hosts` entry for `PROD_HOST` |

Generate `PROD_KNOWN_HOSTS` from a trusted network and verify its fingerprint
against the server. Store only the verified output; the workflow keeps strict
host verification enabled.

In **Settings → Pages**, select **GitHub Actions** as the publishing source.
Leave `DEPLOY_ENABLED=false` until the service, permissions, environment file,
Variables, and Secrets have all been verified.

## First deployment

1. Merge the deployment branch through the normal review process; do not merge
   it directly from an automation script.
2. Keep `DEPLOY_ENABLED=false` for the first post-merge build if credentials or
   server permissions still need checking.
3. Change `DEPLOY_ENABLED` to exactly `true` when ready.
4. Open **Actions → Deploy → Run workflow** on `main`.
5. Watch the production job complete before the Pages job begins.
6. Verify `https://recoilcrew.pangyostonefist.org/healthz` returns `ok: true`
   and the deployed SHA.
7. Verify both playable frontends:
   `https://recoilcrew.pangyostonefist.org/` and
   `https://mwl313.github.io/RecoilCrewDS/`.
8. In browser developer tools, confirm both frontends connect to
   `wss://recoilcrew.pangyostonefist.org/ws`, then test multiplayer between
   the two URLs.

Every later push or merge to `main` follows the same sequence automatically.
Set `DEPLOY_ENABLED=false` to stop both production and Pages publication while
still allowing validation and artifact builds.

## Release behavior and automatic rollback

`deploy-release.sh` extracts into a staging directory, installs production npm
dependencies there, and writes `.release-env` before changing `current`. It
then atomically changes the symlink, restarts the service, and polls the local
health endpoint. A failed health check restores the previous symlink, restarts
the prior release, reports whether rollback health succeeded, and exits
non-zero. Pages therefore stays on its previous version. The newest five
release directories are retained; the active directory is never pruned.

## Manual rollback

List releases and identify the full prior SHA:

```bash
ls -lt /opt/recoilcrew/releases
readlink -f /opt/recoilcrew/current
```

Switch the symlink atomically and restart (replace `<previous-sha>`):

```bash
sudo -u deploy ln -s "releases/<previous-sha>" /opt/recoilcrew/.current.rollback
sudo -u deploy mv -Tf /opt/recoilcrew/.current.rollback /opt/recoilcrew/current
sudo systemctl restart recoilcrew
curl --fail --silent http://127.0.0.1:8080/healthz
```

The reported `release` must equal `<previous-sha>`. Manual server rollback does
not roll back GitHub Pages; if the protocol changed, redeploy the matching old
commit through the workflow or temporarily disable public access until both
frontends match the server.

## Operational checks

```bash
sudo systemctl status recoilcrew
sudo journalctl -u recoilcrew -n 100 --no-pager
sudo systemctl status caddy
curl --fail http://127.0.0.1:8080/healthz
```
