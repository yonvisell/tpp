# Wire-temperature calibration

- **Heat spare wire from the same batch in a small kiln.** Start with about five temperature references placed around the actual resistance curve.
- **Measure with the kiln closed.** First confirm manufacturer-supported access for the insulated electrical leads and temperature probe.
- **Use a 1–2 m winding and thicker leads.** Its approximately 1.4–2.9 kΩ resistance permits a two-wire measurement.
- **Measure temperature beside the winding.** The active pixel requires no attached thermometer.
- **Record the normalized resistance curve and its uncertainty.** An 800 °C reference extends calibration to that temperature; the operating limit is a separate design choice.

![Closed-kiln wire-calibration fixture: a compact winding on an alumina tube, adjacent reference probe, and thick insulated leads to an external meter.](../src/figures/wire-calibration.png)

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

Representative NiCr80 resistivity, $1.09\times10^{-6}\ \Omega\,\mathrm m$, gives approximately **1,440 Ω/m** at 31 µm diameter. A stable 1 Ω series contribution is **0.07%** of a one-metre winding.

A total of **0.6 m of 0.5 mm NiCr leads contributes about 3.3 Ω**. A 7% change adds 0.23 Ω, or **0.016%** of the winding resistance. Measure and subtract the room-temperature lead resistance; include its temperature-dependent remainder in the uncertainty. Ultrafine leads of the same length would contribute about **866 Ω**.

The kiln supplies heat and the meter supplies a small measuring current. Passing the pixel's approximate **0.47 A** through one metre would require

$$
V=IR\approx0.47\times1440\approx680\ \mathrm V.
$$

The long winding therefore serves externally heated calibration. A measuring current near **100 µA** dissipates only **14 µW** in one metre.

## 3. Temperature sweep

**Goal:** obtain the few reference points that constrain the resistance curve and its extrema.

1. **Connect at room temperature.** Record wire length, resistance and lead resistance. Check stability while gently moving the external leads.
2. **Close the kiln.** Place the reference probe beside the winding. During initial setup, compare its center and ends at equilibrium and record the temperature spread.
3. **Check measuring-current effects.** At one settled temperature, repeat with a second small current; include any detectable resistance change in the uncertainty or reduce current.
4. **Collect about five equilibrium references:** room temperature, an informative rising-branch point, the observed resistance maximum, a falling-branch point and the upper calibration reference, provisionally **800 °C**. Follow the measured curve during the sweep and record each reference after temperature and resistance settle.
5. **Add a point only where needed:** another extremum or an interpolation interval that limits control. Repeat selected references during cooling and record the final room-temperature resistance, including any baseline shift.

Save temperature, meter reading, lead correction and normalized resistance:

$$
q(T)=\frac{R_{\mathrm{meas}}(T)-R_{\mathrm{leads}}(T)}
{R_{\mathrm{meas}}(T_0)-R_{\mathrm{leads}}(T_0)},
$$

where $T_0$ is the room-temperature reference. Store measurement and interpolation uncertainty separately. If the actual curve has several extrema, place additional references around those extrema.

An initial **0.1% resistance-error allocation** is 0.05% meter, 0.02% residual lead effects and 0.03% connection/repeatability effects. Replace these allocations with measured or specified values. A **±5–10 °C** temperature-reference target combines probe uncertainty and spatial variation. The resulting temperature resolution also depends on the local resistance-curve slope.

## 4. Interpretation

**Goal:** distinguish an equilibrium resistance reference from temperature measurements during a pulse.

**Opening the kiln before attaching clips changes the wire temperature.** A free 31 µm wire has an illustrative cooling time of **0.1–0.2 s** near 800 °C for convection of 100–300 W/(m² K) plus radiation. Its ceramic support can remain hot while the wire cools; contact conductance determines their temperature difference. Connect the meter before heating and read it with the kiln closed.

**A series-connected foil does not establish the wire temperature.** At equal current, heating per exposed surface area scales as $1/(A\mathcal P)$, where $A$ is cross-sectional area and $\mathcal P$ exposed perimeter. A **15 µm-thick, 1 mm-wide foil receives about 414 times less heating per surface area** than a 31 µm wire. Length cancels from this interior heat balance; support and end losses further affect equilibrium.

An unpowered foil can share the winding's temperature in a uniform enclosure, but optical measurement also requires sufficient target area, known emissivity and optical access. The adjacent reference probe measures the calibration temperature directly.

The measured curve relates resistance to uniform equilibrium temperature. Applied to an assembled pixel, it supports an effective wire-temperature estimate together with thermal history. Local transient hotspots require independent measurements with adequate spatial and temporal resolution.
