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
