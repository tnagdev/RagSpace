# Chat Manager - Prisma Setup Guide

This guide covers setting up Prisma for the chat-manager service's PostgreSQL database.

## Prerequisites

- PostgreSQL database server running
- Python 3.11+ installed
- Virtual environment activated

## Installation

1. **Install Prisma Python Client**

```bash
pip install prisma==0.15.0
```

2. **Configure Environment Variables**

Create a `.env` file in the chat-manager root:

```bash
cp .env.example .env
```

Update the database connection strings:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ragspace?schema=chat_manager
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/ragspace?schema=chat_manager
```

**Note**: 
- `DATABASE_URL`: Used by the application at runtime
- `DIRECT_URL`: Used by Prisma migrations (required for connection poolers)

## Database Setup

### 1. Generate Prisma Client

```bash
# From chat-manager directory
prisma generate --schema=./prisma/schema.prisma
```

This generates the Python Prisma client based on your schema.

### 2. Create the Schema

If the `chat_manager` schema doesn't exist in PostgreSQL:

```sql
-- Connect to your PostgreSQL database
psql -U postgres -d ragspace

-- Create schema
CREATE SCHEMA IF NOT EXISTS chat_manager;
```

### 3. Run Migrations

```bash
# Create initial migration
prisma migrate dev --name init --schema=./prisma/schema.prisma

# Or deploy to production
prisma migrate deploy --schema=./prisma/schema.prisma
```

## Schema Overview

The database has two main tables in the `chat_manager` schema:

### Conversation Table

Stores conversation metadata:

```prisma
model Conversation {
    id        String    @id @default(uuid())
    userId    String
    title     String?
    createdAt DateTime  @default(now())
    updatedAt DateTime  @updatedAt
    messages  Message[]
}
```

### Message Table

Stores individual messages within conversations:

```prisma
model Message {
    id             String       @id @default(uuid())
    conversationId String
    role           String       // 'user' or 'assistant'
    content        String       @db.Text
    timestamp      DateTime     @default(now())
}
```

## Common Prisma Commands

### Generate Client

After modifying the schema:

```bash
prisma generate --schema=./prisma/schema.prisma
```

### Create Migration

```bash
prisma migrate dev --name <migration_name> --schema=./prisma/schema.prisma
```

### View Database in Studio

```bash
prisma studio --schema=./prisma/schema.prisma
```

Opens a GUI to view and edit database records at http://localhost:5555

### Reset Database (Development Only)

⚠️ **Warning**: This will delete all data!

```bash
prisma migrate reset --schema=./prisma/schema.prisma
```

## Troubleshooting

### "Schema not found" Error

Ensure the schema exists in PostgreSQL:

```sql
CREATE SCHEMA IF NOT EXISTS chat_manager;
```

### Connection Issues

1. Verify PostgreSQL is running:
   ```bash
   psql -U postgres -c "SELECT version();"
   ```

2. Check your connection string format:
   ```
   postgresql://[user]:[password]@[host]:[port]/[database]?schema=[schema_name]
   ```

3. Test connection:
   ```bash
   psql "postgresql://postgres:postgres@localhost:5432/ragspace"
   ```

### Migration Conflicts

If migrations are out of sync:

```bash
# Mark migrations as applied (use with caution)
prisma migrate resolve --applied <migration_name> --schema=./prisma/schema.prisma
```

## Production Deployment

1. Set production database URL in environment
2. Run migrations:
   ```bash
   prisma migrate deploy --schema=./prisma/schema.prisma
   ```
3. Generate client:
   ```bash
   prisma generate --schema=./prisma/schema.prisma
   ```

## Using in Code

The PrismaService is a singleton that handles connections:

```python
from src.services.PrismaService import PrismaService

# In your service
prisma_service = PrismaService()
await prisma_service.ensure_connected()

# Query conversations
conversations = await prisma_service.prisma.conversation.find_many(
    where={"userId": user_id}
)

# Create message
await prisma_service.prisma.message.create(
    data={
        "conversationId": conv_id,
        "role": "user",
        "content": "Hello!"
    }
)
```

## References

- [Prisma Python Documentation](https://prisma-client-py.readthedocs.io/)
- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
