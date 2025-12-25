# API Gateway

The API Gateway serves as the single entry point for all client requests, handling routing, authentication, rate limiting, and request forwarding to appropriate microservices.

## Architecture

### Folder Structure

```
src/
├── common/                      # Shared utilities and types
│   ├── decorators/             # Custom decorators (@Public, etc.)
│   └── types/                  # TypeScript type definitions
├── config/                     # Configuration files
│   ├── rate-limit.config.ts    # Rate limiting configuration
│   └── services.config.ts      # Service registry and routing rules
├── filters/                    # Exception filters
│   └── global-exception.filter.ts
├── guards/                     # Route guards
│   ├── auth.guard.ts          # Session authentication guard
│   └── throttler.guard.ts     # Rate limiting guard
├── interceptors/              # Request/Response interceptors
│   └── logging.interceptor.ts # Request/response logging
├── modules/                   # Feature modules
│   └── proxy/                 # Proxy module for service routing
│       ├── proxy.controller.ts
│       ├── proxy.service.ts
│       └── proxy.module.ts
├── prisma/                    # Prisma schema for session validation
│   └── schema.prisma
├── app.controller.ts          # Root controller (health checks)
├── app.module.ts              # Root module
├── app.service.ts             # Root service
└── main.ts                    # Application entry point
```

## Features

### 1. **Request Routing**
- Automatically routes requests to appropriate microservices based on path patterns
- Service registry in `config/services.config.ts` defines routing rules
- Supports wildcard patterns for flexible route matching
- Special handling for file uploads (multipart/form-data)

### 2. **Authentication**
- Session-based authentication using `AuthGuard`
- Validates better-auth session cookies directly from database
- Protects all routes by default (use `@Public()` decorator for public routes)
- Injects user information headers (`x-user-id`, `x-user-email`, etc.) for downstream services

### 3. **Rate Limiting**
- Protects against abuse with configurable rate limits
- Uses IP address for anonymous users, user ID for authenticated users
- Configured via `RATE_LIMIT_TTL` and `RATE_LIMIT_MAX` environment variables

### 4. **File Upload Support**
- Special handling for multipart/form-data requests
- Uses `AnyFilesInterceptor` to capture uploaded files
- Forwards files to appropriate services (e.g., upload-manager)
- Maintains file metadata and original form fields

### 5. **Global Error Handling**
- Custom exception filter for consistent error responses
- Detailed error logging with request context
- User-friendly error messages

### 6. **Request Logging**
- Logs all incoming requests and outgoing responses
- Includes HTTP method, path, status code, and response time
- Tracks user information when available

## Environment Configuration

Create a `.env` file based on `.env.example`:

```bash
# API Gateway Configuration
PORT=3000
NODE_ENV=development

# Gateway Microservice Port (for internal communication)
GATEWAY_MICROSERVICE_PORT=8000
GATEWAY_HOST=0.0.0.0

# Database Configuration (for session validation)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/scenestore

# JWT Configuration (legacy, may be removed)
JWT_SECRET=your-secret-key-change-this-in-production
JWT_EXPIRATION=1h

# Rate Limiting
RATE_LIMIT_TTL=60          # Time window in seconds
RATE_LIMIT_MAX=100         # Max requests per window

# Service URLs
AUTH_SERVICE_URL=http://auth-service:3001
UPLOAD_MANAGER_URL=http://upload-manager:3002
SCENE_DETECTOR_URL=http://scene-detector:3003
FILE_EMBEDDER_URL=http://file-embedder:3004
CHAT_MANAGER_URL=http://chat-manager:3005

# Service Microservice Ports (TCP)
AUTH_SERVICE_HOST=localhost
AUTH_SERVICE_PORT=8001

# CORS
CORS_ORIGIN=*
```

## Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate
```

## Running

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## Request Flow

1. **Client Request** → API Gateway
2. **Logging Interceptor** → Logs incoming request
3. **Rate Limit Guard** → Checks request rate
4. **Auth Guard** → Validates session cookie from database (if not public route)
5. **Proxy Controller** → Determines target service, enriches headers with user info
6. **Proxy Service** → Forwards request to microservice (with files if present)
7. **Response** → Returns to client with logging

## Authentication Flow

The API Gateway uses a direct database session validation approach:

1. **Session Cookie Extraction**: Extracts `better-auth.session_token` from request cookies
2. **Database Lookup**: Queries the session table directly using Prisma
3. **Session Validation**: Checks if session exists and hasn't expired
4. **User Population**: Loads user data associated with the session
5. **Header Injection**: Adds user information to downstream service requests:
   - `x-user-id`: User's unique identifier
   - `x-user-email`: User's email address
   - `x-user-username`: User's username
   - `x-user-name`: User's display name

This approach eliminates the need for service-to-service calls to auth-service and provides better performance and reliability.

## API Endpoints

### Health Check
```
GET /api/health
```
Public endpoint to check API Gateway status.

### Protected Routes
All other routes require a valid session cookie (automatically set after login via auth-service).

## Adding a New Service

1. Add service configuration to `src/config/services.config.ts`:
```typescript
NEW_SERVICE: {
  name: 'new-service',
  url: process.env.NEW_SERVICE_URL || 'http://new-service:3006',
  routes: ['/new-service/*'],
}
```

2. Add environment variable to `.env`:
```
NEW_SERVICE_URL=http://new-service:3006
```

3. No code changes needed - routing is automatic!

## Security Best Practices

1. **Database Access**: API Gateway has read-only access to user/session tables
2. **CORS Configuration**: Restrict CORS origin to your frontend domain in production
3. **Rate Limiting**: Adjust limits based on your use case
4. **HTTPS**: Always use HTTPS in production
5. **Environment Variables**: Never commit `.env` files to version control
6. **Session Security**: Sessions are validated on every request against the database

## Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Microservices

The gateway routes to these services:

- **auth-service** (Port 8001): Authentication & authorization
- **upload-manager** (Port 3002): File upload handling with S3 integration
- **scene-detector** (Port 3003): Scene detection processing
- **file-embedder** (Port 8003): File embedding generation and semantic search
- **chat-manager** (Port 3005): AI-powered conversational search with SSE streaming

## Troubleshooting

### 401 Unauthorized Errors

- Ensure you have a valid session cookie (login through auth-service first)
- Check that DATABASE_URL is correctly configured
- Verify the session hasn't expired (default expiration varies)
- Check browser DevTools → Application → Cookies for `better-auth.session_token`

### File Upload Issues

- Ensure `Content-Type: multipart/form-data` header is set
- Check upload-manager service is running and accessible
- Verify file size doesn't exceed limits
- Check logs for detailed error messages

### Service Connection Errors

- Verify all service URLs in `.env` are correct
- Ensure target services are running
- Check Docker network configuration if using containers
- Review service logs for connectivity issues
