import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth';
import { database } from '@/lib/database';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { apiKey } = await request.json();
    
    if (!apiKey) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 });
    }

    const userId = session.user.email;
    
    // Check if user exists, if not create them
    let user = database.getUserByEmail(userId);
    
    if (!user) {
      // Create new user
      user = database.createUser({
        user_id: userId,
        email: userId,
        intervals_api_key: apiKey,
        last_sync: new Date().toISOString()
      });
    } else {
      // Update existing user's API key
      database.updateUserApiKey(userId, apiKey);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'API key saved successfully' 
    });
  } catch (error) {
    console.error('Error saving API key:', error);
    return NextResponse.json(
      { error: 'Failed to save API key' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.email;
    const user = database.getUserByEmail(userId);
    
    return NextResponse.json({ 
      hasApiKey: !!(user?.intervals_api_key),
      apiKey: user?.intervals_api_key ? '***hidden***' : null
    });
  } catch (error) {
    console.error('Error fetching API key:', error);
    return NextResponse.json(
      { error: 'Failed to fetch API key' },
      { status: 500 }
    );
  }
} 