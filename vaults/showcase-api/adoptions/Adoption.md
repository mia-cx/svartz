---
title: Adoption
description: A request to adopt one pet, and its decision.
tags: [adoptions]
model:
  name: Adoption
  schema:
    type: object
    required: [id, petId, status, applicant]
    properties:
      id:
        type: string
        example: ad_901
      petId:
        type: string
        example: p_42
      status:
        type: string
        enum: [pending, approved, declined, withdrawn]
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
      decidedAt:
        type: string
        format: date-time
        nullable: true
---
