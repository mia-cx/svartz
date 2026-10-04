---
title: Authentication
description: Every request carries a bearer token from the shelter dashboard.
tags: [basics]
---

Create a token under **Settings → API tokens** in the shelter dashboard. Send it in the `Authorization` header:

```http
Authorization: Bearer hs_live_4f9c2e…
```

Tokens have one of two scopes:

| Scope | Can |
| --- | --- |
| `read` | List and fetch pets and adoptions |
| `write` | Everything in `read`, plus create, update, and delete |

> [!warning] Keep tokens server-side
> A token carries your shelter's full scope. Never ship one in a browser bundle or a mobile app.

Listing pets needs no token. Every other operation returns [[errors|`401 unauthorized`]] without one.
