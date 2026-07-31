import { createClient } from "@supabase/supabase-js";

// Supabase Storage for original uploaded PDFs (audit trail / re-processing).
// Uses the service role key server-side only - never expose this key to the client.

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Find both in your Supabase project: " +
      "Project Settings -> API. Use the service_role key (not anon) since this runs server-side only."
  );
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BUCKET = "fund-reports";

export async function ensureBucketExists() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: false });
  }
}

export async function uploadReportFile(
  path: string,
  fileBuffer: Buffer,
  contentType = "application/pdf"
): Promise<string> {
  await ensureBucketExists();
  const { error } = await supabase.storage.from(BUCKET).upload(path, fileBuffer, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Failed to upload ${path} to storage: ${error.message}`);
  return path;
}

export async function downloadReportFile(path: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw new Error(`Failed to download ${path} from storage: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function getSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) throw new Error(`Failed to sign URL for ${path}: ${error.message}`);
  return data.signedUrl;
}
