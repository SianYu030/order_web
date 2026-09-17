# Reference Showroom HD Desktop Design

## Goal
Rebuild the desktop management-platform home screen so it visually matches the approved high-resolution showroom reference while preserving all existing business behavior and keeping the current production branch untouched until preview verification.

## Approved visual direction
- Desktop view uses the approved high-resolution showroom artwork as the primary visual canvas.
- The canvas keeps the warm wood showroom, left navigation, centered operation board, eight operational cards, right display area, plants, lighting, and the approved typography/layout baked into the visual asset.
- Real HTML interaction is layered over the artwork with transparent or visually minimal hotspots aligned to the fill/record tabs and eight card actions.
- Mobile view keeps the existing responsive card interface; the fixed showroom artwork is desktop-only.

## Functional requirements
- Preserve `?role=staff|supervisor|admin` behavior and role filtering.
- Preserve `?view=mobile|desktop` and existing aliases.
- Keep Apps Script bridge and `/api/systems` unchanged.
- Fill mode uses `formUrl`; record mode uses `recordUrl` and remains limited by existing role rules.
- The eight primary system names map deterministically to the eight visual slots in this order: board material (saw), board material (Nesting), online repair, factory scrap record, first-article record, rework, hardware issue, edge-band issue.
- Hotspots scale with the artwork so alignment remains correct at different desktop viewport sizes.
- Loading/error states must remain usable. If data cannot load, show a readable overlay instead of leaving a dead image.

## Safety and rollout
- Implement on isolated branch `design/reference-showroom-hd`.
- Do not move or overwrite the production branch during implementation.
- Validate with unit tests, lint, typecheck, production build, then use a deploy preview/branch URL for visual verification before any production cutover.

## Asset
- Web-optimized reference artwork: `/reference-showroom-hd.webp`.
- Keep the original generated PNG outside the repository; only commit the optimized WebP used by the site.
