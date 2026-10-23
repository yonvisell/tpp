# Thermopneumatic pixel drive

Technical documentation for foil and wire thermopneumatic pixels: circuit designs, electrical measurement, resistance–temperature calibration and a local pulse controller.

[Documentation website](https://tactile-pixel-temperature-control.candidamber16.chatgpt.site) · [Source archive](https://github.com/yonvisell/tpp-temperature-control)

## Documents

- [Temperature controller](content/controller.md)
- [Foil macro pixel](content/macro.md)
- [Wire pixel array](content/wire-array.md)
- [Wire temperature calibration](content/wire-temperature.md)

The generated website has document and section navigation, expandable circuit figures, print layouts and downloadable Markdown. Equations render at build time. KaTeX styles and fonts are included locally, so reading the site requires no external services.

## Build

Use Node 24 or later:

```sh
npm ci --ignore-scripts
node scripts/build.mjs
node scripts/check.mjs
```

The build reads only `content/`, `src/` and installed dependencies. It produces the complete static site in `dist/`. All page and asset links are relative, supporting a domain root, a GitHub Pages repository path or an offline archive.

To preview:

```sh
node scripts/serve.mjs --port 4178
```

Open the printed local URL. Deploy the contents of `dist/` using the selected static-hosting service.

## Update selected source documents

Import revised documents explicitly before building:

```sh
node scripts/sync.mjs --source-root /path/to/document-workspace
node scripts/build.mjs
node scripts/check.mjs
```

To include a selected LaTeX source in the repository and website downloads:

```sh
node scripts/sync.mjs --source-root /path/to/document-workspace --latex relative-file.tex
```

The import list is `src/documents.mjs`. Synchronization copies selected images and matching editable SVGs, removes inline document links, rewrites image paths and checks for private paths and email addresses. It does not scan or copy research PDFs. The normal build never reads the external workspace.

## Rendering and checks

Pseudocode fences render as proportional-font procedure lists, retaining indentation as list hierarchy and preserving literal operators. Repository Markdown uses GitHub-compatible `$...$` and `$$...$$` mathematics and relative image paths. Synchronization converts the original math delimiters outside code fences; the site renderer also supports `\(...\)` and `\[...\]`. KaTeX errors fail the build rather than appearing silently on the page.

`node scripts/check.mjs` checks local resources, heading anchors, equation output, downloads and private-path leakage. Browser inspection remains useful for layout and interactions. The vendored KaTeX license is included with its styles and fonts.
