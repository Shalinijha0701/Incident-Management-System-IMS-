<!--
  This file records the original assignment prompt and planning notes for the
  Incident Management System (IMS) challenge. The information contained
  here serves as a reference for the engineering team as well as a
  deliverable for evaluators who wish to verify that all requirements
  have been addressed in the submitted solution.
-->

# Assignment Prompt

The objective is to build a resilient **Incident Management System (IMS)** to
monitor a distributed stack (APIs, MCP hosts, distributed caches, RDBMS and
NoSQL stores) and mediate failures through a structured workflow. High volumes
of signals must be ingested, debounced and stored while preserving raw
payloads for auditing. Incidents progress through a lifecycle of
`OPEN → INVESTIGATING → RESOLVED → CLOSED`, and a root cause analysis (RCA)
is mandatory for closure. The following core requirements were extracted from
the provided brief:

- **High‑throughput ingestion**: Accept up to 10,000 signals per second
  without blocking on persistence. Backpressure must not cause the system to
  crash even if the database slows down.
- **Debounce logic**: Within a 10‑second window only one work item is
  created per component ID, but all raw signals are retained and linked in
  the NoSQL store.
- **Data separation**: Raw signals (audit log) are stored in MongoDB,
  structured work items (source of truth) in PostgreSQL and hot‑path state
  in Redis. A timeseries extension (TimescaleDB) supports aggregations.
- **Workflow engine**: Implement the state machine and alerting patterns to
  enforce transitions and dispatch component‑specific alerts (P0/P1/P2).
- **Observability**: Expose a `/health` endpoint and print throughput
  metrics (signals per second) to the console every 5 seconds.
- **Frontend**: Provide a live dashboard (React/Vite) with a real‑time feed,
  incident detail view and RCA submission form.
- **Testing & documentation**: Include unit tests for RCA validation,
  comprehensive README instructions, architecture diagram and seeding scripts.

This solution structures the project into `/backend` and `/frontend` folders,
with additional `/docs` and `/scripts` for documentation and tooling.