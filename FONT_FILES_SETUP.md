# Font Files Setup (Commercial Fonts)

The project is already configured to use local commercial fonts when files are present.

## Required files

Place files here:

- `public/fonts/proxima-nova/ProximaNova-Regular.woff2`
- `public/fonts/proxima-nova/ProximaNova-Regular.woff`
- `public/fonts/sofia-pro/SofiaPro-Regular.otf`
- `public/fonts/gotham/Gotham-Book.otf`

## Notes

- These fonts are commercial and must be licensed.
- If files are missing, the site uses fallback system fonts.
- Font switching is available in the header selector.

## Optional weights

If you have additional weights (Light/Medium/etc.), we can add matching `@font-face` rules and map UI styles more precisely.
