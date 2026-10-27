---
title: Notification
description: How a shelter hears about new adoption requests.
model:
  name: Notification
  schema:
    oneOf:
      - type: object
        required: [kind]
        properties:
          kind: { type: string, const: none }
      - type: object
        required: [kind, url, status, pausedReason, attempts]
        properties:
          kind: { type: string, const: webhook }
          url: { type: string, format: uri, example: "https://shelter.example/hooks/harbour" }
          status: { type: string, enum: [active, paused] }
          pausedReason: { type: [string, "null"], description: "Why delivery stopped, while `status` is `paused`." }
          attempts:
            type: array
            maxItems: 20
            description: The latest deliveries, newest first.
            items:
              oneOf:
                - type: object
                  required: [outcome, at]
                  properties:
                    outcome: { type: string, const: delivered }
                    at: { type: string, format: date-time }
                - type: object
                  required: [outcome, at, httpStatus]
                  properties:
                    outcome: { type: string, const: failed }
                    at: { type: string, format: date-time }
                    httpStatus: { type: [integer, "null"], description: "`null` when the shelter's server didn't answer." }
    example: { kind: none }
---

A shelter either turns notifications off or gives Harbour a webhook.
