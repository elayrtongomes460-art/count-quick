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
