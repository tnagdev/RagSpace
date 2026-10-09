# api-gateway

The only public entry point. Serves the REST API at `/api/v1` defined in [`contracts/openapi/public.v1.yaml`](../contracts/openapi/public.v1.yaml) and translates each operation into gRPC calls to the internal services.

- **Auth**: resolves the `better-auth.session_token` cookie via `AuthService.ValidateSession` (cached 30s). Routes are protected unless marked `@Public()`. `/api/v1/auth/*` is proxied to auth-service over HTTP.
- **Request pipeline** (`src/main.ts`): correlation id → `Cache-Control: no-store` → rate limits (`src/http/rate-limit.ts`) → `Origin` check on unsafe methods → auth passthrough → body parsing → OpenAPI validation (`src/http/openapi-validator.ts`) → controllers.
- **Errors**: gRPC status + `x-error-code` trailer → RFC 9457 problem+json (`src/http/problem.ts`).
- **Streaming**: `GET /events` fans `file.updated` events out per user (exclusive RabbitMQ queue per instance); `POST /conversations/{id}/messages` relays `ChatService.SendMessage` as SSE.

```bash
npm test          # Jest
npx tsc -p tsconfig.build.json --noEmit
```

Config is read from the environment in `src/config.ts` (see `.env.docker`).
