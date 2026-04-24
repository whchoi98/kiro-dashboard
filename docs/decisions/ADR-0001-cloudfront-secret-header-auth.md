# ADR-0001: CloudFront + Custom Header Secret for ALB Access Control

**Date**: 2026-04-22
**Status**: Accepted
**Deciders**: WooHyung Choi

---

## Context

The kiro-dashboard runs on ECS Fargate behind an ALB. We need to prevent direct ALB access while allowing CloudFront to proxy requests. Options include AWS WAF, VPC-only ALB, or a shared secret header.

AWS WAF adds ~$5/month base + per-request costs. A VPC-only ALB requires PrivateLink or VPN for CloudFront connectivity, adding complexity. A custom header secret is free and simple: CloudFront injects it, and the ALB listener rule rejects requests without it.

## Decision

Use a custom HTTP header (`X-Custom-Secret`) injected by CloudFront into origin requests. The ALB listener rule forwards only requests containing the correct header value; all other requests receive HTTP 403.

The secret is generated via `crypto.randomUUID()` at CDK synth time, making it non-deterministic and non-derivable from public information.

## Consequences

### Positive
- Zero additional AWS cost (no WAF charges)
- Simple to implement and understand
- ALB default action returns 403, blocking all direct access attempts

### Negative
- Security depends on header secrecy — anyone with the value can bypass CloudFront
- No rate limiting, IP blocking, or bot protection (WAF provides these)
- Header value is embedded in CloudFormation template (readable by IAM users with `cloudformation:DescribeStacks`)

### Neutral
- CloudFront-to-ALB traffic uses HTTP (not HTTPS) — acceptable within AWS network but not end-to-end encrypted

## Alternatives Considered

| Alternative | Why rejected |
|-------------|-------------|
| AWS WAF on CloudFront | Added monthly cost (~$5+ base) for a low-traffic internal dashboard |
| VPC-only ALB + PrivateLink | Significant networking complexity; CloudFront requires public origin or PrivateLink |
| Security group restrict to CloudFront IPs | CloudFront IP ranges change; requires Lambda to auto-update SG rules |
