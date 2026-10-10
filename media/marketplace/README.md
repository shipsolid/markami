# Marketplace captures

Only screenshots captured from the exact packaged markami VSIX belong here. Generated mockups,
source-tree browser fixtures, private documents, credentials, and customer data are prohibited.

Run **Actions → Marketplace captures → Run workflow** from the repository's default branch. The
workflow builds the versioned VSIX, extracts its packaged extension, launches it in VS Code stable at
1440×900 under Xvfb, captures the public fixtures in `fixtures/marketplace/`, validates every PNG,
updates the generated README gallery, and opens a review pull request.

The required files are:

- `rendered-editor.png`
- `source-preserving-editing.png`
- `technical-markdown.png`

Review the workflow artifact and pull request for product accuracy, clipping, legibility, private
content, and correct source-reveal behavior. Only after that review may release evidence set
`listing_approved: true`. The tagged release workflow consumes committed captures and never generates
or changes them.
