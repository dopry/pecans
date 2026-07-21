# Copilot Instructions for Pecans

## Project Overview

Pecans is an Electron Release Server that provides download URLs and auto-update functionality for Electron applications using GitHub releases. It supports Squirrel-based auto-updates for both macOS and Windows platforms.

## Technology Stack

- **Runtime**: Node.js (>=22)
- **Language**: TypeScript
- **Framework**: Express.js
- **Testing**: vitest, nock for HTTP mocking
- **Build**: TypeScript compiler with dual CJS/ESM output
- **Release**: Semantic Release with automated versioning

## Architecture & Key Components

### Core Structure

- `/src/index.ts` - Main entry point and Express app setup
- `/src/pecans.ts` - Core Pecans class handling routing and middleware
- `/src/backends/` - Backend implementations (currently GitHub)
- `/src/models/` - Data models for versions, platforms, and releases
- `/src/utils/` - Utility functions and helpers
- `/src/versions.ts` - Version parsing and channel management

### API Endpoints

The server provides several endpoint patterns:

- Download: `/download/latest`, `/download/:version`, `/download/:version/:os`
- Channels: `/download/channel/:channel`, `/download/channel/:channel/:os`
- Updates: `/update/:platform/:version` (Squirrel integration)
- Release Notes: `/notes/:version`
- Feeds: Atom/RSS for versions and channels

## Development Guidelines

### TypeScript Standards

- Use strict TypeScript configuration (check `tsconfig.*.json` files)
- Prefer explicit types over `any`
- Use interfaces for complex object structures
- Export types and interfaces for reusability
- Follow existing naming conventions (PascalCase for classes, camelCase for variables)

### Code Organization

- Keep business logic separate from Express routing
- Use the existing event-driven architecture (`pecans.on()` pattern)
- Maintain the backend abstraction layer for different data sources
- Follow the established error handling patterns

### Testing Approach

- Tests are located in `/test/` directory
- Use vitest with its built-in `expect` assertions
- Mock external dependencies (GitHub API) using nock
- Test both success and error scenarios
- Run tests with `npm test`

### Build & Release

- ESM-only build (`dist/index.js`) via tsup
- Use `npm run build` to compile TypeScript
- Semantic release handles versioning automatically
- Follow conventional commit format for releases

## Environment Configuration

Key environment variables:

- `GITHUB_TOKEN` - GitHub API authentication
- `GITHUB_OWNER` - Repository configuration
- `GITHUB_REPO` - Repository configuration
- `PECANS_BASE_PATH` - Base path for proxied deployments
- `PECANS_BACKEND` - Backend type (default: `PecansGitHubBackend`)
- `CACHE_MAX_AGE` - Cache duration in seconds (default: 7200 = 2 hours)
- `PORT` - Server port (default: 5000)

## Common Patterns

### Backend Implementation

When working with backends, follow the abstract Backend pattern with built-in caching:

```typescript
// Extend Backend class which includes stale-while-revalidate caching
class MyBackend extends Backend {
  async fetchReleases(): Promise<PecansReleases> {
    // Implementation - this is cached automatically
  }
}
```

The Backend class provides automatic caching with stale-while-revalidate strategy:

- Cache duration configurable via `cacheMaxAge` option (default: 2 hours)
- Serves stale data while refreshing in background when cache expires
- Includes webhook middleware for manual cache refreshing

### Error Handling

Use the established Express error handling middleware:

```typescript
// Return structured errors
res.format({
  "text/plain": () => res.status(code).send(msg),
  "text/html": () => res.status(code).send(msg),
  "application/json": () => res.status(code).send({ error: msg, code }),
});
```

### Event-Driven Downloads

Utilize the event system for logging and monitoring:

```typescript
pecans.on("beforeDownload", (download) => {
  // Log or process download
});
```

## File Naming & Structure

- TypeScript files use `.ts` extension
- Test files mirror source structure in `/test/`
- Configuration files are in root directory
- Built output goes to `/dist/` (ESM only)

## Dependencies Management

- Core runtime dependencies in `dependencies`
- Development tools in `devDependencies`
- Keep dependencies minimal and up-to-date
- Use exact versions for better reproducibility

## Performance Considerations

- **Built-in caching**: Backend class implements stale-while-revalidate caching
- Cache GitHub API responses with configurable TTL (default: 2 hours)
- Handle rate limiting for GitHub API calls gracefully
- Optimize file serving for large Electron app downloads
- Use appropriate Express middleware for compression
- Manual cache refresh via webhook endpoints for immediate updates

## Security Guidelines

- Validate all user inputs, especially version strings
- Sanitize file paths to prevent directory traversal
- Use HTTPS for production deployments
- Regularly update dependencies for security patches

## Deployment Notes

- Designed for containerized deployment (see Dockerfile)
- Can be deployed as Express middleware in larger applications
- Documentation available at https://pecans.darrelopry.com/

## Debugging & Troubleshooting

- Use `npm run dev` for development with nodemon
- Check GitHub API rate limits and authentication
- Verify release asset availability and naming conventions
- Test Squirrel update endpoints with appropriate user agents

When making changes to this project, always consider the impact on existing Electron app deployments and maintain backward compatibility with the API endpoints.
