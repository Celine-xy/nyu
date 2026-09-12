const MAX_CONTENT_LENGTH = 6000;
function excerptFrom(content) {
  let text = String(content || '').replace(/\s+$/g, '');
  const firstHeading = text.search(/(?:^|\n)#\s+/);
  if (firstHeading >= 0) {
    const headingEnd = text.indexOf('\n', firstHeading);
    text = headingEnd >= 0 ? text.slice(headingEnd + 1) : '';
  }
  text = text
    .replace(/\[(?:share (?:on|over) [^\]]+|copy share link)\]\([^)]*\)/gi, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.slice(0, MAX_CONTENT_LENGTH);
}
function normalizeResult(data, url) {
  const metadata = data.metadata || {};
  return { title: metadata.title || data.title || 'Untitled page', domain: new URL(url).hostname, url, description: metadata.description || data.description || '', content: excerptFrom(data.markdown || data.content) };
}
module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
  let url;
  try { url = new URL(request.body?.url); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('scheme'); }
  catch { return response.status(400).json({ error: 'Enter one valid http:// or https:// URL.' }); }
  if (!process.env.FIRECRAWL_API_KEY) return response.status(503).json({ error: 'Deep Read is not configured yet. Add FIRECRAWL_API_KEY and retry.' });
  try {
    const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', { method: 'POST', headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.href, formats: ['markdown'], onlyMainContent: true }) });
    const payload = await firecrawlResponse.json();
    if (!firecrawlResponse.ok || payload.success === false) throw new Error(payload.error || payload.message || 'Firecrawl could not retrieve this page.');
    return response.status(200).json(normalizeResult(payload.data || payload, url.href));
  } catch (error) { return response.status(502).json({ error: error.message || 'Firecrawl could not retrieve this page.' }); }
};
