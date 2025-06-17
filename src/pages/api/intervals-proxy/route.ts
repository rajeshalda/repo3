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
    const { endpoint, method = 'GET', data } = body;
    
    // Get user ID from session or request
    const userId = request.headers.get('x-user-id');
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

    const url = `${INTERVALS_BASE_URL}${endpoint}`;
    console.log('Making request to intervals API:', url, 'for user:', userId);
    
    const options: RequestInit = {
      method,
      headers,
      ...(data && { body: JSON.stringify(data) })
    };

    const response = await fetch(url, options);
    const responseData = await response.json();

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