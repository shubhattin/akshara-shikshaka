import { Receiver } from '@upstash/qstash';
import { resolveSiteUrl } from '~/effect/config';
import { qstashTargetUrl, type QstashPath } from '~/effect/qstash';

type VerifyOk = { ok: true; body: unknown };
type VerifyFail = { ok: false; response: Response };
export type VerifyQstashResult = VerifyOk | VerifyFail;

const siteUrl = () => resolveSiteUrl(process.env);

/**
 * Verify the QStash signature and return the parsed JSON body, or a 401 Response.
 * `path` binds the signature to this endpoint (JWT `sub`), so a message signed for another
 * route — or another app on the same Upstash account (krida) — is rejected.
 */
export async function verifyQstashRequest(
  request: Request,
  path: QstashPath
): Promise<VerifyQstashResult> {
  try {
    const site = siteUrl();
    if (!site) throw new Error('VITE_BASE_URL is not set');
    const receiver = new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!
    });
    const signature = request.headers.get('upstash-signature') ?? '';
    const body = await request.text();
    await receiver.verify({ signature, body, url: qstashTargetUrl(site, path) });
    return { ok: true, body: JSON.parse(body) };
  } catch (err) {
    console.error(
      '[qstash] signature verification failed',
      err instanceof Error ? err.message : 'unknown error'
    );
    return { ok: false, response: new Response('Unauthorized', { status: 401 }) };
  }
}
