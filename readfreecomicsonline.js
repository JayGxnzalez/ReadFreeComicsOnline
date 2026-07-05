function toAbsolute(u) {
    u = String(u || "").trim();
    if (u.indexOf("//") === 0) {
        u = "https:" + u;
    } else if (u.indexOf("http://") === 0) {
        u = "https://" + u.substring(7);
    } else if (u.indexOf("https://") !== 0 && u.length > 0) {
        u = "https://readfreecomicsonline.com" + (u.indexOf("/") === 0 ? "" : "/") + u;
    }
    return u;
}

function getArticleBlocks(html) {
    const blocks = [];
    const regex = /<article[^>]*id="post-[\s\S]*?<\/article>/g;
    let m;
    while ((m = regex.exec(html)) !== null) {
        blocks.push(m[0]);
    }
    return blocks;
}

function parseArticle(block) {
    const titleMatch = /<h2 class="entry-title"[^>]*>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>/.exec(block);
    if (!titleMatch) return null;

    const url = toAbsolute(titleMatch[1]);
    const title = String(titleMatch[2]).trim();

    let thumb = "";
    const imgRegex = /<img[^>]+src="([^"]+)"/g;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(block)) !== null) {
        if (imgMatch[1].indexOf("/wp-content/uploads/") !== -1) {
            thumb = toAbsolute(imgMatch[1]);
            break;
        }
    }

    const dateMatch = /<time class="entry-date published" datetime="([^"]+)"/.exec(block);
    const dateStr = dateMatch ? dateMatch[1] : "";
    const ts = dateStr ? new Date(dateStr).getTime() : 0;

    let tagUrl = "";
    let tagText = "";
    const tagLinkMatch = /<a href="([^"]+)"[^>]*rel="tag"[^>]*>([^<]+)<\/a>/.exec(block);
    if (tagLinkMatch) {
        tagUrl = toAbsolute(tagLinkMatch[1]);
        tagText = String(tagLinkMatch[2]).trim();
    }

    return { url: url, title: title, thumb: thumb, ts: ts, tagUrl: tagUrl, tagText: tagText };
}

async function searchResults(keyword) {
    const results = [];
    try {
        const response = await fetch("https://readfreecomicsonline.com/?s=" + encodeURIComponent(keyword));
        const html = await response.text();
        const blocks = getArticleBlocks(html);

        const seen = {};
        for (let i = 0; i < blocks.length; i++) {
            const item = parseArticle(blocks[i]);
            if (!item) continue;

            const seriesId = item.tagUrl || item.url;
            if (seen[seriesId]) continue;
            seen[seriesId] = true;

            let seriesTitle = item.title;
            if (item.tagText) {
                seriesTitle = item.tagText.split("–")[0].trim();
            }

            results.push({
                id: seriesId,
                imageURL: item.thumb,
                title: seriesTitle
            });
        }
        return results;
    } catch (err) {
        return results;
    }
}

async function extractDetails(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();

        let description = "";
        const descMatch = /<meta property="og:description" content="([^"]+)"/.exec(html);
        if (descMatch) description = descMatch[1].trim();

        const tags = [];
        const blocks = getArticleBlocks(html);
        if (blocks.length > 0) {
            const catRegex = /<a[^>]*rel="category tag"[^>]*>([^<]+)<\/a>/g;
            let cm;
            while ((cm = catRegex.exec(blocks[0])) !== null) {
                tags.push(String(cm[1]).trim());
            }
        }

        return { description: description, tags: tags };
    } catch (err) {
        return { description: "", tags: [] };
    }
}

async function extractChapters(url) {
    try {
        const base = url.replace(/\/$/, "");
        const issues = [];
        const seenUrls = {};

        for (let page = 1; page <= 30; page++) {
            const pageUrl = page === 1 ? url : base + "/page/" + page + "/";
            let html;
            try {
                const response = await fetch(pageUrl);
                html = await response.text();
            } catch (e) {
                break;
            }

            const blocks = getArticleBlocks(html);
            if (blocks.length === 0) break;

            let addedAny = false;
            for (let i = 0; i < blocks.length; i++) {
                const item = parseArticle(blocks[i]);
                if (!item || seenUrls[item.url]) continue;
                seenUrls[item.url] = true;
                addedAny = true;

                let number = 0;
                const numMatch = /Issue\s+(\d+(?:\.\d+)?)/i.exec(item.title);
                if (numMatch) number = parseFloat(numMatch[1]);

                issues.push({
                    id: item.url,
                    title: item.title,
                    chapter: number,
                    ts: item.ts
                });
            }

            if (!addedAny) break;
        }

        issues.sort(function (a, b) { return a.ts - b.ts; });

        const results = [];
        for (let i = 0; i < issues.length; i++) {
            const issue = issues[i];
            const chapterNum = issue.chapter > 0 ? issue.chapter : (i + 1);
            results.push([String(chapterNum), [{
                id: issue.id,
                title: issue.title,
                chapter: chapterNum
            }]]);
        }

        return { en: results };
    } catch (err) {
        return { en: [] };
    }
}

async function extractImages(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();

        const images = [];
        const seen = {};
        const imgRegex = /<img[^>]+src="([^"]+)"/g;
        let m;
        while ((m = imgRegex.exec(html)) !== null) {
            const src = m[1];
            if (src.indexOf("/wp-content/uploads/") === -1) continue;
            if (!/\.(webp|jpe?g|png)(\?.*)?$/i.test(src)) continue;

            const abs = toAbsolute(src);
            if (seen[abs]) continue;
            seen[abs] = true;
            images.push(abs);
        }

        return images;
    } catch (err) {
        return [];
    }
}
