// Vercel 서버리스 함수: 브라우저 대신 서버에서 OpenAI(ChatGPT) API를 호출해서
// API 키가 화면(HTML/JS)에 노출되지 않게 합니다.
// 키는 Vercel 환경변수 OPENAI_API_KEY 에서 읽습니다. (모델은 OPENAI_MODEL, 없으면 gpt-4o-mini)
const SYSTEM_PROMPT = [
  '너는 제주도 맛집을 알아봐 주는 친절한 안내 에이전트야.',
  '맛집을 추천할 때는 지역(제주시, 성산, 서귀포, 애월 등)과 대표 메뉴를 함께 알려줘.',
  '날씨(비, 바람 등)와 가까운 체험 장소도 같이 안내해 줘.',
  '실시간 영업 여부나 정확한 가격은 모르니, 방문 전에 확인하라고 알려줘.',
  '제주 여행·맛집과 관계없는 질문에는 정중히 제주 이야기로 돌아오도록 안내해 줘.',
  '답변은 한국어로, 5문장 이내로 짧고 읽기 쉽게 써줘.'
].join('\n');

module.exports = async (req, res) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'OPENAI_API_KEY 환경변수가 설정되지 않았습니다.' });
    return;
  }
  // 상태 확인용: 채팅창이 열릴 때 '온라인/오프라인' 표시를 위해 호출 (OpenAI는 호출하지 않음)
  if (req.method === 'GET') {
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST 요청만 사용할 수 있습니다.' });
    return;
  }

  // 대화 기록: 최근 10개만, 각 500자까지, user/assistant 역할만 허용
  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  const raw = Array.isArray(body && body.messages) ? body.messages : [];
  const messages = raw
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-10)
    .map(m => ({ role: m.role, content: m.content.slice(0, 500) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    res.status(400).json({ error: '보낼 메시지가 없습니다.' });
    return;
  }

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        max_tokens: 400,
        temperature: 0.7
      })
    });
    if (!r.ok) {
      res.status(r.status === 429 ? 429 : 502).json({
        error: r.status === 429 ? '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' : 'OpenAI 요청에 실패했습니다.'
      });
      return;
    }
    const data = await r.json();
    const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!reply) {
      res.status(502).json({ error: '답변을 받지 못했습니다.' });
      return;
    }
    res.status(200).json({ reply: reply.trim() });
  } catch (e) {
    res.status(502).json({ error: 'OpenAI에 연결하지 못했습니다.' });
  }
};

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}
