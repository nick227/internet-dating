# Running Prisma Migrations on Railway

## Option 1: Using Railway CLI (Recommended)

1. Install Railway CLI if you haven't already:
   ```bash
   npm i -g @railway/cli
   ```

2. Login to Railway:
   ```bash
   railway login
   ```

3. Link to your project:
   ```bash
   railway link
   # Select project: Internet-Dating (e14aa4a7-a774-41ad-b99c-7c7d5765841a)
   ```

4. Run migrations:
   ```bash
   railway run --service <your-service-name> pnpm -w --filter backend run migrate
   ```
   
   Or directly:
   ```bash
   cd backend
   railway run pnpm run migrate
   ```

## Option 2: Using Railway Dashboard One-Off Command

1. Go to your Railway project dashboard
2. Select your service
3. Go to the "Deployments" tab
4. Click "New Deployment" or use the "Run Command" feature
5. Run:
   ```bash
   cd backend && pnpm run migrate
   ```

## Option 3: Manual Migration via Railway Shell

1. Open Railway dashboard
2. Go to your service
3. Click on "Shell" or "Connect" to open a terminal
4. Run:
   ```bash
   cd backend
   pnpm run migrate
   ```

## Option 4: Check Migration Status

To check which migrations have been applied:

```bash
cd backend
pnpm prisma migrate status --schema prisma/schema
```

## Option 5: Run Migrations Directly

If the script doesn't work, run Prisma directly:

```bash
cd backend
pnpm prisma migrate deploy --schema prisma/schema
```

## Troubleshooting

- **Error: DATABASE_URL not found**: Make sure the environment variable is set in Railway
- **Error: Migration already applied**: This is normal if migrations were partially run
- **Error: Connection refused**: Check that your MySQL service is running and accessible

## Verify Tables Were Created

After running migrations, verify tables exist:

```bash
cd backend
pnpm prisma studio --schema prisma/schema
```

Or check via MySQL:
```bash
railway run mysql -h mysql.railway.internal -u root -p
# Then run: SHOW TABLES;
```
