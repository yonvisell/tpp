# MacroTPP: circuit, calibration and operation

- **Purpose:** drive one tactile pixel; stop heating at an estimated temperature ceiling.
- **Hardware:** Teensy 4.1, INA253EVM, MOSFET and two voltage dividers; adjustable 0–5 V supply, current below 5 A.
- **Temperature reference:** equilibrium pyrometer readings paired with electrical resistance.
- **Computation:** Teensy measures and controls; PC calibrates, fits and plots.
- **Prerequisites:** approximately 1 Ω foil, active dimensions and alloy properties; assembled circuit, bench meter, oscilloscope and suitable pyrometer.

![MacroTPP electrical circuit](../src/figures/macro-circuit.png)

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

1. **Load inputs:** electrical gains/errors, $R_0$, resistance and heat-capacity cells, coefficient ranges, ceiling $T_c$, pulse duration $t_p$, global minimum capacity $C_{\mathrm{global,min}}$, full heating bound $P_{\max}$, turn-off allowance $\tau_s$, and maximum data age $\tau_f$. Keep separate state time and last-valid-measurement time.
2. **Prepare the pulse:** finish pending reads; calculate both temperature ranges through the entire off interval, including turn-off settling. Fix original end $t_0+t_p$. Calculate the deadline below. In one short critical section, recheck that deadline, arm the timer and raise the gate; otherwise leave the gate low.
3. **Process each settled reading:** calculate $V_h=V_+-V_-$ and $I_h=I_s+V_-/D_-$, with $D_-\approx2000\,\Omega$. Reject stale timestamps and invalid current/power intervals. Calculate normalized-resistance limits $y^-=V_h^-/(I_h^+R_0^+)$, $y^+=V_h^+/(I_h^-R_0^-)$. Execute the four temperature-endpoint updates in F1. Retain a cell only when $Q_{\max}\ge y^-$ and $Q_{\min}\le y^+$; intersect its temperature span with the calculated range. Keep associated surroundings ranges and every compatible branch.
4. **Set the deadline:** with state time $t_m$, last valid reading $t_v$, and $M=\max(T_{\rm high},S_{\rm high})$ across retained states, use
   $$
   t_{\rm stop}=\min\left[t_0+t_p,\ t_m+\frac{(T_c-M)C_{\mathrm{global,min}}}{P_{\max}}-\tau_s,\ t_v+\tau_f-\tau_s\right].
   $$
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

**Inputs:** two reference readings and corresponding mean ADC codes for each channel $j\in\{+,-,s\}$; intermediate/warm checks; reference and measurement-error allowances. Channels are positive-terminal voltage, negative-terminal voltage and sensor-branch current.

1. **For each channel $j$:**
   - Read reference values $x_1,x_2$ and ADC means $c_1,c_2$.
   - **If** $c_1=c_2$, **stop**: calibration failed.
   - Calculate $a_j=(x_2-x_1)/(c_2-c_1)$, $b_j=x_1-a_jc_1$.
   - Convert each check code using $x=a_jc+b_j$.
   - **If** a check exceeds its error allowance, **stop**: resolve the discrepancy.
   - Store $a_j,b_j$, error allowance and calibrated channel delay.
2. Store the measured negative-divider resistance interval $[D_-^-,D_-^+]$, nominally centered on **2000 Ω**.

### Algorithm B2. ReadFoil — Teensy

**Inputs:** B1 calibration, conversion timeout, settled-conduction flag and minimum calibrated current $I_{\min}$.

1. **If** conduction has not settled, **return** current time and “no resistance reading,” with settled flag false.
2. Acquire three paired readings: current with positive terminal; current with negative terminal; current with positive terminal. **If** a conversion times out or saturates, **return fault**.
3. Convert codes using B1. Correct timestamps for calibrated channel delays. Set $t_m$ to the negative-terminal reading’s effective time.
4. Interpolate the two bracketing positive-terminal readings to $t_m$. Likewise interpolate two current readings whose effective times bracket $t_m$:
   $$
   \operatorname{interp}(x_a,x_b;t)=x_a+\frac{t-a}{b-a}(x_b-x_a).
   $$
   **If** either bracket is missing or crosses switching, **return fault**.
5. Let the aligned values be $V_+,V_-,I_s$. Calculate
   $$
   V_h=V_+-V_-,\qquad I_h=I_s+V_-/D_-,\qquad R_h=V_h/I_h.
   $$
   The added current passes through the foil but bypasses the sensor.
6. Apply calibrated error limits, including residual interpolation error. With nonnegative terminal/current intervals, form
   $$
   V_h^- =V_+^- -V_-^+,\quad V_h^+=V_+^+-V_-^-,
   $$
   $$
   I_h^-=I_s^-+\max(0,V_-^-)/D_-^+,\quad
   I_h^+=I_s^++\max(0,V_-^+)/D_-^-.
   $$
   **If** $V_h^-\le0$ or $I_h^-<I_{\min}$, **return fault**.
7. **Return** $t_m,V_h,I_h,[V_h^-,V_h^+],[I_h^-,I_h^+]$.

## Appendix C. Temperature-table preparation

**Goal:** preserve every resistance-compatible temperature, including different branches.

### Algorithm C1. PrepareCells — PC

**Inputs:** calibrated normalized resistance curves $q_-(T),q_+(T)$, including temperature-reference and interpolation uncertainty; heat-capacity curves $C_-(T),C_+(T)$ from active mass and alloy data.

1. Divide the calibrated operating range into **1 °C cells**.
2. **For each cell $[T_i,T_{i+1}]$:**
   - Set $Q_{\min}$ to the minimum of $q_-$ within the cell.
   - Set $Q_{\max}$ to the maximum of $q_+$ within the cell.
   - Store the minimum of $C_-$ and maximum of $C_+$ within the cell.
   - For piecewise-linear curves, evaluate cell endpoints and every enclosed curve knot; do not miss an internal turning point.
3. Set $C_{\mathrm{global,min}}$ to the minimum stored heat capacity.
4. **Return** the cell table and global minimum. Keep heat-capacity uncertainty separate from temperature dependence.

Here $q(T)=R(T)/R_0$, with $R_0$ the measured reference resistance at ambient $T_a$. Heat capacity is in J/K; it is fixed from geometry/material information rather than fitted freely.

## Appendix D. Thermal identification

**Goal:** obtain thermal coefficients from the specified pulse sequence.

Use foil temperature $T$, effective surroundings temperature $S$, and
$$
C(T)\dot T=P_h-G(T-S),\qquad
\dot S=\beta(T-S)-\gamma(S-T_a).
$$
$G$ is W/K; $\beta,\gamma$ are s$^{-1}$. All three coefficients are positive.

### Algorithm D1. CollectPulseDataAndFit — PC and Teensy

1. Choose checked duration $t_p$, onset interval $T_r>t_p$, and $N=\min(10,N_q)$, where $N_q$ is the checked pulse-count limit.
2. Start after established cooling. Log timestamps, gate transitions, calibrated voltage/current, valid-reading flags, $T_a$ and $R_0$.
3. Apply $t_p/2$, using $t_p$ if the shorter pulse supplies no settled reading; wait $40T_r$ after turn-off.
4. Apply $t_p$; wait $40T_r$ after turn-off.
5. Apply $N$ pulses of width $t_p$, starts separated by $T_r$.
6. Wait $2T_r$ after the last turn-off; apply $t_p$. Wait $20T_r$ after turn-off; apply $t_p$.
7. Set reference scales $G_*=C(T_a)/t_p$, $\beta_*=1/T_r$, $\gamma_*=1/(20T_r)$. Try all **27** starting combinations of factors 0.1, 1 and 10.
8. **For each candidate vector $z$:** set $(G,\beta,\gamma)=(G_*,\beta_*,\gamma_*)\exp z$; integrate the model through every pulse and pause. At valid settled-on samples calculate $r_k=[q(T(t_k))-R_h(t_k)/R_0]/s_k$, where $s_k>0$ is normalized-resistance repeatability. Minimize $\sum r_k^2$; reject integration failure or temperature outside calibration.
9. Refit under lower/upper capacity and channel-calibration alternatives, changing one calibration quantity throughout the trace and $R_0$ together. Include lower/upper switch-edge energy when unresolved. Tighten integration tolerances tenfold; require predicted normalized resistance to change by less than $0.1\min s_k$.
10. **Profile each coefficient:** hold it fixed, refit the other two, and move upward/downward by factors of two for at most 20 steps. Stop at the first incompatible fit; bisect the final bracket until its ratio is below 1.05. If no incompatible point is found, mark that limit unresolved rather than treating the search endpoint as physical. Retain one or two coefficient sets.
11. **Verify without refitting:** after established cooling, alternate widths $t_p/2,t_p$ for $N$ pulses at $T_r$; wait $5T_r$ after turn-off, then apply $t_p$. Save residuals and observer results. Resolve systematic disagreement before use; unresolved parameter limits require an additional informative restart measurement.

Compare compatibility against full electrical and resistance-curve error bands. These fitted ranges are engineering estimates. Off intervals provide no resistance observations.

## Appendix E. Electrical-energy bookkeeping

**Goal:** account for heat delivered between observations.

For supply interval $[V_s^-,V_s^+]$, effective series resistance $R_s=(V_s-V_h)/I_h$, and complete heater-resistance range $[R_{\min},R_{\max}]$, require $R_{\min}>R_s^+\ge R_s^-\ge0$. Settled-on power is bounded by
$$
P_{\rm on}^-=\frac{(V_s^-)^2R_{\max}}{(R_{\max}+R_s^+)^2},\qquad
P_{\rm on}^+=\frac{(V_s^+)^2R_{\min}}{(R_{\min}+R_s^-)^2}.
$$
Set $P_{\rm switch}^+=V_{\max}^2/R_{\min}$ and $P_{\rm off}^+=R_{\max}I_{\rm off,max}^2$. The voltage bound includes switching excursions; the off-current bound includes divider leakage.

### Algorithm E1. EnergySegments — Teensy

1. Split the requested time interval at every gate transition and measured settling boundary.
2. **For each resulting segment of duration $h$:**
   - **Settled on:** return $[E^-,E^+]=[P_{\rm on}^-h,P_{\rm on}^+h]$ and $P=P_{\rm on}^+$.
   - **Switching/settling:** return $[0,P_{\rm switch}^+h]$ and $P=P_{\rm switch}^+$.
   - **Settled off:** return $[0,P_{\rm off}^+h]$ and $P=P_{\rm off}^+$.
3. Use these segments separately in F1. Sampled $V_hI_h$ gives nominal power; it does not narrow these between-reading bounds.

## Appendix F. Thermal-state computation

**Goal:** calculate temperature changes using heat capacity over the range reachable during each step.

Store up to eight rectangles with fields $T_{\rm low},T_{\rm high},S_{\rm low},S_{\rm high}$, coefficient-set identifier and represented time. Superscripts $-,+$ below denote their low/high values.

For scalar $d$, define
$$
p_-(a,d)=\min(a^-d,a^+d),\qquad p_+(a,d)=\max(a^-d,a^+d).
$$

### Algorithm F1. AdvanceRange — Teensy

**Inputs:** one rectangle, its coefficient ranges, one energy segment from E1.

1. Subdivide the segment so that
   $$
   h\le\min\{C_{\mathrm{global,min}}/G^+,\,1/(\beta^++\gamma^+)\}.
   $$
   Compute energy bounds separately for each substep.
2. **For each substep, using its phase power bound $P$:**
   $$
   \begin{aligned}
   M&=\max(T^+-T_a,S^+-T_a)+Ph/C_{\mathrm{global,min}},\\
   g_0&=G^+/C_{\mathrm{global,min}},\\
   T_{\rm reach}^-&=\max(T_a,T^- -hg_0M),\\
   T_{\rm reach}^+&=\min(T_a+M,\ T^++h[P/C_{\mathrm{global,min}}+g_0M]).
   \end{aligned}
   $$
3. **If** this reachable interval leaves the calibrated table, **return fault**. Among all cells intersecting it, take the minimum capacity as $C_{\min,\mathrm{step}}$ and maximum as $C_{\max,\mathrm{step}}$.
4. Set $g^-=G^-/C_{\max,\mathrm{step}}$, $g^+=G^+/C_{\min,\mathrm{step}}$, then calculate
   $$
   \begin{aligned}
   L_T&=P/C_{\min,\mathrm{step}}+g^+M,&L_S&=(\beta^++\gamma^+)M,\\
   \epsilon_T&=\tfrac12g^+(L_T+L_S)h^2,&
   \epsilon_S&=\tfrac12[\beta^+L_T+(\beta^++\gamma^+)L_S]h^2.
   \end{aligned}
   $$
5. Using **old** endpoints throughout the right-hand sides, calculate
   $$
   \begin{aligned}
   T_{\rm new}^-&=T^-+E^-/C_{\max,\mathrm{step}}-h\,p_+(g,T^--S^-)-\epsilon_T,\\
   T_{\rm new}^+&=T^++E^+/C_{\min,\mathrm{step}}-h\,p_-(g,T^+-S^+)+\epsilon_T,\\
   S_{\rm new}^-&=S^-+h[p_-(\beta,T^--S^-)-\gamma^+(S^--T_a)]-\epsilon_S,\\
   S_{\rm new}^+&=S^++h[p_+(\beta,T^+-S^+)-\gamma^-(S^+-T_a)]+\epsilon_S.
   \end{aligned}
   $$
6. Replace lower endpoints below $T_a$ by $T_a$; store the four new endpoints and advance represented time.

These calculations assume passive two-state dynamics, an enclosed initial state, and valid coefficient, capacity and electrical bounds. The $\epsilon$ terms account for integration error; they are not optional tuning gains.

### Algorithm F2. RestrictRanges — Teensy

1. From B2, calculate $y^-=V_h^-/(I_h^+R_0^+)$, $y^+=V_h^+/(I_h^-R_0^-)$.
2. **For each predicted rectangle:** if its foil-temperature range exceeds the calibrated table, return a fault and preserve the original states.
3. Scan overlapping cells. Skip cells with $Q_{\max}<y^-$ or $Q_{\min}>y^+$. For every other cell, intersect its span with $[T^-,T^+]$; combine adjacent intersections into a continuous run.
4. **Whenever a run ends:** create a candidate with its temperature span, source surroundings range and coefficient-set identifier. If fewer than eight entries exist, append it. Otherwise, among the eight entries plus candidate, merge the nearest pair sharing a coefficient set into their enclosing temperature and surroundings ranges. Store the resulting eight entries. This keeps memory bounded during scanning.
5. **If no candidates remain:** return a mismatch fault and preserve the predicted states. Otherwise return the retained ranges. Never discard a hotter alternative.

## Appendix G. Pulse-control pseudocode

**Goal:** enforce finite local deadlines independently of the PC.

**Configuration:** ceiling $T_c$; maximum duration; $C_{\mathrm{global,min}}$; full heating-power bound $P_{\max}>0$; timer-dispatch plus physical turn-off bound $\tau_s$; maximum measurement age $\tau_f>\tau_s$. Preserve the original pulse-end time once a pulse begins.

### Algorithm G1. SetDeadline — Teensy

1. Let $t_m$ be state time, $t_v$ last-valid-measurement time, and $M=\max(T^+,S^+)$ across stored states.
2. Calculate $t_{\rm temperature}=t_m+(T_c-M)C_{\mathrm{global,min}}/P_{\max}-\tau_s$.
3. Set $t_{\rm stop}=\min(t_{\rm original},t_{\rm temperature},t_v+\tau_f-\tau_s)$.
4. **If** the deadline has passed, call GateOff. Otherwise arm the gate-off timer. Return the deadline.

### Algorithm G2. RunFiniteSequence — Teensy

1. Require initialized temperatures, valid calibration and no unresolved fault. Load the finite count and scheduled onsets. Initialize temperatures only after established cooling.
2. **Before each pulse:** require gate low, elapsed repetition interval and remaining count. Finish or discard pending reads. Snapshot $t_0=\text{now}$; update all states through off time to $t_0$, including physical turn-off and settling, using E1/F1. Set state time to that update's end.
3. Fix $t_{\rm original}=t_0+\min(t_p,t_{\rm configured,max})$. Set $t_v=t_0$ for first-reading grace and calculate G1.
4. **Briefly prevent timer interrupts:** recheck $t_{\rm stop}>\text{now}$; only then arm the timer, raise the gate and record actual transition time. Restore interrupts. If the gate remained low, stop the sequence.
5. **For each completed measurement:**
   - On timeout/channel failure, call GateOff, preserve state and disable subsequent pulses.
   - If its time is no later than stored state time, discard it; never refresh data expiry.
   - Use E1/F1 to update all states to the reading time; store that time even when resistance is unavailable.
   - **Only if settled on:** require nonsaturated inputs and current lower limit at least $I_{\min}$; require measured power $[V_h^-I_h^-,V_h^+I_h^+]$ to overlap configured $[P_{\rm on}^-,P_{\rm on}^+]$. On either failure, stop and disable subsequent pulses.
   - **Only if settled on:** call F2. On fault, preserve predicted state and stop. Otherwise store its result and refresh $t_v$.
   - If the gate remains high, call G1. Preserve the original pulse end.
6. **While off:** finish or discard pending reads, update states through all elapsed energy phases to a captured end time, and store that time. Retain both temperatures; transfer buffered logs when time permits.
7. **Timer interrupt:** call GateOff at its deadline.

**GateOff:** lower the gate; log its actual transition once. Fault paths also disable further requests until the cause is resolved and the initial thermal condition is re-established. After reset, enforce the established cooldown.
