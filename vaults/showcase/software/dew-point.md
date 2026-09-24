---
title: Dew point
description: The temperature at which air can't hold its water, and how to compute it.
tags: [software, weather]
created: 2026-09-02
---

Dew point says how humid the air feels better than relative humidity does. The station computes it with the Magnus formula, using $a = 17.62$ and $b = 243.12\,^{\circ}\mathrm{C}$:

$$
\gamma(T, RH) = \ln\left(\frac{RH}{100}\right) + \frac{a\,T}{b + T}
\qquad
T_d = \frac{b\,\gamma}{a - \gamma}
$$

At 14.2 °C and 81.5% humidity, $T_d \approx 11.1\,^{\circ}\mathrm{C}$.

> [!example] Reading the number
> Below 10 °C feels dry. From 16 °C it starts to feel sticky, and above 21 °C most people call it oppressive.

The [[software/firmware|firmware]] sends raw temperature and humidity. The server computes dew point, so a better formula never needs a reflash.
