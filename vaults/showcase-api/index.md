---
title: Harbour Shelter API
description: List adoptable animals, file adoption requests, and follow them to a home.
---

The Harbour Shelter API is a small REST and GraphQL API for an animal shelter network. Every request goes to `https://api.harbour.example/v2` over HTTPS and returns JSON.

```sh
curl https://api.harbour.example/v2/pets?status=available \
  -H "Authorization: Bearer $HARBOUR_TOKEN"
```

New here? Read [[authentication|Authentication]] first, then [[errors|Errors]].
