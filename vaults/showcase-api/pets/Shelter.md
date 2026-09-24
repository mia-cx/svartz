---
title: Shelter
description: A shelter location in the network.
tags: [pets]
model:
  name: Shelter
  schema:
    type: object
    required: [id, name]
    properties:
      id:
        type: string
        example: sh_harbourside
      name:
        type: string
        example: Harbourside
      city:
        type: string
        example: Portsmouth
---
