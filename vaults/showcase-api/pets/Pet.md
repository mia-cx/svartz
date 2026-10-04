---
title: Pet
description: An animal in the shelter's care, from intake to adoption.
tags: [pets]
model:
  name: Pet
  schema:
    type: object
    required: [id, name, species, status, intakeDate]
    properties:
      id:
        type: string
        description: Unique identifier, prefixed `p_`.
        example: p_42
      name:
        type: string
        example: Biscuit
      species:
        type: string
        enum: [dog, cat, rabbit, bird, other]
      breed:
        type: string
        nullable: true
        example: Border collie cross
      ageMonths:
        type: integer
        description: Estimated age at intake plus time in care.
        example: 30
      status:
        type: string
        enum: [available, on_hold, adopted]
        description: "`on_hold` while an adoption is under review."
      intakeDate:
        type: string
        format: date
      photos:
        type: array
        items:
          type: string
          format: uri
          example: https://cdn.harbour.example/p_42/1.jpg
      shelter:
        $ref: Shelter
---

Pets move from `available` to `on_hold` when an [[Adoption]] is filed, then to `adopted` or back to `available` when it's decided.
