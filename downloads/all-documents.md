# TPP control


---

# Temperature-limited heating pulses

**Rev08 · Single-channel model and implementation**

## Summary

- **End each fixed-amplitude heating pulse at an estimated temperature ceiling or its requested duration.** This controls pulse termination; tactile displacement and force remain separate quantities to measure.
- **Predict two temperatures: metal and surrounding material.** Electrical power heats the metal, while the surroundings retain heat between pulses. Three fitted heat-transfer coefficients describe this exchange.
- **Correct the predicted metal temperature using measured resistance and the calibrated resistance–temperature curve.** The model carries the heating and cooling history; resistance supplies a new observation. A short table search balances their agreement.
- **Check nonmonotonicity explicitly.** Search near the predicted temperature and stop when two distinct resistance-compatible branches remain. Where resistance changes little with temperature, the model supplies most of the estimate.
- **Use a measured stopping allowance and a local timer.** The allowance covers observed underestimation; the timer accounts for further heating and switch delay. Fit on one experiment and check fixed settings on another. The result is an effective-temperature estimate with experimentally established operating scope.

## 1. One heater and its inputs

One electrical measurement and the stored thermal state supply each control cycle.

![Single-channel heating, measurement and temperature control](../assets/figures/single-channel-control.png)

The adjustable supply powers one resistive heater through a switch. Separate voltage-sense connections measure across the active metal; current measurement includes any sensing-network current that bypasses the current sensor. The controller receives corrected, time-aligned voltage $`V`$ and current $`I`$.

| Symbol | Meaning |
|---|---|
| $`T,S,A`$ | Effective metal, surroundings and ambient temperatures, °C |
| $`t,\Delta t`$ | Time and elapsed update interval, s |
| $`P`$ | Interval-average heater-power input used by the model, W |
| $`C(T)`$ | Active-metal heat capacity, J/K |
| $`G`$ | Metal-to-surroundings thermal conductance, W/K |
| $`\beta`$ | Rate at which the surroundings warm in response to $`T-S`$, s⁻¹ |
| $`\gamma`$ | Rate at which the surroundings cool toward ambient, s⁻¹ |
| $`R_0,q(T)`$ | Metal resistance at ambient, Ω, and dimensionless curve $`R(T)/R_0`$ |
| $`V,I`$ | Corrected heater-terminal voltage, V, and heater current, A |
| $`e_R`$ | Normalized-resistance error allowance, dimensionless |
| $`w`$ | Permitted temperature-correction width, K |
| $`T_c,M`$ | Selected temperature ceiling, °C, and empirical stopping allowance, K |

The software interface is:

```pseudocode
UPDATE(t, T, S, average_power, V, I, settled_reading, heating)
    returns updated T, S, measurement_status and switch_off_deadline
```

Before operation, supply electrical channel calibration, $`R_0`$, the measured $`q(T)`$ points, $`C(T)`$, fitted $`G,\beta,\gamma`$, and the limits used below. Calculate $`C(T)=m c_p(T)`$ from active-metal mass $`m`$ and alloy specific heat $`c_p`$. A measured material curve can serve pixels made from the same stock; each pixel needs its own $`R_0`$.

## 2. Predict heating and retained heat

The thermal model predicts the next temperatures before the resistance reading is used.

Use

```math
C(T)\frac{dT}{dt}=P-G(T-S),\qquad
\frac{dS}{dt}=\beta(T-S)-\gamma(S-A).
```

Electrical power heats the metal. The term $`G(T-S)`$ transfers heat between metal and surroundings. The second equation represents warming and cooling of the effective surrounding material. Its temperature $`S`$ persists during pauses, so two otherwise identical pulses can begin from different thermal conditions.

For a short interval, the prediction is

```math
T_{\rm pred}=T+\Delta t\frac{P-G(T-S)}{C(T)},\qquad
S_{\rm pred}=S+\Delta t[\beta(T-S)-\gamma(S-A)].
```

Use the old $`T,S`$ on both right-hand sides. Divide longer intervals into steps no greater than one tenth of the smaller time scale $`C_{\min}/G`$ and $`1/(\beta+\gamma)`$, where $`C_{\min}`$ is the minimum heat capacity over the operating range. This is a practical integration setting; halve it during the offline replay and check that the change is small compared with the selected temperature resolution.

Calculate the power input in the same way during fitting and operation:

1. **Settled heating:** average two consecutive measured powers from the same continuous ON interval, $`P=(V_{\rm old}I_{\rm old}+VI)/2`$.
2. **Switching and analog settling:** use $`P=P_{\max}`$ during the measured settling interval. Calculate $`P_{\max}=V_{\max}^2/R_{\min}`$, with the largest checked terminal voltage, including excursions, and the smallest calibrated metal resistance.
3. **OFF time:** use the measured residual power.
4. Split an update at each switch transition or settling boundary; apply the corresponding power to each part.

Initialize $`T=S=A`$ after the measured cooling period. Continue updating both temperatures during every pause.

## 3. Convert the resistance curve into a correction

The calibrated curve relates candidate temperatures to resistance; the update compares those predictions with the measured resistance.

For a stock curve measured at a different ambient, first normalize it at the operating ambient: $`q(T)=q_{\rm cal}(T)/q_{\rm cal}(A)`$. Then $`q(A)=1`$ matches the current pixel's measured $`R_0`$. Recalculate the normalized error allowance with this scaling and ambient/reference-resistance uncertainty. Store the resulting pairs $`(T_j,q_j)`$, ordered by temperature. Between adjacent points, use

```math
q(U)=q_j+\frac{q_{j+1}-q_j}{T_{j+1}-T_j}(U-T_j),
```

where $`U`$ is a candidate temperature. Include points around each observed turning region. Interpolation represents the measured curve; its remaining error belongs in $`e_R`$.

During settled conduction calculate

```math
y=\frac{V}{I R_0}.
```

Prepare a table of $`q(U)`$ at **1 °C spacing**, using the interpolation above. Also calculate $`L`$, the largest absolute interpolation slope. For each table temperature within $`T_{\rm pred}\pm w`$, test

```math
|y-q(U)|\le e,\qquad e=e_R+L\,(1\ ^\circ\mathrm C).
```

The second term allows for the grid and a window boundary between grid points. The 1 °C spacing is a numerical resolution, not a measurement accuracy. Require $`w\ge1`$ K. Consecutive passing grid indices form a continuous run. No run means disagreement between the electrical reading and the allowed correction. More than one separated run means that distinct local resistance branches remain. Either result ends the heating pulse.

When one run remains, choose its temperature minimizing

```math
J(U)=\left(\frac{U-T_{\rm pred}}{w}\right)^2+
\left(\frac{y-q(U)}{e_R}\right)^2.
```

Also evaluate $`J`$ at the continuous prediction $`T_{\rm pred}`$ itself, using interpolated resistance, if it passes the same resistance test. Select the lower-cost candidate; choose the continuous prediction on a tie. This preserves temperature changes smaller than a grid step. Set $`T`$ to the selected temperature and $`S=S_{\rm pred}`$. The calculation balances the prediction against resistance agreement. A flat $`q`$ gives nearly equal resistance scores; the first term then keeps the estimate near the prediction. A steep slope makes resistance more informative. The initialized thermal history selects the search region; resistance distinguishes temperatures within it.

**Set two fixed correction settings:**

1. **Resistance allowance $`e_R`$:** add the checked electrical-error allowance and the curve-error allowance, both expressed as fractions of $`R_0`$. Include reference uncertainty, observed heating–cooling variation and the stated interpolation allowance. Store a positive value.
2. **Search width $`w`$:** compare the uncorrected model with aligned independent temperature readings on the fitting experiment. Take the largest absolute temperature difference, add reference uncertainty and 1 K, and use at least 1 K. Keep this width fixed for validation.

When independent temperature readings are unavailable, $`w`$ is a declared engineering setting. Section 5 states the operating claim supported by that case.

**Illustrative curve.** Suppose measured anchors were $`(20,1.000),(400,1.040),(600,1.060),(800,1.040)`$. These values illustrate the calculation and are not a NiCr calibration. A reading $`y=1.050`$ has solutions near 500 and 700 °C. With $`T_{\rm pred}=510`$ °C and $`w=20`$ K, only the neighborhood of 500 °C is searched. With a prediction of 600 °C and a 120 K search window, both branches remain and heating stops.

## 4. End a heating pulse

Each pulse ends at the earliest temperature, duration or data-age limit.

The requested pulse specifies fixed voltage, maximum duration and $`T_c`$. Set the stopping allowance $`M`$ from the completed observer on the fitting experiment:

1. At each aligned reference reading, subtract the corrected estimate from the independently measured temperature.
2. Keep the largest positive difference, or zero if all differences are negative.
3. Add the temperature-reference uncertainty and 1 K for the numerical grid.
4. Check this fixed allowance on the separate validation experiment.

At state time $`t`$, calculate

```math
t_{\rm temperature}=t+
\frac{[T_c-M-\max(T,S)]C_{\min}}{P_{\max}}-\tau_{\rm off},
```

where $`P_{\max}`$ bounds delivered heater power, including switching excursions, and $`\tau_{\rm off}`$ is the measured timer/physical-turn-off delay. Set the local timer to the earliest of this deadline, the original requested pulse end, and the last valid reading plus the permitted data age minus $`\tau_{\rm off}`$. Turn off immediately if that time has passed.

The hotter model state cannot increase through passive internal heat exchange alone. Added electrical power gives the rise allowance $`P_{\max}/C_{\min}`$. The stopping rule combines this modeled rise with the experimentally checked allowance $`M`$.

**One clock cycle.** Take illustrative values $`T=500`$, $`S=100`$, $`A=20`$ °C; $`C=0.001`$ J/K, $`G=0.001`$ W/K, $`\beta=1`$, $`\gamma=0.2`$ s⁻¹; $`P=10.4`$ W and $`\Delta t=0.001`$ s. The prediction is $`T_{\rm pred}=510`$, $`S_{\rm pred}=100.384`$ °C. With the illustrative curve, $`y=1.050`$, $`w=20`$ K and $`e_R=0.001`$, the grid minimum is **502 °C**: its prediction and resistance contributions to $`J`$ are 0.16 and 0.04.

For $`T_c=550`$ °C, $`M=15`$ K, $`P_{\max}=12`$ W, $`C_{\min}=0.001`$ J/K and $`\tau_{\rm off}=50`$ µs, the temperature deadline is **2.70 ms after this state time**. A shorter requested duration or earlier data expiry takes precedence.

## 5. Fit once, then validate separately

Parameter fitting and validation use different recorded sequences.

The fitting experiment identifies $`G,\beta,\gamma`$. Choose a checked pulse width $`t_p`$ and onset interval $`t_r>t_p`$; keep the voltage fixed. Log gate transitions, voltage, current and ambient temperature throughout:

1. From ambient, apply one pulse of width $`t_p`$; wait $`4t_r`$ after turn-off.
2. Apply four pulses, with starts separated by $`t_r`$.
3. Wait $`t_r`$ after the last turn-off; apply one pulse.
4. Wait $`4t_r`$ after turn-off; apply one final pulse.

The isolated pulse identifies rapid heating. The train and restart pulses reveal heat retained between pulses.

For each positive candidate $`G,\beta,\gamma`$, replay the complete record from ambient using the power-input recipe and prediction equations. **Do not apply resistance corrections during this replay.** Minimize

```math
J_{\rm fit}=\sum_{k\in\text{settled readings}}
\left[\frac{q(T(t_k))-V_k/(I_kR_0)}{e_R}\right]^2.
```

Fix heat capacity from the measured geometry and material data. Three fitted coefficients then describe heat transfer. Appendix B gives a small derivative-free search. Independent temperature observations, where available, distinguish fits with similar resistance predictions but different temperature histories.

For foil, a pyrometer can provide these observations when its spot lies on the active metal, emissivity is calibrated, and its temporal response resolves the experiment. Begin with sufficiently slow pulses for that instrument. For ultrafine wire, the same-stock equilibrium calibration establishes the material curve; it does not supply in-pulse temperature observations.

The validation experiment checks the completed controller with fixed coefficients, $`e_R,w,M`$, voltage and load range:

1. From the same initial ambient condition, apply four pulses with alternating widths $`t_p/2,t_p,t_p/2,t_p`$, starting every $`t_r`$.
2. Wait $`2t_r`$ after the final turn-off, then apply one pulse of width $`t_p`$.
3. Use full-duration pulses throughout if a half pulse supplies no settled reading.

Evaluate four outcomes:

1. Predicted and measured resistance agree without refitting.
2. Independent temperature, where resolved, stays within the stated stopping allowance and below the ceiling after turn-off.
3. The observer remains on a coherent branch and permits useful displacement or force.
4. Pulse termination and retained heating behave correctly under the intended mechanical load.

Agreement in resistance tests electrical prediction, including across a nonmonotonic curve. Without resolved independent temperature data, use the observer as experimental estimate-based pulse control within the previously checked finite-pulse protocol; $`M`$ remains a declared engineering margin. A demonstrated temperature-error allowance requires the independent reference. Restrict operation to the checked pulse, load and repetition range.

## Appendix A. Clock-cycle arithmetic

The following calculation runs once per channel update.

The table contains candidate temperature `U` and interpolated `q`. A settled reading is invalid if it times out, saturates, or has current below the calibrated measurement range. `permitted_data_age` is the configured maximum delay between valid readings. Time `t` is the update endpoint; `state_time` is the previously represented time. Split intervals at switching events. The electrical routine supplies interval-average `P` and a valid settled reading flag.

```pseudocode
UPDATE(t, T, S, P, V, I, settled, heating):
    if t <= state_time: switch OFF; return timestamp_fault
    if heating and settled and readings_invalid: switch OFF; return measurement_fault
    remaining = t-state_time
    hmax = 0.1*min(Cmin/G, 1/(beta+gamma))
    while remaining > 0:
        h = min(remaining,hmax)
        Tnew = T + h*(P-G*(T-S))/C(T)
        Snew = S + h*(beta*(T-S)-gamma*(S-A))
        T = Tnew; S = Snew; remaining = remaining-h; state_time = state_time+h
        if T is outside calibration: switch OFF; return range_fault
    state_time = t
    if not heating: return T, S
    if settled:
        y = V/(I*R0)
        predicted = T; best_cost = infinity; runs = 0; previous_pass = false
        for consecutive grid entries with abs(U-predicted) <= w:
            passes = abs(y-q) <= eR + L*grid_step
            if passes and not previous_pass: runs = runs+1
            if passes:
                cost = ((U-predicted)/w)^2 + ((y-q)/eR)^2
                if cost < best_cost: best_cost = cost; best_T = U
            previous_pass = passes
        if runs != 1: switch OFF; return mismatch_or_ambiguity
        q_pred = interpolate_q(predicted)
        if abs(y-q_pred) <= eR + L*grid_step:
            cost = ((y-q_pred)/eR)^2
            if cost <= best_cost: best_T = predicted
        T = best_T; last_valid_time = t
    temperature_end = t + (Tc-M-max(T,S))*Cmin/Pmax - turn_off_delay
    data_end = last_valid_time + permitted_data_age - turn_off_delay
    deadline = min(original_pulse_end,temperature_end,data_end)
    if deadline <= now: switch OFF
    else: arm local switch-off timer for deadline
    return T, S, deadline
```

A fault preserves the last computed state and disables subsequent pulses. Before starting a pulse, update OFF cooling to its start time, set `last_valid_time` to that time, and fix `original_pulse_end = start_time + requested_duration`. Calculate the same deadline above. In one short uninterrupted operation, check that the deadline is future, arm the timer and enable the switch; otherwise leave it OFF. Record the actual gate transition. The data-expiry term supplies the first-reading deadline. After reset, complete the established cooldown before initializing to ambient.

## Appendix B. Reproducible coefficient search

A direct multiplicative search gives a reproducible initial fit.

Use reference values $`G=C(A)/t_p`$, $`\beta=1/t_r`$, $`\gamma=1/(4t_r)`$. Try exactly three starts, multiplying all three reference values together by 0.1, 1 or 10. This is a small local search; independent temperature checks distinguish physically different fits.

```pseudocode
COST(G, beta, gamma):
    set T=A, S=A, cost=0
    replay every logged power interval using the prediction equations
    at each valid resistance sample:
        cost = cost + ((q(T)-V/(I*R0))/eR)^2
    return cost, or infinity if temperature leaves calibration

FIT():
    for common starting factor 0.1, 1 and 10:
        coefficients = starting_factor * reference_coefficients
        ratio = 2
        for at most 200 search rounds:
            evaluate current coefficients and six alternatives:
                multiply or divide one coefficient by ratio
            if an alternative lowers COST: retain the best alternative
            else: ratio = sqrt(ratio)
            if ratio < 1.02: finish this start
        if search completed and cost is finite: retain fit and predicted temperatures
    if no finite completed fit remains: return fitting_failure
    return the lowest-cost completed fit and the other completed fits
```

Inspect systematic residuals and alternative temperature histories. Unfinished searches or incompatible independent temperatures require resolving that specific fit before operation. The validation record remains separate from fitting and allowance selection.

## Appendix C. Physical interpretation and processor implementation

The processor executes the same arithmetic as the offline replay.

A Teensy 4.1 can perform the single-channel arithmetic locally. The macro circuit measures current and both terminal voltages; the wire channel measures shunt current and selected differential voltage. Apply each circuit's measured bypass-current correction before forming $`VI`$ or $`V/I`$. USB transfers configuration and buffered records outside the pulse-control calculation.

The model has consistent physical units: power divided by heat capacity has units K/s; $`G(T-S)`$ has units W; the two heat-transfer rates have units s⁻¹; all three fitted coefficients are positive. The passive model cools toward ambient with power removed. The inferred $`T`$ is a resistance-related effective metal temperature, distinct from the spatial peak at a hotspot. The two-state description and finite correction window must explain the intended pulse history before their estimates are used to end pulses.

---

# Foil pixel: circuit and calibration

- **This circuit drives one centimetre-scale thermopneumatic pixel.** Electrical pulses heat its foil; the resulting gas expansion moves the membrane. The controller regulates estimated foil temperature, while a separate displacement or force measurement checks tactile output.
- **Voltage and current provide two useful measurements:** resistance $`R=V/I`$, which changes with temperature, and power $`P=VI`$, which drives the thermal model.
- **The temperature estimate combines both.** A model predicts heating and cooling; a calibrated table identifies temperatures consistent with the measured resistance. The controller selects the temperature that best matches both. A second temperature records heat retained around the foil.
- **Calibration supplies the missing physical scale.** Pyrometer measurements establish resistance versus temperature. A pulse sequence identifies heat-transfer coefficients; a different sequence checks the result.
- **The selected hardware is one Teensy 4.1, INA253EVM A3 and CSD17305Q5A.** The PC prepares calibration and plots results; measurement and pulse termination run locally.

![Foil-pixel electrical circuit](../assets/figures/macro-circuit.png)

## 1. Connect power and measurement paths

**Purpose:** measure heat delivered to the foil separately from losses in the cables and switch.

1. Connect supply positive → foil → INA253 current path → MOSFET → supply negative.
2. Attach two heavier power wires and **two separate sense wires at the foil pads**. Connect each sense wire to a 1 kΩ/1 kΩ divider.
3. Power Teensy through USB and the current sensor from its 3.3 V regulator. Route heater current back to the supply separately from measurement-ground traces.

Teensy’s inputs and outputs use **3.3 V**. The dividers reduce a 5 V terminal potential to approximately 2.5 V. Subtracting the two calibrated terminal potentials gives foil voltage without the cable, sensor or switch drops.

For approximately 1 Ω foil, 2, 3 and 4 V **across the foil** produce 4, 9 and 16 W. Use an adjustable **0–5 V supply with current limited below 5 A**. Begin calibration at low voltage and raise it while watching measured foil current. Normal operating pulses should remain in constant-voltage operation.

## 2. Calibrate the electrical readings

**Purpose:** convert three ADC readings into foil voltage, current and resistance.

Use the final electronics and cables. Initially replace the foil with a stable 1 Ω resistor whose continuous rating exceeds the calibration power $`I^2R`$.

1. **Voltage channels:** disconnect heater power. Apply two measured DC potentials to each sense input. For ADC codes $`n_1,n_2`$ and reference voltages $`x_1,x_2`$, calculate
   ```math
   a=(x_2-x_1)/(n_2-n_1),\qquad b=x_1-an_1.
   ```
   Convert subsequent codes with $`x=an+b`$. Check an intermediate voltage and the small negative-terminal voltage present during conduction.
2. **Current channel:** put a reference ammeter in the **INA253/MOSFET branch**. Apply two positive currents spanning operation and calculate its gain and offset with the same formula. Check an intermediate current and repeat after the board warms. Remove the ammeter afterward.
3. **Switched-load check:** pulse the resistor. Record the time after switching at which reconstructed resistance settles, the channel delays, and the delay from a gate-off command to current cessation. Save the largest observed voltage/current errors together with reference-meter uncertainty.
4. **Power check:** record supply-voltage extrema and $`(V_s-V)/I`$, where $`V_s`$ is supply voltage and $`V,I`$ refer to the foil. Measure residual off-current in a **foil power lead**, which includes divider leakage.

For each settled electrical reading:

1. Acquire current together with the positive-terminal voltage, then with the negative-terminal voltage, then with the positive-terminal voltage again.
2. Interpolate the two positive-terminal readings to the middle timestamp; use the current measured at that timestamp.
3. Calculate

```math
V=V_+-V_-,\qquad I=I_s+V_-/D,\qquad R=V/I,\qquad P=VI.
```

Here $`I_s`$ is calibrated sensor-branch current and $`D`$ is the negative divider’s measured total resistance, nominally **2000 Ω**. Its small current passes through the foil but bypasses the sensor. The positive-divider current does not pass through the foil.

## 3. Establish the temperature scale

**Purpose:** attach an independently measured temperature to the resistance curve.

Measure the active foil length, width and thickness; calculate mass $`m=\rho lwd`$ using alloy density $`\rho`$. Store heat capacity $`C(T)=m c_p(T)`$, where $`c_p(T)`$ is alloy specific heat. Keep uncertainty in thickness, active dimensions and material data with this table.

1. Record calibration ambient temperature $`A_{\rm cal}`$ and foil resistance $`R_{\rm cal}`$ after equilibration.
2. Hold the switch on at a low DC voltage. Once both electrical readings and pyrometer temperature remain stable within instrument repeatability, record $`V,I,T`$.
3. Raise voltage in steps. Include points on both sides of each resistance turning point and at the highest intended calibration temperature. Repeat selected points during cooling.
4. At each reference, check the center and ends of the active resistance-bearing region. The pyrometer spot must fit entirely on foil; apply its emissivity and reflected-radiation corrections.
5. Calculate $`q_{\rm cal}(T)=V/(IR_{\rm cal})`$. Store the measured points, a piecewise-linear curve and electrical/temperature uncertainty.

At operating ambient $`A`$, measure $`R_0`$ and use $`q(T)=q_{\rm cal}(T)/q_{\rm cal}(A)`$, so $`q(A)=1`$. The operating ambient must lie within the calibrated range.

Only spatially consistent equilibrium points establish the material curve. If center and end temperatures differ beyond the calibration allowance, reduce the gradient or use a more uniform reference specimen. A total-resistance versus spot-temperature curve requires a separate interpretation and cannot replace the material calibration unchanged.

## 4. Fit, check and operate

**Purpose:** connect the calibrated circuit to useful temperature-controlled pulses.

The controller estimates foil temperature $`T`$ and surroundings temperature $`S`$. Its three fitted coefficients describe heat transfer between them and cooling toward ambient $`A`$. Use the explicit fitting and update calculations in Temperature control.

1. Load electrical calibration, $`R_0`$, resistance and heat-capacity tables, fitted coefficients and pulse limits. Start after the established cooldown, with $`T=S=A`$.
2. Request a finite sequence of **fixed-amplitude pulses**, specifying temperature ceiling $`T_c`$, maximum duration and repetition interval.
3. At every settled reading, calculate $`V,I,R,P`$. Predict $`T,S`$ with the thermal model, then score the 1 °C table entries near predicted $`T`$ against measured $`R/R_0`$. Stop if no group or separated groups of compatible temperatures remain. For one group, select the lowest-cost candidate, also scoring the continuous prediction to preserve changes smaller than a grid step.
4. End heating when $`\max(T,S)+M`$ reaches $`T_c`$. Here $`M`$ is an experimentally checked temperature allowance. The local timer also enforces maximum duration, measurement expiry and the predicted rise before switch-off. Continue calculating cooling for both states between pulses.
5. Run the independent sequence without refitting. Compare temperature with a pyrometer trace where its response resolves the pulse; record resistance residuals and displacement or force separately. Resistance agreement checks electrical/model consistency; it does not establish temperature error.

After a processor reset, keep power disabled for the cooldown measured after the hottest permitted run. This establishes the initial thermal state for the next sequence.

## Appendix A. Components and pins

| Item | Selected configuration |
|---|---|
| Processor | Teensy 4.1; USB power |
| Current sensor | INA253EVM **A3** section; 3.3 V; REF1/REF2 grounded; nominal 0.4 V/A |
| Power switch | CSD17305Q5A on an assembled copper carrier; source to supply negative |
| Gate | Pin 2 → 1 kΩ → gate; 100 kΩ gate-to-source |
| Current output | Sensor → 100 Ω → pin 14/ADC0; 1 nF at ADC input to ground |
| Positive terminal | 1 kΩ/1 kΩ divider → pin 26/ADC1; 1 nF midpoint-to-ground |
| Negative terminal | Identical divider → pin 27/ADC1 |
| Divider resistors | 0.1%, low temperature coefficient |
| Sensor bypass | 100 nF at supply pins |
| Heater supply | Adjustable 0–5 V; current limit below 5 A |

The miniature MOSFET needs a soldered current/thermal pad and copper area. Assemble it on a carrier or PCB with accessible supply, foil and test terminals. Power the analog circuitry before enabling heater power.

---

# Wire array: circuit and calibration

- **Repeat one independently controlled heater channel eight times per board.** Four identical boards serve 32 pixels. Every pixel has its own MOSFET, shunt and current amplifier.
- **Share voltage measurement within each board.** Two selectors connect the chosen pixel’s terminal-sense wires to one difference amplifier. The other pixels can continue heating during that measurement.
- **Keep the tactile array passive.** Place sensing and switching electronics in the housing, at least 10 cm from the pixels; run separate power and voltage-sense conductors to the heater pads.
- **Use the same temperature-estimation calculation for every pixel.** Each channel supplies measured voltage/current and its own room-temperature resistance. Pixels from one wire batch share the calibrated material curve.
- **Complete one eight-channel board first.** Its concurrent-load measurements establish supply droop, sensing error and delay to switch-off before the design is duplicated.

![One wire-heater channel](../assets/figures/array-channel-circuit.png)

![Shared voltage measurement for eight channels](../assets/figures/array-shared-circuit.png)

## 1. Build the repeated channel

**Purpose:** control each heater independently while measuring its electrical input.

1. Connect supply positive → heater → **0.100 Ω shunt → AO3400A → supply negative**. Place the shunt and switch on the electronics board.
2. Run two short, separate traces from the shunt pads to INA190A2 inputs. Its gain of 50 gives a nominal current sensitivity of **5 V/A**.
3. Connect each heater terminal to a 3 kΩ/1 kΩ divider. Connect the divider midpoints through the TMUX1108 pair to the shared AD8276, as shown above.

At 0.47 A, the current output is approximately **2.35 V** and the shunt dissipates **22 mW**. Set the initial total heater-current ceiling to **0.55 A**, including sensing-network current that bypasses the shunt.

The selectors choose both terminals of the same pixel; the AD8276 subtracts them. The rail remains below 10 V and the analog circuitry uses 3.3 V.

For each group of eight pixels, provide **25 functional conductors:** one common positive feed, eight individual returns and sixteen voltage-sense connections. Begin the sense connections at the heater pads. Rate the common feed and connector for at least the intended 4.4 A eight-channel ceiling.

## 2. Supply concurrent pulses

**Purpose:** maintain the selected heater voltage when several pixels turn on together.

A 12.5 Ω heater at 2.8 W requires

```math
I=\sqrt{2.8/12.5}\approx0.47\ {\rm A},\qquad V=IR\approx5.9\ {\rm V}.
```

Eight such heaters use approximately **3.8 A**; 32 use approximately **15 A and 90 W of instantaneous heater power**. At 20% duty, mean heater power is approximately 18 W. The supply and conductors must support the concurrent current even when average power is much lower.

1. Connect eight stable 12–13 Ω resistor loads rated for the calibration power.
2. Increase the rail while measuring voltage at each load’s sense terminals. Record rail voltage, heater voltage and current with one, several and all eight loads on.
3. Select a rail setting that supplies the intended heater voltage without exceeding any channel’s current ceiling.
4. Repeat with the intended pulse pattern. Record the minimum/maximum rail voltage and the largest measurement error after simultaneous switching.
5. Use those extrema in the controller configuration. A pulse request exceeding the checked concurrent-load condition must reduce concurrency or drive amplitude.

## 3. Calibrate current and voltage

**Purpose:** calculate actual heater resistance rather than the resistance of the complete power path.

1. For each channel, measure two positive reference currents with the ammeter in the **shunt/MOSFET branch**. Record ADC codes $`n_1,n_2`$ and reference currents $`x_1,x_2`$.
2. Calculate $`a=(x_2-x_1)/(n_2-n_1)`$, $`b_0=x_1-an_1`$; convert subsequent codes using $`x=an+b_0`$. Check a third current and repeat after warming the board.
3. Apply two measured differential voltages through the actual sense connections and selected front end. Calculate voltage gain and offset with the same formula. Check a third value, the installed terminal common-mode voltage, and changes caused by neighboring channels.

The heater current is

```math
I=I_s+b,\qquad R=V/I,\qquad P=VI.
```

Here $`b`$ is **signed net sensing-network current bypassing the shunt**. The bare negative-terminal divider contributes approximately $`V_-/4000`$; loading by the connected difference amplifier can change its magnitude and sign.

1. Measure total current in the **heater lead before the sensing branch**.
2. Subtract the calibrated shunt-branch current to obtain $`b`$.
3. Repeat with each selector position, intended neighboring loads and a warm board.
4. Store a correction and an error range covering those readings and reference-meter uncertainty. If the difference is below the meter’s resolution, include that resolution in the error range.
5. Measure off-current in the heater lead and store its upper bound.

Pulse the resistor loads using the final cable and scan order. Record selection-to-settled-reading time, relative voltage/current delay, and measurement-to-current-off delay. Use only settled conducting readings for $`V/I`$.

## 4. Apply the single-channel controller

**Purpose:** repeat one calculation without coupling the pixels’ power commands.

Use Temperature control separately for each channel. Store each pixel’s electrical calibration and resistance $`R_0`$ at ambient temperature $`A`$; load the same-batch curve from the wire-temperature fixture, rescaled so $`q(A)=1`$. Each channel retains its own heater temperature $`T`$ and surroundings temperature $`S`$.

For each active channel:

1. Select its two voltage terminals and wait the measured settling time.
2. Read its current and selected voltage; align their timestamps and calculate corrected $`I,V,R,P`$.
3. Predict that channel’s $`T,S`$, then score the 1 °C temperature-table entries against the prediction and measured $`R/R_0`$. Stop on mismatch or separated compatible groups. For one group, select the lowest-cost candidate, also scoring the continuous prediction to preserve changes smaller than a grid step.
4. End its fixed-amplitude pulse when $`\max(T,S)+M`$ reaches the requested temperature ceiling. Update its timer deadline for the remaining temperature allowance, maximum duration and measurement expiry.
5. Retain its thermal state after switch-off. Record channel, timestamp, measurements and stopping reason.

The board timer serves the earliest active deadline. A measurement fault stops the affected operation and blocks further requests until corrected. The PC sends settings and finite sequences; local timing remains independent of PC communication. Until a resolved independent temperature reference checks $`M`$, it is an engineering stopping allowance rather than a measured temperature-error limit.

## 5. Check the assembled pixels

**Purpose:** verify both the measurement and the resulting tactile output under the intended conditions.

1. Check array continuity and connector orientation before installing the wire. Keep the common heater feed isolated from any conflicting ground connection.
2. Record each assembled pixel’s ambient resistance. Compare it with its wire length and with other pixels of the same geometry; inspect unusually large differences.
3. Run the fitting sequence on a representative pixel. Give **every finished pixel** the separate fixed-model operating check; refit only pixels for which that check fails.
4. Repeat the operating check with intended neighboring-pixel activity and mechanical contact.
5. Measure displacement or force as well as resistance. Record the pulse amplitude, repetition rate and load condition associated with repeatable useful output. Resistance residuals test electrical/model consistency; a temperature-error claim additionally requires an independent temperature reference that resolves the transient.

## Appendix A. Parts

| Per pixel | Selection |
|---|---|
| Current amplifier | INA190A2DCKR, SC70-6; 3.3 V; REF grounded |
| Shunt | Vishay WSLP0805R1000FEA, 0.100 Ω, 1%, 0.5 W |
| Switch | AO3400A |
| Gate components | 1 kΩ series; 100 kΩ gate-to-source |
| Terminal dividers | Two 3.00 kΩ/1.00 kΩ pairs, 0.1%, low temperature coefficient |
| Filters | 1 nF per divider; current output 100 Ω/1 nF |
| Supply bypass | 100 nF at current amplifier |

| Per eight-channel board | Quantity |
|---|---:|
| Teensy 4.1 | 1 |
| Pixel circuits above | 8 |
| TMUX1108PWR | 2 |
| AD8276BRZ | 1 |
| Shared-voltage output filter | 100 Ω/100 pF |
| Shared-IC supply bypasses | Three 100 nF capacitors |
| Shared selector-enable pull-down | 10 kΩ |

Provide a physical supply disconnect, supply protection and connectors rated for concurrent current. Place shunts/amplifiers away from switch heating; route power current separately from measurement ground.

## Appendix B. Connections

**INA190A2 DCK:** pin 1 REF, 2 GND, 3 VS, 4 IN+, 5 IN−, 6 OUT.

Both TMUX1108 selectors use 3.3 V, common address/enable lines, and grounded VSS/GND. Enable HIGH connects the selected inputs; LOW disconnects them.

**AD8276BRZ:** selected positive divider to pin 3; negative divider to pin 2; pin 7 to 3.3 V; pin 4 and REF pin 1 to ground; SENSE pin 5 to OUT pin 6. OUT feeds 100 Ω with 100 pF at the ADC. Check the selected voltage path over approximately 0.20–2.50 V output and its recovery from zero-output saturation.

| Function | Teensy pins |
|---|---|
| Eight current outputs, ADC0 | 14–21 |
| Selected differential voltage, ADC1 | 26 |
| Eight heater gates | 2–9 |
| Selector A0/A1/A2 | 10/11/12 |
| Selector enable | 13 |
| Common start / external stop | Reserve 0/1 with defined default levels |

---

# Wire-temperature reference

- **Measure same-stock spare wire at known temperatures.** The resulting resistance–temperature curve supplies the material reference used by the active pixel’s controller.
- **Heat the specimen in a closed kiln.** An adjacent probe measures temperature while a bench meter measures resistance through permanently connected leads.
- **Use a long specimen.** A 1–2 m winding of approximately 31 µm NiCr has about 1.4–2.9 kΩ resistance; thick leads then add a small, measurable correction.
- **Keep the nonmonotonic shape.** Place references around each turning point and repeat selected points during cooling.
- **Keep material and actuator measurements separate.** Each finished pixel also needs its own ambient resistance and operating check.

![Closed-kiln wire-temperature fixture](../assets/figures/wire-calibration.png)

## 1. Assemble the reference specimen

**Purpose:** place the complete resistance-bearing length in a nearly uniform temperature field.

1. Wind **1–2 m of same-stock wire** in one noncrossing layer around a **20 mm outside-diameter alumina tube**. At 0.5 mm pitch, 16–32 turns occupy 8–16 mm. Leave expansion slack and support the ends separately.
2. Put the winding in a loosely covered alumina boat near the kiln center; place the reference probe beside it.
3. Connect two approximately **0.5 mm NiCr leads** using isolated high-temperature compression contacts on ceramic. Separate the leads with ceramic bores or beads through the hot zone.
4. Install leads and probe through **manufacturer-supported access** before heating. Keep the kiln closed during every reading.

Select the kiln and supported feedthrough arrangement together. A vent opening alone does not establish that electrical leads can safely pass through it.

## 2. Check the electrical measurement

**Purpose:** quantify lead and contact errors before interpreting the wire’s resistance.

Representative NiCr80 resistivity gives approximately **1440 Ω/m** for 31 µm wire. A total of 0.6 m of 0.5 mm NiCr leads adds approximately **3.3 Ω**. A 7% change in that lead resistance is 0.23 Ω, or **0.016%** of a one-metre specimen. Use measured lead resistance and the actual lead alloy’s thermal variation in the calculation.

1. Before attaching the fine wire, join the hot-end contacts and measure total lead/contact resistance at ambient.
2. Attach the specimen. Record resistance and check connection stability while gently moving the external leads.
3. Record the meter’s measuring current. At 100 µA, a 1440 Ω specimen dissipates approximately **14 µW**.
4. At one steady kiln temperature, repeat the reading with a second small measurement current. Resolve any reproducible resistance shift from self-heating or range error before continuing.
5. Save meter uncertainty, lead correction and connection variation separately.

A two-wire measurement is sufficient when these errors fit the required resolution. Locally, normalized-resistance uncertainty $`u_q`$ corresponds to $`u_T\approx u_q/|dq/dT|`$. At a resistance turning point, that local conversion fails; the controller uses the curve together with thermal history.

## 3. Collect the temperature references

**Purpose:** establish temperature scale, curve shape and repeatability with a small measurement set.

1. At equilibrium, record calibration ambient $`A_{\rm cal}`$, total resistance and lead/contact correction.
2. At one steady elevated temperature, compare probe readings beside the winding’s center and ends. Include the spatial spread with probe uncertainty.
3. Step the kiln upward. Record a reference after temperature and resistance are stable within instrument repeatability.
4. Begin with approximately five references: ambient, rising branch, observed extremum, falling branch and upper calibration temperature. For an 800 °C reference, kiln, probe, insulation and contacts must all cover that temperature.
5. Add a point wherever another turning region or interpolation uncertainty remains unresolved.
6. Repeat selected references on cooling, then measure final ambient resistance. Keep any baseline drift with the record.

Equilibrium and a sufficiently uniform enclosure connect the adjacent probe reading to the winding temperature. Opening the door would replace that reference condition with an unknown cooling transient.

## 4. Prepare the controller table

**Purpose:** produce a reusable same-stock curve with traceable uncertainty.

For each reference calculate

```math
q_{\rm cal}(T)=\frac{R_{\rm meas}(T)-R_{\rm leads}(T)}
{R_{\rm meas}(A_{\rm cal})-R_{\rm leads}(A_{\rm cal})}.
```

1. Save temperature, measured resistance, lead correction, corrected resistance and $`q_{\rm cal}(T)`$.
2. Add probe/spatial, meter, residual lead/contact and heating–cooling uncertainties.
3. Sort by temperature and connect adjacent points with straight lines, retaining every observed extremum. Export the curve for the 1 °C lookup table in Temperature control.
4. Measure each finished pixel’s $`R_0`$ at operating ambient $`A`$. Rescale the curve with $`q(T)=q_{\rm cal}(T)/q_{\rm cal}(A)`$, so $`q(A)=1`$; use $`R(T)=R_0q(T)`$. $`A`$ must lie within the calibrated range. Store the wire-stock identifier.

This experiment establishes the equilibrium material curve. Pulse-response measurements test the assembled actuator’s thermal model; resistance agreement alone does not independently measure transient temperature error.

## Appendix A. Equipment

| Item | Configuration |
|---|---|
| Kiln | Programmable through the upper reference; supported lead/probe access |
| Specimen and support | Same-stock wire; alumina tube and covered boat |
| Leads and contacts | Thick NiCr, ceramic insulation, isolated high-temperature compression contacts |
| Temperature instrument | Probe/thermometer with documented uncertainty over the reference range |
| Resistance instrument | Bench meter with documented accuracy and measuring current |

---

# Student prototype: one temperature-limited foil pixel*

*Proposed student implementation; not reviewed by Yon Visell.*

- Build one foil-heater channel and end each fixed-voltage heating pulse from a resistance-assisted temperature estimate.
- Track metal temperature $`T`$ and surrounding-material temperature $`S`$; retain both between pulses.
- Begin with pulses that the available pyrometer resolves and that produce useful tactile displacement or force.
- Fit three thermal coefficients on one sequence, then check the fixed controller on a different sequence.
- Deliver a working pulse controller and recorded electrical, temperature and tactile-output results.

## 1. Build one channel

Use a Teensy 4.1, INA253EVM A3 current sensor, CSD17305Q5A switch and adjustable 0–5 V supply with current below 5 A. Connect supply positive → approximately 1 Ω foil → current sensor → switch → supply negative. Use a copper carrier for the switch.

Attach separate voltage-sense wires at the foil pads. Each feeds a 1 kΩ/1 kΩ divider with 1 nF at its midpoint. The current output uses 100 Ω/1 nF. Connect the gate through 1 kΩ and add a 100 kΩ gate-to-source pull-down. Use 3.3 V sensor and controller signals. The pyrometer views the active foil; its spot must fit the target.

## 2. Measure the inputs

Complete these measurements before temperature-controlled pulses.

1. **Electrical conversion:** use two known values per voltage/current channel, then check an intermediate value. For ADC code $`n`$, store $`x=an+b`$, with $`a=(x_2-x_1)/(n_2-n_1)`$, $`b=x_1-an_1`$. Calibrate sensor-branch current. Reconstruct heater quantities as $`V=V_+-V_-`$, $`I=I_s+V_-/2000`$ after settling.
2. **Timing and power:** pulse a stable resistor. Record settling time, maximum heater power $`P_{\max}`$, turn-off delay and residual OFF power. Check the complete voltage/current sample cycle.
3. **Temperature curve:** at settled temperature references, record resistance and pyrometer temperature. Include the intended working range and any resistance turning point. Use $`q(T)=R(T)/R_0`$, where $`R_0`$ is measured at ambient $`A`$. Normalize a previously measured stock curve by its value at $`A`$. Apply emissivity correction and compare center/end temperatures across the active foil; use a sufficiently uniform specimen for the material curve.
4. **Heat capacity:** calculate active foil mass times alloy specific heat, $`C(T)=mc_p(T)`$. Store its minimum $`C_{\min}`$.
5. **Useful pulse:** choose one fixed voltage and finite duration that give the desired tactile response within the independently observed temperature range. The pyrometer must resolve that pulse; check its response time and recorded trace before using it as a dynamic reference.

Between adjacent calibration points use

```math
q(U)=q_j+(q_{j+1}-q_j)(U-T_j)/(T_{j+1}-T_j).
```

Precompute $`q(U)`$ at 1 °C spacing and the largest absolute segment slope $`L`$. The spacing sets numerical resolution. Record normalized-resistance error $`e_R>0`$ from electrical checks and curve uncertainty.

## 3. Fit and set the stopping allowance

Use fixed voltage, pulse width $`t_p`$ and start-to-start interval $`t_r>t_p`$. Record this fitting sequence:

1. From ambient, apply one pulse; wait $`4t_r`$ after turn-off.
2. Apply four pulses starting every $`t_r`$.
3. Wait $`t_r`$ after the final turn-off; apply one pulse.
4. Wait $`4t_r`$ after turn-off; apply one pulse.

Fit positive $`G,\beta,\gamma`$ by replaying

```math
T_{\rm new}=T+\Delta t[P-G(T-S)]/C(T),\qquad
S_{\rm new}=S+\Delta t[\beta(T-S)-\gamma(S-A)]
```

and minimizing $`\sum[q(T)-V/(IR_0)]^2`$. Use measured power during settled conduction, $`P_{\max}`$ during settling and measured OFF power. Keep the state through every pause; apply no resistance correction during fitting. A direct multiplicative search over the three coefficients is sufficient for the initial fit.

Set search width $`w\ge1`$ K from the largest uncorrected-model temperature error on this record, adding reference uncertainty and one grid step. Replay the resistance-corrected observer below. Set stopping allowance $`M`$ from its largest temperature underestimation, plus reference uncertainty and one grid step. Freeze these values before the separate check.

## 4. Run the local controller

Initialize $`T=S=A`$ after cooling. Before a pulse, update the stored cooling state, fix its original end time and initialize the first-reading expiry. In one uninterrupted operation, check the deadline, arm the timer and enable the switch if the deadline is future. Use a clock step $`\Delta t\le0.1\min(C_{\min}/G,1/(\beta+\gamma))`$; divide longer gaps into such steps. Each update receives aligned voltage/current and its timestamp. Here $`T_c`$ is the temperature ceiling; `data_age` is the maximum permitted interval between valid readings. An invalid reading has timed out, saturated, or fallen below the calibrated current range.

```pseudocode
At each clock update:
    if timestamp is stale or settled readings are invalid: switch OFF; return
    dt = sample_time-state_time
    P = average of previous and current V*I during settled conduction
    use Pmax during settling; use measured OFF power while off
    remaining = dt
    while remaining > 0:
        h = min(remaining,0.1*min(Cmin/G,1/(beta+gamma)))
        Tnew = T + h*(P-G*(T-S))/C(T)
        Snew = S + h*(beta*(T-S)-gamma*(S-A))
        T = Tnew; S = Snew; state_time = state_time+h
        remaining = remaining-h
        if T is outside calibration: switch OFF; return
    if switch is OFF: retain T,S; return
    if reading is settled:
        y = V/(I*R0); predicted = T
        runs = 0; previous_pass = false; best_cost = infinity
        for consecutive grid temperatures U within predicted ± w:
            passes = abs(y-q[U]) <= eR + L*grid_step
            if passes and not previous_pass: runs = runs+1
            if passes:
                cost = ((U-predicted)/w)^2 + ((y-q[U])/eR)^2
                if cost < best_cost: best_cost = cost; best_T = U
            previous_pass = passes
        if runs != 1: switch OFF; return ambiguity_or_mismatch
        q_pred = interpolate_q(predicted)
        if abs(y-q_pred) <= eR + L*grid_step:
            if ((y-q_pred)/eR)^2 <= best_cost: best_T = predicted
        T = best_T; last_valid_time = sample_time
    thermal_end = state_time + (Tc-M-max(T,S))*Cmin/Pmax - off_delay
    deadline = min(thermal_end,original_end,last_valid_time+data_age-off_delay)
    if deadline <= now: switch OFF
    else: arm local timer for deadline
```

The table search follows the initialized thermal history. Multiple separated compatible runs stop the pulse. The continuous prediction is also a candidate, preserving small temperature rises where the curve is flat. Faults disable further pulses until resolved; reset requires the established cooldown.

## 5. Check the result independently

Keep coefficients and allowances fixed:

1. From ambient, apply four pulses of widths $`t_p/2,t_p,t_p/2,t_p`$, with starts separated by $`t_r`$.
2. Wait $`2t_r`$ after the last turn-off; apply one pulse of width $`t_p`$.
3. Use full-width pulses throughout if a half pulse supplies no settled reading.
4. Record resistance, pyrometer temperature, estimated temperature, gate transitions and tactile output. Confirm that pulses end before the independently observed temperature exceeds the selected ceiling and that the chosen tactile response is useful and repeatable.

This check establishes the tested pulse and load range. The estimate represents effective foil temperature; spatial hotspots and pulses faster than the reference instrument require different temperature evidence.

## Appendix: subsequent improvements

After this single-channel result, extend pulse rate within available temperature-reference bandwidth, improve electrical precision if resistance error dominates, or repeat the same calculation for additional channels. Preserve the demonstrated operating settings while evaluating each change.
