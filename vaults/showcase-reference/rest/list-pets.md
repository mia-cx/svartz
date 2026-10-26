---
title: List pets
description: Adoptable pets, newest first, a page at a time.
source: https://github.com/harbour-example/api/blob/main/src/routes/pets.ts#L12
operation:
  protocol: rest
  method: GET
  path: /pets
  auth: bearer
  parameters:
    - { name: status, in: query, schema: { type: string, enum: [available, on_hold, adopted], default: available } }
    - { name: species, in: query, schema: { type: string, enum: [dog, cat, rabbit, bird, other] } }
    - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 100, default: 20 }, description: Pets per page. }
    - { name: cursor, in: query, type: string, description: The `next_cursor` from the previous page. }
  responses:
    200:
      description: A page of pets.
      schema:
        type: object
        required: [data]
        properties:
          data: { type: array, items: { $ref: Pet } }
          next_cursor: { type: [string, "null"], description: Pass as `cursor` for the next page. }
---
