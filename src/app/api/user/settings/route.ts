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
    const settings = database.getUserSettings(userId);
    
    return NextResponse.json({ 
      enabled: settings?.enabled || false,
      userId: userId
    });
  } catch (error) {
    console.error('Error fetching user settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { enabled } = await request.json();
    
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'Enabled must be a boolean' }, { status: 400 });
    }

    const userId = session.user.email;
    
    // Ensure user exists in users table first
    let user = database.getUserByEmail(userId);
    if (!user) {
      user = database.createUser({
        user_id: userId,
        email: userId,
        last_sync: new Date().toISOString()
      });
    }
    
    // Update user settings
    database.updateUserSettings(userId, enabled);

    return NextResponse.json({ 
      success: true, 
      enabled: enabled,
      message: `User settings ${enabled ? 'enabled' : 'disabled'} successfully` 
    });
  } catch (error) {
    console.error('Error updating user settings:', error);
    return NextResponse.json(
      { error: 'Failed to update user settings' },
      { status: 500 }
    );
  }
} 