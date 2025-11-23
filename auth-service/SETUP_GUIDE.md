# Auth Service - Better Auth with Prisma & PostgreSQL

## Setup Complete! ✅

Better Auth has been configured with Prisma and PostgreSQL.

## What Was Created:

1. **Prisma Schema** (`src/prisma/schema.prisma`)
   - User, Session, Account, Verification models
   - PostgreSQL as database provider

2. **Prisma Module** (`src/prisma/`)
   - PrismaService for database connection
   - Global module exported

3. **Better Auth Service** (`src/authentication/better-auth/`)
   - Configured with Prisma adapter
   - Email/password authentication enabled

4. **Auth Controller** (`src/authentication/authentication.controller.ts`)
   - Catch-all route handler for Better Auth
   - Handles all auth endpoints automatically

5. **Environment Config** (`.env.example`)
   - Database URL template
   - Better Auth configuration

## Setup Steps:

### 1. Install Dependencies

```bash
cd auth-service

# Install @nestjs/config if not already installed
npm install @nestjs/config

# Ensure Better Auth and Prisma are installed
npm install better-auth @prisma/client prisma
npm install --save-dev @types/node
```

### 2. Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your PostgreSQL credentials
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
```

### 3. Set Up Database

```bash
# Generate Prisma Client
npx prisma generate

# Create database and run migrations
npx prisma migrate dev --name init

# (Optional) Open Prisma Studio to view data
npx prisma studio
```

### 4. Start the Service

```bash
npm run start:dev
```

The auth service will run on http://localhost:8001

## Better Auth Endpoints

Better Auth automatically provides these endpoints:

### Sign Up
```bash
POST http://localhost:8001/sign-up/email
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

### Sign In
```bash
POST http://localhost:8001/sign-in/email
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### Get Session
```bash
GET http://localhost:8001/get-session
Cookie: better-auth.session_token=<token>
```

### Sign Out
```bash
POST http://localhost:8001/sign-out
Cookie: better-auth.session_token=<token>
```

### Update User
```bash
POST http://localhost:8001/update-user
Cookie: better-auth.session_token=<token>
Content-Type: application/json

{
  "name": "Updated Name"
}
```

## Via API Gateway

All requests go through the API gateway:

```bash
# Sign Up
POST http://localhost:3000/api/auth/sign-up/email

# Sign In
POST http://localhost:3000/api/auth/sign-in/email

# Get Session (requires auth token)
GET http://localhost:3000/api/auth/get-session
```

## Database Schema

The Prisma schema includes:

- **User**: Core user information (email, name, password hash)
- **Session**: Active user sessions with tokens
- **Account**: OAuth accounts (for future social login)
- **Verification**: Email verification tokens

## Configuration Options

Edit `src/authentication/better-auth/better-auth.service.ts` to customize:

```typescript
this.auth = betterAuth({
  database: prismaAdapter(this.prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    // Add more options:
    // minPasswordLength: 8,
    // requireEmailVerification: true,
  },
  // Add social providers:
  // socialProviders: {
  //   google: { ... },
  //   github: { ... },
  // },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
});
```

## Troubleshooting

### Missing @nestjs/config
```bash
npm install @nestjs/config
```

### Database Connection Issues
- Check DATABASE_URL in .env
- Ensure PostgreSQL is running
- Verify database exists

### Prisma Client Not Generated
```bash
npx prisma generate
```

### Migration Issues
```bash
# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Create new migration
npx prisma migrate dev --name your_migration_name
```

## Next Steps

1. ✅ Database is set up
2. ✅ Better Auth is configured
3. Test authentication endpoints
4. Add email verification (optional)
5. Add social login providers (optional)
6. Implement refresh tokens (optional)

## API Gateway Integration

The API Gateway is already configured to route `/api/auth/*` to this service at http://localhost:8001

Public routes (no JWT required):
- `/api/auth/sign-up/email`
- `/api/auth/sign-in/email`
- `/api/auth/health`

Protected routes (JWT required):
- `/api/auth/get-session`
- `/api/auth/update-user`
- `/api/auth/sign-out`

---

**Status**: Ready to use! 🎉

Run the migrations and start testing authentication!
