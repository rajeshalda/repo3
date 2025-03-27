import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

const INTERVALS_BASE_URL = 'https://api.myintervals.com';

async function getUserApiKey(userId: string): Promise<string | null> {
  try {
    const userDataPath = path.join(process.cwd(), '.data', 'user-data.json');
    const userData = await fs.readFile(userDataPath, 'utf-8');
    const users = JSON.parse(userData).users;
    const user = users.find((u: any) => u.userId === userId || u.email === userId);
    return user?.intervalsApiKey || null;
  } catch (error) {
    console.error('Error getting API key:', error);
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
      return NextResponse.json({ error: 'User ID not provided' }, { status: 401 });
    }

    // Get API key from server storage
    const apiKey = await getUserApiKey(userId);
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not found' }, { status: 401 });
    }

    // Make request to Intervals API
    const headers = {
      'Authorization': `Basic ${Buffer.from(apiKey + ':X').toString('base64')}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const url = `${INTERVALS_BASE_URL}${endpoint}`;
    const options: RequestInit = {
      method,
      headers,
      ...(data && { body: JSON.stringify(data) })
    };

    const response = await fetch(url, options);
    const responseData = await response.json();

    if (!response.ok) {
      return NextResponse.json(responseData, { status: response.status });
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 