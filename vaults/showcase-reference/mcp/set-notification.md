---
title: Set notifications
description: Turn adoption-request notifications off, or send them to a webhook.
operation:
  protocol: mcp
  kind: tool
  name: set_notification
  endpoint: https://mcp.harbour.example/mcp
  auth: { scheme: bearer, description: A dashboard token with `shelter:manage`. }
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true }
  inputSchema:
    type: object
    required: [webhook_url]
    properties:
      webhook_url:
        description: "The webhook's https address, or `null` to turn notifications off."
        anyOf:
          - { type: string, format: uri, pattern: "^https://", maxLength: 2048 }
          - { type: "null" }
  outputSchema: { $ref: Notification }
  examples:
    - title: Turn notifications off
      arguments: { webhook_url: null }
      result: { structuredContent: { kind: none } }
---

Harbour sends a test delivery when a webhook is set, and the tool fails if it doesn't arrive.
