import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { database } from '@/lib/database';

export async function POST() {
  try {
    // Get the current user from the session
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.email) {
      return NextResponse.json(
        { success: false, message: 'User not authenticated' },
        { status: 401 }
      );
    }

    const userEmail = session.user.email;
    
    // Clear all meetings for the current user from SQLite database
    database.clearUserMeetings(userEmail);

    return NextResponse.json({ 
      success: true, 
      message: 'AI agent meetings cleared successfully for current user' 
    });
  } catch (error) {
    console.error('Error clearing AI agent meetings:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to clear AI agent meetings' },
      { status: 500 }
    );
  }
} 