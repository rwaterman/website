# website

Source for [rickwaterman.com](https://rickwaterman.com) — Rick Waterman's personal site.
A static site (bio, resume, links + feeds, share feed, 404, plus an unlisted fun page) built with
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
npm run test:e2e   # Playwright: builds, serves on :4399, runs e2e/ in headless Chromium
```

End-to-end tests live in `e2e/` and need a one-time `npx playwright install chromium`
(`--with-deps` on Debian/Ubuntu). They cover every page and its background shader, the nav,
the contact form against a stubbed `/api/contact` (the real endpoint only exists behind
CloudFront), and `/fun`, where every shader in `src/shaders/` must compile and paint.
Headless Chromium renders WebGL2 in software, so the gallery test takes about a minute.
Run one file with `npx playwright test e2e/contact.spec.ts`, or debug with `--ui`.

`SITE` (e.g. `https://dev.rickwaterman.com`) is read at build time for canonical URLs and
the sitemap. Only `SITE=https://rickwaterman.com` links the nav to the prod blog/notes;
the dev deploy and local `npm run dev` (no `SITE`) link to `blog-dev` / `notes-dev`.
Site identity, nav, external links, music profiles, and playlists live in `src/config/site.ts`.
Time-based text is derived, not typed: "N+ years" comes from `careerStartYear` there, and the
copyright year (`src/components/Year.astro`) is rendered at build time and corrected in the
browser. Only the legal page's "Last updated" date is set by hand, when its text changes.

## Content

- **Fun** (`/fun`) — the non-work page, linked from the nav.
- **Fun → GenAI Shaders** — GLSL fragment shaders in `src/shaders/*.frag`, run by
  `src/lib/shader-runtime.ts` (WebGL2, Shadertoy-style `mainImage` + `iResolution` /
  `iTime` / `iMouse`). One shared offscreen GL context renders every visible tile into
  its own 2D canvas, so the page can hold dozens of shaders without hitting the browser's
  context cap; tiles pause offscreen and under `prefers-reduced-motion`. Every tile has a
  Fullscreen button and the section has "Random shader" and "Shader of the day" (changes each
  UTC day) — all open a fullscreen stage. Stage keys: `←` `→` browse, `R` random, `T` tour (a new
  shader every 20 seconds), `E` edit, `S` save a PNG, `C` copy link, `Space` pause, `Esc` close.
  The editor recompiles the open shader as its GLSL changes and keeps the last good program
  running when a compile fails; edits last until the page reloads. Every shader has a link,
  `/fun#<id>`, that opens it on the stage. The filter chips narrow the grid by `kind`, and the
  stage browses only what the filter shows. Register new shaders in `src/config/shaders.ts`
  with an `id`, a `kind`, a title, and a caption.
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

- **Feed** (`/feed`) — videos, links, and images shared from the phone's share sheet. Posts
  are not in the repo: they live in DynamoDB and the page loads them from `/api/feed` in the
  browser, so a share appears without a deploy. See [Share feed](#share-feed).

## Layout

```
src/
  pages/        index, resume, fun, links (+ feeds), feed, legal, 404
  components/   Header, Footer, Section
  layouts/      Layout.astro
  config/       site.ts — name, nav, external links, playlists; shaders.ts
  lib/          opml.ts, feed.ts, fun.ts, slug.ts, shader-runtime.ts (+ node:test files)
  shaders/      *.frag fragment shader bodies
  assets/       memes/, cats/ (processed by astro:assets)
  styles/       global.css (Tailwind 4 tokens + component classes)
e2e/            Playwright specs (pages, contact form, shader gallery)
public/         static assets (resume PDF, feeds.opml, og.png, favicon.svg/.ico, apple-touch-icon.png)
infra/          AWS CDK app (TypeScript)
  bin/website.ts
  lib/shared-stack.ts   account-wide singletons (us-west-2)
  lib/edge-stack.ts     shared WAF (us-east-1)
  lib/cert-stack.ts     per-env ACM certificate (us-east-1)
  lib/site-stack.ts     one environment (us-west-2)
  lib/feed.ts           share feed construct, used by site-stack.ts
  lambda/feed/          share feed Lambda (index.mjs handler, post.mjs validation)
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
  Phone[iOS Shortcut<br/>share sheet] -->|POST /api/feed + token| CF
  CF -->|/api/feed| FEED[HTTP API + Lambda] --> DDB[(DynamoDB)]
  FEED --> MEDIA[(S3 media bucket)]
  CF -->|/feed-media/*| MEDIA
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
| Shared CloudFront WebACL (`WebsiteEdge`) | One WAF for the apex and every subdomain distribution. Rules: geo-block OFAC-sanctioned countries + RU/BY, 1000 req / 10 min per-IP rate limit, AWS IP-reputation managed group, silent browser challenge on `/contact*` and `/api/contact` |
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
that may only write to that environment's bucket and invalidate its distribution; and
SSM parameters `/website/<env>/bucket-name` and `/website/<env>/distribution-id` that the
deploy workflow resolves at run time, so nothing is hardcoded in CI.

A contact form (`/contact` page → HTTP API → Lambda → SES, served through the same
distribution at `/api/contact`) is enabled per environment via `enableContactForm` in
`site-config.ts`. Abuse controls, outermost first: the shared WAF issues a silent browser
challenge when `/contact` loads, which sets a 24-hour `aws-waf-token` cookie that the
page's same-origin POST to `/api/contact` carries (curl and scripted clients are stopped
at the edge; the WAF JS SDK is not used because `GetWebACL` only exposes its URL for
ATP/ACFP/Bot Control ACLs), the HTTP API stage throttles at
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

### Share feed

`/feed` shows what was shared from the phone. An iOS Shortcut in the share sheet posts the
URL or image to `/api/feed`; one Lambda stores it in a DynamoDB table (images go to a
private media bucket served at `/feed-media/*`), and the page reads the newest 100 posts
back from the same endpoint. It is enabled per environment via `enableFeed` in
`site-config.ts`.

| Request | Auth | Body | Result |
| --- | --- | --- | --- |
| `GET /api/feed` | none | — | `{ "items": [{ id, createdAt, url?, title?, note?, image? }] }`, newest first |
| `POST /api/feed` | `x-feed-token` | `{ "url"?, "title"?, "note"?, "image"? }` | `201 { "id" }` |
| `DELETE /api/feed/{id}` | `x-feed-token` | — | `200 { "ok": true }`, image removed too |

The API answers only through CloudFront: the distribution adds an `x-origin-verify` header
that the Lambda checks, so a request sent straight to the API Gateway hostname gets `403`
and cannot bypass the web application firewall (WAF) rate limit. The firewall also masks
`x-feed-token` in its sampled requests.

A post needs a `url` (http or https) or an `image` (base64 JPEG, PNG, GIF, or WebP, up to
4 MB decoded). YouTube links render as an embedded player, images inline, and every other
link as a titled link with its host.

The token is the only write guard. It lives in the SecureString parameter
`/website/<env>/feed-token`, which is created by hand and never appears in the repo:

```sh
aws ssm put-parameter --region us-west-2 --type SecureString \
  --name /website/prod/feed-token --value "$(openssl rand -hex 32)"
aws ssm get-parameter --region us-west-2 --with-decryption \
  --name /website/prod/feed-token --query Parameter.Value --output text
```

To rotate it, overwrite the parameter (`--overwrite`) and update the Shortcut. A running
Lambda caches the old token until its execution environment is recycled; to force that,
change any environment variable on the function or redeploy.

Remove a mis-share with its `id` from `GET /api/feed`:

```sh
curl -X DELETE -H "x-feed-token: $TOKEN" https://rickwaterman.com/api/feed/<id>
```

The post leaves `/feed` at once. A deleted image can stay in CloudFront and browser caches
for up to five minutes, the cache lifetime set on every upload. If the request fails, send
it again: the post stays listed until its image is gone, so a retry always finishes the job.

#### iOS Shortcut

Build it once in the Shortcuts app; it then appears in every app's share sheet.

1. New Shortcut named "Post to feed". In its details, turn on **Show in Share Sheet** and
   accept **Images** and **URLs** (Safari web pages and text can stay on as well).
2. **Ask for Input** (Text, prompt "Note", allow an empty answer).
3. **Get Images from Input**, then **If** *Images* **has any value**:
   1. **Resize Image** to 1600 wide, **Convert Image** to JPEG (quality about 0.8). This
      turns HEIC photos into a format the endpoint accepts and keeps them under 4 MB.
   2. **Base64 Encode** the converted image, line breaks **None**.
   3. **Get Contents of URL** `https://rickwaterman.com/api/feed`: method POST, header
      `x-feed-token` set to the token, request body JSON with `image` (Base64 Encoded) and
      `note` (Provided Input).
4. **Otherwise**: **Get URLs from Input**, then **Get Contents of URL** with the same
   method and header, and a JSON body of `url` (URLs), `title` (Shortcut Input → Name),
   and `note` (Provided Input).
5. **End If**, then **Show Notification** with the response so a rejected post is visible.

Share from YouTube, Reddit, Safari, or Photos → **Post to feed** → type a note or leave it
blank. The post is on `/feed` on the next page load.

## CI/CD

Both workflows use OIDC (`id-token: write`) and the repo secrets `AWS_ACCOUNT_ID`,
`HOSTED_ZONE_ID`, and `REDIRECT_HOSTED_ZONE_ID`; no long-lived AWS keys exist.

- **`deploy.yml`** — on push to `develop` (→ dev) or `main` (→ prod), or
  `workflow_dispatch` with an `env` choice. Runs `astro check` and the unit tests, builds
  with the env's `SITE`, writes a
  `Disallow: /` `robots.txt` on dev, assumes `website-content-<env>`, syncs `dist/` to S3
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
