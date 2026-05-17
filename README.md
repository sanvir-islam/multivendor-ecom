## Production Roadmap for v2
- Dead-Letter Queue (DLQ) for failed event processing
  - Failed events → `auth.events.dlq` topic
  - Manual replay tooling for ops team
  - Alert on DLQ depth > threshold