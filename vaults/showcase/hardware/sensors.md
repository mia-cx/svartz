---
title: Sensors
description: What the station measures, and the parts that do the measuring.
tags: [hardware, sensors]
created_at: 2026-08-20
updated_at: 2026-08-20
---

The station measures four things. Each sensor sits on the same I²C bus, so the wiring stays short[^bus].

![[station.svg|The station layout]]

## Temperature

A Sensirion SHT45 reads temperature to ±0.1 °C. It needs shade and airflow, which is the whole reason the [[hardware/enclosure#Radiation shield|radiation shield]] exists.

## Humidity

The same SHT45 reports relative humidity. Humidity alone says little about comfort. Combined with temperature it gives the [[software/dew-point|dew point]], which does.

> [!warning] Condensation
> Above 95% relative humidity the sensor can hold a film of water for hours. Readings stay high until it dries. The SHT45's built-in heater clears it; the firmware runs it for one second every hour.

## Pressure

A Bosch BMP390 reads station pressure. Weather reports use sea-level pressure, so the firmware corrects for the station's altitude of 42 m.

| Sensor | Measures | Accuracy | Interface |
| --- | --- | --- | --- |
| SHT45 | Temperature, humidity | ±0.1 °C, ±1% RH | I²C `0x44` |
| BMP390 | Pressure | ±0.5 hPa | I²C `0x77` |
| Tipping bucket | Rain | 0.2 mm per tip | GPIO interrupt |

## Wind

Not yet. A cup anemometer needs a mast taller than the fence, and the neighbours have opinions.

[^bus]: I²C tolerates about a metre of cable at 100 kHz. The longest run here is 40 cm.
