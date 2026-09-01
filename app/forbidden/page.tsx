import { Forbidden } from "@/components/forbidden";

// requireManager / requireAdmin 不符時的落點（見 lib/auth.ts）。
export default function ForbiddenPage() {
  return <Forbidden />;
}
