---
title: Download a medical record attachment
description: One file attached to a pet's medical record.
operation:
  protocol: rest
  method: GET
  path: /shelters/{shelterId}/pets/{petId}/medical-records/{recordId}/attachments/{attachmentId}
  auth: bearer
  parameters:
    - { name: shelterId, in: path, type: string, example: s_7 }
    - { name: petId, in: path, type: string, example: p_42 }
    - { name: recordId, in: path, type: string, example: mr_3 }
    - { name: attachmentId, in: path, type: string, example: att_1 }
  responses:
    200: { description: The file. }
---
