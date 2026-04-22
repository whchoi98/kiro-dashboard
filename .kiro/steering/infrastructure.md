# Infrastructure Rules

- CDK stacks are in `infra/` with separate package.json — do not mix with app dependencies
- 4-stack architecture: NetworkStack → SecurityStack → EcsStack → CdnStack
- Default CDK region: ap-northeast-2, Athena/S3 region: us-east-1
- ECS Fargate: ARM64, 512 CPU / 1024 MB, auto-scale 1-4 at 70% CPU
- Docker: multi-stage build with node:20-alpine, `output: 'standalone'` in next.config.js
- Always set `HOSTNAME=0.0.0.0` in ECS container environment for Next.js standalone
