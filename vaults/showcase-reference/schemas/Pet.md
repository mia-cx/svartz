---
title: Pet
description: An animal in a shelter's care, from intake to adoption.
model:
  name: Pet
  schema:
    type: object
    required: [id, name, species, status, intakeDate]
    properties:
      id: { type: string, description: "Unique id, prefixed `p_`.", example: p_42 }
      name: { type: string, example: Biscuit }
      species: { type: string, enum: [dog, cat, rabbit, bird, other] }
      breed: { type: [string, "null"], example: Border collie cross }
      status: { type: string, enum: [available, on_hold, adopted], description: "`on_hold` while an adoption is under review." }
      intakeDate: { type: string, format: date }
      photos: { type: array, items: { type: string, format: uri } }
---

HTTP, GraphQL, and MCP all return this object.
