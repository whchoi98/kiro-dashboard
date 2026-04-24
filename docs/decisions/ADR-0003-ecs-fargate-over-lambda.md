# ADR-0003: ECS Fargate Over Lambda for Next.js Hosting

**Date**: 2026-04-22
**Status**: Accepted
**Deciders**: WooHyung Choi

---

## Context

The kiro-dashboard is a Next.js 14 application using App Router with Server Components and Bedrock streaming responses (SSE). We need a compute platform on AWS to host it.

Key requirements:
- Server-side rendering with React Server Components
- Long-running SSE connections for AI analysis (Bedrock streaming can take 30-60 seconds)
- Persistent WebSocket-like connections for real-time data
- Container-based deployment for reproducible builds

## Decision

Deploy on ECS Fargate with ARM64 architecture (Graviton) for cost efficiency. The container runs the Next.js production server directly (`next start`) on port 3000, behind an ALB and CloudFront.

Configuration: 512 CPU units (0.5 vCPU), 1024 MiB memory, auto-scaling 1-4 tasks based on CPU utilization (70% target).

## Consequences

### Positive
- No cold start latency — container is always running
- No timeout limits — Bedrock streaming can run as long as needed (Lambda has 15-min max)
- Full Node.js runtime — no Lambda adapter needed for Next.js App Router
- ARM64/Graviton provides ~20% better price-performance vs x86
- Auto-scaling handles traffic spikes while maintaining minimum 1 task

### Negative
- Always-on cost even during zero traffic (~$15-20/month for 0.5 vCPU Fargate)
- More infrastructure to manage vs serverless (ECS cluster, task definitions, ALB)
- Deployment requires Docker build + ECR push + ECS service update (vs simple Lambda zip)

### Neutral
- Container image size is larger than a Lambda deployment package but acceptable for a production application

## Alternatives Considered

| Alternative | Why rejected |
|-------------|-------------|
| AWS Lambda + Lambda Web Adapter | 15-minute timeout kills long Bedrock streaming sessions; cold starts degrade UX; App Router SSR support is limited |
| Lambda@Edge / CloudFront Functions | Cannot run full Next.js server; limited to lightweight request/response transformations |
| EC2 instances | Over-provisioned for this workload; requires manual capacity management; no built-in health checks |
| AWS App Runner | Simpler but less control over networking (VPC, security groups); no custom ALB listener rules for secret header auth |
