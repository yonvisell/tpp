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
