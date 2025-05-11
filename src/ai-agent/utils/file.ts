import fs from 'fs/promises';
import path from 'path';

export async function readJsonFile(filePath: string): Promise<any> {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            // If file doesn't exist, return empty storage structure
            return { meetings: [] };
        }
        throw error;
    }
}

export async function writeJsonFile(filePath: string, data: any): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    // Write file
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
} 