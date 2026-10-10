import { redirect } from "next/navigation";
import { getViewer, homeForRole } from "@/lib/auth";

export default async function Home() {
  const viewer = await getViewer();
  redirect(viewer ? homeForRole(viewer.role) : "/login");
}
