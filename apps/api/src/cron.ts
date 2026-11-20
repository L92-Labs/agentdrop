import type { AppEnv } from "./config";

export async function cleanupExpired(env: AppEnv): Promise<{ deleted: number }> {
  const now = Date.now();
  const rows = await env.DB.prepare(
    "SELECT id, r2_key FROM artifacts WHERE expires_at <= ? LIMIT 100",
  )
    .bind(now)
    .all<{ id: string; r2_key: string }>();

  let deleted = 0;
  for (const row of rows.results ?? []) {
    await env.DATA.delete(row.r2_key);
    await env.DB.prepare("DELETE FROM artifacts WHERE id = ?").bind(row.id).run();
    deleted++;
  }

  await env.DB.prepare("DELETE FROM link_requests WHERE expires_at <= ? AND completed_at IS NULL")
    .bind(now)
    .run();

  await env.DB.prepare("DELETE FROM rate_counters WHERE window_start < ?")
    .bind(now - 7 * 86_400_000)
    .run();

  const stale = await env.DB.prepare(
    "SELECT id, r2_key, r2_upload_id FROM multipart_uploads WHERE expires_at <= ? LIMIT 50",
  )
    .bind(now)
    .all<{ id: string; r2_key: string; r2_upload_id: string }>();
  for (const row of stale.results ?? []) {
    try {
      await env.DATA.resumeMultipartUpload(row.r2_key, row.r2_upload_id).abort();
    } catch {
      // ignore
    }
    await env.DB.prepare("DELETE FROM multipart_uploads WHERE id = ?").bind(row.id).run();
  }

  return { deleted };
}

export default {
  async scheduled(_event: ScheduledEvent, env: AppEnv, _ctx: ExecutionContext) {
    await cleanupExpired(env);
  },
};
