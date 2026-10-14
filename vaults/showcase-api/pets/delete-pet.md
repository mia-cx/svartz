---
title: Delete a pet
description: Remove a record entered by mistake. Adopted pets can't be deleted.
tags: [pets]
operation:
  protocol: rest
  method: DELETE
  path: /pets/{petId}
  auth: bearer
  parameters:
    - name: petId
      in: path
      type: string
      example: p_42
  responses:
    204:
      description: Deleted.
    409:
      description: The pet is adopted or on hold.
      schema:
        $ref: Error
---
