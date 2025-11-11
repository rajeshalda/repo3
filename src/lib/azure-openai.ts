export class AzureOpenAIClient {
  private endpoint: string;
  private apiKey: string;
  private deploymentName: string;
  private apiVersion: string = '2025-01-01-preview'; // Updated API version
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 1000; // Minimum 1 second between requests
  private maxRetries: number = 3;

  constructor() {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT;

    if (!endpoint || !apiKey || !deploymentName) {
      throw new Error('Missing Azure OpenAI configuration');
    }

    this.endpoint = endpoint.replace(/\/+$/, ''); // Remove trailing slashes
    this.apiKey = apiKey;
    this.deploymentName = deploymentName;
  }

  private async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await this.sleep(this.minRequestInterval - timeSinceLastRequest);
    }
    this.lastRequestTime = Date.now();
  }

  async getCompletion(prompt: string, retryCount = 0): Promise<string> {
    try {
      await this.waitForRateLimit();

      const url = `${this.endpoint}/openai/deployments/${this.deploymentName}/chat/completions?api-version=${this.apiVersion}`;
      
      console.log('Making request to:', url.replace(this.apiKey, '[REDACTED]'));
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_completion_tokens: 5000
        })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('OpenAI API Error:', {
          status: response.status,
          statusText: response.statusText,
          error: error
        });
        
        // Handle rate limit error
        if (response.status === 429 && retryCount < this.maxRetries) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '42');
          console.log(`Rate limited. Waiting ${retryAfter} seconds before retry ${retryCount + 1}/${this.maxRetries}`);
          await this.sleep(retryAfter * 1000);
          return this.getCompletion(prompt, retryCount + 1);
        }

        throw new Error(`Azure OpenAI API error: ${response.status} - ${JSON.stringify(error)}`);
      }

      const data = await response.json();
      console.log('Full Azure OpenAI response:', JSON.stringify(data, null, 2));

      // Log token usage for monitoring
      if (data.usage) {
        console.log('Token usage:', {
          prompt: data.usage.prompt_tokens,
          completion: data.usage.completion_tokens,
          reasoning: data.usage.completion_tokens_details?.reasoning_tokens || 0,
          total: data.usage.total_tokens
        });
      }

      const content = data.choices[0].message.content;
      console.log('Raw content from OpenAI:', content);

      if (!content || content.trim() === '') {
        console.error('Empty response from OpenAI. Full response:', JSON.stringify(data, null, 2));
        throw new Error('OpenAI returned empty response');
      }

      // Remove any markdown formatting if present
      const cleanContent = content.replace(/^```json\s*|\s*```$/g, '').trim();

      // Validate JSON response
      try {
        JSON.parse(cleanContent);
        return cleanContent;
      } catch (e) {
        console.error('Invalid JSON response from OpenAI:', cleanContent);
        console.error('Parse error:', e);
        throw new Error('OpenAI returned invalid JSON response');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('429') && retryCount < this.maxRetries) {
        const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff
        console.log(`Rate limited. Retrying in ${waitTime/1000} seconds. Attempt ${retryCount + 1}/${this.maxRetries}`);
        await this.sleep(waitTime);
        return this.getCompletion(prompt, retryCount + 1);
      }
      console.error('Azure OpenAI request failed:', error);
      throw error;
    }
  }

  async testConnection(): Promise<string> {
    try {
      await this.waitForRateLimit();

      const url = `${this.endpoint}/openai/deployments/${this.deploymentName}/chat/completions?api-version=${this.apiVersion}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Respond with just the word "OK" if you can see this.' }
          ],
          max_completion_tokens: 100
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Azure OpenAI API error: ${response.status} - ${JSON.stringify(error)}`);
      }

      const data = await response.json();
      return data.choices[0].message.content || 'Connected';
    } catch (error) {
      console.error('Azure OpenAI connection test failed:', error);
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.testConnection();
      return true;
    } catch (error) {
      console.error('Azure OpenAI availability check failed:', error);
      return false;
    }
  }
} 