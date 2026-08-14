# Nx Angular Repository

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

✨ A repository showcasing key [Nx](https://nx.dev) features for Angular monorepos ✨
🚀 If you haven't connected to Nx Cloud yet, [complete your setup here](https://cloud.nx.app/get-started). Get faster builds with remote caching, distributed task execution, and self-healing CI. [See how your workspace can benefit](#nx-cloud).
## 📦 Project Overview

This repository demonstrates a production-ready Angular monorepo with:

- **2 Applications**

  - `shop` - Angular e-commerce application with product listings and detail views
  - `api` - Backend API with Docker support serving product data

- **6 Libraries**

  - `@org/feature-products` - Product listing feature (Angular)
  - `@org/feature-product-detail` - Product detail feature (Angular)
  - `@org/data` - Data access layer for shop features
  - `@org/shared-ui` - Shared UI components
  - `@org/models` - Shared data models
  - `@org/products` - API product service library

- **E2E Testing**
  - `shop-e2e` - Playwright tests for the shop application

## 🚀 Quick Start

```bash
# Clone the repository
git clone <your-fork-url>
cd <your-repository-name>

# Install dependencies
pnpm install

# Serve the Angular shop application (this will simultaneously serve the API backend)
pnpm nx run shop:serve

# ...or you can serve the API separately
pnpm nx run api:serve

# Build all projects
pnpm nx run-many -t build

# Run tests
pnpm nx run-many -t test

# Lint all projects
pnpm nx run-many -t lint

# Run e2e tests
pnpm nx run shop-e2e:e2e

# Run tasks in parallel

pnpm nx run-many -t lint test build e2e --parallel=3

# Visualize the project graph
pnpm nx graph
```

## ⭐ Featured Nx Capabilities

This repository showcases several powerful Nx features:

### 1. 🔒 Module Boundaries

Enforces architectural constraints using tags. Each project has specific dependencies it can use:

- `scope:shared` - Can be used by all projects
- `scope:shop` - Shop-specific libraries
- `scope:api` - API-specific libraries
- `type:feature` - Feature libraries
- `type:data` - Data access libraries
- `type:ui` - UI component libraries

**Try it out:**

```bash
# See the current project graph and boundaries
pnpm nx graph

# View a specific project's details
pnpm nx show project shop --web
```

[Learn more about module boundaries →](https://nx.dev/docs/features/enforce-module-boundaries)

### 2. 🐳 Docker Integration

The API project includes Docker support with automated targets and release management:

```bash
# Build Docker image
pnpm nx run api:docker:build

# Run Docker container
pnpm nx run api:docker:run

# Release with automatic Docker image versioning
pnpm nx release
```

**Nx Release for Docker:** The repository is configured to use Nx Release for managing Docker image versioning and publishing. When running `nx release`, Docker images for the API project are automatically versioned and published based on the release configuration in `nx.json`. This integrates seamlessly with semantic versioning and changelog generation.

[Learn more about Docker integration →](https://nx.dev/docs/guides/nx-release/release-docker-images)

### 3. 🎭 Playwright E2E Testing

End-to-end testing with Playwright is pre-configured:

```bash
# Run e2e tests
pnpm nx run shop-e2e:e2e

# Run e2e tests in CI mode
pnpm nx run shop-e2e:e2e-ci
```

[Learn more about E2E testing →](https://nx.dev/docs/technologies/test-tools/playwright)

### 4. ⚡ Vitest for Unit Testing

Fast unit testing with Vite for Angular libraries:

```bash
# Test a specific library
pnpm nx run data:test

# Test all projects
pnpm nx run-many -t test
```

[Learn more about Vite testing →](https://nx.dev/docs/technologies/build-tools/vite)

### 5. 🔧 Self-Healing CI

The CI pipeline includes `nx fix-ci` which automatically identifies and suggests fixes for common issues:

```bash
# In CI, this command provides automated fixes
pnpm nx fix-ci
```

This feature helps maintain a healthy CI pipeline by automatically detecting and suggesting solutions for:

- Missing dependencies
- Incorrect task configurations
- Cache invalidation issues
- Common build failures

[Learn more about self-healing CI →](https://nx.dev/docs/features/ci-features/self-healing-ci)

## 📁 Project Structure

```
├── apps/
│   ├── app/            - Employee app (Angular, Persian/RTL)
│   ├── dashboard/      - Admin dashboard (Angular)
│   └── api/            - NestJS + Prisma backend
├── shared/
│   ├── ui/             - spartan/ui primitives (@sanpay/ui/*)
│   └── models/         - Shared domain models (@sanpay/models)
├── nx.json             - Nx configuration
├── tsconfig.base.json  - TypeScript configuration + path aliases
└── eslint.config.mjs   - ESLint with module boundary rules
```

## 🏷️ Understanding Tags

This repository uses tags to enforce module boundaries:

| Project            | Tags                         | Can Import From              |
| ------------------ | ---------------------------- | ---------------------------- |
| `shop`             | `scope:shop`                 | `scope:shop`, `scope:shared` |
| `api`              | `scope:api`                  | `scope:api`, `scope:shared`  |
| `feature-products` | `scope:shop`, `type:feature` | `scope:shop`, `scope:shared` |
| `data`             | `scope:shop`, `type:data`    | `scope:shared`               |
| `models`           | `scope:shared`, `type:data`  | Nothing (base library)       |

## 📚 Useful Commands

```bash
# Project exploration
pnpm nx graph                                    # Interactive dependency graph
pnpm nx list                                     # List installed plugins
pnpm nx show project shop --web                 # View project details

# Development
pnpm nx run shop:serve                              # Serve Angular app
pnpm nx run api:serve                               # Serve backend API
pnpm nx run shop:build                              # Build Angular app
pnpm nx run data:test                               # Test a specific library
pnpm nx run feature-products:lint                   # Lint a specific library

# Running multiple tasks
pnpm nx run-many -t build                       # Build all projects
pnpm nx run-many -t test --parallel=3          # Test in parallel
pnpm nx run-many -t lint test build            # Run multiple targets

# Affected commands (great for CI)
pnpm nx affected -t build                       # Build only affected projects
pnpm nx affected -t test                        # Test only affected projects

# Docker operations
pnpm nx run api:docker:build                        # Build Docker image
pnpm nx run api:docker:run                          # Run Docker container
```

## 🎯 Adding New Features

### Generate a new Angular application:

```bash
pnpm nx g @nx/angular:app my-app
```

### Generate a new Angular library:

```bash
pnpm nx g @nx/angular:lib my-lib
```

### Generate a new Angular component:

```bash
pnpm nx g @nx/angular:component my-component --project=my-lib
```

### Generate a new API library:

```bash
pnpm nx g @nx/node:lib my-api-lib
```

You can use `pnpm nx list` to see all available plugins and `pnpm nx list <plugin-name>` to see all generators for a specific plugin.

## Nx Cloud

Nx Cloud ensures a [fast and scalable CI](https://nx.dev/nx-cloud?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) pipeline. It includes features such as:

- [Remote caching](https://nx.dev/docs/features/ci-features/remote-cache?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Task distribution across multiple machines](https://nx.dev/docs/features/ci-features/distribute-task-execution?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Automated e2e test splitting](https://nx.dev/docs/features/ci-features/split-e2e-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Task flakiness detection and rerunning](https://nx.dev/docs/features/ci-features/flaky-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Install Nx Console

Nx Console is an editor extension that enriches your developer experience. It lets you run tasks, generate code, and improves code autocompletion in your IDE. It is available for VSCode and IntelliJ.

[Install Nx Console &raquo;](https://nx.dev/docs/getting-started/editor-setup?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## 🔗 Learn More

- [Nx Documentation](https://nx.dev/docs)
- [Angular Monorepo Tutorial](https://nx.dev/docs/getting-started/tutorials/angular-monorepo-tutorial)
- [Module Boundaries](https://nx.dev/docs/features/enforce-module-boundaries)
- [Docker Integration](https://nx.dev/docs/guides/nx-release/release-docker-images)
- [Playwright Testing](https://nx.dev/docs/technologies/test-tools/playwright)
- [Vite with Angular](https://nx.dev/docs/technologies/build-tools/vite)
- [Nx Cloud](https://nx.dev/nx-cloud)
- [Releasing Packages](https://nx.dev/docs/features/manage-releases)

## 💬 Community

Join the Nx community:

- [Discord](https://go.nx.dev/community)
- [X (Twitter)](https://twitter.com/nxdevtools)
- [LinkedIn](https://www.linkedin.com/company/nrwl)
- [YouTube](https://www.youtube.com/@nxdevtools)
- [Blog](https://nx.dev/blog)
