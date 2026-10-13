<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep weight-based counting in a separate protected route with product-linked, owner-scoped calibration records; this preserves existing inventory quantities and workflows.
- Store all calibration weights in grams and convert scale input before the pure counting calculation; this prevents unit mismatches.
- Use AppShell's opt-in compact spacing for single-screen tools; this keeps other routes' established spacing unchanged.
- Persist weight counts through authenticated server functions into the existing inventory and inventory-item records, preserving the inventory snapshot on recount; this reuses history, signatures and PDF without changing stock or scanner counting.
- Keep the selected weight inventory in route search and its list in TanStack Query; this supports reloads and resuming counts from inventory details.
- Keep Android packaging in android-apk as a thin HTTPS WebView client of the published app; this preserves TanStack server functions and existing inventory workflows without duplicating them.
- Install SheetJS from its official versioned distribution URL; the npm xlsx release does not contain the required security fixes.
- Use the shared CSV serializer for item and inventory exports; neutralize formula-like text at export time while preserving numeric quantities and stored catalog data.
- Create selected/imported inventory rows atomically through an authenticated invoker RPC and the shared InventorySetup form; keep product identity separate from reference quantities, prices and locations, and preserve those snapshots across scanner and weight recounts.
- Use inventory-item counted state to distinguish selected pending rows from confirmed zero counts; existing rows default to counted so historical reports remain unchanged.
- Create empty inventories through the authenticated setup action with free-entry origin; scanner and weight counts append catalog products with zero reference values without copying deprecated stock fields.
- Fetch the item catalog in explicitly ranged, stably ordered pages before local search or export; this avoids silently truncating catalogs at the Data API row limit.
- Read complete catalogs with bounded parallel pagination and render large catalog/selection forms in small pages; this reduces network waterfalls and input lag while keeping all rows searchable, selectable and exportable.
- Keep catalog query data fresh for five minutes and invalidate it after catalog mutations; this avoids redundant reloads without retaining stale product edits.
- Show scanner inventory progress in a separate read-only list using paginated inventory snapshots and counted state, not catalog stock; this preserves imported references and existing counting actions.
- Use the shared natural-order comparator for imported inventory previews and progress lists; this orders numeric code and location segments without modifying snapshots or counts.
- Correct historical quantities through an owner-authenticated server function with optimistic row-version checks; update counted state and divergences only, preserving inventory references, signatures and completion timestamps.
