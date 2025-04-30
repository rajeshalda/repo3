import { AzureOpenAIConfig, validateConfig } from '../../config/azure-openai';
import { RateLimiter } from '../rate-limiter/token-bucket';
import { generateMeetingAnalysisPrompt } from './prompts/meeting-analysis';
import { reportSelectionPrompt } from './prompts/report-selection';

interface OpenAIResponse {
    choices: {
        message: {
            content: string;
        };
    }[];
}

class AzureOpenAIClient {
    private static instance: AzureOpenAIClient;
    private rateLimiter: RateLimiter;

    private constructor() {
        validateConfig();
        
        // Initialize our custom rate limiter
        this.rateLimiter = RateLimiter.getInstance();
    }

    public static getInstance(): AzureOpenAIClient {
        if (!AzureOpenAIClient.instance) {
            AzureOpenAIClient.instance = new AzureOpenAIClient();
        }
        return AzureOpenAIClient.instance;
    }

    private async waitForCapacity(): Promise<void> {
        await this.rateLimiter.acquireToken();
    }

    private async retryWithExponentialBackoff<T>(
        operation: () => Promise<T>,
        retryCount: number = 0
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            // Check if it's a rate limit error (429)
            if (error instanceof Error && error.message.includes('429')) {
                console.warn(`Rate limit exceeded, retrying after backoff (attempt ${retryCount + 1})`);
                
                // Use a longer backoff for rate limit errors
                const delay = AzureOpenAIConfig.retryDelay * Math.pow(2, retryCount) * 2;
                await new Promise(resolve => setTimeout(resolve, delay));
                
                return this.retryWithExponentialBackoff(operation, retryCount + 1);
            }
            
            if (retryCount >= AzureOpenAIConfig.maxRetries) {
                throw error;
            }

            const delay = AzureOpenAIConfig.retryDelay * Math.pow(2, retryCount);
            await new Promise(resolve => setTimeout(resolve, delay));

            return this.retryWithExponentialBackoff(operation, retryCount + 1);
        }
    }

    public async sendRequest(prompt: string, options: {
        temperature?: number;
        maxTokens?: number;
        model?: string;
    } = {}): Promise<string> {
        // Wait for rate limiter to allow the request
        await this.waitForCapacity();

        return this.retryWithExponentialBackoff(async () => {
            const response = await fetch(
                `${AzureOpenAIConfig.endpoint}/openai/deployments/${AzureOpenAIConfig.deployment}/chat/completions?api-version=2024-02-15-preview`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': AzureOpenAIConfig.apiKey as string
                    },
                    body: JSON.stringify({
                        messages: [{ role: 'user', content: prompt }],
                        temperature: options.temperature ?? AzureOpenAIConfig.defaultTemperature,
                        max_tokens: options.maxTokens ?? AzureOpenAIConfig.defaultMaxTokens,
                        model: options.model ?? AzureOpenAIConfig.defaultModel
                    })
                }
            );

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Azure OpenAI API error: ${response.status} ${response.statusText}\n${errorBody}`);
            }

            const data: OpenAIResponse = await response.json();
            
            if (!data.choices?.[0]?.message?.content) {
                throw new Error('Invalid response format from Azure OpenAI API');
            }

            return data.choices[0].message.content;
        });
    }

    public async analyzeMeeting(meetingData: string): Promise<string> {
        const prompt = generateMeetingAnalysisPrompt(meetingData);
        return this.sendRequest(prompt, {
            temperature: 0.3, // Lower temperature for more focused analysis
            maxTokens: 1500  // Increased for detailed analysis
        });
    }
    
    public updateRateLimit(requestsPerMinute: number): void {
        this.rateLimiter.updateRateLimit(requestsPerMinute);
    }

    public async selectAttendanceReport(
        meetingInfo: any,
        reports: any[]
    ): Promise<{
        selectedReport: {
            id: string;
            confidence: number;
            reason: string;
        } | null;
        analysis: {
            dateMatch: boolean;
            durationValid: boolean;
            isRecurringInstance: boolean;
            totalValidReports: number;
        };
    }> {
        try {
            const prompt = reportSelectionPrompt
                .replace('{meetingInfo}', JSON.stringify(meetingInfo, null, 2))
                .replace('{reports}', JSON.stringify(reports, null, 2));

            const response = await this.sendRequest(prompt, {
                temperature: 0.1,
                maxTokens: 500
            });

            const result = JSON.parse(response);
            return result;
        } catch (error) {
            console.error('Error in report selection:', error);
            return {
                selectedReport: null,
                analysis: {
                    dateMatch: false,
                    durationValid: false,
                    isRecurringInstance: false,
                    totalValidReports: 0
                }
            };
        }
    }
}

export const openAIClient = AzureOpenAIClient.getInstance(); 