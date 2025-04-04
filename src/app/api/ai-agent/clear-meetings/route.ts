import { NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

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
    
    // Get the absolute path to the JSON file
    const filePath = path.join(process.cwd(), 'src/ai-agent/data/storage/json/ai-agent-meetings.json');
    
    // Read the current meetings data
    const fileContent = await readFile(filePath, 'utf-8');
    const data = JSON.parse(fileContent);
    
    // Filter out meetings for the current user
    if (data && data.meetings) {
      data.meetings = data.meetings.filter((meeting: any) => meeting.userId !== userEmail);
    }
    
    // Write the updated data back to the file
    await writeFile(filePath, JSON.stringify(data, null, 2));

    return NextResponse.json({ success: true, message: 'AI agent meetings cleared successfully for current user' });
  } catch (error) {
    console.error('Error clearing AI agent meetings:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to clear AI agent meetings' },
      { status: 500 }
    );
  }
} 