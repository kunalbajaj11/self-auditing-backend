# Docker Setup Guide

This guide explains how to run the SmartExpense API backend using Docker.

## Prerequisites

- Docker Desktop installed and running
- Docker Compose (included with Docker Desktop)

## Quick Start

### Production Mode

1. Copy the environment file:
   ```bash
   cp .env.example .env
   ```

2. Update the `.env` file with your configuration values.

3. Build and start the containers:
   ```bash
   docker-compose up -d
   ```

4. The API will be available at `http://localhost:3000`

### Development Mode

1. Copy the environment file:
   ```bash
   cp .env.example .env
   ```

2. Update the `.env` file with your development configuration.

3. Start the development containers:
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

4. The API will be available at `http://localhost:3000` with hot reload enabled.

## Docker Compose Files

### `docker-compose.yml` (Production)
- Multi-stage build for optimized production image
- PostgreSQL database with persistent volume
- Health checks for both services
- Production-optimized settings

### `docker-compose.dev.yml` (Development)
- Development Dockerfile with hot reload
- Source code mounted as volume for live updates
- Debug port exposed (9229)
- Development-friendly database settings

## Available Commands

### Start Services
```bash
# Production
docker-compose up -d

# Development
docker-compose -f docker-compose.dev.yml up -d
```

### Stop Services
```bash
# Production
docker-compose down

# Development
docker-compose -f docker-compose.dev.yml down
```

### View Logs
```bash
# Production
docker-compose logs -f api
docker-compose logs -f postgres

# Development
docker-compose -f docker-compose.dev.yml logs -f api
```

### Rebuild Containers
```bash
# Production
docker-compose build --no-cache
docker-compose up -d

# Development
docker-compose -f docker-compose.dev.yml build --no-cache
docker-compose -f docker-compose.dev.yml up -d
```

### Access Database
```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U postgres -d smart_expense_uae

# Or using docker-compose.dev.yml
docker-compose -f docker-compose.dev.yml exec postgres psql -U postgres -d smart_expense_uae
```

### Execute Commands in API Container
```bash
# Production
docker-compose exec api sh

# Development
docker-compose -f docker-compose.dev.yml exec api sh
```

## Environment Variables

See `.env.example` for all available environment variables. Key variables:

- **Database**: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`
- **JWT**: `JWT_ACCESS_SECRET`
- **AWS S3**: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME`
- **Email**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`
- **Google Cloud**: `GOOGLE_APPLICATION_CREDENTIALS`

## Volumes

### Production
- `postgres_data`: Persistent PostgreSQL data storage

### Development
- `postgres_dev_data`: Development PostgreSQL data storage
- Source code mounted for hot reload

## Health Checks

Both services include health checks:
- **PostgreSQL**: Checks if database is ready to accept connections
- **API**: Checks if the API health endpoint responds

## Troubleshooting

### Port Already in Use
If port 3000 or 5432 is already in use, update the ports in `docker-compose.yml`:
```yaml
ports:
  - "3001:3000"  # Change 3001 to any available port
```

### Database Connection Issues
1. Ensure PostgreSQL container is healthy:
   ```bash
   docker-compose ps
   ```
2. Check database logs:
   ```bash
   docker-compose logs postgres
   ```

### Build Failures
1. Clear Docker cache:
   ```bash
   docker system prune -a
   ```
2. Rebuild without cache:
   ```bash
   docker-compose build --no-cache
   ```

### Permission Issues
If you encounter permission issues with volumes, ensure Docker has proper permissions or adjust file ownership.

## Production Deployment

For production deployment:

1. Use environment-specific `.env` files
2. Use Docker secrets for sensitive data
3. Configure proper CORS origins
4. Set `DB_SYNCHRONIZE=false` and use migrations
5. Use managed database services (RDS, etc.) instead of containerized database
6. Configure proper logging and monitoring
7. Use reverse proxy (nginx) for SSL termination

## Building for Different Platforms

To build for a specific platform:
```bash
docker buildx build --platform linux/amd64 -t smart-expense-api .
```




