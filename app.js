const loadButton = document.querySelector('#load-news');
const filterInput = document.querySelector('#keyword-filter');
const newsStatus = document.querySelector('#news-status');
const articleList = document.querySelector('#article-list');
const deepReadPanel = document.querySelector('#deep-read-panel');
const deepReadContent = document.querySelector('#deep-read-content');
let articles = [];

function setStatus(message, isError = false) { newsStatus.textContent = message; newsStatus.classList.toggle('is-error', isError); }
function formatDate(value) { const date = new Date(value); return value && !Number.isNaN(date.valueOf()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable'; }
function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }

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
    const source = element('p', '', `${page.domain} · `);
    const original = element('a', 'original-link', 'Open original article');
    original.href = page.url; original.target = '_blank'; original.rel = 'noopener noreferrer'; source.append(original);
    deepReadContent.replaceChildren(element('h3', '', page.title), source, ...(page.description ? [element('p', '', page.description)] : []), element('p', 'excerpt', page.content || 'No clean text excerpt was available.'));
  } catch (error) { deepReadContent.replaceChildren(element('p', 'inline-error', `${error.message} Please try another article.`)); }
  finally { button.disabled = false; }
}

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
renderArticles();
