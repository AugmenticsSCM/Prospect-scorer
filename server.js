require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert B2B sales analyst for Augmentics, a supply chain AI company.
You score enterprise prospects on their fit for AI-powered supply chain solutions.

Score each dimension 1-10 where 10 = perfect fit:
- td (Transaction Density): Volume and frequency of supply chain transactions. High volume = better fit.
- sf (System Fragmentation): Number of disconnected systems/tools in their stack. More fragmentation = better fit.
- se (SKU Entropy): Complexity and variability of their product catalog. High complexity = better fit.
- cn (Communication Noise): Volume of manual communications (emails, calls) to coordinate supply chain. More noise = better fit.
- cp (Context Perishability): How quickly supply chain data becomes stale/outdated. Faster perishability = better fit.
- dn (Decision Nuance): Complexity of decisions requiring human judgment. More nuance = better fit.

Respond ONLY with valid JSON, no markdown, no explanation outside the JSON:
{
  "td": <1-10>,
  "sf": <1-10>,
  "se": <1-10>,
  "cn": <1-10>,
  "cp": <1-10>,
  "dn": <1-10>,
  "rationale": "<2-3 sentence summary of why this company is or isn't a strong fit>"
}`;

app.post('/api/score', async (req, res) => {
  const { company } = req.body;
  if (!company || !company.trim()) {
    return res.status(400).json({ error: 'Company name is required' });
  }

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Score this company as a prospect for Augmentics supply chain AI: "${company.trim()}"\n\nUse publicly known information about this company's industry, size, and operations to estimate scores. If the company is unknown, make reasonable estimates based on any context clues in the name.`
        }
      ]
    });

    const text = message.content[0].text.trim();
    let scores;
    try {
      scores = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Could not parse JSON from model response');
      scores = JSON.parse(match[0]);
    }

    const dims = ['td', 'sf', 'se', 'cn', 'cp', 'dn'];
    for (const d of dims) {
      if (typeof scores[d] !== 'number' || scores[d] < 1 || scores[d] > 10) {
        scores[d] = Math.max(1, Math.min(10, Math.round(Number(scores[d])) || 5));
      }
    }

    res.json(scores);
  } catch (err) {
    console.error('Scoring error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to score company' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Prospect Scorer running on port ${PORT}`));
