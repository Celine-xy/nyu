const { XMLParser } = require('fast-xml-parser');
const SOURCES = [
  { source: 'WIRED', url: 'https://www.wired.com/feed/tag/ai/latest/rss' },
  { source: 'TechCrunch', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  { source: 'VentureBeat', url: 'https://venturebeat.com/category/ai/feed/' }
];
const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
const asArray = (value) => Array.isArray(value) ? value : value ? [value] : [];
const cleanText = (value) => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function normalizeItem(item, source) {
  const url = typeof item.link === 'object' ? item.link?.['@_href'] : item.link;
  const title = cleanText(item.title);
  if (!title || !url) return null;
  const parsedDate = Date.parse(item.pubDate || item.published || item['dc:date'] || '');
  return { id: String(item.guid?.['#text'] || item.guid || url), source, title, url, publishedAt: Number.isNaN(parsedDate) ? '' : new Date(parsedDate).toISOString(), summary: cleanText(item.description || item['content:encoded'] || item.summary || '') };
}

async function fetchSource(config) {
  const response = await fetch(config.url, { headers: { 'User-Agent': 'AI-News-Assistant/1.0' } });
  if (!response.ok) throw new Error(`${config.source} returned ${response.status}`);
  const parsed = parser.parse(await response.text());
  const items = asArray(parsed?.rss?.channel?.item || parsed?.feed?.entry);
  if (!items.length) throw new Error(`${config.source} returned no readable stories`);
  return items.map((item) => normalizeItem(item, config.source)).filter(Boolean).slice(0, 6);
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed.' });
  try {
    const settled = await Promise.allSettled(SOURCES.map(fetchSource));
    const articles = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    const failures = settled.flatMap((result, index) => result.status === 'rejected' ? [{ source: SOURCES[index].source, message: result.reason.message }] : []);
    if (!articles.length) return response.status(502).json({ error: 'All RSS sources are currently unavailable.', failures });
    articles.sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
    return response.status(200).json({ articles: articles.slice(0, 18), failures });
  } catch { return response.status(500).json({ error: 'The news service could not be reached.' }); }
};
