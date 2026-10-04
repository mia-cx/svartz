---
title: Retrieve a pet
description: One pet by id, including its photos.
tags: [pets]
operation:
  protocol: rest
  method: GET
  path: /pets/{petId}
  auth: bearer
  parameters:
    - name: petId
      in: path
      type: string
      example: p_42
  responses:
    200:
      description: The pet.
      schema:
        $ref: Pet
    404:
      description: No pet with this id.
      schema:
        $ref: Error
---
