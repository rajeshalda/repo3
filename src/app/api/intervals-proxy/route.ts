import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';

const INTERVALS_BASE_URL = 'https://api.myintervals.com';

async function getUserApiKey(userId: string): Promise<string | null> {
  try {
    console.log('Getting API key from SQLite for user:', userId);
    const user = database.getUserByEmail(userId);
    
    if (!user?.intervals_api_key) {
      console.log('No API key found in SQLite database for user:', userId);
      return null;
    }
    
    console.log('API key found in SQLite database for user:', userId);
    return user.intervals_api_key;
  } catch (error) {
    console.error('Error getting API key from SQLite:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpoint, method = 'GET', data, forceBypassCache } = body;
    
    // Get user ID from session or request
    const userId = request.headers.get('x-user-id');
    const noCache = request.headers.get('x-no-cache') === 'true' || forceBypassCache === true;
    
    if (!userId) {
      console.log('User ID not provided in request headers');
      return NextResponse.json({ error: 'User ID not provided' }, { status: 401 });
    }

    console.log('Looking up API key for user:', userId);

    // Get API key from SQLite database
    const apiKey = await getUserApiKey(userId);
    if (!apiKey) {
      console.log('API key not found for user:', userId);
      return NextResponse.json({ error: 'API key not found' }, { status: 401 });
    }

    console.log('Found API key for user:', userId, '- proceeding with request');

    // Make request to Intervals API
    const headers = {
      'Authorization': `Basic ${Buffer.from(apiKey + ':X').toString('base64')}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // If cache bypassing is requested, add cache control headers
    if (noCache) {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    }

    // Construct the URL - ensure the endpoint is properly used with its query parameters
    let formattedEndpoint = endpoint;
    // Remove leading slash if present
    if (formattedEndpoint.startsWith('/')) {
      formattedEndpoint = formattedEndpoint.substring(1);
    }
    
    // Make sure INTERVALS_BASE_URL doesn't end with slash
    const baseUrl = INTERVALS_BASE_URL.endsWith('/')
      ? INTERVALS_BASE_URL.slice(0, -1)
      : INTERVALS_BASE_URL;
    
    // Ensure the limit parameter is included for task endpoints
    if (formattedEndpoint.startsWith('task') && !formattedEndpoint.includes('limit=')) {
      formattedEndpoint += formattedEndpoint.includes('?') ? '&limit=500' : '?limit=500';
    }
      
    const url = `${baseUrl}/${formattedEndpoint}`;
    console.log('Making request to intervals API:', url, 'for user:', userId);
    
    const options: RequestInit = {
      method,
      headers,
      ...(data && { body: JSON.stringify(data) })
    };

    const response = await fetch(url, options);
    
    // Try to parse the response as JSON, but handle text responses as well
    let responseData;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        responseData = await response.json();
      } catch (err) {
        console.error('Error parsing JSON response:', err);
        // Fallback to text if JSON parsing fails
        responseData = { error: 'Failed to parse JSON response', text: await response.text() };
      }
    } else {
      // Handle non-JSON responses
      const text = await response.text();
      console.log('Non-JSON response:', text.substring(0, 300) + '...');
      try {
        // Try to parse it as JSON anyway
        responseData = JSON.parse(text);
      } catch (err) {
        // If not JSON, return as text
        responseData = { text };
      }
    }

    // Log response details
    console.log(`Intervals API response for user ${userId}: Status ${response.status}, content-type: ${contentType}`);
    if (responseData && typeof responseData === 'object') {
      // If task response, log the number of tasks
      if (responseData.task && Array.isArray(responseData.task)) {
        console.log(`Task response contains ${responseData.task.length} tasks`);
      }
      
      // Log first part of the response data
      console.log('Response data:', JSON.stringify(responseData).substring(0, 300) + '...');
    }

    if (!response.ok) {
      console.log(`Intervals API error for user ${userId}:`, responseData);
      return NextResponse.json(responseData, { status: response.status });
    }

    console.log(`Intervals API request successful for user ${userId}`);
    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 