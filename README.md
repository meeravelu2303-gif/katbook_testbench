# katbook_testbench

Production-grade Playwright + TypeScript API test bench for the Katbook API. See [CLAUDE.md](CLAUDE.md) for project rules and [docs/TEST_STRATEGY.md](docs/TEST_STRATEGY.md) for the endpoint inventory, domain mapping, and phased rollout plan.

## Quick start

```bash
npm install
cp .env.example .env   # fill in credentials as they become available; blank ones just skip those tests
npm test                # runs against TEST_ENV=dev (192.168.1.74:2504)
npm run report           # open the last HTML report
```

## Status

- Framework scaffolding, config, fixtures, base API client, factories, and the Bugzilla defect-filing integration (ported from `kpost-testbench_v2`, currently disabled — no `BUGZILLA_URL`/`BUGZILLA_API_KEY` set) are in place.
- One proven domain (`src/tests/user/login.spec.ts`) exercises auth end-to-end against the real dev host.
- Remaining ~21 domains from the test strategy doc are implemented incrementally, phased Auth → Core Entities → Edge Cases.
