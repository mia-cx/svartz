---
title: pet
description: One pet with its shelter, in a single request.
operation:
  protocol: graphql
  kind: query
  name: pet
  auth: bearer
  args:
    - { name: id, type: ID!, description: The pet's id. }
    - { name: includeAdopted, type: Boolean, default: false, description: Find a pet even after adoption. }
  returns: Pet
  example:
    query: |
      query Pet($id: ID!) {
        pet(id: $id) { name species status }
      }
    variables: { id: p_42 }
    response: { data: { pet: { name: Biscuit, species: dog, status: available } } }
---
