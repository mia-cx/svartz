---
title: Errors
description: One error shape for every failed request.
tags: [basics]
---

A failed request returns a 4xx or 5xx status and an [[error-object|Error]] object:

```json
{
  "code": "pet_not_found",
  "message": "No pet with id p_42.",
  "requestId": "req_8d1f0a"
}
```

| Status | Meaning |
| --- | --- |
| `400` | The request body or a parameter is invalid. `message` names the field. |
| `401` | The token is missing or revoked. |
| `404` | The resource doesn't exist, or belongs to another shelter. |
| `409` | The pet is already adopted or on hold. |
| `429` | Too many requests. Wait for the `Retry-After` seconds. |

Quote the `requestId` when you contact support.
