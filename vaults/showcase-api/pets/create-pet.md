---
title: Create a pet
description: Record a new intake. The pet starts as `available`.
tags: [pets]
operation:
  protocol: rest
  method: POST
  path: /pets
  auth: bearer
  parameters:
    - name: Idempotency-Key
      in: header
      type: string
      description: Retry safely. The same key within 24 hours returns the first result.
      example: 7d3c1e2a
  requestBody:
    schema:
      type: object
      required: [name, species]
      properties:
        name:
          type: string
          example: Biscuit
        species:
          type: string
          enum: [dog, cat, rabbit, bird, other]
        breed:
          type: string
          example: Border collie cross
        ageMonths:
          type: integer
          example: 30
  responses:
    201:
      description: The new pet.
      schema:
        $ref: Pet
    400:
      description: A required field is missing.
      schema:
        $ref: Error
    401:
      description: The token is missing or read-only.
      schema:
        $ref: Error
---
