# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine AS build
WORKDIR /src

# Copy project file and restore dependencies
COPY DockerMetricsCollector/DockerMetricsCollector.csproj ./DockerMetricsCollector/
RUN dotnet restore DockerMetricsCollector/DockerMetricsCollector.csproj

# Copy source and build
COPY DockerMetricsCollector/ ./DockerMetricsCollector/
RUN dotnet publish DockerMetricsCollector/DockerMetricsCollector.csproj \
    -c Release \
    -o /app \
    --no-restore

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine AS runtime
WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy published app
COPY --from=build /app .

# Default port
ENV PORT=5000
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/info || exit 1

# Run as non-root user (but needs docker group access)
# Note: The container needs to be run with docker.sock mounted and proper permissions

ENTRYPOINT ["dotnet", "DockerMetricsCollector.dll"]
