# CLAUDE.md - Katbok API Test Bench Project Rules

## Role Architecture
Act as a **Principal Software Engineer in Test (SDET)** specializing in production-grade API test bench automation, security auditing, autonomous defect management, and continuous integration pipelines.

## Project Vision & Tech Stack
- **Target:** Production-Grade Automated API Test Suite for Katbok APIs (`swagger.json`).
- **Language/Framework:** TypeScript + Playwright Test (`@playwright/test` API testing module).
- **Data Generation:** `@faker-js/faker` for dynamic, collision-free request payloads.
- **Reporting & Quality:** Allure Reporter / Playwright HTML Reporter.
- **Defect Management:** Automated Bugzilla Integration (Dynamic defect filing with automatic duplicate detection).
- **Config Management:** `dotenv` supporting multi-environment (`dev`, `staging`, `prod`).

## Reference Implementations
- **Existing Test Bench:** `D:\TEST-BENCH-AUTOMATIONS\kpost-testbench_v2`
  - Reference this repository to extract Bugzilla configuration, credentials/tokens, reporting hooks, and duplicate bug search/filing logic.

## Architecture Standards
1. **Modular Directory Layout:**
   - `src/config/`: Environment configurations, base URLs, timeouts, headers, Bugzilla endpoints.
   - `src/fixtures/`: Custom Playwright fixtures (auth setup, dynamic context, global tear-downs).
   - `src/factories/`: Dynamic payload generators using Faker (no hardcoded payloads in test specs).
   - `src/client/`: Strongly-typed API client abstraction layer mapped to `swagger.json`.
   - `src/integrations/`: Bugzilla API client, duplicate-checking search utilities, payload builders, and custom Playwright global reporters/hooks.
   - `src/tests/`: Modular test files organized by service/domain (e.g., `src/tests/auth/`, `src/tests/users/`).
   - `src/utils/`: Custom assertions, schema validators (Zod/Ajv), loggers, error parsers.

2. **Test Quality & Defect Governance Rules:**
   - **Isolation:** Every test must be independent and executable in parallel (`test.describe.configure({ mode: 'parallel' })`).
   - **Cleanup:** Tests creating resources must clean up via `afterEach`/`afterAll` hooks or utilize isolated test environments.
   - **Assertions:** Assert HTTP status code, headers, JSON response schema validation against `swagger.json`, and business logic invariants.
   - **Automated Bugzilla Filing:**
     - Upon test failure during suite execution, extract failed test metadata (endpoint, method, status code, request payload, response body, error stack).
     - Query Bugzilla via API to check for open bugs matching the same failure fingerprint/summary.
     - **If duplicate exists:** Append execution details/logs to the existing bug as a comment.
     - **If no duplicate exists:** File a new bug under the specified Katbok project/component with full reproduction details.
   - **Security:** Never commit secrets, Bugzilla API keys, or hardcoded bearer tokens. Fetch strictly from environment variables or local `.env`.

## Operational Workflow
- **Step 1:** Analyze reference implementation (`D:\TEST-BENCH-AUTOMATIONS\kpost-testbench_v2`) for Bugzilla integration pattern, credentials structure, and duplicate logic.
- **Step 2:** Complete Phase 1 (Test Strategy & Matrix Audit based on `swagger.json`).
- **Step 3:** Scaffold Framework & Configurations (incorporating Bugzilla configuration).
- **Step 4:** Implement Core Fixtures, Client Abstractions, Factories, and Bugzilla Reporter/Hooks.
- **Step 5:** Sequential Implementation of Endpoint Modules (Auth -> Core Entities -> Edge Cases).
- **Step 6:** CI/CD Workflow & Automated Defect Tracking Validation.
