export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Model waterfall: best → good → fallback → wide-open
  // Each model is tried in order; if busy (429/503) we drop to the next
  const models = ['glm-5-turbo', 'glm-5', 'GLM-4.5', 'GLM-4-Plus'];

  for (const model of models) {
    try {
      const body = { ...req.body, model };
      const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.ZAI_API_KEY}`
        },
        body: JSON.stringify(body)
      });

      // If busy/rate-limited, try next model
      if (response.status === 429 || response.status === 503) {
        console.log(`${model} busy, trying next...`);
        continue;
      }

      const data = await response.json();

      // Some APIs return error in body even with 200 status
      if (data.error?.code === 'concurrency_limit_exceeded' ||
          data.error?.code === 'rate_limit_exceeded') {
        console.log(`${model} concurrency full, trying next...`);
        continue;
      }

      // Success — include which model was used in response
      res.status(response.status).json({ ...data, _model_used: model });
      return;

    } catch (err) {
      console.log(`${model} error: ${err.message}, trying next...`);
      continue;
    }
  }

  // All models exhausted
  res.status(503).json({ error: 'All models are currently busy. Please try again in a moment.' });
}
