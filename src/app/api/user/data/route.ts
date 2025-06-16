import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth';
import { database } from '@/lib/database';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.email;
    
    // Get user data from SQLite database
    const user = database.getUserByEmail(userId);
    
    // Only return the current user's data for security
    const userData = {
      users: user ? [
        {
          userId: user.user_id,
          email: user.email,
          intervalsApiKey: user.intervals_api_key,
        }
      ] : [],
      hasApiKey: !!(user?.intervals_api_key)
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