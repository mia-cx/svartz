---
title: pet
description: Fetch one pet with its shelter in a single request.
tags: [graphql]
operation:
  protocol: graphql
  kind: query
  name: pet
  args:
    - name: id
      type: ID!
      required: true
      description: The pet's id.
  returns: Pet
  example:
    query: |
      query Pet($id: ID!) {
        pet(id: $id) {
          name
          species
          status
          shelter { name city }
        }
      }
    variables:
      id: p_42
    response:
      data:
        pet:
          name: Biscuit
          species: dog
          status: available
          shelter:
            name: Harbourside
            city: Portsmouth
---

The GraphQL endpoint takes the same bearer token as REST. Fields match the [[Pet]] object.
