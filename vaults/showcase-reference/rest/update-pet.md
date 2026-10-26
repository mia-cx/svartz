---
title: Update a pet
description: Change some fields of a pet's record.
operation:
  protocol: rest
  method: PATCH
  path: /pets/{petId}
  auth: bearer
  parameters:
    - { name: petId, in: path, type: string, example: p_42 }
  requestBody:
    contentType: application/merge-patch+json
    schema:
      type: object
      properties:
        status: { type: string, enum: [available, on_hold, adopted] }
        breed: { type: [string, "null"] }
    example: { status: on_hold }
  responses:
    200: { description: The updated pet., schema: { $ref: Pet } }
---
