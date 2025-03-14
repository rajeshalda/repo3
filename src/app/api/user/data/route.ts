import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth';
import { UserStorage } from '@/lib/user-storage';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const storage = new UserStorage();
    await storage.loadData();
    
    // Get the current user's data
    const userId = session.user.email;
    const apiKey = await storage.getUserApiKey(userId);
    
    // Only return the current user's data for security
    const userData = {
      users: apiKey ? [
        {
          userId,
          email: userId,
          intervalsApiKey: apiKey,
        }
      ] : [],
      hasApiKey: !!apiKey
    };
    
    return NextResponse.json(userData);
  } catch (error) {
    console.error('Error fetching user data:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch user data', hasApiKey: false },
      { status: 500 }
    );
  }
} 