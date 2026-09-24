---
title: Error
description: The body of every failed request.
tags: [basics]
model:
  name: Error
  schema:
    type: object
    required: [code, message, requestId]
    properties:
      code:
        type: string
        description: Stable and machine-readable. Match on this, not on `message`.
        example: pet_not_found
      message:
        type: string
        example: No pet with id p_42.
      requestId:
        type: string
        example: req_8d1f0a
---
