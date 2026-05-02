<!--
  Describes the overall architecture of the Incident Management System. This
  document highlights the key components, data flows and design patterns
  implemented in the solution. It should be read alongside the README for
  implementation details and setup instructions.
-->

# Architecture Overview

The Incident Management System (IMS) is designed as a distributed set of
services backed by purpose‑built data stores. Signals (error or latency
events) are ingested at high volume and processed asynchronously to create
*work items*. Each work item represents an ongoing incident tied to a
particular component (e.g., database cluster, cache node, API host).

## Component Flow

1. **Signal Ingestion**: Clients send signals via HTTP or WebSocket. A
   Fastify server accepts these requests and enqueues them immediately on a
   BullMQ queue. A rate limiter protects this endpoint and signals are never
   persisted synchronously, ensuring the system can sustain bursts of
   10,000 events per second.

2. **Backpressure Handling**: The BullMQ queue (backed by Redis) buffers
   incoming jobs. If the database becomes slow the queue grows but the
   producer continues to respond quickly. Workers consume from the queue
   at a controlled rate, providing natural backpressure. Retry logic on
   the queue prevents transient failures from dropping events.

3. **Debounce Worker**: A dedicated worker applies a 10‑second debounce
   per component ID using Redis. When a new signal arrives:
   - If no debounce key exists, a new work item is inserted into
     PostgreSQL. The raw signal is stored in MongoDB and an alert is
     dispatched via the appropriate strategy (P0 for RDBMS, P1 for API,
     P2 for cache). The worker publishes the new work item on a Redis
     pub/sub channel so that connected clients receive real‑time updates.
   - If a debounce key exists, the signal is simply appended to the
     existing work item in MongoDB.

4. **Data Persistence**: The system uses **MongoDB** to retain raw signal
   payloads (audit log), **PostgreSQL** for structured work items (source
   of truth) and **Redis** as a cache for hot‑path dashboard state. A
   TimescaleDB extension on PostgreSQL enables timeseries aggregations,
   exposing endpoints such as `/metrics/incidents-per-hour` to summarise
   incident counts by time bucket.

5. **Workflow Engine**: A finite state machine enforces valid state
   transitions (`OPEN → INVESTIGATING → RESOLVED → CLOSED`). Closing an
   incident requires a Root Cause Analysis (RCA) containing a
   **root cause description**, a **category** (e.g., database failure,
   cache failure), a **fix** applied and a **prevention** plan. Attempting to
   close without supplying all these fields results in a 400 error. The
   alerting strategy pattern maps component types to P0/P1/P2 alert levels.

6. **Front‑end Dashboard**: The React/Vite frontend connects via WebSocket
   to the `/live-feed` endpoint to receive new work items in real time. It
   lists active incidents by severity, provides a detail view of raw
   signals and exposes buttons to transition incidents from **OPEN →
   INVESTIGATING** and **INVESTIGATING → RESOLVED**. A detailed RCA form
   appears when an incident is `RESOLVED` and must be completed to
   transition to `CLOSED`. The dashboard also displays computed MTTR for
   closed incidents, a coloured severity badge and a timeseries metrics
   panel showing incidents per hour.

## Diagram

The following diagram illustrates the high‑level architecture and data
flow. Arrows represent the direction of data movement between components.

![IMS Architecture](architecture_diagram.png)

## Backpressure Flow Diagram

The sequence below summarises how a burst of signals flows through the system and
where backpressure is applied. A Mermaid diagram is provided for clarity.

```mermaid
graph TD
  Subgraph_Clients[Clients send signals]
  Signals --> RateLimiter[Rate Limiter]
  RateLimiter --> Queue[Redis/BullMQ Queue]
  Queue --> Worker[Debounce Worker]
  Worker --> Postgres[(PostgreSQL)]
  Worker --> Mongo[(MongoDB)]
  Worker --> Alerting[Alert Strategy]
  Worker -- Publish --> WebSocket(WebSocket clients)
  Alerting --> External[External notification (P0/P1/P2)]
```

* **Rate Limiter**: Protects the ingestion API by capping requests per IP. Exceeding
  the limit returns a 429 error without enqueueing.
* **Queue**: Buffers incoming signals. If downstream services slow down the queue
  grows, but producers remain unaffected.
* **Debounce Worker**: Consumes jobs at a steady rate, creates or updates work
  items based on a 10‑second window, dispatches alerts and publishes
  notifications over WebSocket. Failed jobs are routed to a **dead‑letter
  queue** for inspection and replay.