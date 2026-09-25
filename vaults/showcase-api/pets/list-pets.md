---
title: List pets
description: Adoptable pets across the network, newest intake first.
tags: [pets]
operation:
  protocol: rest
  method: GET
  path: /pets
  auth: none
  parameters:
    - name: status
      in: query
      type: string
      description: Filter by status. Defaults to `available`.
      example: available
    - name: species
      in: query
      type: string
      description: One of `dog`, `cat`, `rabbit`, `bird`, `other`.
    - name: limit
      in: query
      type: integer
      description: Page size, 1–100. See [[pagination|Pagination]].
    - name: cursor
      in: query
      type: string
      description: The `nextCursor` from the previous page.
  responses:
    200:
      description: A page of pets.
      schema:
        type: object
        properties:
          data:
            type: array
            items:
              $ref: Pet
          nextCursor:
            type: string
            nullable: true
            example: null
    400:
      description: An unknown `status` or `species`.
      schema:
        $ref: Error
---
