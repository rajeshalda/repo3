import { NextResponse } from 'next/server';
import { AzureOpenAIClient } from '@/lib/azure-openai';

export async function GET() {
  try {
    const openai = new AzureOpenAIClient();
    
    // Test the connection
    const isAvailable = await openai.isAvailable();
    if (!isAvailable) {
      return NextResponse.json({ 
        success: false, 
        error: 'OpenAI service is not available' 
      }, { status: 500 });
    }

    // Try a simple completion
    const response = await openai.getCompletion('Say "Hello World"');
    
    return NextResponse.json({ 
      success: true, 
      response,
      message: 'OpenAI communication successful'
    });
  } catch (error) {
    console.error('OpenAI test failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
} 