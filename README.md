# HireLoop Multi-Tenant Job Platform

HireLoop is a complete browser-based multi-tenant job platform demo. Each tenant has isolated jobs, candidates, applications, pipeline stages, analytics, and activity history.

## Features

- Tenant switcher with isolated company workspaces
- Admin, recruiter, and candidate role modes
- Job creation and job status management
- Candidate job applications
- Hiring pipeline with stages: Applied, Screening, Interview, Offer, Hired
- Real-time activity feed using `BroadcastChannel`
- Local persistence with `localStorage`
- Responsive dashboard, job board, application pipeline, and talent pool
- No external dependencies

## How To Run

Open this file in your browser:

```text
C:\Users\DELL\Documents\CPU Scheduling\multi-tenant-job-platform\index.html
```

To see real-time behavior, open the same file in two browser tabs. Create a job, apply to a job, or move a candidate in one tab; the other tab updates automatically.

## Project Structure

```text
multi-tenant-job-platform/
├── index.html
├── README.md
└── src/
    ├── app.js
    └── styles.css
```

## How The Multi-Tenant Model Works

The app stores one top-level `tenants` array. Every tenant owns its own jobs, candidates, applications, and activity feed. All UI queries read from the selected tenant only, which demonstrates tenant isolation.

In production, this same idea should be enforced on the server and database, not only in the browser.

## How To Scale This Project

1. Move data from `localStorage` to a backend API.
2. Add authentication and map each user to one or more tenant memberships.
3. Add tenant-aware authorization on every API request.
4. Use PostgreSQL with `tenant_id` on all tenant-owned tables, or use separate schemas/databases for high-isolation enterprise tenants.
5. Add row-level security so one tenant can never read another tenant's data.
6. Replace `BroadcastChannel` with WebSockets or Server-Sent Events for real-time updates across users and devices.
7. Add background workers for emails, resume parsing, scoring, reminders, and webhook delivery.
8. Add caching for public job boards and frequently read dashboard metrics.
9. Add audit logs for compliance-sensitive hiring actions.
10. Split heavy services later: search, notifications, analytics, and resume processing.

## Suggested Production Architecture

```text
Browser / Mobile
      |
Load Balancer / CDN
      |
Frontend App + API Gateway
      |
Auth Service ---- Tenant Membership Service
      |
Job API ---- Application API ---- Candidate API
      |
PostgreSQL + Redis + Object Storage
      |
Workers: email, resume parsing, analytics, webhooks
      |
WebSocket Gateway for live updates
```

## Database Sketch

```sql
tenants(id, name, plan, created_at)
users(id, name, email, created_at)
memberships(id, tenant_id, user_id, role)
jobs(id, tenant_id, title, department, location, status, created_by, created_at)
candidates(id, tenant_id, name, email, location, resume_url, created_at)
applications(id, tenant_id, job_id, candidate_id, stage, applied_at)
activity_events(id, tenant_id, actor_id, event_type, body, created_at)
```

Every tenant-owned table includes `tenant_id`, and every query must filter by it.
