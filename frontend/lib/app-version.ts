/** Keep this value aligned with the root and frontend package versions. */
export const APP_VERSION = "1.1.3-change3";
/** Internal change suffixes are used for Git tags only, not shown in the product UI. */
export const APP_RELEASE_VERSION = APP_VERSION.replace(/-change\d+$/, "");
