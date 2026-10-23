# Thermopneumatic pixel drive


---

# Temperature control for thermopneumatic pixels

**Rev07 · 23 October 2026 · Circuit and controller specification**

## Summary

- **Implement temperature-limited pulses on Teensy.** Each request supplies a temperature ceiling and maximum duration. Teensy measures voltage and current during heating and turns the switch off at the earlier limit.
- **Use two temperatures:** metal temperature and an effective surrounding-material temperature. Keep both between pulses to account for accumulated heat. Fit three heat-transfer coefficients on the PC.
- **Prepare electrical calibration, resistance versus temperature for the actual alloy, and active-metal heat capacity.** A short pulse sequence then identifies heat-transfer coefficients. Measure each pixel's room-temperature resistance; share the material curve among pixels made from the same stock.
- **Handle nonmonotonic resistance with a lookup table.** Store the resistance range for each 1 °C temperature cell. Keep every cell consistent with measured resistance and thermal history; calculate switch-off time from the hottest remaining possibility.
- **Keep firmware small:** fixed arrays, table comparisons, four temperature endpoints per possible state, and a local switch-off timer. Use heat capacity from the current temperature range; PC performs calibration, fitting and plotting.
- **Use one material calibration, one fitting sequence and one separate operating check.** Add measurements where the operating check identifies a specific unresolved temperature or heat-transfer coefficient.

## 1. Hardware and information required before operation

**Goal:** assemble the measurement path and obtain the inputs used by the controller.

| Function | MacroTPP | Wire array |
|---|---|---|
| Processor | Teensy 4.1 | One Teensy 4.1 per eight pixels |
| Current measurement | INA253EVM A3, 0.4 V/A | INA190A2 and 0.100 Ω shunt, 5 V/A |
| Voltage measurement | Two terminal-voltage dividers; subtract on Teensy | Two TMUX1108 selectors and one AD8276 per eight pixels |
| Switch | CSD17305Q5A on a thermally suitable carrier | AO3400A per pixel at the established wire current |
| Temperature reference | Pyrometer viewing the active foil | Same-stock wire winding in a closed kiln, with an adjacent reference probe |

Use separate voltage-sense wires at the metal terminals. Teensy uses 3.3 V signals. USB connects it to the PC; heating power comes from the adjustable supply. The array's sensing and switching boards remain in the housing, at least 10 cm from the passive pixel array.

| Configuration | Required values | Use |
|---|---|---|
| Electrical calibration | Channel gains, offsets, errors, settling times and delays | Convert readings to terminal voltage and metal current |
| Resistance scale | Ambient temperature $`T_a`$, pixel resistance $`R_0`$, normalized curve $`q(T)=R(T)/R_0`$ and its uncertainty | Compare resistance with possible temperatures |
| Heat capacity | Active-metal mass $`m`$, specific heat $`c_p(T)`$, $`C(T)=mc_p(T)`$, uncertainty limits | Convert electrical heat to temperature change |
| Thermal coefficients | Positive $`G,\beta,\gamma`$, with fitted ranges | Estimate heat loss and retained heating |
| Electrical limits | Supply-voltage, metal-resistance and series-resistance ranges; off current | Include heat between measurements |
| Timing | Measurement interval, maximum data age $`a_{\max}`$, timer-to-physical-off delay $`\tau_{\rm off}`$ | Calculate the switch-off deadline |
| Operating limits | Ceiling $`T_c`$, established pulse duration $`t_p`$, repetition period $`T_r`$, maximum train length $`N_q`$ | Constrain stimulation requests |

Determine heat capacity from active-metal geometry or mass and material data; fit only the three heat-transfer coefficients. Measure $`R_0`$ after ambient equilibration and initialize both temperatures at that condition. After a warm processor reset, disable power for the cooling time established after the hottest permitted run. A cool foil reading alone does not establish that surrounding material has cooled.

## 2. Temperature estimate and switch-off calculation

**Goal:** turn each electrical measurement into a definite pulse-ending decision.

Use the two-state thermal model

```math
C(T)\frac{dT}{dt}=P-G(T-S),\qquad
\frac{dS}{dt}=\beta(T-S)-\gamma(S-T_a).
```

Here $`T`$ is effective metal temperature (°C), $`S`$ is effective surrounding-material temperature (°C), and $`P=VI`$ is electrical power in the metal (W). Conductance $`G`$ (W/K) determines heat transfer from the metal. Rates $`\beta,\gamma`$ (s⁻¹) determine surrounding-material heating and cooling. Keeping $`S`$ during pauses accounts for the effect of previous pulses.

For each measurement, execute four steps:

1. **Calculate voltage and current.** Apply channel calibration, align readings in time, and calculate the electrical intervals $`[V^-,V^+]`$, $`[I^-,I^+]`$. Include the uncertainty in room-temperature resistance $`[R_0^-,R_0^+]`$.
2. **Update both temperatures through the elapsed time.** Include settled heating, switching and cooling. Appendix D gives the four temperature-endpoint calculations; Appendix E supplies electrical heat for each interval.
3. **Keep temperatures consistent with resistance.** During settled conduction, calculate

```math
y^-=\frac{V^-}{I^+R_0^+},\qquad
y^+=\frac{V^+}{I^-R_0^-}.
```

For each predicted metal-temperature range, keep a table cell only when its resistance range overlaps $`[y^-,y^+]`$. Intersect retained cells with the predicted temperature range. Keep their associated surroundings-temperature ranges. If no state remains, turn off the switch and report a measurement/model mismatch.

4. **Set the stop time.** Let $`T_{\rm hot}`$ be the largest metal or surroundings temperature still possible, $`t_m`$ the time represented by the updated state, and $`C_{\min}`$ the smallest plausible heat capacity over the operating range. Set

```math
t_{\rm temperature}=t_m+
\frac{(T_c-T_{\rm hot})C_{\min}}{P_{\max}}-\tau_{\rm off}.
```

Set the timer to the earliest of this time, the original requested pulse end, and the measurement-expiry time. If the deadline has passed, turn off immediately. Otherwise, continue until that deadline or a new measurement changes it. Measurement expiry occurs at the last valid measurement time plus $`a_{\max}-\tau_{\rm off}`$.

Internal heat exchange cannot raise the hotter model temperature. Electrical heating raises it by at most $`P_{\max}/C_{\min}`$. The deadline therefore includes heating after the last reading and before physical switch-off. Obtain $`P_{\max}=V_{\max}^2/R_{\min}`$ from maximum rail voltage, including excursions, and minimum metal resistance.

**Example.** A resistance reading permits 420–445 °C and 615–650 °C. If thermal history permits 400–470 °C, keep 420–445 °C. If it permits 400–670 °C, keep both ranges and use at least 650 °C in the stop-time calculation. The code performs table comparisons rather than choosing an inverse branch of $`R(T)`$.

## 3. Fit and check the thermal response

**Goal:** estimate three coefficients from one short electrical sequence and check a different sequence.

Use an amplitude, duration $`t_p`$, repetition period $`T_r>t_p`$ and train length already demonstrated on the pixel. Set $`N=\min(10,N_q)`$.

1. From ambient, apply one $`t_p/2`$ pulse; wait $`40T_r`$ after switch-off.
2. Apply one $`t_p`$ pulse; wait $`40T_r`$.
3. Apply $`N`$ pulses of duration $`t_p`$, starting every $`T_r`$.
4. Wait $`2T_r`$ after the final switch-off; apply one $`t_p`$ pulse.
5. Wait $`20T_r`$; apply one final $`t_p`$ pulse.

Save timestamps, gate transitions, terminal voltage, metal current, saturation/settling flags, ambient temperature and $`R_0`$. Keep the modeled thermal state through every pause. Compare resistance only during settled conduction. If a half-duration pulse contains no settled reading, use $`t_p`$ instead.

Fit $`G,\beta,\gamma`$ by simulating temperature from measured power, calculating $`q(T)`$, and minimizing its weighted difference from measured $`R/R_0`$. Appendix C specifies starting values, numerical settings and parameter-range calculation.

For the independent operating check, alternate $`t_p/2`$ and $`t_p`$ for up to $`N`$ pulses at period $`T_r`$, wait $`5T_r`$, and apply one $`t_p`$ pulse. Keep fitted coefficients fixed. Compare measured and predicted resistance within each pulse and across pulse number. Run the complete observer on these data and determine whether its upper temperature estimate permits useful tactile output. For an array, include the intended neighboring-pixel activity.

| Observation | Action |
|---|---|
| Both sequences fit and useful pulses remain below the ceiling | Use the calibrated pulse amplitude, repetition rate and load range |
| Fits disagree mainly after a pause | Add the restart pulse giving the greatest predicted resistance separation |
| Fits disagree near a resistance turning point | Add one equilibrium temperature reference there |
| Residuals grow with pulse number or mechanical load | Refit for that condition; add a thermal state only if the repeated discrepancy remains |
| Electrical uncertainty consumes the temperature margin | Improve that measurement before increasing power |

## 4. Firmware organization

**Goal:** keep real-time work to measurement, arithmetic and switch commands.

- **Configuration:** electrical gains/errors, resistance cells, heat-capacity data, coefficient ranges, power limits and timing limits; loaded before a run.
- **Per-pixel state:** up to eight entries, each containing metal and surroundings temperature ranges and a coefficient-set identifier; also state time, requested pulse end and current deadline.
- **Measurement/control routine:** read channels, update states, apply the resistance table, set the deadline.
- **Timer:** drive the gate low at the deadline. Gate-low is the reset/default state.
- **PC connection:** load settings and retrieve traces. Buffer data while heating; transfer it outside the measurement calculation.

Use at most two coefficient sets. If more than eight state entries arise, merge the nearest pair with the same coefficient-set identifier: replace each temperature interval by the smallest interval containing both. This retains both possibilities. For an array, run the same calculations per pixel and schedule the bank timer for the earliest pending deadline.

## Appendix A. Electrical calibration and measurement pseudocode

**Goal:** obtain calibrated, time-aligned voltage/current readings and measured error allowances.

Apply two reference values spanning each channel's operating range, then check an intermediate value and repeated/warm-board readings. Retain the final electronics and cables. For the macro current channel, place the reference ammeter in the INA253/MOSFET branch. Calibrate the small negative-terminal voltage over its actual range.

```pseudocode
CALIBRATE_CHANNEL(code_low, value_low, code_high, value_high):
    gain = (value_high - value_low) / (code_high - code_low)
    offset = value_low - gain * code_low
    return gain, offset

CHECK_CHANNEL(reference_trials, gain, offset):
    error = 0
    for each trial:
        estimated = gain * trial.code + offset
        error = max(error, abs(estimated-trial.reference) + trial.reference_error)
    return error
```

Pulse a stable resistor through the complete circuit. Set settling time to the first time after switching at which reconstructed resistance stays within its selected error allowance. Measure channel delays and the delay from a gate-off command to cessation of heating. Repeat at the intended current and after the circuit warms. Measure residual off current in a foil power lead, which includes current bypassing the sensor through the divider.

For MacroTPP, acquire three pairs: current/positive terminal, current/negative terminal, current/positive terminal. Correct timestamps for channel delay and interpolate to the middle negative-terminal time. Interpolate within settled conduction only.

```pseudocode
MEASURE_MACRO():
    read the three current/voltage pairs, each with a timeout
    convert codes with channel gains and offsets
    subtract each channel delay from its sample time
    t = middle negative-terminal sample time
    Vplus = interpolate bracketing positive-terminal samples at t
    Isensor = interpolate bracketing current samples at t
    Vminus = middle negative-terminal voltage
    V = Vplus - Vminus
    I = Isensor + Vminus / Dminus
    return t, V, I, electrical_errors, settled, saturated
```

The negative divider's measured total resistance $`D_{\rm minus}`$ is nominally 2000 Ω. Its current traverses the foil but bypasses the sensor. In the array, calibrate the selected shunt-current and differential-voltage channels, then include divider bypass current as below. Calculate resistance only when the current's lower error limit exceeds the minimum calibrated current.

Construct error intervals explicitly. Interpolate lower and upper sample limits using the same nonnegative interpolation weights. For the macro circuit,

```math
\begin{aligned}
V^-&=V_+^- -V_-^+,\qquad V^+=V_+^+-V_-^-,\\
I^-&=I_s^-+\max(0,V_-^-)/D_-^+,\\
I^+&=I_s^++\max(0,V_-^+)/D_-^-.
\end{aligned}
```

Widen these intervals by the residual timing and settling errors established with the resistor. The array's negative-terminal divider also bypasses its shunt: add its calibrated bypass-current range to the sensor-current interval. A shared differential-voltage output alone does not measure that bypass current.

## Appendix B. Temperature references and resistance-table pseudocode

**Goal:** establish the temperature scale and prepare simple Teensy comparisons.

For foil, collect pyrometer temperature, voltage and current at steady DC conditions. Check temperature agreement along the active resistance-bearing path, with the measured region filling the pyrometer spot and emissivity/reflection corrections applied. If that path is nonuniform, the result is a geometry-specific resistance-versus-spot-temperature calibration; it does not establish the material's uniform-temperature curve.

For wire, wind a long same-stock length on an insulating ceramic fixture with separated turns. Keep it inside the closed kiln during measurement. Route heat-resistant leads through an existing rated feedthrough; place the reference probe adjacent to the winding. Use low measurement current and wait for temperature and resistance to settle. Opening the kiln before measuring introduces an unknown cooling interval. Series-connected foil and wire need not have equal temperatures because heat loss per unit length and end cooling differ.

Include ambient, both sides of each resistance extremum, the extremum region and the highest operating temperature. Repeat selected points during cooling. Normalize resistance by its ambient value. Use piecewise-linear interpolation with lower and upper curves $`q_-(T),q_+(T)`$ including reference error, observed variation and interpolation uncertainty. Begin with five anchors for a simple single-extremum curve; add points where its shape remains unresolved.

```pseudocode
BUILD_RESISTANCE_TABLE(measured_points, interpolation_allowance):
    for each measured point:
        R = measured_voltage / measured_current
        q = R / ambient_resistance
        q_low = V_low / (I_high * R0_high)
        q_high = V_high / (I_low * R0_low)
    sort points by temperature
    construct central, lower and upper piecewise-linear curves
    widen lower/upper curves for temperature-reference and interpolation errors

    for each 1-degree cell [T0, T1]:
        points = T0, T1, and every calibration knot inside this cell
        cell.q_low = minimum lower-curve value at these points
        cell.q_high = maximum upper-curve value at these points
        round q_low down and q_high up when storing floating-point values
    save central curve for PC fitting and cells for Teensy

BUILD_HEAT_CAPACITY_TABLE(mass_low, mass_high, material_data):
    for each temperature cell covering operation plus one update's possible rise:
        cp_low = smallest specific heat permitted over the whole cell
        cp_high = largest specific heat permitted over the whole cell
        cell.C_low = mass_low * cp_low
        cell.C_high = mass_high * cp_high
        round C_low down and C_high up for storage
    Cmin = minimum C_low over all cells
    save the capacity cells and Cmin
```

An 800-cell table uses 6.4 kB for two 32-bit resistance limits per cell. The index supplies temperature edges. Retaining whole cells enlarges each compatible-range boundary by at most 1 °C relative to the represented calibration band.

## Appendix C. Experiment and model-fitting pseudocode

**Goal:** reproduce the short experiment and calculate coefficients without choosing a resistance inverse.

```pseudocode
COLLECT_FITTING_DATA(tp, Tr, Nq):
    N = min(10, Nq)
    initialize from ambient; start timestamped electrical logging
    pulse(tp/2); wait_after_switch_off(40*Tr)
    pulse(tp); wait_after_switch_off(40*Tr)
    repeat N times, with pulse starts separated by Tr:
        pulse(tp)
    wait_after_switch_off(2*Tr); pulse(tp)
    wait_after_switch_off(20*Tr); pulse(tp)
    save electrical data, transitions and configuration
```

The `pulse` operation uses the established amplitude and finite duration; every wait preserves thermal history. Use the full duration in place of the half-duration pulse when required for a settled reading.

Fit positive coefficients through their logarithms. Reference scales are $`G_*=C(T_a)/t_p`$, $`\beta_*=1/T_r`$, $`\gamma_*=1/(20T_r)`$. Try all 27 starting combinations of factors 0.1, 1 and 10. Weight each normalized-resistance residual by its measured repeatability $`s_k`$.

```pseudocode
RESIDUALS(log_parameters, experiment, heat_capacity):
    G, beta, gamma = reference_scales * exp(log_parameters)
    set T and S to the independently established initial temperature
    solve the two temperature equations through the complete experiment
        use measured power; retain state through pauses
        split integration at each switch transition
    if integration fails or leaves the calibrated temperature range:
        return a fixed-length vector of large residuals and a failure flag
    for each settled conducting sample k:
        predicted_q = central_resistance_curve(T_at_sample_k)
        residual[k] = (predicted_q - measured_q[k]) / s[k]
    return residual

FIT_MODEL(experiment):
    solutions = empty list
    fit the nominal data from each of the 27 starting combinations
    keep distinct compatible solutions
    if none remain: stop and report that the model does not explain the data
    for each heat-capacity and electrical-calibration variant:
        refit from each retained solution
        keep distinct fits consistent with the full measurement-error bands
    repeat best fits with integration tolerances ten times smaller
    require predicted q to change by less than 0.1 * smallest s[k]
    return solutions
```

Use SciPy `least_squares`, method `trf`, linear loss, `x_scale=1`; use `solve_ivp`, method `Radau`, initially `rtol=1e-6`, `atol=1e-4` °C. Start searches between $`10^{-4}`$ and $`10^4`$ times each reference scale. Extend a search that reaches its endpoint; optimizer search limits are not physical parameter limits.

Interpolate measured power within settled intervals. At switching edges, use the measured waveform; if unresolved, repeat fitting with the lower and upper transition energies from Appendix E. Repeat for heat-capacity and channel-calibration alternatives. These trials assess sensitivity; check the resulting parameter ranges on the independent operating sequence.

```pseudocode
MAKE_FIT_VARIANTS(nominal_data, calibration_uncertainties):
    variants = nominal data
    add one variant using the lower heat-capacity curve
    add one variant using the upper heat-capacity curve
    for each voltage/current channel gain and offset:
        create one variant at its lower calibration limit and one at its upper limit
        apply that same change to the entire trace and the R0 measurement
        recompute voltage, current, power and normalized resistance
    if switch-edge energy was unresolved:
        add variants using all lower and all upper transition energies
    return variants
```

Vary one calibration quantity at a time; keep all other values nominal. This is a defined sensitivity calculation, supplemented by fitting against the complete error bands. Coefficient ranges inferred from these trials and profiles are engineering estimates, not a guarantee that every joint parameter combination has been identified.

```pseudocode
FIND_PARAMETER_RANGES(solutions):
    for each distinct solution and each coefficient:
        search upward and downward, for at most 20 doubling/halving steps each
            hold this coefficient fixed and refit the other two
            compare predicted resistance with electrical plus curve uncertainty
            stop in that direction at the first incompatible fit
        if every trial in a direction remains compatible: mark its endpoint unresolved
        otherwise bisect the last interval until endpoint ratio is below 1.05
    if an endpoint is unresolved: request the additional restart measurement below
    enclose compatible coefficients in one or two parameter sets
    run the complete observer on the separate operating sequence
    return parameter sets and operating-check results
```

For an unresolved coefficient range, simulate restart pulses after $`T_r,2T_r,5T_r,10T_r,20T_r,40T_r`$. Select the pause producing the greatest predicted resistance separation relative to measurement error. Perform that one additional restart experiment, then refit. Prioritize ambiguities that prevent useful pulses at the selected ceiling.

## Appendix D. Thermal-update pseudocode and mathematical basis

**Goal:** update the temperature ranges with explicit arithmetic in temperature units.

Each state stores $`T^-,T^+,S^-,S^+`$ and its coefficient-set identifier. Superscripts indicate lower/upper limits. Store lower/upper heat-capacity values for each temperature cell on the PC, including mass, specific-heat and interpolation uncertainty. Let $`C_{\min}`$ denote the smallest capacity over the complete operating range; keep this global value in the switch-off calculation. For a signed difference $`d`$, define

```math
\mathrm{low}(a,d)=\min(a^-d,a^+d),\qquad
\mathrm{high}(a,d)=\max(a^-d,a^+d).
```

These products handle either direction of heat flow. Subdivide time so that

```math
h\le\min\{C_{\min}/G^+,\;1/(\beta^++\gamma^+)\}.
```

Let $`[E^-,E^+]`$ enclose electrical heat delivered in that step and $`P_*`$ be its instantaneous power limit. First calculate the temperature range that can be reached during the step:

```math
\begin{aligned}
M&=\max(T^+-T_a,S^+-T_a)+P_*h/C_{\min},\qquad g_0=G^+/C_{\min},\\
T_{\rm reach}^-&=\max(T_a,T^- -hg_0M),\\
T_{\rm reach}^+&=\min(T_a+M,T^+ +h[P_*/C_{\min}+g_0M]).
\end{aligned}
```

Take the smallest and largest capacity values in every cell intersecting this range; call them $`c^-,c^+`$. Then set $`g^-=G^-/c^+`$, $`g^+=G^+/c^-`$. Using local capacity values avoids treating its entire temperature dependence as uncertainty on every update. Calculate

```math
\begin{aligned}
L_T&=P_*/c^-+g^+M,\quad L_S=(\beta^++\gamma^+)M,\\
\epsilon_T&=\tfrac12 g^+(L_T+L_S)h^2,\\
\epsilon_S&=\tfrac12[\beta^+L_T+(\beta^++\gamma^+)L_S]h^2.
\end{aligned}
```

Here $`M`$ limits temperature rise during the step; $`L_T,L_S`$ limit temperature-change rates. The $`\epsilon`$ terms include variation of heat exchange within the step. Electrical heat is integrated separately, requiring no derivative of the switching waveform.

```pseudocode
THERMAL_STEP(state, parameters, h, E_low, E_high, P_limit):
    copy old T_low, T_high, S_low, S_high
    M = max(T_high-Ta, S_high-Ta) + P_limit*h/Cmin
    g0 = G_high/Cmin
    reach_low = max(Ta, T_low-h*g0*M)
    reach_high = min(Ta+M, T_high+h*(P_limit/Cmin+g0*M))
    cells = heat-capacity cells intersecting [reach_low, reach_high]
    c_low = smallest lower capacity in cells
    c_high = largest upper capacity in cells
    g_low = G_low/c_high
    g_high = G_high/c_low
    LT = P_limit/c_low + g_high*M
    LS = (beta_high+gamma_high)*M
    epsilon_T = 0.5*g_high*(LT+LS)*h*h
    epsilon_S = 0.5*(beta_high*LT+(beta_high+gamma_high)*LS)*h*h
    d_low = T_low - S_low
    d_high = T_high - S_high
    new_T_low = T_low + E_low/c_high - h*high(g,d_low) - epsilon_T
    new_T_high = T_high + E_high/c_low - h*low(g,d_high) + epsilon_T
    new_S_low = S_low + h*(low(beta,d_low)-gamma_high*(S_low-Ta)) - epsilon_S
    new_S_high = S_high + h*(high(beta,d_high)-gamma_low*(S_high-Ta)) + epsilon_S
    set both new lower temperatures to at least Ta
    return new temperatures with the same coefficient-set identifier

UPDATE_THERMAL_STATES(states, start_time, end_time):
    split elapsed time at switch transitions and settling boundaries
    subdivide intervals to satisfy the step-size condition
    for each interval:
        obtain E_low, E_high and P_limit from Appendix E
        replace every state by THERMAL_STEP(state, interval)
    return states at end_time
```

If the reachable range exceeds the heat-capacity table, switch off and report a configuration-range error. At table construction, include the full allowed temperature range and the maximum temperature change during one update.

Under the step-size condition each Euler update is nondecreasing in both old temperatures for the capacity interval selected for that step. Lower/upper state corners, coefficient ranges and integration allowances therefore enclose the output. The endpoint temperature differences identify state corners, rather than extrema of the difference itself. This calculation allows temperature-dependent coefficients within the specified ranges without their derivatives.

The reachable-temperature calculation contains the entire within-step trajectory: the hotter state can rise by at most $`P_*h/C_{\min}`$, and metal cooling is limited by $`g_0M`$. Consequently the selected capacity cells cover all temperatures used during the step. This replaces a separate heat-content table and its inverse with a minimum/maximum lookup.

## Appendix E. Electrical heat between readings

**Goal:** include settled heating, switching and cooling in every temperature update.

For fixed-voltage drive, measure supply range $`[V_s^-,V_s^+]`$ and effective series resistance $`R_s=(V_s-V)/I`$ over intended current and circuit temperature. The calibrated material curve and $`R_0`$ give the complete metal-resistance range $`[R_{\min},R_{\max}]`$. For $`R_{\min}>R_s^+\ge R_s^-\ge0`$,

```math
P_{\rm on}^- = \frac{(V_s^-)^2R_{\max}}{(R_{\max}+R_s^+)^2},\qquad
P_{\rm on}^+ = \frac{(V_s^+)^2R_{\min}}{(R_{\min}+R_s^-)^2}.
```

For settled off time, use $`P_{\rm off}^+=R_{\max}I_{\rm off,max}^2`$. Measure residual metal current, including divider and electronics leakage. During switching and analog settling, use $`P_{\max}=V_{\max}^2/R_{\min}`$, including voltage excursions.

```pseudocode
ELECTRICAL_HEAT(interval_type, duration):
    if interval_type == settled_ON:
        return P_on_low*duration, P_on_high*duration, P_on_high
    if interval_type == settled_OFF:
        return 0, P_off_high*duration, P_off_high
    return 0, Pmax*duration, Pmax
```

Apply the settled-ON expression while the supply remains in constant-voltage operation. Stop a run when the measured power interval, including electrical error, has no overlap with the configured power interval. Integrating measured $`VI`$ supplies the energy trace for fitting and plots; the wider interval includes unmeasured changes between samples.

## Appendix F. Resistance correction and complete pulse-controller pseudocode

**Goal:** specify every start, measurement update and stop.

```pseudocode
MATCH_RESISTANCE(states, y_low, y_high):
    result = empty list
    for each state:
        if state temperature extends outside the calibrated table:
            switch gate OFF; disable further pulses; report calibration-range error
            return original states without resistance correction
        current_run = empty
        for each temperature cell overlapping [state.T_low, state.T_high]:
            if cell.q_low <= y_high AND cell.q_high >= y_low:
                T_low = max(state.T_low, cell.temperature_low)
                T_high = min(state.T_high, cell.temperature_high)
                extend current_run when adjacent; otherwise finish it and start a new run
            else:
                finish current_run, if present
        finish current_run, if present
    return result

FINISH_RUN(current_run, source_state):
    create candidate with this T range, source S range and coefficient-set identifier
    if result has fewer than eight entries: append candidate
    else:
        among result plus candidate, find closest T ranges sharing a coefficient set
        merge that pair using the smallest enclosing T and S intervals
        store the resulting eight entries
    clear current_run

SET_STOP_TIME():
    T_hot = largest T_high or S_high among all stored states
    temperature_end = state_time + (ceiling-T_hot)*Cmin/Pmax - turn_off_delay
    data_end = last_valid_measurement_time + max_data_age - turn_off_delay
    deadline = min(requested_end, temperature_end, data_end)
    if deadline <= now:
        switch gate OFF
    else:
        set the local switch-off timer to deadline

START_PULSE(ceiling, duration):
    require initialized temperatures and no unresolved fault
    require gate is OFF, repetition interval elapsed, and train count below its limit
    require ceiling and duration within configured operating limits
    finish or discard pending measurement reads before updating OFF state
    update stored temperatures through elapsed OFF time to now
    state_time = now
    requested_end = now + duration
    last_valid_measurement_time = now
    SET_STOP_TIME()
    briefly prevent timer interrupts:
        if deadline > now:
            arm timer, switch gate ON and save transition time
    restore timer interrupts
    if gate was switched ON:
        save pulse-start time and increment train count

ON_MEASUREMENT(sample):
    if timeout or channel failure:
        switch gate OFF; disable further pulses; report fault; return
    if sample.time <= state_time:
        discard this sample; return
    update states to sample.time using all elapsed power intervals
    state_time = sample.time
    if sample is settled_ON:
        if sample is saturated:
            switch gate OFF; disable further pulses; report fault; return
        if current's lower limit is below the calibrated minimum:
            switch gate OFF; disable further pulses; report fault; return
        if measured and configured power intervals do not overlap:
            switch gate OFF; disable further pulses; report fault; return
        calculate y_low and y_high from voltage, current and R0 errors
        states = MATCH_RESISTANCE(states, y_low, y_high)
        if states is empty:
            switch gate OFF; disable further pulses; report mismatch; return
        last_valid_measurement_time = sample.time
    if gate is ON:
        SET_STOP_TIME()
    save sample, temperature ranges, energy and stop reason in a buffer

ON_TIMER_DEADLINE():
    switch gate OFF
    log switch time

WHILE_GATE_IS_OFF():
    finish or discard pending measurement reads
    UPDATE_THERMAL_STATES(states, state_time, now)
        include physical turn-off and settling before residual off power
    state_time = end time of that update
    retain both temperatures for the next pulse
    transfer buffered measurements when time is available
```

Use one gate-off helper so every stop logs its transition time. The array version stores these fields per pixel and sets the bank timer to the earliest deadline. At expiry, turn off all pixels whose deadlines have arrived and schedule the next. A measurement/model fault disables subsequent requests until its cause is corrected and the initial thermal condition is re-established.

## Appendix G. Interpretation of the temperature result

**Goal:** distinguish effective metal temperature from spatial peak temperature.

The estimate contains the actual reduced-model state when initial temperatures, electrical heat, thermal coefficients, heat capacity and resistance calibration lie within their specified ranges. The fitting sequence and independent operating check establish the practical operating range for these assumptions.

Equilibrium resistance calibration describes uniformly heated metal. Operating resistance instead integrates temperature-dependent resistivity along the active path. The observer estimates an effective temperature consistent with that resistance and the thermal model; a narrow section or nonuniform thermal contact can be hotter. Establish the operating ceiling on representative fabricated pixels under repeated pulses and intended mechanical contact.

On a locally monotonic curve, relative resistance error $`\varepsilon_r`$ corresponds approximately to temperature uncertainty $`\delta T=\varepsilon_r/|d\ln R/dT|`$. At sensitivity 10 parts per million per kelvin, 0.025% resistance error corresponds to 25 K temperature uncertainty. Near a turning point, use the complete resistance table and thermal history.

This specification supplies the calculations and calibration procedures. Timing, actuator parameters and temperature performance require measurement on the assembled system.

---

# MacroTPP: circuit, calibration and operation

- **Purpose:** drive one tactile pixel; stop heating at an estimated temperature ceiling.
- **Hardware:** Teensy 4.1, INA253EVM, MOSFET and two voltage dividers; adjustable 0–5 V supply, current below 5 A.
- **Temperature reference:** equilibrium pyrometer readings paired with electrical resistance.
- **Computation:** Teensy measures and controls; PC calibrates, fits and plots.
- **Prerequisites:** approximately 1 Ω foil, active dimensions and alloy properties; assembled circuit, bench meter, oscilloscope and suitable pyrometer.

![MacroTPP electrical circuit](../assets/figures/macro-circuit.png)

## 1. Circuit

**Goal:** deliver controlled heating and measure voltage directly across the foil.

Connect supply positive → **foil → INA253 current path → CSD17305Q5A → supply negative**. Mount the MOSFET on an assembled copper carrier. Attach two power wires and **two separate voltage-sense wires at the foil pads**. Each sense wire feeds a 1 kΩ/1 kΩ divider; subtraction excludes cable, sensor and switch losses.

USB powers Teensy; its regulator supplies **3.3 V** to the sensor. Analog inputs and control signals are not 5 V tolerant. Dividers halve terminal voltage. Join signal grounds at the power-stage reference; route heater current separately.

For 1 Ω foil, 2, 3 and 4 V across it produce **4, 9 and 16 W**. Select voltage from minimum foil resistance, keeping current below 5 A and normal pulses within constant-voltage operation.

## 2. Calibration

**Goal:** establish electrical accuracy, the temperature scale and retained heating.

1. **Voltage:** disconnect heater power; calibrate each input at two measured DC potentials. Check intermediate values and the small negative-terminal voltage during conduction.
2. **Current:** use a stable 1 Ω power resistor and ammeter **in the INA253/MOSFET branch**. Calibrate at two positive currents; check intermediate current and warm operation. Remove the ammeter afterward.
3. **Pulsed electrical check:** use final wiring. Measure resistance error, settling, turn-off delay, supply variation and effective series resistance. Measure off-current in a foil power lead; the sensor branch misses divider leakage.
4. **Temperature:** use the same circuit under steady DC. Step supply voltage; record voltage, current and pyrometer temperature once electrical and temperature readings are stable within instrument repeatability. Include the resistance turning region and highest operating temperature; repeat during cooling. The optical spot must lie wholly on foil. Account for emissivity and reflections; check center and near-contact temperatures across the active heated path. Without spatial agreement within the calibration allowance, the result is a geometry-dependent resistance–spot-temperature relation, unsuitable as a material resistance–temperature curve.
5. **Dynamics:** collect data from the specified pulse sequence, fit the thermal model and run the independent verification sequence in Appendix D. Check tactile displacement or force repeatability.

## 3. Operation

**Goal:** execute finite, locally controlled pulse sequences.

1. **Load inputs:** electrical gains/errors, $`R_0`$, resistance and heat-capacity cells, coefficient ranges, ceiling $`T_c`$, pulse duration $`t_p`$, global minimum capacity $`C_{\mathrm{global,min}}`$, full heating bound $`P_{\max}`$, turn-off allowance $`\tau_s`$, and maximum data age $`\tau_f`$. Keep separate state time and last-valid-measurement time.
2. **Prepare the pulse:** finish pending reads; calculate both temperature ranges through the entire off interval, including turn-off settling. Fix original end $`t_0+t_p`$. Calculate the deadline below. In one short critical section, recheck that deadline, arm the timer and raise the gate; otherwise leave the gate low.
3. **Process each settled reading:** calculate $`V_h=V_+-V_-`$ and $`I_h=I_s+V_-/D_-`$, with $`D_-\approx2000\,\Omega`$. Reject stale timestamps and invalid current/power intervals. Calculate normalized-resistance limits $`y^-=V_h^-/(I_h^+R_0^+)`$, $`y^+=V_h^+/(I_h^-R_0^-)`$. Execute the four temperature-endpoint updates in F1. Retain a cell only when $`Q_{\max}\ge y^-`$ and $`Q_{\min}\le y^+`$; intersect its temperature span with the calculated range. Keep associated surroundings ranges and every compatible branch.
4. **Set the deadline:** with state time $`t_m`$, last valid reading $`t_v`$, and $`M=\max(T_{\rm high},S_{\rm high})`$ across retained states, use
   ```math
   t_{\rm stop}=\min\left[t_0+t_p,\ t_m+\frac{(T_c-M)C_{\mathrm{global,min}}}{P_{\max}}-\tau_s,\ t_v+\tau_f-\tau_s\right].
   ```
   Lower the gate if this time has passed. On timeout, calibration-range error or measurement/model disagreement, lower it, preserve thermal state and disable subsequent pulses. Every stop records its actual gate-transition time.

After reset, enforce the cooling time established after the hottest allowed run. A cool foil reading alone does not establish that surrounding material has cooled. Initialize the first-reading expiry from pulse start; subsequently refresh it only after a valid settled measurement. USB work remains outside these calculations.

## Appendix A. Assembly

**Goal:** specify connections.

| Component | Configuration |
|---|---|
| Teensy 4.1 | USB power; 3.3 V sensor supply/signals |
| INA253EVM A3 | REF1/REF2 grounded; 0.4 V/A nominal; 100 nF supply bypass |
| CSD17305Q5A | Copper carrier; source to supply negative |
| Gate | Pin 2 → 1 kΩ → gate; 100 kΩ gate-to-source |
| Current | Sensor output → 100 Ω → pin 14/ADC0; 1 nF to ground |
| Positive terminal | 1 kΩ/1 kΩ divider → pin 26/ADC1; 1 nF midpoint-to-ground |
| Negative terminal | Identical divider → pin 27/ADC1 |
| Dividers | 0.1%, low temperature coefficient |
| Supply | Adjustable 0–5 V; current limit below 5 A |

Power analog electronics before heater supply; disconnect heater power for rewiring.

## Appendix B. Electrical software

**Goal:** convert ADC codes into aligned foil measurements.

### Algorithm B1. CalibrateElectrical — PC

**Inputs:** two reference readings and corresponding mean ADC codes for each channel $`j\in\{+,-,s\}`$; intermediate/warm checks; reference and measurement-error allowances. Channels are positive-terminal voltage, negative-terminal voltage and sensor-branch current.

1. **For each channel $`j`$:**
   - Read reference values $`x_1,x_2`$ and ADC means $`c_1,c_2`$.
   - **If** $`c_1=c_2`$, **stop**: calibration failed.
   - Calculate $`a_j=(x_2-x_1)/(c_2-c_1)`$, $`b_j=x_1-a_jc_1`$.
   - Convert each check code using $`x=a_jc+b_j`$.
   - **If** a check exceeds its error allowance, **stop**: resolve the discrepancy.
   - Store $`a_j,b_j`$, error allowance and calibrated channel delay.
2. Store the measured negative-divider resistance interval $`[D_-^-,D_-^+]`$, nominally centered on **2000 Ω**.

### Algorithm B2. ReadFoil — Teensy

**Inputs:** B1 calibration, conversion timeout, settled-conduction flag and minimum calibrated current $`I_{\min}`$.

1. **If** conduction has not settled, **return** current time and “no resistance reading,” with settled flag false.
2. Acquire three paired readings: current with positive terminal; current with negative terminal; current with positive terminal. **If** a conversion times out or saturates, **return fault**.
3. Convert codes using B1. Correct timestamps for calibrated channel delays. Set $`t_m`$ to the negative-terminal reading’s effective time.
4. Interpolate the two bracketing positive-terminal readings to $`t_m`$. Likewise interpolate two current readings whose effective times bracket $`t_m`$:
   ```math
   \mathrm{interp}(x_a,x_b;t)=x_a+\frac{t-a}{b-a}(x_b-x_a).
   ```
   **If** either bracket is missing or crosses switching, **return fault**.
5. Let the aligned values be $`V_+,V_-,I_s`$. Calculate
   ```math
   V_h=V_+-V_-,\qquad I_h=I_s+V_-/D_-,\qquad R_h=V_h/I_h.
   ```
   The added current passes through the foil but bypasses the sensor.
6. Apply calibrated error limits, including residual interpolation error. With nonnegative terminal/current intervals, form
   ```math
   V_h^- =V_+^- -V_-^+,\quad V_h^+=V_+^+-V_-^-,
   ```
   ```math
   I_h^-=I_s^-+\max(0,V_-^-)/D_-^+,\quad
   I_h^+=I_s^++\max(0,V_-^+)/D_-^-.
   ```
   **If** $`V_h^-\le0`$ or $`I_h^-<I_{\min}`$, **return fault**.
7. **Return** $`t_m,V_h,I_h,[V_h^-,V_h^+],[I_h^-,I_h^+]`$.

## Appendix C. Temperature-table preparation

**Goal:** preserve every resistance-compatible temperature, including different branches.

### Algorithm C1. PrepareCells — PC

**Inputs:** calibrated normalized resistance curves $`q_-(T),q_+(T)`$, including temperature-reference and interpolation uncertainty; heat-capacity curves $`C_-(T),C_+(T)`$ from active mass and alloy data.

1. Divide the calibrated operating range into **1 °C cells**.
2. **For each cell $`[T_i,T_{i+1}]`$:**
   - Set $`Q_{\min}`$ to the minimum of $`q_-`$ within the cell.
   - Set $`Q_{\max}`$ to the maximum of $`q_+`$ within the cell.
   - Store the minimum of $`C_-`$ and maximum of $`C_+`$ within the cell.
   - For piecewise-linear curves, evaluate cell endpoints and every enclosed curve knot; do not miss an internal turning point.
3. Set $`C_{\mathrm{global,min}}`$ to the minimum stored heat capacity.
4. **Return** the cell table and global minimum. Keep heat-capacity uncertainty separate from temperature dependence.

Here $`q(T)=R(T)/R_0`$, with $`R_0`$ the measured reference resistance at ambient $`T_a`$. Heat capacity is in J/K; it is fixed from geometry/material information rather than fitted freely.

## Appendix D. Thermal identification

**Goal:** obtain thermal coefficients from the specified pulse sequence.

Use foil temperature $`T`$, effective surroundings temperature $`S`$, and
```math
C(T)\dot T=P_h-G(T-S),\qquad
\dot S=\beta(T-S)-\gamma(S-T_a).
```
$`G`$ is W/K; $`\beta,\gamma`$ are s$`^{-1}`$. All three coefficients are positive.

### Algorithm D1. CollectPulseDataAndFit — PC and Teensy

1. Choose checked duration $`t_p`$, onset interval $`T_r>t_p`$, and $`N=\min(10,N_q)`$, where $`N_q`$ is the checked pulse-count limit.
2. Start after established cooling. Log timestamps, gate transitions, calibrated voltage/current, valid-reading flags, $`T_a`$ and $`R_0`$.
3. Apply $`t_p/2`$, using $`t_p`$ if the shorter pulse supplies no settled reading; wait $`40T_r`$ after turn-off.
4. Apply $`t_p`$; wait $`40T_r`$ after turn-off.
5. Apply $`N`$ pulses of width $`t_p`$, starts separated by $`T_r`$.
6. Wait $`2T_r`$ after the last turn-off; apply $`t_p`$. Wait $`20T_r`$ after turn-off; apply $`t_p`$.
7. Set reference scales $`G_*=C(T_a)/t_p`$, $`\beta_*=1/T_r`$, $`\gamma_*=1/(20T_r)`$. Try all **27** starting combinations of factors 0.1, 1 and 10.
8. **For each candidate vector $`z`$:** set $`(G,\beta,\gamma)=(G_*,\beta_*,\gamma_*)\exp z`$; integrate the model through every pulse and pause. At valid settled-on samples calculate $`r_k=[q(T(t_k))-R_h(t_k)/R_0]/s_k`$, where $`s_k>0`$ is normalized-resistance repeatability. Minimize $`\sum r_k^2`$; reject integration failure or temperature outside calibration.
9. Refit under lower/upper capacity and channel-calibration alternatives, changing one calibration quantity throughout the trace and $`R_0`$ together. Include lower/upper switch-edge energy when unresolved. Tighten integration tolerances tenfold; require predicted normalized resistance to change by less than $`0.1\min s_k`$.
10. **Profile each coefficient:** hold it fixed, refit the other two, and move upward/downward by factors of two for at most 20 steps. Stop at the first incompatible fit; bisect the final bracket until its ratio is below 1.05. If no incompatible point is found, mark that limit unresolved rather than treating the search endpoint as physical. Retain one or two coefficient sets.
11. **Verify without refitting:** after established cooling, alternate widths $`t_p/2,t_p`$ for $`N`$ pulses at $`T_r`$; wait $`5T_r`$ after turn-off, then apply $`t_p`$. Save residuals and observer results. Resolve systematic disagreement before use; unresolved parameter limits require an additional informative restart measurement.

Compare compatibility against full electrical and resistance-curve error bands. These fitted ranges are engineering estimates. Off intervals provide no resistance observations.

## Appendix E. Electrical-energy bookkeeping

**Goal:** account for heat delivered between observations.

For supply interval $`[V_s^-,V_s^+]`$, effective series resistance $`R_s=(V_s-V_h)/I_h`$, and complete heater-resistance range $`[R_{\min},R_{\max}]`$, require $`R_{\min}>R_s^+\ge R_s^-\ge0`$. Settled-on power is bounded by
```math
P_{\rm on}^-=\frac{(V_s^-)^2R_{\max}}{(R_{\max}+R_s^+)^2},\qquad
P_{\rm on}^+=\frac{(V_s^+)^2R_{\min}}{(R_{\min}+R_s^-)^2}.
```
Set $`P_{\rm switch}^+=V_{\max}^2/R_{\min}`$ and $`P_{\rm off}^+=R_{\max}I_{\rm off,max}^2`$. The voltage bound includes switching excursions; the off-current bound includes divider leakage.

### Algorithm E1. EnergySegments — Teensy

1. Split the requested time interval at every gate transition and measured settling boundary.
2. **For each resulting segment of duration $`h`$:**
   - **Settled on:** return $`[E^-,E^+]=[P_{\rm on}^-h,P_{\rm on}^+h]`$ and $`P=P_{\rm on}^+`$.
   - **Switching/settling:** return $`[0,P_{\rm switch}^+h]`$ and $`P=P_{\rm switch}^+`$.
   - **Settled off:** return $`[0,P_{\rm off}^+h]`$ and $`P=P_{\rm off}^+`$.
3. Use these segments separately in F1. Sampled $`V_hI_h`$ gives nominal power; it does not narrow these between-reading bounds.

## Appendix F. Thermal-state computation

**Goal:** calculate temperature changes using heat capacity over the range reachable during each step.

Store up to eight rectangles with fields $`T_{\rm low},T_{\rm high},S_{\rm low},S_{\rm high}`$, coefficient-set identifier and represented time. Superscripts $`-,+`$ below denote their low/high values.

For scalar $`d`$, define
```math
p_-(a,d)=\min(a^-d,a^+d),\qquad p_+(a,d)=\max(a^-d,a^+d).
```

### Algorithm F1. AdvanceRange — Teensy

**Inputs:** one rectangle, its coefficient ranges, one energy segment from E1.

1. Subdivide the segment so that
   ```math
   h\le\min\{C_{\mathrm{global,min}}/G^+,\,1/(\beta^++\gamma^+)\}.
   ```
   Compute energy bounds separately for each substep.
2. **For each substep, using its phase power bound $`P`$:**
   ```math
   \begin{aligned}
   M&=\max(T^+-T_a,S^+-T_a)+Ph/C_{\mathrm{global,min}},\\
   g_0&=G^+/C_{\mathrm{global,min}},\\
   T_{\rm reach}^-&=\max(T_a,T^- -hg_0M),\\
   T_{\rm reach}^+&=\min(T_a+M,\ T^++h[P/C_{\mathrm{global,min}}+g_0M]).
   \end{aligned}
   ```
3. **If** this reachable interval leaves the calibrated table, **return fault**. Among all cells intersecting it, take the minimum capacity as $`C_{\min,\mathrm{step}}`$ and maximum as $`C_{\max,\mathrm{step}}`$.
4. Set $`g^-=G^-/C_{\max,\mathrm{step}}`$, $`g^+=G^+/C_{\min,\mathrm{step}}`$, then calculate
   ```math
   \begin{aligned}
   L_T&=P/C_{\min,\mathrm{step}}+g^+M,&L_S&=(\beta^++\gamma^+)M,\\
   \epsilon_T&=\tfrac12g^+(L_T+L_S)h^2,&
   \epsilon_S&=\tfrac12[\beta^+L_T+(\beta^++\gamma^+)L_S]h^2.
   \end{aligned}
   ```
5. Using **old** endpoints throughout the right-hand sides, calculate
   ```math
   \begin{aligned}
   T_{\rm new}^-&=T^-+E^-/C_{\max,\mathrm{step}}-h\,p_+(g,T^--S^-)-\epsilon_T,\\
   T_{\rm new}^+&=T^++E^+/C_{\min,\mathrm{step}}-h\,p_-(g,T^+-S^+)+\epsilon_T,\\
   S_{\rm new}^-&=S^-+h[p_-(\beta,T^--S^-)-\gamma^+(S^--T_a)]-\epsilon_S,\\
   S_{\rm new}^+&=S^++h[p_+(\beta,T^+-S^+)-\gamma^-(S^+-T_a)]+\epsilon_S.
   \end{aligned}
   ```
6. Replace lower endpoints below $`T_a`$ by $`T_a`$; store the four new endpoints and advance represented time.

These calculations assume passive two-state dynamics, an enclosed initial state, and valid coefficient, capacity and electrical bounds. The $`\epsilon`$ terms account for integration error; they are not optional tuning gains.

### Algorithm F2. RestrictRanges — Teensy

1. From B2, calculate $`y^-=V_h^-/(I_h^+R_0^+)`$, $`y^+=V_h^+/(I_h^-R_0^-)`$.
2. **For each predicted rectangle:** if its foil-temperature range exceeds the calibrated table, return a fault and preserve the original states.
3. Scan overlapping cells. Skip cells with $`Q_{\max}<y^-`$ or $`Q_{\min}>y^+`$. For every other cell, intersect its span with $`[T^-,T^+]`$; combine adjacent intersections into a continuous run.
4. **Whenever a run ends:** create a candidate with its temperature span, source surroundings range and coefficient-set identifier. If fewer than eight entries exist, append it. Otherwise, among the eight entries plus candidate, merge the nearest pair sharing a coefficient set into their enclosing temperature and surroundings ranges. Store the resulting eight entries. This keeps memory bounded during scanning.
5. **If no candidates remain:** return a mismatch fault and preserve the predicted states. Otherwise return the retained ranges. Never discard a hotter alternative.

## Appendix G. Pulse-control pseudocode

**Goal:** enforce finite local deadlines independently of the PC.

**Configuration:** ceiling $`T_c`$; maximum duration; $`C_{\mathrm{global,min}}`$; full heating-power bound $`P_{\max}>0`$; timer-dispatch plus physical turn-off bound $`\tau_s`$; maximum measurement age $`\tau_f>\tau_s`$. Preserve the original pulse-end time once a pulse begins.

### Algorithm G1. SetDeadline — Teensy

1. Let $`t_m`$ be state time, $`t_v`$ last-valid-measurement time, and $`M=\max(T^+,S^+)`$ across stored states.
2. Calculate $`t_{\rm temperature}=t_m+(T_c-M)C_{\mathrm{global,min}}/P_{\max}-\tau_s`$.
3. Set $`t_{\rm stop}=\min(t_{\rm original},t_{\rm temperature},t_v+\tau_f-\tau_s)`$.
4. **If** the deadline has passed, call GateOff. Otherwise arm the gate-off timer. Return the deadline.

### Algorithm G2. RunFiniteSequence — Teensy

1. Require initialized temperatures, valid calibration and no unresolved fault. Load the finite count and scheduled onsets. Initialize temperatures only after established cooling.
2. **Before each pulse:** require gate low, elapsed repetition interval and remaining count. Finish or discard pending reads. Snapshot $`t_0=\text{now}`$; update all states through off time to $`t_0`$, including physical turn-off and settling, using E1/F1. Set state time to that update's end.
3. Fix $`t_{\rm original}=t_0+\min(t_p,t_{\rm configured,max})`$. Set $`t_v=t_0`$ for first-reading grace and calculate G1.
4. **Briefly prevent timer interrupts:** recheck $`t_{\rm stop}>\text{now}`$; only then arm the timer, raise the gate and record actual transition time. Restore interrupts. If the gate remained low, stop the sequence.
5. **For each completed measurement:**
   - On timeout/channel failure, call GateOff, preserve state and disable subsequent pulses.
   - If its time is no later than stored state time, discard it; never refresh data expiry.
   - Use E1/F1 to update all states to the reading time; store that time even when resistance is unavailable.
   - **Only if settled on:** require nonsaturated inputs and current lower limit at least $`I_{\min}`$; require measured power $`[V_h^-I_h^-,V_h^+I_h^+]`$ to overlap configured $`[P_{\rm on}^-,P_{\rm on}^+]`$. On either failure, stop and disable subsequent pulses.
   - **Only if settled on:** call F2. On fault, preserve predicted state and stop. Otherwise store its result and refresh $`t_v`$.
   - If the gate remains high, call G1. Preserve the original pulse end.
6. **While off:** finish or discard pending reads, update states through all elapsed energy phases to a captured end time, and store that time. Retain both temperatures; transfer buffered logs when time permits.
7. **Timer interrupt:** call GateOff at its deadline.

**GateOff:** lower the gate; log its actual transition once. Fault paths also disable further requests until the cause is resolved and the initial thermal condition is re-established. After reset, enforce the established cooldown.

---

# Wire TPP array — circuit and temperature control

- Build **32 channels as four identical eight-pixel boards**, each controlled by one Teensy 4.1.
- Give every heater an independent switch and current sensor; share voltage measurement across each board.
- Keep the tactile array passive, with the electronics **at least 10 cm away** and separate voltage-sense connections at the heater pads.
- Use one batch resistance–temperature calibration, each pixel's room-temperature resistance, and local pulse deadlines.

## 1. Circuit

**Goal:** measure each heater's electrical resistance while controlling its heating pulses independently.

![One heater channel, repeated eight times per board](../assets/figures/array-channel-circuit.png)

![Shared voltage measurement and Teensy connections](../assets/figures/array-shared-circuit.png)

*Electrical schematic in two sheets; component placement and PCB routing are separate layout steps.*

Each channel uses an **AO3400A**, **0.100 Ω shunt** and **INA190A2**. Two selectors and one **AD8276** measure the voltage across the selected heater. The other heaters continue operating during selection. Separate sense connections exclude power-cable and contact voltage drops from heater-voltage measurement.

At **0.47 A through the shunt**, the current amplifier outputs **2.35 V** and the shunt dissipates **22 mW**. Set the initial heater-current ceiling to **0.55 A**, including current that bypasses the shunt through the voltage-sensing network.

## 2. Power and local control

**Goal:** supply concurrent pixels and stop each pulse from its local temperature estimate.

A **12.5 Ω heater at 2.8 W** draws approximately **0.47 A at 5.9 V**. Eight simultaneous heaters draw about **3.8 A**; 32 require about **15 A and 90 W instantaneous heater power**. At 20% duty, mean heater power is approximately **18 W**. Set the rail above the required heater voltage by the measured cable, shunt and switch drops, within the circuit's voltage range. Size the supply for concurrent loads or limit simultaneous heating.

The PC loads calibration and run settings, then collects logs. Each Teensy scans its eight channels and enforces pulse deadlines locally. A wired start signal can coordinate boards. Measure the complete delay from sampling through computation to switch turn-off and include it in the deadline calculation.

The thermal model tracks heater temperature $`T`$ and surrounding-material temperature $`S`$:

```math
C(T)\dot T=P-G(T-S),\qquad
\dot S=\beta(T-S)-\gamma(S-T_a).
```

Here $`P`$ is heater power, $`C`$ its heat capacity, $`T_a`$ ambient temperature, and $`G,\beta,\gamma`$ fitted heat-transfer coefficients. Retain both states between pulses. Resistance measurements narrow predicted temperature ranges using the batch calibration; retain all compatible branches when the curve is nonmonotonic. Set the next cutoff from the highest remaining heater or surrounding temperature, the minimum heat capacity and maximum possible heater power.

## 3. Measurement and calibration

**Goal:** obtain heater resistance with explicit electrical uncertainty.

Calibrate each current path at two positive currents, measuring the reference current in the **shunt/MOSFET branch**, and check an intermediate value. Fit $`I_s=a_I n_I+c_I`$, where $`n_I`$ is the ADC reading. Calibrate the complete voltage path similarly as $`V_h=a_V n_V+c_V`$, including dividers, selectors and AD8276 loading. Check error over the installed common-mode voltage and concurrent-load range.

Heater current includes sensing-network current that bypasses the shunt:

```math
I_h\in[I_s^-+b^-,\ I_s^++b^+],\qquad
R_h\in\left[\frac{V_h^-}{I_h^+},\frac{V_h^+}{I_h^-}\right],\quad I_h^->0.
```

The interval $`[b^-,b^+]`$ bounds this additional, signed current. With only the 3 kΩ/1 kΩ return divider connected, it is approximately $`V_-/4000`$, where $`V_-`$ is the heater's negative-terminal voltage. The selected AD8276 path adds loading. During the resistor-load checkout, compare a reference measurement in the **heater lead, before the sensing branch**, with calibrated shunt current; retain a range covering selector states, concurrent loads, circuit warming and reference-meter error. Include residual settling error in the voltage and current intervals.

Use settled ON readings for resistance. During switching and OFF periods, propagate the thermal states with the corresponding power bounds. Preserve sample timestamps; stop heating on stale data, a missed acquisition deadline, or disagreement between settled measurements and the calibrated electrical range.

## Appendix A — bill of materials

### Per-pixel parts

| Item | Selected part/configuration |
|---|---|
| Current amplifier | **INA190A2DCKR**, SC70-6, gain 50, 3.3 V, REF grounded |
| Shunt | **Vishay WSLP0805R1000FEA**, 0.100 Ω, 1%, 0.5 W; calibrate installed value |
| Heater MOSFET | **AO3400A** |
| Gate components | **1 kΩ** series; **100 kΩ** gate-to-source |
| Voltage scaling | Two **3.00 kΩ/1.00 kΩ** divider pairs, 0.1%, preferably ≤25 ppm/K; heater rail below 10 V |
| Filtering | **1 nF** per divider midpoint; current output **100 Ω/1 nF** |
| Supply bypass | **100 nF** at the current amplifier |

### Complete system

| Part/function | Eight-pixel board | 32-pixel system |
|---|---:|---:|
| Teensy 4.1 | 1 | 4 |
| INA190A2DCKR | 8 | 32 |
| 0.100 Ω WSLP0805 shunt | 8 | 32 |
| AO3400A + gate resistor + pull-down | 8 sets | 32 sets |
| TMUX1108PWR | 2 | 8 |
| AD8276BRZ | 1 | 4 |
| 3.00 kΩ/1.00 kΩ divider pairs | 16 pairs | 64 pairs |
| Divider 1 nF capacitors | 16 | 64 |
| Current-output 100 Ω/1 nF filters | 8 | 32 |
| Voltage-output 100 Ω/100 pF filter | 1 | 4 |
| Analog-IC 100 nF bypass capacitors | 11 | 44 |
| Selector-enable 10 kΩ pull-down | 1 | 4 |

Provide supply protection, a physical supply disconnect, USB connections and power connectors rated for concurrent loads. Join Teensy ground to supply negative; route heater current separately from measurement ground. Keep analog circuits powered whenever the heater rail is enabled. Size bulk capacitance from measured pulse-induced rail droop.

## Appendix B — connections and pin map

### One channel, repeated eight times

```text
Common supply+ → power lead → heater i → individual return → 0.100 Ω → AO3400A drain
                                                                        source → ground
                                             INA190 IN+ ─┘       └─ IN−
                                             INA190 OUT → Teensy current input i

Heater i sense+ → terminal divider → positive-voltage selector input i
Heater i sense− → terminal divider → negative-voltage selector input i
Selected terminal pair → shared AD8276 difference amplifier → Teensy voltage input
```

Place the shunt between the heater return and MOSFET drain. Route separate traces from its pads to INA190 IN+ and IN−. DCK pins are **1 REF, 2 GND, 3 VS, 4 IN+, 5 IN−, 6 OUT**. The amplifier operates continuously. Its ±15 µV maximum offset corresponds to ±0.15 mA before calibration.

Both **TMUX1108PWR** selectors use 3.3 V, shared address/enable lines, and VSS and GND connected to common ground. **Enable HIGH connects; LOW disconnects.** Add the 10 kΩ enable pull-down.

Connect the selected positive divider to **AD8276BRZ pin 3**, negative to **pin 2**; **pin 7** to 3.3 V, **pin 4 and REF pin 1** to ground, **SENSE pin 5** to **OUT pin 6**. OUT feeds **100 Ω with 100 pF at the ADC**. Check the complete voltage path over **0.20–2.50 V output**, approximately 0.8–10 V heater voltage after calibration, including recovery from zero-output saturation. Use the measured settling time after selection or a switching edge.

| Function | Teensy 4.1 pins |
|---|---|
| Eight current outputs, ADC0 | **14–21** |
| Shared differential-voltage output, ADC1 | **26** |
| Eight heater gates | **2–9** |
| Selector address A0/A1/A2 | **10/11/12** |
| Selector enable | **13** |
| Common start / external stop | Reserve **0/1**, with defined default levels |

Use the Teensy ADC library's synchronized read functions for the current/voltage pair. Measure the residual timing difference and analog-path delays with the installed filters and cables.

## Appendix C — cable layout and fabrication

- **25 functional conductors per eight pixels:** one positive feed, eight returns and sixteen sense connections. Start sense traces at the heater pads.
- Rate the common feed and connector for **4.4 A** at the eight-channel ceiling.
- An **18-conductor version** uses one feed, eight returns, eight negative senses and one shared positive sense. Include measured positive-bus variation under concurrent loads in its voltage uncertainty.
- At a representative 6 V rail, a 4 kΩ return divider produces approximately **30 µW** of off-state heating in a 12.5 Ω heater. Include additional front-end leakage in the OFF-power bound.

1. Fabricate the existing laboratory geometry from its digital CAD. Preserve cavities, wire threading and heater pads; add terminal-sense traces and verify connector orientation. Export manufacturing files through the established laboratory process.
2. Check the shared-bus netlist. An isolated resistive bus can serve as the positive feed; remove any conflicting ground connection before use.
3. Build one eight-channel electronics board with supply, current, voltage and gate test points. Separate power and measurement routing and keep shunts/amplifiers away from switch heating.
4. Check eight stable resistor loads using the final cables and selector sequence. Record electrical errors, bypass-current bounds, neighboring-channel effects and total cutoff delay under concurrent loads.
5. Obtain one same-batch resistance–temperature curve; measure each pixel's room-temperature resistance and check representative assembled pixels for baseline changes. Load channel calibration, curve identity and pulse limits into the common firmware, then duplicate the board.

## Appendix D — measurement procedure

```pseudocode
At startup:
    Set all heater gates LOW and selector enable LOW.
    Load channel calibration, uncertainty and room-temperature resistance.
    Initialize thermal states from ambient only after the established cooling time.
Before each heating pulse:
    Program a local switch-off deadline using the current temperature ranges.
    Enable the requested heater only while that deadline remains valid.
For each selected channel i:
    Set selector address i and enable; wait the measured settling time.
    Start startSynchronizedSingleRead(14+i, 26) and record acquisition times.
    If conversion exceeds its timeout, switch off, record the fault and end this acquisition.
    Read the pair with readSynchronizedSingle().
    If its timestamp is no later than stored state time, switch off and discard this acquisition.
    Advance both thermal states to the sample time using elapsed ON, edge and OFF intervals.
    If the heater is OFF or still settling, skip the resistance update.
    Otherwise:
        Convert readings to calibrated shunt-current and heater-voltage intervals.
        Add the bypass-current interval to obtain heater current.
        Divide voltage by positive heater current, then normalize by room-temperature resistance.
        Keep temperature cells compatible with both prediction and resistance.
        Switch off if no state remains or prediction leaves the calibrated range.
    Update the local deadline; retain thermal states after switch-off.
    Log timestamps, raw readings, corrected current/voltage and temperature ranges.
After a fault:
    Disable further pulses until its cause is resolved and the initial thermal state is established.
```

## Appendix E — system diagram

![Array system](../assets/figures/array-system.png)

---

# Wire-temperature calibration

- **Heat spare wire from the same batch in a small kiln.** Start with about five temperature references placed around the actual resistance curve.
- **Measure with the kiln closed.** First confirm manufacturer-supported access for the insulated electrical leads and temperature probe.
- **Use a 1–2 m winding and thicker leads.** Its approximately 1.4–2.9 kΩ resistance permits a two-wire measurement.
- **Measure temperature beside the winding.** The active pixel requires no attached thermometer.
- **Record the normalized resistance curve and its uncertainty.** An 800 °C reference extends calibration to that temperature; the operating limit is a separate design choice.

![Closed-kiln wire-calibration fixture: a compact winding on an alumina tube, adjacent reference probe, and thick insulated leads to an external meter.](../assets/figures/wire-calibration.png)

## 1. Fixture and equipment

**Goal:** hold the wire at a known, nearly uniform temperature while measuring resistance outside the closed kiln.

Wind **1–2 m of approximately 31 µm NiCr wire** in one noncrossing layer around a **20 mm outside-diameter alumina tube**. A **0.5 mm pitch** gives **16–32 turns** spanning **8–16 mm**. Leave slack and support the ends separately. Place the tube in a loosely covered alumina boat near the kiln center, with the reference probe beside the winding.

| Item | Selection |
|---|---|
| Kiln | Small programmable kiln rated for the upper calibration temperature, with manufacturer-supported electrical/probe feedthroughs. The TableTop Hi-Temp Burnout Kiln—PROGRAMMABLE is a candidate subject to confirmation of this access. |
| Support | Approximately 20 mm alumina tube and small alumina boat/cover |
| Electrical leads | Two approximately **0.5 mm NiCr leads**, insulated with separate ceramic bores or beads |
| Hot connections | Two isolated compression contacts on ceramic, rated for the upper calibration temperature |
| Temperature reference | Type K thermometer/probe rated for the range; **Fluke 80PK-22** is rated to 1090 °C. Keep its handle outside. |
| Resistance measurement | Bench DMM with specified measuring current and accuracy on the selected resistance range |

**Confirm the feedthrough arrangement with the kiln manufacturer before purchase or assembly.** A ventilation opening alone does not establish supported routing. Install the leads and probe using the approved arrangement, preserving insulation, ventilation and door closure.

Wrap each wire end around a smooth post or thicker lead and secure it under a clean compression washer. Mount contacts separately on ceramic, provide strain relief, and check connection stability through the first heat cycle.

## 2. Electrical measurement

**Goal:** make lead resistance small compared with the heated wire resistance.

Representative NiCr80 resistivity, $`1.09\times10^{-6}\ \Omega\,\mathrm m`$, gives approximately **1,440 Ω/m** at 31 µm diameter. A stable 1 Ω series contribution is **0.07%** of a one-metre winding.

A total of **0.6 m of 0.5 mm NiCr leads contributes about 3.3 Ω**. A 7% change adds 0.23 Ω, or **0.016%** of the winding resistance. Measure and subtract the room-temperature lead resistance; include its temperature-dependent remainder in the uncertainty. Ultrafine leads of the same length would contribute about **866 Ω**.

The kiln supplies heat and the meter supplies a small measuring current. Passing the pixel's approximate **0.47 A** through one metre would require

```math
V=IR\approx0.47\times1440\approx680\ \mathrm V.
```

The long winding therefore serves externally heated calibration. A measuring current near **100 µA** dissipates only **14 µW** in one metre.

## 3. Temperature sweep

**Goal:** obtain the few reference points that constrain the resistance curve and its extrema.

1. **Connect at room temperature.** Record wire length, resistance and lead resistance. Check stability while gently moving the external leads.
2. **Close the kiln.** Place the reference probe beside the winding. During initial setup, compare its center and ends at equilibrium and record the temperature spread.
3. **Check measuring-current effects.** At one settled temperature, repeat with a second small current; include any detectable resistance change in the uncertainty or reduce current.
4. **Collect about five equilibrium references:** room temperature, an informative rising-branch point, the observed resistance maximum, a falling-branch point and the upper calibration reference, provisionally **800 °C**. Follow the measured curve during the sweep and record each reference after temperature and resistance settle.
5. **Add a point only where needed:** another extremum or an interpolation interval that limits control. Repeat selected references during cooling and record the final room-temperature resistance, including any baseline shift.

Save temperature, meter reading, lead correction and normalized resistance:

```math
q(T)=\frac{R_{\mathrm{meas}}(T)-R_{\mathrm{leads}}(T)}
{R_{\mathrm{meas}}(T_0)-R_{\mathrm{leads}}(T_0)},
```

where $`T_0`$ is the room-temperature reference. Store measurement and interpolation uncertainty separately. If the actual curve has several extrema, place additional references around those extrema.

An initial **0.1% resistance-error allocation** is 0.05% meter, 0.02% residual lead effects and 0.03% connection/repeatability effects. Replace these allocations with measured or specified values. A **±5–10 °C** temperature-reference target combines probe uncertainty and spatial variation. The resulting temperature resolution also depends on the local resistance-curve slope.

## 4. Interpretation

**Goal:** distinguish an equilibrium resistance reference from temperature measurements during a pulse.

**Opening the kiln before attaching clips changes the wire temperature.** A free 31 µm wire has an illustrative cooling time of **0.1–0.2 s** near 800 °C for convection of 100–300 W/(m² K) plus radiation. Its ceramic support can remain hot while the wire cools; contact conductance determines their temperature difference. Connect the meter before heating and read it with the kiln closed.

**A series-connected foil does not establish the wire temperature.** At equal current, heating per exposed surface area scales as $`1/(A\mathcal P)`$, where $`A`$ is cross-sectional area and $`\mathcal P`$ exposed perimeter. A **15 µm-thick, 1 mm-wide foil receives about 414 times less heating per surface area** than a 31 µm wire. Length cancels from this interior heat balance; support and end losses further affect equilibrium.

An unpowered foil can share the winding's temperature in a uniform enclosure, but optical measurement also requires sufficient target area, known emissivity and optical access. The adjacent reference probe measures the calibration temperature directly.

The measured curve relates resistance to uniform equilibrium temperature. Applied to an assembled pixel, it supports an effective wire-temperature estimate together with thermal history. Local transient hotspots require independent measurements with adequate spatial and temporal resolution.
