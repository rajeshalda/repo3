// import fs from 'fs';
// import path from 'path';
// import { mkdir, writeFile, readFile } from 'fs/promises';

interface UserData {
  userId: string;
  email: string;
  intervalsApiKey: string;
  lastSync?: string;
}

interface PostedMeeting {
  id: string;
  subject: string;
  date: string;
  postedDate: string;
  userId: string;
}

interface StorageData {
  users: UserData[];
  postedMeetings: PostedMeeting[];
}

export class UserStorage {
  private data: StorageData;
  private readonly STORAGE_KEY = 'meeting-tracker-data';
  private readonly storagePath = '.data';
  private readonly storageFile = '.data/user-data.json';
  private isDataLoaded = false;

  constructor() {
    this.data = { users: [], postedMeetings: [] };
    this.loadData().catch(error => {
      console.error('Error loading data in constructor:', error);
    });
  }

  public async loadData(): Promise<void> {
    if (this.isDataLoaded) return;
    
    if (typeof window === 'undefined') {
      // Server-side: Read from file
      try {
        const { promises: fs } = await import('fs');
        const { join } = await import('path');
        const filePath = join(process.cwd(), this.storageFile);
        
        try {
          const data = await fs.readFile(filePath, 'utf8');
          this.data = JSON.parse(data);
          this.isDataLoaded = true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            // File doesn't exist yet, use default empty data
            await this.ensureStorageDirectory();
            await this.saveData();
            this.isDataLoaded = true;
          } else {
            console.error('Error reading storage file:', error);
          }
        }
      } catch (error) {
        console.error('Error importing fs modules:', error);
      }
    } else {
      // Client-side: Only load posted meetings
      try {
        const data = localStorage.getItem(this.STORAGE_KEY);
        if (data) {
          const parsedData = JSON.parse(data);
          this.data.postedMeetings = parsedData.postedMeetings || [];
        }
        this.isDataLoaded = true;
      } catch (error) {
        console.error('Error reading from localStorage:', error);
      }
    }
  }

  private async ensureStorageDirectory(): Promise<void> {
    if (typeof window === 'undefined') {
      try {
        const { promises: fs } = await import('fs');
        const { join } = await import('path');
        await fs.mkdir(join(process.cwd(), this.storagePath), { recursive: true });
      } catch (error) {
        console.error('Error creating storage directory:', error);
      }
    }
  }

  private async saveData(): Promise<void> {
    if (typeof window === 'undefined') {
      // Server-side: Save to file
      try {
        const { promises: fs } = await import('fs');
        const { join } = await import('path');
        await this.ensureStorageDirectory();
        await fs.writeFile(
          join(process.cwd(), this.storageFile),
          JSON.stringify(this.data, null, 2)
        );
      } catch (error) {
        console.error('Error saving to file:', error);
      }
    } else {
      // Client-side: Only save posted meetings
      try {
        const localData = {
          postedMeetings: this.data.postedMeetings
        };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(localData));
      } catch (error) {
        console.error('Error saving to localStorage:', error);
      }
    }
  }

  async getUserApiKey(userId: string): Promise<string | null> {
    // Client-side: Make API request to get user data
    if (typeof window !== 'undefined') {
      try {
        const response = await fetch('/api/user/data');
        if (response.ok) {
          const userData = await response.json();
          const user = userData.users?.find((u: UserData) => u.userId === userId || u.email === userId);
          return user?.intervalsApiKey || null;
        }
        return null;
      } catch (error) {
        console.error('Error fetching user data:', error);
        return null;
      }
    }
    
    // Server-side: Read from file
    if (!this.isDataLoaded) {
      await this.loadData();
    }
    
    const user = this.data.users.find(u => u.userId === userId || u.email === userId);
    return user?.intervalsApiKey || null;
  }

  async setUserApiKey(userId: string, email: string, apiKey: string): Promise<void> {
    // Client-side: Make API request to save API key
    if (typeof window !== 'undefined') {
      const response = await fetch('/api/user/save-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email, apiKey })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save API key');
      }
      return;
    }
    
    // Server-side: Save to file
    if (!this.isDataLoaded) {
      await this.loadData();
    }
    
    const existingUserIndex = this.data.users.findIndex(u => u.userId === userId || u.email === email);
    const userData: UserData = {
      userId,
      email,
      intervalsApiKey: apiKey,
      lastSync: new Date().toISOString()
    };

    if (existingUserIndex >= 0) {
      this.data.users[existingUserIndex] = userData;
    } else {
      this.data.users.push(userData);
    }

    await this.saveData();
  }

  addPostedMeeting(meeting: PostedMeeting): void {
    this.data.postedMeetings.push(meeting);
    this.saveData();
  }

  getPostedMeetings(userId: string, startDate: string, endDate: string): PostedMeeting[] {
    return this.data.postedMeetings.filter(meeting => {
      const meetingDate = new Date(meeting.date);
      return meetingDate >= new Date(startDate) && meetingDate <= new Date(endDate);
    });
  }

  isUserFirstLogin(userId: string): boolean {
    return !this.data.users.some(u => u.userId === userId);
  }

  updateLastSync(userId: string): void {
    const user = this.data.users.find(u => u.userId === userId);
    if (user) {
      user.lastSync = new Date().toISOString();
      this.saveData();
    }
  }
} 