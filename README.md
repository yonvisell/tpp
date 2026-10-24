# TPP control

Temperature control, circuits and calibration for thermopneumatic tactile pixels.

The controller estimates metal temperature from electrical power and heat loss, then corrects that estimate using the measured resistance–temperature relation. It controls one pixel by ending each pulse at a temperature or duration limit.

[Read the documentation](https://yonvisell.github.io/tpp/)

## 1. Documents

- [Temperature control](content/controller.md): the physical model, resistance correction and calculations performed each clock cycle.
- [Foil pixel](content/macro.md): single-pixel circuit, measurements and operation.
- [Wire array](content/wire-array.md): repeated drive channels and shared measurement electronics.
- [Wire calibration](content/wire-temperature.md): resistance–temperature measurements using a long, same-stock wire.
- [Controller LaTeX](content/latex/main.tex).

These are proposed circuit and controller designs. Bench measurements establish the temperature accuracy and usable operating range.

## 2. Build and preview

The repository includes source documents, editable diagrams and the generated website in `dist/`.

1. Use Node 24 or later.
2. Install the pinned dependencies: `npm ci --ignore-scripts`.
3. Build the pages: `node scripts/build.mjs`.
4. Check equations, algorithms and local links: `node scripts/check.mjs`.
5. Preview: `node scripts/serve.mjs --port 4178`.

GitHub Pages serves the generated files from the `gh-pages` branch. All page and asset paths are relative.

## 3. Update the source documents

1. Update the selected documents listed in `src/documents.mjs`.
2. Import them: `node scripts/sync.mjs --source-root /path/to/document-workspace --latex TactileTeleopControllerRev08/latex/main.tex`.
3. Run the build and checks above.

The import copies only the listed documents and their figures. Mathematical expressions and pseudocode calculations are checked against their rendered output.

---

* [Student MVP](content/student-mvp.md) — separate implementation draft; not yet reviewed by Yon Visell.
