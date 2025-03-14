import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth';
import { UserStorage } from '@/lib/user-storage';

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

    const storage = new UserStorage();
    await storage.loadData();
    
    // Save the API key server-side
    await storage.setUserApiKey(session.user.email, session.user.email, apiKey);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving API key:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save API key' },
      { status: 500 }
    );
  }
} 