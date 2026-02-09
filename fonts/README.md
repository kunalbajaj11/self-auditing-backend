# PDF fonts (Inter)

Generated PDFs (invoices, purchase orders, sales orders, delivery challans, reports) use **Inter** when font files are present here; otherwise they fall back to Helvetica.

## Add Inter font files

Place these two files in this `fonts` folder:

- **Inter-Regular.ttf**
- **Inter-Bold.ttf**

### Where to get them

1. **Google Fonts**: https://fonts.google.com/specimen/Inter — download the family, then copy `Inter-Regular.ttf` and `Inter-Bold.ttf` from the extracted zip into this folder.
2. **Inter GitHub**: https://github.com/rsms/inter/releases — download the release and copy the same two files from the `ttf` folder.

After adding the files, restart the backend. New PDFs will use Inter; existing behavior is unchanged if the files are missing.
