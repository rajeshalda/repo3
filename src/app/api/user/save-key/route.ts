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

    const { userId, email, apiKey } = await request.json();
    
    // Security check: Only allow saving for the current user
    if (email !== session.user.email && userId !== session.user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    if (!apiKey) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 });
    }

    // Save the API key to SQLite database
    const existingUser = database.getUserByEmail(session.user.email);
    if (existingUser) {
      // Update existing user's API key
      database.updateUserApiKey(session.user.email, apiKey);
      database.updateUserLastSync(session.user.email);
    } else {
      // Create new user
      database.createUser({
        user_id: session.user.email,
        email: session.user.email,
        intervals_api_key: apiKey,
        last_sync: new Date().toISOString()
      });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving API key:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save API key' },
      { status: 500 }
    );
  }
} 