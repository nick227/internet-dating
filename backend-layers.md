# backend-layers.md

## Layers

1. **Database**
   - MySQL

2. **Schema / ORM**
   - Prisma schema
   - Prisma migrations

3. **Data Access**
   - Prisma client
   - Used only in services

4. **Business Logic**
   - Service modules
   - Domain-based (users, profiles, posts, matches, messages, quizzes)

5. **API Contract**
   - OpenAPI spec
   - Generated types and client

6. **HTTP Layer**
   - REST routes
   - Auth middleware
   - Input parsing

7. **Auth**
   - Session cookies
   - User context injection

8. **Realtime**
   - WebSocket for messages only