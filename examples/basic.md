# Examples

## Example 1: Build a REST API with Auth

### Input

Build a REST API for managing user profiles. It needs JWT authentication, and users have roles (admin, viewer). Store data in PostgreSQL. Use FastAPI.

### Expected Output

1. A7-Security reviews the request: flags JWT secret storage, role-based access control requirements, and any PHI data handling considerations
2. A1-Development scaffolds the FastAPI app with models, routes, and auth middleware
3. A2-Testing writes unit tests and integration tests, runs them, confirms all pass
4. A4-Documentation generates the OpenAPI spec and README
5. A10-Quality Control runs the final checklist: security, test coverage, docs completeness

### Notes

A7 always runs first when auth or user data is involved. ESSENCE does not deliver until tests pass and A10 signs off.

---

## Example 2: Design a Responsive Dashboard UI

### Input

Design a responsive dashboard for displaying sales metrics. Use Material-UI. Must meet accessibility standards.

### Expected Output

1. A3-UX applies the DAVINCI protocol: inventories existing patterns, defines the visual direction, builds the layout
2. Produces responsive MUI components with WCAG 2.1 AA compliance (contrast ratios, keyboard navigation, ARIA labels)
3. A2-Testing writes component tests
4. A4-Documentation produces a component guide
5. ESSENCE opens the result in the browser for visual verification

### Notes

A3-UX always enforces WCAG 2.1 AA. Mobile-first layout is the default unless specified otherwise.

---

## Example 3: CI/CD Pipeline Setup

### Input

Set up a GitHub Actions CI/CD pipeline for our Node.js app. It should run tests on PR and deploy to staging on merge to main.

### Expected Output

1. A5-Infrastructure designs the pipeline: test job (PR trigger) + deploy job (main merge trigger)
2. A7-Security reviews: secrets management, environment protection rules, no hardcoded credentials
3. Produces `.github/workflows/ci.yml` and `.github/workflows/deploy.yml`
4. A4-Documentation updates the README with the pipeline overview

### Notes

A7 reviews all deployment configurations for secret exposure and environment protection rules before delivery.
