const MAX_SOURCES = 5;
const MAX_JOBS_PER_SOURCE = 8;
const POSITIVE_SIGNALS = /\b(junior|graduate|entry[ -]?level|trainee|intern(?:ship)?|assistant|associate|coordinator|analyst|0\s*[–-]\s*2\s*years?|no prior experience)\b/i;
const SENIOR_SIGNALS = /\b(senior|lead|principal|head|director|executive|5\+?\s*years?)\b/i;
const SKILL_SIGNALS = /\b(analysis|data|research|communication|presentation|project|customer|stakeholder|writing|software|technical|digital|operations|coordination|policy)\b/i;
const FUTURE_SIGNALS = /\b(ai|artificial intelligence|data|digital|technology|software|cyber|climate|innovation|policy|automation)\b/i;
const JOB_SCHEMA = {
  type: 'object',
  properties: {
    jobs: {
      type: 'array',
      maxItems: MAX_JOBS_PER_SOURCE,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' }, employer: { type: 'string' }, location: { type: 'string' }, jobUrl: { type: 'string' }, postedDate: { type: 'string' }, employmentType: { type: 'string' }, description: { type: 'string' },
          juniorEvidence: { type: 'array', items: { type: 'string' } }, transferableSkills: { type: 'array', items: { type: 'string' } }, futureRelevantSignals: { type: 'array', items: { type: 'string' } }, learningSignals: { type: 'array', items: { type: 'string' } }, seniorityWarnings: { type: 'array', items: { type: 'string' } }
        },
        required: ['title', 'employer', 'location', 'jobUrl', 'postedDate', 'employmentType', 'description', 'juniorEvidence', 'transferableSkills', 'futureRelevantSignals', 'learningSignals', 'seniorityWarnings']
      }
    }
  }, required: ['jobs']
};
const EXTRACTION_PROMPT = 'Extract up to 8 job opportunities visibly listed on this page. Focus on actual job postings, not navigation or promotional content. For each job return title, employer, location, direct job URL if visible, date, employment type, a short factual description, evidence that it is junior/graduate/entry-level, transferable skills, future-relevant technology/digital/data/policy/innovation signals, learning/training signals, and any evidence that the role is actually senior. Do not infer unsupported facts.';

function cleanString(value, limit = 500) { return typeof value === 'string' ? value.trim().slice(0, limit) : ''; }
function cleanList(value) { return Array.isArray(value) ? value.map((item) => cleanString(item, 180)).filter(Boolean).slice(0, 5) : []; }
function isPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1' || host.startsWith('fc00:') || host.startsWith('fd00:') || host.startsWith('fe80:')) return true;
  const parts = host.split('.').map(Number);
  return parts.length === 4 && parts.every(Number.isInteger) && (parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31));
}
function validateUrls(value) {
  if (!Array.isArray(value) || !value.length) throw new Error('Add at least one public job-listing URL.');
  if (value.length > MAX_SOURCES) throw new Error('You can scan up to five URLs at once.');
  const unique = [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
  if (!unique.length) throw new Error('Add at least one public job-listing URL.');
  return unique.map((item) => {
    const url = new URL(item);
    if (!['http:', 'https:'].includes(url.protocol) || isPrivateHost(url.hostname)) throw new Error('Use public http:// or https:// URLs only.');
    return url.href;
  });
}
function absoluteUrl(value, sourceUrl) { try { return new URL(value || sourceUrl, sourceUrl).href; } catch { return sourceUrl; } }
function normalizeJob(raw, sourceUrl) {
  const title = cleanString(raw?.title);
  const description = cleanString(raw?.description);
  if (!title) return null;
  const juniorEvidence = cleanList(raw.juniorEvidence);
  const transferableSkills = cleanList(raw.transferableSkills);
  const futureRelevantSignals = cleanList(raw.futureRelevantSignals);
  const learningSignals = cleanList(raw.learningSignals);
  const seniorityWarnings = cleanList(raw.seniorityWarnings);
  const searchable = `${title} ${description}`;
  if (POSITIVE_SIGNALS.test(searchable) && !juniorEvidence.length) juniorEvidence.push(`The title or description includes an early-career signal: “${title}”.`);
  if (SKILL_SIGNALS.test(searchable) && !transferableSkills.length) transferableSkills.push('The listing describes transferable work responsibilities.');
  if (FUTURE_SIGNALS.test(searchable) && !futureRelevantSignals.length) futureRelevantSignals.push('The listing references a future-relevant field or responsibility.');
  if (SENIOR_SIGNALS.test(searchable) && !seniorityWarnings.length) seniorityWarnings.push(`The listing includes a seniority signal: “${title}”.`);
  return { title, employer: cleanString(raw.employer), location: cleanString(raw.location), jobUrl: absoluteUrl(cleanString(raw.jobUrl, 1000), sourceUrl), postedDate: cleanString(raw.postedDate), employmentType: cleanString(raw.employmentType), description, juniorEvidence, transferableSkills, futureRelevantSignals, learningSignals, seniorityWarnings, sourceUrl, sourceDomain: new URL(sourceUrl).hostname };
}
function rankJob(job) {
  const searchable = `${job.title} ${job.description}`;
  const early = Math.min(40, job.juniorEvidence.length * 20 + (POSITIVE_SIGNALS.test(searchable) ? 10 : 0));
  const skills = Math.min(30, job.transferableSkills.length * 10 + (SKILL_SIGNALS.test(searchable) ? 5 : 0));
  const future = Math.min(20, job.futureRelevantSignals.length * 10 + (FUTURE_SIGNALS.test(searchable) ? 5 : 0));
  const learning = Math.min(10, job.learningSignals.length * 5);
  const penalty = job.seniorityWarnings.length * 25 + (SENIOR_SIGNALS.test(searchable) ? 20 : 0);
  return { ...job, score: early + skills + future + learning - penalty };
}
function recommendation(job) {
  const start = job.juniorEvidence[0];
  const skills = job.transferableSkills[0];
  const exposure = job.futureRelevantSignals[0] || job.learningSignals[0] || job.description;
  if (!start || !skills || !exposure) return null;
  return { ...job, reasons: [
    { heading: 'Accessible start', text: start },
    { heading: 'Skills you can build', text: skills },
    { heading: 'Career exposure', text: exposure }
  ] };
}
async function scanSource(url) {
  const firecrawlResponse = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, formats: [{ type: 'json', schema: JOB_SCHEMA, prompt: EXTRACTION_PROMPT }], onlyMainContent: true, onlyCleanContent: 'basic' })
  });
  const payload = await firecrawlResponse.json();
  if (!firecrawlResponse.ok || payload.success === false) throw new Error(payload.error || payload.message || 'This page could not be cleanly extracted. Try another public job page.');
  const extracted = payload.data?.json || payload.data?.extract || payload.data?.llm_extraction || {};
  const jobs = (Array.isArray(extracted.jobs) ? extracted.jobs : []).map((job) => normalizeJob(job, url)).filter(Boolean);
  return { url, status: jobs.length ? 'Extracted' : 'No jobs found', jobs };
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
  if (!process.env.FIRECRAWL_API_KEY) return response.status(503).json({ error: 'Job Scout is not configured yet. Add FIRECRAWL_API_KEY and retry.' });
  let urls;
  try { urls = validateUrls(request.body?.urls); } catch (error) { return response.status(400).json({ error: error.message }); }
  const settled = await Promise.allSettled(urls.map(scanSource));
  const sources = settled.map((result, index) => result.status === 'fulfilled' ? result.value : { url: urls[index], status: 'Could not extract', error: 'This page could not be cleanly extracted. Try another public job page.', jobs: [] });
  const jobs = sources.flatMap((source) => source.jobs).map(rankJob).map(recommendation).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 5);
  if (!sources.some((source) => source.status !== 'Could not extract')) return response.status(502).json({ error: 'None of the supplied pages could be cleanly extracted. Try other public job pages.', sources });
  return response.status(200).json({ jobs, sources });
};
