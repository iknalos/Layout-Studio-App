export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const models = ['glm-5-turbo', 'glm-5', 'GLM-4.5', 'GLM-4-Plus'];

  for (const model of models) {
    try {
      const body = { ...req.body, model, request_id: undefined };
      const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.ZAI_API_KEY}`
        },
        body: JSON.stringify(body)
      });

      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { error: { message: text } }; }

      // Log for debugging in Vercel logs
      console.log(`Model: ${model}, Status: ${response.status}, Response: ${text.slice(0, 300)}`);

      if (response.status === 429 || response.status === 503) { continue; }
      if (data.error?.code === 'concurrency_limit_exceeded' ||
          data.error?.code === 'rate_limit_exceeded' ||
          data.error?.type === 'concurrency_limit_exceeded') { continue; }

      res.status(200).json({ ...data, _model_used: model });
      return;
    } catch (err) {
      console.log(`${model} error: ${err.message}`);
      continue;
    }
  }

  res.status(503).json({ error: 'All models busy. Please try again.' });
}
