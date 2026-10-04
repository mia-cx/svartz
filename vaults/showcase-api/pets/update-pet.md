---
title: Update a pet
description: Change any field except `status`, which follows adoptions.
tags: [pets]
operation:
  protocol: rest
  method: PATCH
  path: /pets/{petId}
  auth: bearer
  parameters:
    - name: petId
      in: path
      type: string
      example: p_42
  requestBody:
    schema:
      type: object
      properties:
        name:
          type: string
        breed:
          type: string
          nullable: true
        ageMonths:
          type: integer
    example:
      breed: Border collie
  responses:
    200:
      description: The updated pet.
      schema:
        $ref: Pet
    404:
      description: No pet with this id.
      schema:
        $ref: Error
---
