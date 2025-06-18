'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  source: string;
}

const LogLevelBadge = ({ level }: { level: string }) => {
  const getVariant = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error': return 'destructive';
      case 'warn': return 'secondary';
      case 'info': return 'default';
      case 'debug': return 'outline';
      default: return 'default';
    }
  };

  return (
    <Badge variant={getVariant(level)} className="text-xs">
      {level.toUpperCase()}
    </Badge>
  );
};

const SourceBadge = ({ source }: { source: string }) => {
  const getColor = (source: string) => {
    switch (source) {
      case 'console': return 'bg-blue-100 text-blue-800';
      case 'pm2': return 'bg-green-100 text-green-800';
      case 'system': return 'bg-gray-100 text-gray-800';
      default: return 'bg-purple-100 text-purple-800';
    }
  };

  return (
    <Badge className={`text-xs ${getColor(source)}`}>
      {source}
    </Badge>
  );
};

export default function LiveLogsViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [maxLogs, setMaxLogs] = useState(1000);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Connect to SSE endpoint
  const connectToLogs = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource('/api/logs/stream');
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      console.log('Connected to log stream');
    };

    eventSource.onmessage = (event) => {
      try {
        const logEntry: LogEntry = JSON.parse(event.data);
        setLogs(prevLogs => {
          const newLogs = [...prevLogs, logEntry];
          // Keep only the last maxLogs entries
          return newLogs.slice(-maxLogs);
        });
      } catch (error) {
        console.error('Error parsing log entry:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      setIsConnected(false);
    };

    eventSource.onclose = () => {
      setIsConnected(false);
      console.log('Log stream connection closed');
    };
  };

  // Disconnect from SSE
  const disconnectFromLogs = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  };

  // Filter logs based on search term, level, and source
  useEffect(() => {
    let filtered = logs;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(log => 
        log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.source.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by level
    if (levelFilter !== 'all') {
      filtered = filtered.filter(log => log.level.toLowerCase() === levelFilter.toLowerCase());
    }

    // Filter by source
    if (sourceFilter !== 'all') {
      filtered = filtered.filter(log => log.source.toLowerCase() === sourceFilter.toLowerCase());
    }

    setFilteredLogs(filtered);
  }, [logs, searchTerm, levelFilter, sourceFilter]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs, autoScroll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectFromLogs();
    };
  }, []);

  const clearLogs = () => {
    setLogs([]);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getLogLineClass = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error': return 'border-l-red-500 bg-red-50';
      case 'warn': return 'border-l-yellow-500 bg-yellow-50';
      case 'info': return 'border-l-blue-500 bg-blue-50';
      case 'debug': return 'border-l-gray-500 bg-gray-50';
      default: return 'border-l-gray-300 bg-white';
    }
  };

  return (
    <Card className="w-full h-full">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Live Logs
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm font-normal text-gray-500">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={isConnected ? "destructive" : "default"}
              onClick={isConnected ? disconnectFromLogs : connectToLogs}
            >
              {isConnected ? 'Disconnect' : 'Connect'}
            </Button>
            <Button size="sm" variant="outline" onClick={clearLogs}>
              Clear
            </Button>
          </div>
        </div>
        
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 pt-4">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
          
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="warn">Warn</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="debug">Debug</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="console">Console</SelectItem>
              <SelectItem value="pm2">PM2</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center space-x-2">
            <Switch
              id="auto-scroll"
              checked={autoScroll}
              onCheckedChange={setAutoScroll}
            />
            <Label htmlFor="auto-scroll" className="text-sm">Auto-scroll</Label>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <ScrollArea className="h-[600px] w-full" ref={scrollAreaRef}>
          <div className="p-4 space-y-1">
            {filteredLogs.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                {logs.length === 0 ? 'No logs yet. Connect to start streaming.' : 'No logs match your filters.'}
              </div>
            ) : (
              filteredLogs.map((log, index) => (
                <div
                  key={index}
                  className={`p-2 border-l-2 ${getLogLineClass(log.level)} rounded-r text-sm font-mono`}
                >
                  <div className="flex items-start gap-2 mb-1">
                    <span className="text-gray-500 text-xs whitespace-nowrap">
                      {formatTimestamp(log.timestamp)}
                    </span>
                    <LogLevelBadge level={log.level} />
                    <SourceBadge source={log.source} />
                  </div>
                  <div className="text-gray-800 whitespace-pre-wrap break-words">
                    {log.message}
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </CardContent>

      {/* Status bar */}
      <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-600">
        Showing {filteredLogs.length} of {logs.length} logs
        {logs.length >= maxLogs && (
          <span className="text-orange-600 ml-2">
            (Limited to last {maxLogs} entries)
          </span>
        )}
      </div>
    </Card>
  );
}