---
title: Check a pet exists
description: The headers of a pet's record, without the body.
operation:
  protocol: rest
  method: HEAD
  path: /pets/{petId}
  auth: bearer
  parameters:
    - { name: petId, in: path, type: string, example: p_42 }
  responses:
    200: { description: The pet exists. }
    404: { description: No pet with this id. }
---
