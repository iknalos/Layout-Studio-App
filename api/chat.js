export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = {
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2000,
      temperature: 0.1,
      messages: req.body.messages
    };

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: { message: text } }; }

    console.log(`Groq status: ${response.status}, response: ${text.slice(0, 200)}`);
    res.status(200).json(data);
  } catch (err) {
    console.log(`Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}
