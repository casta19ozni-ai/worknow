const https = require('https');

/**
 * Vercel serverless function handler for Nemotron API chat endpoint
 * Handles POST requests to /api/chat for Nemotron integration
 */

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'Only POST requests are supported'
    });
  }

  try {
    const { messages, model } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Invalid request format',
        message: 'Messages array is required'
      });
    }

    if (!model || typeof model !== 'string' || model.trim() === '') {
      return res.status(400).json({
        error: 'Invalid request format',
        message: 'Model is required and must be a non-empty string'
      });
    }

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

    if (!OPENROUTER_API_KEY) {
      console.error('OPENROUTER_API_KEY environment variable is not set');
      return res.status(500).json({
        error: 'Server configuration error',
        message: 'OpenRouter API key not configured'
      });
    }

    const requestBody = {
      model: model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 4096,
      stream: false
    };

    const options = {
      hostname: 'openrouter.ai',
      port: 443,
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'X-Title': 'WorkNow-Nemotron-Integration'
      }
    };

    return new Promise((resolve, reject) => {
      let responded = false;
      let settled = false;

      const finish = (statusCode, body, err = null) => {
        if (responded) return;
        responded = true;
        if (!res.headersSent) {
          res.status(statusCode).json(body);
        }
        if (!settled) {
          settled = true;
          if (err) reject(err);
          else resolve();
        }
      };

      const postReq = https.request(options, (response) => {
        if (responded) return;

        let data = '';

        response.on('data', (chunk) => {
          if (responded) return;
          data += chunk;
        });

        response.on('end', () => {
          if (responded) return;

          try {
            const result = JSON.parse(data);

            if (!result || !result.choices || !result.choices[0] || !result.choices[0].message) {
              throw new Error('Invalid response format from OpenRouter');
            }

            const assistantResponse = result.choices[0].message.content;

            if (!assistantResponse || typeof assistantResponse !== 'string' || assistantResponse.trim() === '') {
              throw new Error('Empty or invalid response received from OpenRouter');
            }

            finish(response.statusCode || 200, result);
          } catch (error) {
            console.error('Error processing OpenRouter response:', error);
            finish(500, {
              error: 'Server error',
              message: 'Failed to process OpenRouter response'
            }, error);
          }
        });
      });

      postReq.on('error', (error) => {
        console.error('Error making request to OpenRouter:', error);
        finish(500, {
          error: 'Server error',
          message: 'Failed to connect to OpenRouter API'
        }, error);
      });

      postReq.setTimeout(30000, () => {
        console.error('Timeout reaching OpenRouter API');
        postReq.destroy();
        finish(500, {
          error: 'Server error',
          message: 'Request timeout reaching OpenRouter API'
        }, new Error('Request timeout'));
      });

      postReq.write(JSON.stringify(requestBody));
      postReq.end();
    });

  } catch (error) {
    console.error('Error in /api/chat endpoint:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Server error',
        message: 'Internal server error'
      });
    }
  }
};
