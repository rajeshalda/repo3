import { NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';

export async function POST() {
  try {
    // Define the empty meetings structure
    const emptyMeetings = {
      meetings: []
    };

    // Get the absolute path to the JSON file
    const filePath = path.join(process.cwd(), 'src/ai-agent/data/storage/json/ai-agent-meetings.json');

    // Write the empty structure to the file
    await writeFile(filePath, JSON.stringify(emptyMeetings, null, 2));

    return NextResponse.json({ success: true, message: 'AI agent meetings cleared successfully' });
  } catch (error) {
    console.error('Error clearing AI agent meetings:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to clear AI agent meetings' },
      { status: 500 }
    );
  }
} 