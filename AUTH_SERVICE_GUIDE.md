# Auth Service Structure

## Overview
The auth-service handles user authentication, registration, and JWT token generation.

## Recommended Folder Structure

```
auth-service/
├── src/
│   ├── auth/                      # Auth module
│   │   ├── auth.controller.ts     # Login, register, refresh endpoints
│   │   ├── auth.service.ts        # Auth business logic
│   │   ├── auth.module.ts         # Auth module definition
│   │   ├── dto/                   # Data Transfer Objects
│   │   │   ├── login.dto.ts
│   │   │   ├── register.dto.ts
│   │   │   └── refresh-token.dto.ts
│   │   └── strategies/            # Passport strategies
│   │       ├── jwt.strategy.ts
│   │       └── local.strategy.ts
│   ├── users/                     # Users module
│   │   ├── users.controller.ts    # User CRUD operations
│   │   ├── users.service.ts       # User business logic
│   │   ├── users.module.ts        # Users module definition
│   │   ├── entities/
│   │   │   └── user.entity.ts     # User database entity
│   │   └── dto/
│   │       ├── create-user.dto.ts
│   │       └── update-user.dto.ts
│   ├── database/                  # Database configuration
│   │   └── database.module.ts     # TypeORM/Prisma setup
│   ├── guards/                    # Guards
│   │   └── jwt-auth.guard.ts      # JWT authentication guard
│   ├── app.controller.ts
│   ├── app.module.ts
│   ├── app.service.ts
│   └── main.ts
├── .env.example
├── package.json
└── README.md
```

## Key Responsibilities

### 1. User Registration
- Validate user data
- Hash passwords (bcrypt)
- Store user in database
- Return user info (no password)

### 2. User Login
- Validate credentials
- Generate JWT access token
- Generate refresh token
- Return tokens to client

### 3. Token Management
- Generate JWT tokens with user payload
- Validate tokens
- Refresh access tokens using refresh tokens
- Handle token expiration

### 4. Password Security
- Hash passwords with bcrypt (salt rounds: 10-12)
- Never store plain text passwords
- Validate password strength on registration

## Required Dependencies

```bash
npm install @nestjs/jwt @nestjs/passport passport passport-jwt
npm install bcrypt class-validator class-transformer
npm install @nestjs/typeorm typeorm pg  # For PostgreSQL
# OR
npm install @prisma/client prisma  # For Prisma
```

## Environment Variables

```env
# Server
PORT=3001
NODE_ENV=development

# JWT
JWT_SECRET=your-secret-key-must-match-api-gateway
JWT_EXPIRATION=1h
JWT_REFRESH_SECRET=your-refresh-secret
JWT_REFRESH_EXPIRATION=7d

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/scenestore
```

## API Endpoints

### Public Endpoints
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login and get tokens
- `POST /auth/refresh` - Refresh access token

### Protected Endpoints (require JWT)
- `GET /auth/me` - Get current user info
- `POST /auth/logout` - Logout (invalidate tokens)
- `PUT /auth/change-password` - Change password

## Example DTOs

### login.dto.ts
```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
```

### register.dto.ts
```typescript
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password: string;
}
```

## JWT Payload

```typescript
interface JwtPayload {
  sub: string;      // User ID
  email: string;    // User email
  role?: string;    // User role (optional)
  iat?: number;     // Issued at
  exp?: number;     // Expiration
}
```

## Security Best Practices

1. **Password Hashing**: Always use bcrypt with appropriate salt rounds
2. **Token Expiration**: Keep access tokens short-lived (15min-1h)
3. **Refresh Tokens**: Store securely, longer expiration (7-30 days)
4. **Input Validation**: Use DTOs with class-validator
5. **Rate Limiting**: Prevent brute force attacks (handled by API Gateway)
6. **HTTPS Only**: Never send tokens over HTTP
7. **Token Storage**: Clients should store tokens in httpOnly cookies or secure storage

## Integration with API Gateway

The auth-service generates JWT tokens that the API Gateway validates. Both must share the same `JWT_SECRET` in their environment variables.

```
Client → API Gateway → Auth Service
         (validates)    (generates)
              ↓              ↓
         JWT Token ← ← ← JWT Token
```

## Next Steps

1. Set up database (PostgreSQL recommended)
2. Create user entity/model
3. Implement auth service with bcrypt
4. Create JWT strategy for token validation
5. Add endpoints for register/login/refresh
6. Test integration with API Gateway
