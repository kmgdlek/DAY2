// Vercel 서버리스 함수: 브라우저 대신 서버에서 Pixabay를 호출해서
// API 키가 화면(HTML/JS)에 노출되지 않게 합니다.
// 키는 Vercel 환경변수 PIXABAY_API_KEY 에서 읽습니다.
module.exports = async (req, res) => {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'PIXABAY_API_KEY 환경변수가 설정되지 않았습니다.' });
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET 요청만 사용할 수 있습니다.' });
    return;
  }

  const q = String(req.query.q || '').trim().slice(0, 100);
  if (!q) {
    res.status(400).json({ error: '검색어(q)가 필요합니다.' });
    return;
  }
  // Pixabay는 검색당 최대 500장까지만 주므로 10개씩 최대 50페이지
  const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), 50);

  const params = new URLSearchParams({
    key,
    q,
    image_type: 'photo',
    per_page: '10',
    page: String(page),
    lang: 'ko',
    safesearch: 'true'
  });

  try {
    const r = await fetch('https://pixabay.com/api/?' + params);
    if (!r.ok) {
      res.status(r.status === 429 ? 429 : 502).json({
        error: r.status === 429 ? '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' : 'Pixabay 요청에 실패했습니다.'
      });
      return;
    }
    const data = await r.json();
    // 같은 검색은 1시간 동안 Vercel이 대신 응답해서 호출 횟수를 아낍니다.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({
      totalHits: data.totalHits,
      hits: (data.hits || []).map(h => ({
        id: h.id,
        pageURL: h.pageURL,
        webformatURL: h.webformatURL,
        tags: h.tags,
        user: h.user
      }))
    });
  } catch (e) {
    res.status(502).json({ error: 'Pixabay에 연결하지 못했습니다.' });
  }
};
