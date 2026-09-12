const loadButton = document.querySelector('#load-news');
const filterInput = document.querySelector('#keyword-filter');
const newsStatus = document.querySelector('#news-status');
const articleList = document.querySelector('#article-list');
const deepReadPanel = document.querySelector('#deep-read-panel');
const deepReadContent = document.querySelector('#deep-read-content');
const closeDeepReadButton = document.querySelector('#close-deep-read');
const explorerForm = document.querySelector('#explorer-form');
const explorerUrl = document.querySelector('#explorer-url');
const scrapePageButton = document.querySelector('#scrape-page');
const explorerStatus = document.querySelector('#explorer-status');
const explorerResult = document.querySelector('#explorer-result');
const explorerContent = document.querySelector('#explorer-content');
const jobScoutForm = document.querySelector('#job-scout-form');
const jobUrlFields = [...document.querySelectorAll('#job-url-fields input')];
const scanJobsButton = document.querySelector('#scan-jobs');
const clearJobsButton = document.querySelector('#clear-jobs');
const jobSourceStatuses = document.querySelector('#job-source-statuses');
const jobScoutStatus = document.querySelector('#job-scout-status');
const jobResults = document.querySelector('#job-results');
const jobResultsNote = document.querySelector('#job-results-note');
const jobResultsList = document.querySelector('#job-results-list');
let articles = [];

function setStatus(message, isError = false) { newsStatus.textContent = message; newsStatus.classList.toggle('is-error', isError); }
function formatDate(value) { const date = new Date(value); return value && !Number.isNaN(date.valueOf()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable'; }
function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
function setExplorerStatus(message, isError = false) { explorerStatus.textContent = message; explorerStatus.classList.toggle('is-error', isError); }
function setJobScoutStatus(message, isError = false) { jobScoutStatus.textContent = message; jobScoutStatus.classList.toggle('is-error', isError); }
function renderSourceStatuses(sources, scanning = false) {
  jobSourceStatuses.replaceChildren();
  jobUrlFields.forEach((field, index) => {
    const value = field.value.trim();
    let normalizedValue = value;
    try { normalizedValue = new URL(value).href; } catch { /* The API will provide the readable validation error. */ }
    const source = sources?.find((item) => item.url === normalizedValue);
    const text = !value ? 'Waiting' : scanning ? 'Scanning' : source?.error ? `${source.status}: ${source.error}` : source?.status || 'Waiting';
    jobSourceStatuses.append(element('span', `source-status ${text === 'Could not extract' ? 'is-error' : ''}`, `Source ${index + 1}: ${text}`));
  });
}
function renderJobResults(jobs) {
  jobResultsList.replaceChildren();
  jobs.forEach((job, index) => {
    const card = element('article', 'job-card');
    const title = element('h4', '', `#${index + 1} ${job.title}`);
    const meta = element('p', 'job-meta', [job.employer, job.location, job.sourceDomain, job.employmentType, job.postedDate].filter(Boolean).join(' · ') || job.sourceDomain);
    const original = element('a', 'original-link', 'Open Job Posting');
    original.href = job.jobUrl; original.target = '_blank'; original.rel = 'noopener noreferrer';
    const reasons = element('ul', 'job-reasons');
    job.reasons.forEach((reason) => { const item = element('li', ''); const heading = element('strong', '', `${reason.heading}: `); item.append(heading, document.createTextNode(reason.text)); reasons.append(item); });
    card.append(title, meta, reasons, original); jobResultsList.append(card);
  });
}
function renderPageResult(container, page) {
  const source = element('p', '', page.domain);
  const pageUrl = element('a', 'page-url', page.url);
  pageUrl.href = page.url; pageUrl.target = '_blank'; pageUrl.rel = 'noopener noreferrer';
  const urlLine = element('p', 'page-url-line');
  urlLine.append(pageUrl);
  const actions = element('p', '');
  const original = element('a', 'original-link', 'Open Original Page');
  original.href = page.url; original.target = '_blank'; original.rel = 'noopener noreferrer'; actions.append(original);
  container.replaceChildren(element('h3', '', page.title), source, urlLine, ...(page.description ? [element('p', '', page.description)] : []), element('p', 'excerpt', page.content || 'No clean text excerpt was available.'), actions);
}

function renderArticles() {
  const query = filterInput.value.trim().toLowerCase();
  const matches = articles.filter((article) => `${article.title} ${article.summary}`.toLowerCase().includes(query));
  articleList.replaceChildren();
  if (!matches.length) return articleList.append(element('p', 'empty-state', articles.length ? 'No matching stories.' : 'No stories loaded yet.'));
  matches.forEach((article) => {
    const card = element('article', 'article-card');
    const meta = element('div', 'article-meta');
    meta.append(element('span', 'source-chip', article.source), element('span', '', formatDate(article.publishedAt)));
    const actions = element('div', 'article-actions');
    const original = element('a', 'original-link', 'Read Original Article');
    original.href = article.url; original.target = '_blank'; original.rel = 'noopener noreferrer';
    const deepRead = element('button', 'deep-read-button', 'Deep Read');
    deepRead.type = 'button'; deepRead.addEventListener('click', () => runDeepRead(article, deepRead));
    actions.append(original, deepRead);
    card.append(meta, element('h3', '', article.title), element('p', 'article-summary', article.summary || 'No RSS summary was provided for this story.'), actions);
    articleList.append(card);
  });
}

async function runDeepRead(article, button) {
  deepReadPanel.hidden = false;
  deepReadContent.replaceChildren(element('p', '', `Retrieving ${article.title}…`));
  button.disabled = true;
  try {
    const response = await fetch('/api/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: article.url }) });
    const page = await response.json();
    if (!response.ok) throw new Error(page.error || 'Deep Read could not be completed.');
    renderPageResult(deepReadContent, page);
  } catch (error) { deepReadContent.replaceChildren(element('p', 'inline-error', `${error.message} Please try another article.`)); }
  finally { button.disabled = false; }
}

function closeDeepRead() {
  deepReadPanel.hidden = true;
  deepReadContent.replaceChildren();
}

explorerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = explorerUrl.value.trim();
  if (!value) return setExplorerStatus('Enter a public webpage URL to scrape.', true);
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('scheme');
  } catch { return setExplorerStatus('Enter a valid http:// or https:// webpage URL.', true); }
  scrapePageButton.disabled = true;
  explorerResult.hidden = false;
  explorerContent.replaceChildren(element('p', '', `Retrieving ${value}…`));
  setExplorerStatus('Retrieving one page…');
  try {
    const response = await fetch('/api/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: value }) });
    const page = await response.json();
    if (!response.ok) throw new Error(page.error || 'The page could not be retrieved.');
    renderPageResult(explorerContent, page);
    setExplorerStatus('Page retrieved successfully.');
  } catch (error) {
    explorerContent.replaceChildren(element('p', 'inline-error', `${error.message} Try another public webpage.`));
    setExplorerStatus('The page could not be retrieved.', true);
  } finally { scrapePageButton.disabled = false; }
});

jobScoutForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const urls = jobUrlFields.map((field) => field.value.trim()).filter(Boolean);
  if (!urls.length) { renderSourceStatuses(); return setJobScoutStatus('Add at least one public job-listing URL.', true); }
  try { urls.forEach((value) => { const parsed = new URL(value); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('scheme'); }); }
  catch { renderSourceStatuses(); return setJobScoutStatus('Use valid public http:// or https:// URLs only.', true); }
  scanJobsButton.disabled = true;
  jobResults.hidden = true;
  renderSourceStatuses(null, true);
  setJobScoutStatus(`Scanning ${urls.length} source${urls.length === 1 ? '' : 's'}…`);
  try {
    const response = await fetch('/api/jobs/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls }) });
    const payload = await response.json();
    renderSourceStatuses(payload.sources || []);
    if (!response.ok) throw new Error(payload.error || 'The supplied pages could not be scanned.');
    const jobs = payload.jobs || [];
    jobResults.hidden = false;
    jobResultsNote.textContent = jobs.length ? `Showing ${jobs.length} evidence-supported role${jobs.length === 1 ? '' : 's'} from the pages that could be extracted.` : 'No qualifying junior opportunities were found in the extracted listings.';
    renderJobResults(jobs);
    setJobScoutStatus(`${jobs.length} recommended role${jobs.length === 1 ? '' : 's'} found.`);
  } catch (error) {
    jobResults.hidden = true;
    setJobScoutStatus(error.message, true);
  } finally { scanJobsButton.disabled = false; }
});

clearJobsButton.addEventListener('click', () => {
  jobUrlFields.forEach((field) => { field.value = ''; });
  jobResults.hidden = true; jobResultsList.replaceChildren(); jobResultsNote.textContent = '';
  renderSourceStatuses(); setJobScoutStatus('Add one to five public job-listing URLs. No sign-in pages or bulk scanning.');
});

loadButton.addEventListener('click', async () => {
  loadButton.disabled = true; setStatus('Loading the latest RSS stories…');
  try {
    const response = await fetch('/api/news'); const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'News could not be loaded.');
    articles = payload.articles || []; filterInput.disabled = !articles.length; renderArticles();
    const warning = payload.failures?.length ? ` ${payload.failures.length} source${payload.failures.length === 1 ? '' : 's'} could not be loaded.` : '';
    setStatus(`${articles.length} stories loaded.${warning}`, payload.failures?.length > 0);
  } catch (error) { articles = []; filterInput.disabled = true; renderArticles(); setStatus(`${error.message} Please retry.`, true); }
  finally { loadButton.disabled = false; }
});
filterInput.addEventListener('input', renderArticles);
closeDeepReadButton.addEventListener('click', closeDeepRead);
renderSourceStatuses();
renderArticles();
