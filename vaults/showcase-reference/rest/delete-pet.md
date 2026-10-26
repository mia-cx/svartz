---
title: Remove a pet
description: Delete a pet registered by mistake.
operation:
  protocol: rest
  method: DELETE
  path: /pets/{petId}
  auth: bearer
  parameters:
    - { name: petId, in: path, type: string, example: p_42 }
  responses:
    204: { description: Removed. }
    409: { description: The pet has an open adoption., schema: { $ref: Error } }
---
