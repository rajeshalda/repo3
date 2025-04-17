import matchingConfig from './config/matching-config.json';
import type { Task } from './types';

export interface MatchingPattern {
  meeting: string[];
  task: string[];
  description: string;
}

export function findKeywordMatches(meetingTitle: string, task: Task): { matched: boolean; reason: string; confidence: number } {
  const meetingWords = meetingTitle.toLowerCase().split(/\s+/);
  const taskWords = task.title.toLowerCase().split(/\s+/);
  
  // Check for exact match
  if (meetingTitle.toLowerCase() === task.title.toLowerCase()) {
    return {
      matched: true,
      reason: 'Exact match found between meeting title and task',
      confidence: 1.0
    };
  }

  // Check for keyword matches
  const commonWords = meetingWords.filter(word => taskWords.includes(word));
  if (commonWords.length > 0) {
    const confidence = commonWords.length / Math.max(meetingWords.length, taskWords.length);
    return {
      matched: true,
      reason: `Found keyword matches: ${commonWords.join(', ')}`,
      confidence
    };
  }

  return {
    matched: false,
    reason: 'No keyword matches found',
    confidence: 0
  };
}

export function generateMatchingPrompt(meetingTitle: string, tasks: Task[]): string {
  const taskList = tasks.map((task, index) => 
    `${index + 1}. ${task.title} (Project: ${task.project}, Module: ${task.module}, Status: ${task.status})`
  ).join('\n');

  const matchingRules = matchingConfig.matchingRules.map((rule, index) => 
    `${index + 1}. ${rule}`
  ).join('\n');

  return matchingConfig.promptTemplate
    .replace('{meetingTitle}', meetingTitle)
    .replace('{taskList}', taskList)
    .replace('{matchingRules}', matchingRules);
} 