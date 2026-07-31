'use strict';

const CHALLENGE_BODY_PATTERNS = [
  { evidence: 'body:challenge-platform', pattern: /\/cdn-cgi\/challenge-platform\//i },
  { evidence: 'body:challenges.cloudflare.com', pattern: /challenges\.cloudflare\.com/i },
  { evidence: 'body:_cf_chl_', pattern: /_cf_chl_/i },
  { evidence: 'body:cf-chl-', pattern: /\bcf-chl-/i }
];

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return String(headers.get(name) || '');
  const wanted = String(name || '').toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() !== wanted) continue;
    return Array.isArray(value) ? value.join(', ') : String(value || '');
  }
  return '';
}

function detectCloudflareChallenge(input = {}) {
  const headers = input.headers || null;
  const body = String(input.body || '').slice(0, 4096);
  const cfMitigated = headerValue(headers, 'cf-mitigated').trim().toLowerCase();
  const cfRay = headerValue(headers, 'cf-ray').trim();
  const server = headerValue(headers, 'server').trim();
  const contentType = String(input.contentType || headerValue(headers, 'content-type')).trim();
  const evidence = [];

  if (cfMitigated === 'challenge') evidence.push('header:cf-mitigated=challenge');
  for (const marker of CHALLENGE_BODY_PATTERNS) {
    if (marker.pattern.test(body)) evidence.push(marker.evidence);
  }
  if (
    /<title>\s*just a moment(?:\.\.\.)?\s*<\/title>/i.test(body)
    && (/cloudflare/i.test(server) || Boolean(cfRay) || /cloudflare/i.test(body))
  ) {
    evidence.push('body:cloudflare-just-a-moment');
  }

  return {
    detected: evidence.length > 0,
    status: Number(input.status || input.statusCode || 0),
    contentType,
    cfRay,
    evidence: Array.from(new Set(evidence))
  };
}

function cloudflareChallengeFailure(challenge, detail = {}) {
  const detectedAt = detail.detectedAt || new Date().toISOString();
  return {
    type: 'cloudflare-challenge',
    operation: String(detail.operation || 'login'),
    source: String(detail.source || 'cloudflare-response-evidence'),
    detectedAt,
    status: Number(challenge?.status || 0),
    contentType: String(challenge?.contentType || ''),
    cfRay: String(challenge?.cfRay || ''),
    evidence: Array.isArray(challenge?.evidence) ? challenge.evidence.slice(0, 8) : [],
    sourceIp: String(detail.sourceIp || '')
  };
}

function createCloudflareChallengeError(challenge, detail = {}) {
  const failure = cloudflareChallengeFailure(challenge, detail);
  const error = new Error('Cloudflare challenge detected');
  error.code = failure.type;
  error.connectionFailure = failure;
  return error;
}

function isCloudflareChallengeError(error) {
  return error?.connectionFailure?.type === 'cloudflare-challenge';
}

function runCloudflareChallengeSelfTest() {
  const headerChallenge = detectCloudflareChallenge({
    status: 403,
    headers: { 'cf-mitigated': 'challenge', 'cf-ray': 'test-ray' },
    body: '<html>generic</html>'
  });
  const bodyChallenge = detectCloudflareChallenge({
    status: 200,
    headers: { server: 'cloudflare' },
    body: '<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script>'
  });
  const titledChallenge = detectCloudflareChallenge({
    status: 403,
    headers: { server: 'cloudflare' },
    body: '<html><title>Just a moment...</title></html>'
  });
  const generic403 = detectCloudflareChallenge({
    status: 403,
    headers: { server: 'cloudflare', 'cf-ray': 'generic-ray' },
    body: '<html><title>Forbidden</title></html>'
  });
  const generic502 = detectCloudflareChallenge({
    status: 502,
    headers: { server: 'cloudflare' },
    body: '<html><title>Bad gateway</title></html>'
  });
  return {
    ok: Boolean(
      headerChallenge.detected
        && headerChallenge.cfRay === 'test-ray'
        && bodyChallenge.detected
        && titledChallenge.detected
        && !generic403.detected
        && !generic502.detected
    ),
    headerChallenge,
    bodyChallenge,
    titledChallenge,
    generic403,
    generic502
  };
}

module.exports = {
  cloudflareChallengeFailure,
  createCloudflareChallengeError,
  detectCloudflareChallenge,
  headerValue,
  isCloudflareChallengeError,
  runCloudflareChallengeSelfTest
};
