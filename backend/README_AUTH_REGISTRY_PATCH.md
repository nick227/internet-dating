# Auth Registry Patch (JWT + httpOnly Cookies)

This patch upgrades auth to JWTs while preserving your registry/domain architecture.

## Includes
- JWT access + refresh tokens
- Cookies (httpOnly)
- Auth.user() JWT validation
- /auth/signup, /auth/login, /auth/refresh, /auth/logout, /auth/me

## Required deps
npm i jsonwebtoken bcryptjs cookie-parser
npm i -D @types/jsonwebtoken @types/cookie-parser

## Env vars
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d

## App wiring
Ensure cookie-parser is enabled once:

app.use(cookieParser());

## Migration
- Remove x-user-id usage from frontend
- Auth state now via cookies/JWT

Safe to overwrite existing files.
