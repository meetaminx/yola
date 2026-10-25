import { createApiKey } from "@/lib/server/api-keys";
import { db } from "@/lib/server/db";
import { prefixedId } from "@/lib/utils/ids";

export const prisma = () => db();

/** Empty every application table, keeping the schema and migrations table. */
export async function resetDb() {
  const name = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
  if (!/test/i.test(name)) throw new Error(`Refusing to clear "${name}": not a test database.`);
  const tables = await prisma().$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma().$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
  }
}

export async function makeUser(email = `${prefixedId("u", 8)}@example.com`) {
  const now = new Date();
  return prisma().user.create({ data: { id: prefixedId("usr"), name: "Test User", email, emailVerified: true, createdAt: now, updatedAt: now } });
}

export async function makeProject(ownerId?: string) {
  const owner = ownerId ?? (await makeUser()).id;
  const project = await prisma().project.create({ data: { id: prefixedId("proj", 16), name: "Test project" } });
  await prisma().projectMember.create({ data: { projectId: project.id, userId: owner, role: "owner" } });
  const test = await createApiKey(prisma(), { projectId: project.id, name: "test", mode: "test", createdById: owner });
  const live = await createApiKey(prisma(), { projectId: project.id, name: "live", mode: "live", createdById: owner });
  return { project, ownerId: owner, testKey: test.secret, testKeyId: test.id, liveKey: live.secret };
}

type Handler = (req: Request) => Promise<Response>;

export async function call(
  handler: Handler,
  opts: { method?: string; path: string; key?: string | null; body?: unknown; rawBody?: string; headers?: Record<string, string> },
) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.key) headers.Authorization = `Bearer ${opts.key}`;
  let body: string | undefined;
  if (opts.rawBody !== undefined) body = opts.rawBody;
  else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["Content-Type"] ??= "application/json";
  }
  const res = await handler(new Request(`http://localhost:3000/api/v1${opts.path}`, { method: opts.method ?? "GET", headers, body }));
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
}
