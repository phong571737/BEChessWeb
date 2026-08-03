import { redirect } from "next/navigation";

/** Prevent an incomplete review URL from rendering Next.js's 404 page. */
export default function ReviewIndexPage() {
  redirect("/played");
}
