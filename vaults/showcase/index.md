---
title: Backyard Weather Station
description: Notes from building a solar-powered weather station, one sensor at a time.
tags: [project]
---

This vault documents a small weather station on a fence post: what it measures, how it's built, and what went wrong along the way. It also exercises every Markdown feature a Svartz theme has to render.

## Where to start

- [[sensors|The sensors]] and why each one made the cut
- The [[enclosure]] page covers the radiation shield and wiring
- The [[firmware]] reads the sensors and posts readings every five minutes
- [[dew-point|Dew point]] explains the one formula worth knowing
- The [[log/2026-09-14|latest log entry]] has the current state of things

> [!tip] New here?
> The [[callouts|callouts reference]] page shows every callout type in one place.

## Status

| Part | State | Notes |
| --- | --- | --- |
| Temperature and humidity | Working | Reads within 0.3 °C of the reference |
| Pressure | Working | Needs altitude correction |
| Rain gauge | ==Waiting for parts== | Tipping bucket ordered |
| Solar power | Testing | Survives three cloudy days |
