---
title: Replace a pet
description: Overwrite every field of a pet's record.
operation:
  protocol: rest
  method: PUT
  path: /pets/{petId}
  auth: bearer
  parameters:
    - { name: petId, in: path, type: string, example: p_42 }
  requestBody: { schema: { $ref: Pet } }
  responses:
    200: { description: The replaced pet., schema: { $ref: Pet } }
---
