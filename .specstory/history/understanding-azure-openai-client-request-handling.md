## SpecStory

## Understanding Azure OpenAI Client Request Handling (2/19/2025, 9:21:14 AM)

_**User**_

can you tell me how ai agent using the azure open ai how data are requesting and respone are handle with details explaination

---

_**Assistant**_

I'll explain how the AI agent interacts with Azure OpenAI based on the provided codebase. Let me break this down into key components and flows:

### 1. Core Azure OpenAI Client Setup

```13:38:src/ai-agent/core/azure-openai/client.ts
class AzureOpenAIClient {
    private static instance: AzureOpenAIClient;
    private tokenLimiter: RateLimiter;
    private requestLimiter: RateLimiter;

    private constructor() {
        validateConfig();
        
        // Initialize rate limiters
        this.tokenLimiter = new RateLimiter({
            tokensPerInterval: AzureOpenAIConfig.tokensPerMinute,
            interval: 'minute'
        });
        
        this.requestLimiter = new RateLimiter({
            tokensPerInterval: AzureOpenAIConfig.requestsPerMinute,
            interval: 'minute'
        });
    }

    public static getInstance(): AzureOpenAIClient {
        if (!AzureOpenAIClient.instance) {
            AzureOpenAIClient.instance = new AzureOpenAIClient();
        }
        return AzureOpenAIClient.instance;
    }
```


The system uses a Singleton pattern for the Azure OpenAI client with:
- Rate limiting (8,000 tokens/minute)
- Request limiting (48 requests/minute)
- Single instance management for consistent rate control

### 2. Request Flow

#### A. Request Preparation
1. **Token Management**:

```40:45:src/ai-agent/core/azure-openai/client.ts
    private async waitForCapacity(tokens: number): Promise<void> {
        await Promise.all([
            this.tokenLimiter.removeTokens(tokens),
            this.requestLimiter.removeTokens(1)
        ]);

```

- Estimates token usage based on prompt length
- Waits for capacity before making requests
- Manages both token and request rate limits

2. **Request Configuration**:

```65:89:src/ai-agent/core/azure-openai/client.ts
    public async sendRequest(prompt: string, options: {
        temperature?: number;
        maxTokens?: number;
        model?: string;
    } = {}): Promise<string> {
        const estimatedTokens = Math.ceil(prompt.length / 4);
        await this.waitForCapacity(estimatedTokens);

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
```

The client sends requests with:
- Proper authentication headers
- JSON-formatted messages
- Configurable temperature and token limits
- Model specification

#### B. Error Handling and Retries

```47:63:src/ai-agent/core/azure-openai/client.ts
    private async retryWithExponentialBackoff<T>(
        operation: () => Promise<T>,
        retryCount: number = 0
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (retryCount >= AzureOpenAIConfig.maxRetries) {
                throw error;
            }

            const delay = AzureOpenAIConfig.retryDelay * Math.pow(2, retryCount);
            await new Promise(resolve => setTimeout(resolve, delay));

            return this.retryWithExponentialBackoff(operation, retryCount + 1);
        }

```

Implements exponential backoff retry mechanism:
- Retries failed requests
- Increases delay between retries
- Maximum retry limit enforcement

### 3. Response Processing

1. **Response Validation**:

```143:174:src/ai-agent/services/task/openai.ts
    private parseMatchingResult(result: string, meetingSubject: string): MatchingResult {
        try {
            // Find the JSON object in the response
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error('No JSON found in response');
                return { meetingSubject, matchedTasks: [] };
            }

            // Parse the JSON response
            const parsed = JSON.parse(jsonMatch[0]);
            
            // Validate and transform the response
            const matchedTasks = (parsed.matchedTasks || [])
                .filter((task: Partial<TaskMatch>) => this.isValidTaskMatch(task))
                .sort((a: TaskMatch, b: TaskMatch) => b.confidence - a.confidence);

            // Debug logging
            console.log('Raw OpenAI response:', result);
            console.log('Extracted JSON:', jsonMatch[0]);
            console.log('Parsed tasks:', JSON.stringify(matchedTasks, null, 2));

            return {
                meetingSubject,
                matchedTasks
            };
        } catch (error) {
            console.error('Error parsing matching result:', error);
            console.log('Failed to parse response:', result);
            return { meetingSubject, matchedTasks: [] };
        }
    }
```

- Parses JSON responses
- Validates response structure
- Handles malformed responses
- Sorts results by confidence

2. **Meeting Analysis**:
The agent processes meetings through multiple stages:
- Initial meeting data analysis
- Task matching
- Time entry generation

### 4. Service Integration

1. **Task Matching Service**:

```82:141:src/ai-agent/services/task/openai.ts
    public async matchTasksToMeeting(meeting: ProcessedMeeting, userId: string): Promise<MatchingResult> {
        try {
            // Get Intervals API key and fetch tasks
            const apiKey = await this.getUserIntervalsApiKey(userId);
            console.log('Fetching tasks from Intervals for user:', userId);
            const availableTasks = await this.fetchTasksFromIntervals(apiKey);
            console.log(`Found ${availableTasks.length} tasks in Intervals:`, 
                availableTasks.map(t => `\n- ${t.title} (${t.id})`).join(''));

            // Format meeting analysis data with enhanced context
            const meetingAnalysis = {
                subject: meeting.subject,
                startTime: meeting.start.dateTime,
                endTime: meeting.end.dateTime,
                duration: meeting.attendance?.records?.[0]?.duration || 
                    Math.round((new Date(meeting.end.dateTime).getTime() - new Date(meeting.start.dateTime).getTime()) / 60000),
                analysis: {
                    keyPoints: meeting.analysis?.keyPoints || [],
                    suggestedCategories: meeting.analysis?.suggestedCategories || [],
                    confidence: meeting.analysis?.confidence || 0,
                    context: meeting.analysis?.context || {}
                },
                attendance: meeting.attendance
            };
            console.log('Meeting analysis for matching:', JSON.stringify(meetingAnalysis, null, 2));

            // Format tasks data with enhanced details
            const tasksData = availableTasks.map(task => ({
                ...task,
                matchingContext: {
                    isActive: task.status?.toLowerCase().includes('active'),
                    hasPriority: !!task.priority,
                    hasDescription: !!task.description,
                    projectContext: task.project
                }
            }));
            console.log('Tasks data for matching:', JSON.stringify(tasksData, null, 2));

            // Generate prompt and get matches from OpenAI
            const prompt = generateTaskMatchingPrompt(
                JSON.stringify(meetingAnalysis, null, 2),
                JSON.stringify(tasksData, null, 2)
            );
            console.log('Generated prompt for OpenAI:', prompt);

            const matchingResult = await openAIClient.sendRequest(prompt, {
                temperature: 0.3,
                maxTokens: 1000
            });
            console.log('OpenAI response:', matchingResult);

            // Parse the matching result
            const result = this.parseMatchingResult(matchingResult, meeting.subject);
            console.log('Parsed matching result:', JSON.stringify(result, null, 2));
            return result;
        } catch (error) {
            console.error('Error matching tasks to meeting:', error);
            throw new Error(error instanceof Error ? error.message : 'Failed to match tasks');
        }
    }
```

Shows how the agent:
- Prepares meeting data for analysis
- Generates appropriate prompts
- Handles API responses
- Processes matching results

### 5. Error Management

The system implements comprehensive error handling:

```32:59:src/app/api/openai-status/route.ts
  } catch (error: unknown) {
    console.error('Azure OpenAI Status Check Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Handle specific error cases
    if (errorMessage.includes('DeploymentNotFound')) {
      return NextResponse.json({
        status: 'pending',
        isAvailable: false,
        message: 'Azure OpenAI deployment is initializing. Please wait a few minutes.'
      });
    }
    
    if (errorMessage.includes('401')) {
      return NextResponse.json({
        status: 'error',
        isAvailable: false,
        message: 'Invalid Azure OpenAI credentials'
      });
    }
    
    return NextResponse.json({
      status: 'error',
      isAvailable: false,
      message: 'Failed to connect to Azure OpenAI'
    });
  }
```

- Specific error type handling
- Deployment status checking
- Authentication validation
- Meaningful error messages

### 6. Key Features

1. **Rate Limiting**:
- Token-based rate limiting
- Request frequency control
- Automatic request queuing
- Backoff strategies

2. **Reliability**:
- Retry mechanisms
- Error recovery
- Response validation
- State management

3. **Flexibility**:
- Configurable parameters
- Multiple service endpoints
- Adaptable prompt templates
- Dynamic response handling

### 7. Data Flow Example

For a typical meeting analysis:

1. **Input Processing**:
- Meeting data is received
- Token usage is estimated
- Rate limits are checked

2. **API Interaction**:
- Request is formatted
- Sent to Azure OpenAI
- Response is awaited
- Rate limits are managed

3. **Response Handling**:
- Response is validated
- JSON is parsed
- Results are processed
- Errors are handled

4. **Result Delivery**:
- Processed data is formatted
- Confidence scores are calculated
- Results are returned to caller

This architecture ensures reliable, controlled, and efficient interaction with Azure OpenAI while maintaining proper error handling and rate limiting.

---



---

