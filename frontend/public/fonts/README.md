# Custom fonts

## Booton (body / UI)

Self-hosted trial cuts in `booton/` (from [Displaay Booton](https://displaay.net/typeface/booton)):

- `Booton-TRIAL-Regular.otf` (400)
- `Booton-TRIAL-Medium.otf` (500)
- `Booton-TRIAL-SemiBold.otf` (600)
- `Booton-TRIAL-Bold.otf` (700)

`@font-face` rules live in `src/styles/globals.css`. Full family zip can stay in `booton-font-family/` as archive.

`@font-face` rules live in `src/styles/globals.css`. Until files are added, the stack falls back to `system-ui`.

## Season Mix (headings & display numbers)

Files live in `season-mix/`. Currently using the trial Regular cut:

- `SeasonMix-TRIAL-Regular.otf`

Headings (`h1`–`h6`, `.font-heading`, `.font-display`) and dashboard KPI numbers use **Season Mix**. Body copy uses **Booton**.

See `season-mix/Befonts-License.txt` for trial/license terms.
