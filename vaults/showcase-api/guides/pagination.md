---
title: Pagination
description: List endpoints return pages of up to 100 items with a cursor.
tags: [basics]
---

List endpoints take `limit` (1–100, default 20) and `cursor`. The response carries `nextCursor` until the last page, where it's `null`.

```ts
let cursor: string | null = null;
do {
  const page = await harbour.pets.list({ limit: 100, cursor });
  page.data.forEach(index);
  cursor = page.nextCursor;
} while (cursor);
```
