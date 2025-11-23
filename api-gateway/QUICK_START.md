# API Gateway - Quick Start Guide

## 1. Install Dependencies

```bash
cd RagSpace/api-gateway
npm install
```

## 2. Configure Environment

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your configuration (especially JWT_SECRET in production).

## 3. Run the Gateway

```bash
# Development mode with hot reload
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

The API Gateway will start on `http://localhost:3000`

## 4. Test the Gateway

```bash
# Health check
curl http://localhost:3000/api/health

# Expected response:
{
  "status": "ok",
  "service": "api-gateway",
  "timestamp": "2025-11-13T..."
}
```

## Architecture Diagram

```
┌─────────────┐
│   Clients   │
│  (Web/App)  │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│           API Gateway (Port 3000)           │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │  Interceptors (Logging)              │  │
│  └──────────────────────────────────────┘  │
│                  │                          │
│  ┌──────────────────────────────────────┐  │
│  │  Guards (Rate Limit, Auth)           │  │
│  └──────────────────────────────────────┘  │
│                  │                          │
│  ┌──────────────────────────────────────┐  │
│  │  Proxy Service (Route Matching)      │  │
│  └──────────────────────────────────────┘  │
│                                             │
└──────┬──────┬──────┬──────┬──────┬─────────┘
       │      │      │      │      │
       ▼      ▼      ▼      ▼      ▼
    ┌───┐  ┌───┐  ┌───┐  ┌───┐  ┌───┐
    │Auth│ │Upld│ │Scn│ │Emb│ │Chat│
    │3001│ │3002│ │3003│ │3004│ │3005│
    └───┘  └───┘  └───┘  └───┘  └───┘
```

## Request Flow Example

### 1. Login Request (Public Route)
```bash
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}

# Flow:
Client → Logging → Rate Limit → Proxy → Auth Service (3001)
Auth Service returns JWT token
```

### 2. Protected Request
```bash
GET /api/upload/files
Headers: Authorization: Bearer <token>

# Flow:
Client → Logging → Rate Limit → Auth Guard (validates JWT) 
→ Proxy → Upload Manager (3002)
```

## Next Steps

1. **Set up Auth Service**: The auth-service will handle login/register and JWT generation
2. **Configure Other Services**: Update service URLs in `.env` as you deploy them
3. **Customize Rate Limits**: Adjust in `src/config/rate-limit.config.ts`
4. **Add Routes**: Update `src/config/services.config.ts` to add new service routes
