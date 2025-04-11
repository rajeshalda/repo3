import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth';
import { promises as fs } from 'fs';
import path from 'path';

// Use a dedicated storage file that doesn't affect AI agent
const STORAGE_PATH = path.join(process.cwd(), 'storage', 'manual-posted-meetings.json');

// Define types
interface PostedMeeting {
    id: string;
    subject: string;
    meetingDate: string;
    postedDate: string;
}

interface PostedMeetingsData {
    [userEmail: string]: PostedMeeting[];
}

// Load data helper
async function loadData(): Promise<PostedMeetingsData> {
    try {
        const fileContent = await fs.readFile(STORAGE_PATH, 'utf-8');
        return JSON.parse(fileContent);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            // File doesn't exist, return empty data
            return {};
        }
        throw error;
    }
}

// Save data helper
async function saveData(data: PostedMeetingsData): Promise<void> {
    const dir = path.dirname(STORAGE_PATH);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(STORAGE_PATH, JSON.stringify(data, null, 2));
}

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Return empty array since we're deprecating this feature
        return NextResponse.json({
            meetings: []
        });
    } catch (error) {
        console.error('Error fetching posted meetings:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch posted meetings' },
            { status: 500 }
        );
    }
}

export async function DELETE() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Don't modify AI agent storage
        const data = await loadData();
        data[session.user.email] = [];
        await saveData(data);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error clearing posted meetings:', error);
        return NextResponse.json(
            { error: 'Failed to clear posted meetings' },
            { status: 500 }
        );
    }
} 