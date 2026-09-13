# Project contribution rules

## User-facing text and localization

- Do not hard-code user-facing text in frontend components, pages, dialogs, buttons, labels, tooltips, empty states, validation messages, or accessibility labels.
- Add every new user-facing string to both `frontend/locales/en.ts` and `frontend/locales/vi.ts` with the same translation key.
- Render localized text through `useT()` and `t("key")` (including interpolated values), so English and Vietnamese stay consistent.
- Keep non-user-facing diagnostic logs and internal error identifiers in English.
