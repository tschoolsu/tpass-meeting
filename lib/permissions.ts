import "server-only";
import { isModerator, type TPassClaims } from "@/lib/auth";
import { serviceConfig } from "@/config/service";

// 是否允許「一般學生（default）」自主建立會議（需求 1c：全置設定／權限判斷）。
export function canStudentCreate(session: TPassClaims): boolean {
  if (isModerator(session)) return true;
  return serviceConfig.allowStudentCreate;
}
