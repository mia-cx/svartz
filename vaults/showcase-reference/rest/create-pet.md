---
title: Register a pet
description: Add a pet at intake. It starts as available.
operation:
  protocol: rest
  method: POST
  path: /pets
  auth: bearer
  parameters:
    - { name: Idempotency-Key, in: header, type: string, description: Retrying with the same key returns the first result. }
  requestBody:
    schema:
      type: object
      required: [name, species]
      properties:
        name: { type: string, minLength: 1, maxLength: 60, example: Biscuit }
        species: { type: string, enum: [dog, cat, rabbit, bird, other] }
        breed: { type: string }
  responses:
    201: { description: Registered., schema: { $ref: Pet } }
    422: { description: A field failed validation., schema: { $ref: Error } }
---
