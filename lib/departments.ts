import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

// 部會清單：存 DB，由 /panel 管理。env DEPARTMENTS 只在表為空時當一次性種子（`pnpm db:seed`，見 prisma/seed.ts）。
// 會議上的 department 是純文字，刪掉部會不影響既有會議；表單會把舊值保留在下拉裡。

const MAX_NAME = 50;

export async function listDepartments(): Promise<string[]> {
  const rows = await prisma.departments.findMany({
    select: { name: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
  return rows.map((r) => r.name);
}

export async function addDepartment(raw: string): Promise<{ error?: string }> {
  const name = raw.trim();
  if (!name) return { error: "請輸入部會名稱" };
  if (name.length > MAX_NAME) return { error: `部會名稱不可超過 ${MAX_NAME} 字` };
  if (name.includes(",")) return { error: "部會名稱不可含逗號" };
  try {
    await prisma.$transaction(
      async (tx) => {
        const max = await tx.departments.aggregate({ _max: { position: true } });
        await tx.departments.create({ data: { name, position: (max._max.position ?? 0) + 1 } });
      },
      { timeout: 10_000 },
    );
  } catch (err) {
    // P2002 = unique 違反（name 重複）
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { error: "這個部會已經存在" };
    throw err;
  }
  return {};
}

export async function removeDepartment(name: string): Promise<boolean> {
  const { count } = await prisma.departments.deleteMany({ where: { name } });
  return count > 0;
}
