---
title: Find pets
description: Search adoptable pets by species and status.
source: https://github.com/harbour-example/mcp/blob/main/src/tools/find-pets.ts#L9
operation:
  protocol: mcp
  kind: tool
  name: find_pets
  endpoint: https://mcp.harbour.example/mcp
  auth: { scheme: bearer, description: A dashboard token with `pets:read`. }
  annotations: { readOnlyHint: true, openWorldHint: false }
  inputSchema:
    type: object
    properties:
      species: { type: string, enum: [dog, cat, rabbit, bird, other] }
      status: { type: string, enum: [available, on_hold, adopted], default: available }
      limit: { type: integer, minimum: 1, maximum: 50, default: 10 }
  outputSchema:
    type: object
    required: [pets]
    properties:
      pets: { type: array, items: { $ref: Pet } }
  examples:
    - title: Available dogs
      arguments: { species: dog, limit: 1 }
      result:
        structuredContent:
          pets: [{ id: p_42, name: Biscuit, species: dog, status: available, intakeDate: "2026-09-01" }]
    - title: Limit too high
      arguments: { limit: 500 }
      result:
        isError: true
        content: [{ type: text, text: "limit must be at most 50." }]
    - title: Misspelled tool name
      arguments: { species: dog }
      error: { code: -32602, message: "Unknown tool: find_pet" }
---

Results come newest first. Pass the same filters as [List pets](../rest/list-pets.md).
