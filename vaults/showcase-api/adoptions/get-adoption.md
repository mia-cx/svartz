---
title: Retrieve an adoption
description: One adoption request and its current decision.
tags: [adoptions]
operation:
  protocol: rest
  method: GET
  path: /adoptions/{adoptionId}
  auth: bearer
  parameters:
    - name: adoptionId
      in: path
      type: string
      example: ad_901
  responses:
    200:
      description: The adoption.
      schema:
        $ref: Adoption
    404:
      description: No adoption with this id.
      schema:
        $ref: Error
---
