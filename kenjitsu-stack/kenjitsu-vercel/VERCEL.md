# Self-contained Vercel deployment

The project can be installed and deployed directly from the
`kenjitsu-vercel` directory. Its hardened extension is vendored at:

```text
kenjitsu-vercel/
├── api/
├── src/
├── vendor/
│   └── kenjitsu-extensions/
│       ├── package.json
│       └── dist/
│           ├── main.js
│           └── main.d.ts
├── package.json
├── pnpm-lock.yaml
└── vercel.json
```

No Git repository layout, sibling directory, private registry, registry token,
or Vercel option for files outside the Root Directory is required.

## Commands

- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm build`
- Runtime: Node.js 24.x
- Output: one Node.js Function at `api/index.ts`; there is no static output directory

## Environment variables

No variable is strictly required. Optional variables are:

- `ALLOWED_ORIGINS`: comma-separated origins; defaults to `*`.
- `CORS_CREDENTIALS`: `true` only with explicit `ALLOWED_ORIGINS`; defaults to `false`.
- `MAX_API_REQUESTS`: global request limit; defaults to `120`.
- `WINDOW_IN_MINUTES`: rate-limit window; defaults to `1`.
- `LOG_LEVEL`: Fastify log level; defaults to `info`.
- `ANIKOTOURL`: Anikoto override; normally omit.
- `ANIDBURL`: AniDB override; normally omit.
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`: optional Redis connection.
- `REDIS_TLS`: set to `true` only when the Redis endpoint requires TLS.
- `REDIS_NAMESPACE`: key prefix; defaults to `kenjitsu`.

Do not set `PORT`, `HOST`, `NPM_TOKEN`, registry tokens, or any `NEXT_PUBLIC_`
variable in Vercel. The platform owns the server socket and the extension is a
vendored local dependency.

The serverless handler intentionally disables landing-page static assets. All
API routes and `/health` remain available. AnimePahe is not implemented or
registered.
