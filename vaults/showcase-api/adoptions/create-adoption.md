---
title: File an adoption
description: Put a pet on hold for an applicant while staff review the request.
tags: [adoptions]
operation:
  protocol: rest
  method: POST
  path: /adoptions
  auth: bearer
  requestBody:
    schema:
      type: object
      required: [petId, applicant]
      properties:
        petId:
          type: string
          example: p_42
        applicant:
          type: object
          required: [name, email]
          properties:
            name:
              type: string
              example: Ada Okafor
            email:
              type: string
              format: email
            hasGarden:
              type: boolean
  responses:
    201:
      description: The adoption, `pending`. The pet is now `on_hold`.
      schema:
        $ref: Adoption
    409:
      description: The pet isn't `available`.
      schema:
        $ref: Error
---

Staff decide within five working days. Poll [[get-adoption|Retrieve an adoption]] for the result.
