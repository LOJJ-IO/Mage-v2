# Custom fonts

## Booton (body / UI)

Place licensed webfont files in `booton/` (from [Displaay Booton](https://displaay.net/typeface/booton)):

- `Booton-Regular.woff2` or `Booton-Regular.otf`
- `Booton-Medium.woff2` or `Booton-Medium.otf` (optional)
- `Booton-Bold.woff2` or `Booton-Bold.otf` (optional)

`@font-face` rules live in `src/styles/globals.css`. Until files are added, the stack falls back to `system-ui`.

## Season Mix (headings & display numbers)

Files live in `season-mix/`. Currently using the trial Regular cut:

- `SeasonMix-TRIAL-Regular.otf`

Headings (`h1`–`h6`, `.font-heading`, `.font-display`) and dashboard KPI numbers use **Season Mix**. Body copy uses **Booton**.

See `season-mix/Befonts-License.txt` for trial/license terms.
