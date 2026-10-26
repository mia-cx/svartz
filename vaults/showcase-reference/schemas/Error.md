---
title: Error
description: What a failed HTTP request returns.
model:
  name: Error
  schema:
    type: object
    required: [code, message]
    properties:
      code: { type: string, enum: [not_found, invalid_request, conflict], example: not_found }
      message: { type: string, example: No pet with this id. }
---
