const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

/** Prefixes a public asset for deployments hosted below a path such as /chess. */
export function publicPath(path: string): string {
    return `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
}
