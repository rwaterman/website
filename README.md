# website

Source for [rickwaterman.com](https://rickwaterman.com) — Rick Waterman's personal site.
A static site (bio, resume, links + feeds, 404, plus an unlisted fun page) built with
[Astro](https://astro.build/) and Tailwind CSS, deployed to S3 + CloudFront with AWS CDK.
It is the hub for the sibling [`blog`](https://github.com/rwaterman/blog) (Hugo) and
[`notes`](https://github.com/rwaterman/notes) (Quartz) sites, which live on subdomains and
share infrastructure owned by this repo.

## Requirements

- Node.js ≥ 22.12 (`engines` in `package.json`)
- AWS CLI + CDK bootstrap in `us-west-2` and `us-east-1` for infra work

## Develop

```sh
npm ci
npm run dev        # http://localhost:4321
npm run check      # astro check (types in .astro and .ts)
npm test           # node:test for src/lib
npm run build      # static output in ./dist
npm run preview    # serve ./dist locally
```

`SITE` (e.g. `https://dev.rickwaterman.com`) is read at build time for canonical URLs and
the sitemap. Only `SITE=https://rickwaterman.com` links the nav to the prod blog/notes;
the dev deploy and local `npm run dev` (no `SITE`) link to `blog-dev` / `notes-dev`.
Site identity, nav, external links, music profiles, and playlists live in `src/config/site.ts`.
Time-based text is derived, not typed: "N+ years" comes from `careerStartYear` there, and the
copyright year (`src/components/Year.astro`) is rendered at build time and corrected in the
browser. Only the legal page's "Last updated" date is set by hand, when its text changes.

## Content

- **Fun** (`/fun`, currently built but not in the nav or sitemap — re-add `{ label: 'Fun', href: '/fun' }`
  to `nav` in `src/config/site.ts` and drop the sitemap filter in `astro.config.mjs` to relaunch it)
- **Fun → GenAI Shaders** — GLSL fragment shaders in `src/shaders/*.frag`, run by
  `src/lib/shader-runtime.ts` (WebGL2, Shadertoy-style `mainImage` + `iResolution` /
  `iTime` / `iMouse`). One shared offscreen GL context renders every visible tile into
  its own 2D canvas, so the page can hold dozens of shaders without hitting the browser's
  context cap; tiles pause offscreen and under `prefers-reduced-motion`. Every tile has a
  Fullscreen button and the section has "Random shader" — both open a fullscreen stage
  (`R` random, `Space` pause, `Esc` close). Register new shaders in `src/config/shaders.ts`.
  Every page also draws one shader as a dimmed full-page backdrop — the `background` prop
  on `Layout` names it per page (off under `prefers-reduced-motion`).
- **Theme** — dark for everyone, independent of the OS color-scheme setting. The single
  palette lives in `src/styles/global.css`.
- **Fun → Memes / Cat Photos / Playlists** — drop images into `src/assets/memes/` or
  `src/assets/cats/` (alt text comes from the filename); add playlist links to
  `playlists` in `src/config/site.ts`. Sections without content are not rendered.
- **Links → Feeds** — `public/feeds.opml` is the single copy: parsed at build time for
  the Feeds section of `/links` and served as-is (linked inline as "OPML"). Replace the file to update
  the list.

## Layout

```
src/
  pages/        index, resume, fun, links (+ feeds), legal, 404
  components/   Header, Footer, Section
  layouts/      Layout.astro
  config/       site.ts — name, nav, external links, playlists; shaders.ts
  lib/          opml.ts, fun.ts, slug.ts, shader-runtime.ts (+ node:test files)
  shaders/      *.frag fragment shader bodies
  assets/       memes/, cats/ (processed by astro:assets)
  styles/       global.css (Tailwind 4 tokens + component classes)
public/         static assets (resume PDF, feeds.opml, og.png, favicon.svg/.ico, apple-touch-icon.png)
infra/          AWS CDK app (TypeScript)
  bin/website.ts
  lib/shared-stack.ts   account-wide singletons (us-west-2)
  lib/edge-stack.ts     shared WAF (us-east-1)
  lib/cert-stack.ts     per-env ACM certificate (us-east-1)
  lib/site-stack.ts     one environment (us-west-2)
  lib/redirect-stack.ts rickgwaterman.com → rickwaterman.com 301 (us-east-1)
  lib/site-config.ts    SITE_ENVS, account/region/zone
.github/workflows/
  deploy.yml    build + publish content
  infra.yml     cdk deploy
```

## Architecture

```mermaid
flowchart LR
  GH[GitHub Actions<br/>OIDC, no stored keys] -->|aws s3 sync + invalidate| S3[(S3 bucket<br/>private, OAC)]
  GH -->|cdk deploy| CFN[CloudFormation]
  U[Browser] --> R53[Route53<br/>A/AAAA alias] --> CF[CloudFront<br/>ACM cert + rewrite Function]
  CF --> S3
  WAF[Shared WAF WebACL] -.associated.- CF
  CF -->|/api/contact| API[HTTP API + Lambda + DynamoDB] --> SES[SES email]
```

The home region is `us-west-2`; everything that can live there does (buckets,
distributions, roles, SSM). CloudFront requires its ACM certificate and a
`CLOUDFRONT`-scoped WAF WebACL in `us-east-1`, so those sit in thin edge stacks and are
passed to the home-region stacks with CDK `crossRegionReferences`. DNS is the
`rickwaterman.com` hosted zone. The legacy `rickgwaterman.com` zone only holds the alias
records of `WebsiteRedirect`, which 301s every host under it to the same host under
`rickwaterman.com` (`blog.rickgwaterman.com/x?y` → `blog.rickwaterman.com/x?y`); that stack
has nothing regional but its certificate, so it lives entirely in us-east-1.

| Stack | Region | Contents |
| --- | --- | --- |
| `WebsiteEdge` | us-east-1 | Shared CloudFront WebACL |
| `WebsiteRedirect` | us-east-1 | Legacy-domain redirect: wildcard certificate, CloudFront + Function, apex and `*` alias records |
| `WebsiteCert<Env>` | us-east-1 | That environment's DNS-validated ACM certificate |
| `WebsiteShared` | us-west-2 | OIDC provider, `website-infra-deploy` role, SSM param with the WebACL ARN |
| `WebsiteSite<Env>` | us-west-2 | Bucket, distribution, DNS, content role, SSM params |

### `WebsiteShared` / `WebsiteEdge` — account-wide singletons

Created once and consumed by this repo **and** by `blog` and `notes` (separate CDK apps):

| Resource | Purpose |
| --- | --- |
| GitHub OIDC provider | One per account; all three repos' workflows authenticate through it |
| `website-infra-deploy` role | Assumed by `infra.yml` from `develop`; can only assume the CDK bootstrap roles in both regions |
| Shared CloudFront WebACL (`WebsiteEdge`) | One WAF for the apex and every subdomain distribution. Rules: geo-block OFAC-sanctioned countries + RU/BY, 1000 req / 10 min per-IP rate limit, AWS IP-reputation managed group, silent JS challenge on `/api/contact` |
| SSM `/website/shared/cloudfront-webacl-arn` (us-west-2) | How blog/notes discover the WebACL at deploy time |

### `WebsiteSite<Env>` — one static-site environment

| Env | Stack | Domain | Deploys from | Content role |
| --- | --- | --- | --- | --- |
| dev | `WebsiteSiteDev` | `dev.rickwaterman.com` | `develop` | `website-content-dev` |
| prod | `WebsiteSiteProd` | `rickwaterman.com` (+ `www` → apex 301) | `main` | `website-content-prod` |

Each environment stack creates: a private, encrypted S3 bucket (prod: `RETAIN`, dev:
destroy + auto-empty); a CloudFront distribution with Origin Access Control and a
viewer-request CloudFront Function (directory-index rewrite, `www` redirect on prod);
Route53 A/AAAA alias records; a branch-scoped OIDC role
that may only write to that environment's bucket, invalidate its distribution, and read
the shared WebACL (for the WAF SDK URL); and
SSM parameters `/website/<env>/bucket-name` and `/website/<env>/distribution-id` that the
deploy workflow resolves at run time, so nothing is hardcoded in CI.

A contact form (`/contact` page → HTTP API → Lambda → SES, served through the same
distribution at `/api/contact`) is enabled per environment via `enableContactForm` in
`site-config.ts`. Abuse controls, outermost first: the shared WAF issues a silent JS
challenge on `/api/contact` (the page loads the WAF SDK, whose `fetch` carries the token;
curl and scripted clients are stopped at the edge), the HTTP API stage throttles at
1 req/s (burst 10), a hidden honeypot field drops bot fills, and the Lambda enforces
DynamoDB counters of 5 messages/min per IP, 5/min per reply-to address, and 20/min
globally. Mail is sent from `contact@rickwaterman.com`
via the DKIM-signed SES domain identity in `SharedStack`. The recipient address lives only
in the SecureString parameter `/website/<env>/contact-recipient` (read by the Lambda at run
time) and in its verified SES identity — it never appears in the repo, the client, or
build output. SES identities are regional: the Lambda sends from **us-west-2**, so an
identity verified only in us-east-1 fails with `MessageRejected`. While the account is in
the SES sandbox the recipient must be a verified identity too — swap recipients by
verifying the new address in SES (us-west-2) and updating the parameter; no deploy needed.

## CI/CD

Both workflows use OIDC (`id-token: write`) and the repo secrets `AWS_ACCOUNT_ID`,
`HOSTED_ZONE_ID`, and `REDIRECT_HOSTED_ZONE_ID`; no long-lived AWS keys exist.

- **`deploy.yml`** — on push to `develop` (→ dev) or `main` (→ prod), or
  `workflow_dispatch` with an `env` choice. Runs `astro check` and the unit tests, assumes
  `website-content-<env>`, resolves the bucket, distribution, and WAF SDK URL, builds with
  the env's `SITE` and `WAF_INTEGRATION_URL`, writes a
  `Disallow: /` `robots.txt` on dev, syncs `dist/` to S3
  (hashed `_astro/*` assets cached immutable for a year, everything else
  `must-revalidate`), then invalidates `/*`.
- **`infra.yml`** — on push to `develop` touching `infra/**`. Assumes
  `website-infra-deploy` and runs `cdk deploy --all` — every stack, dev **and** prod.
  Infra has no `main` path; only content promotion follows `main`.

Branching follows git flow: feature branches → `develop` (dev), releases → `main` (prod).

### First-time / local infra deploy

`website-infra-deploy` is created by `WebsiteShared`, so the very first deploy runs
locally with admin credentials. Both regions must be CDK-bootstrapped:

```sh
cd infra && npm ci
npx cdk bootstrap aws://<account>/us-west-2 aws://<account>/us-east-1
AWS_ACCOUNT_ID=<account> HOSTED_ZONE_ID=<zoneId> REDIRECT_HOSTED_ZONE_ID=<legacyZoneId> \
  npx cdk deploy --all --require-approval never
```

Deploy `WebsiteShared` before the blog/notes infra — they import its OIDC provider and
WebACL ARN.
