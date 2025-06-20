import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { useToast } from './ui/use-toast';
import { Loader2, Server, Users, Clock, RefreshCw } from 'lucide-react';

interface PM2Status {
  status: string;
  enabledUsers: number;
  totalUsers: number;
  uptime: number;
}

export function PM2Status() {
  const [status, setStatus] = useState<PM2Status | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentUptime, setCurrentUptime] = useState<number>(0);
  const { toast } = useToast();
  
  const PM2_SERVICE_URL = process.env.NEXT_PUBLIC_PM2_SERVICE_URL || 'http://localhost:3100';

  const fetchStatus = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch('/api/pm2/status');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStatus({
            status: data.status,
            enabledUsers: data.enabledUsers,
            totalUsers: data.totalUsers,
            uptime: data.uptime
          });
          // Set the currentUptime to match the fetched uptime
          setCurrentUptime(data.uptime);
        }
      }
    } catch (error) {
      console.error('Error fetching PM2 status:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    
    // Poll full status every 30 seconds
    const statusIntervalId = setInterval(fetchStatus, 30000);
    
    return () => clearInterval(statusIntervalId);
  }, []);

  // Add separate effect for incrementing uptime every second
  useEffect(() => {
    // Only start the uptime timer if we have a valid status
    if (status?.status !== 'running') return;
    
    // Update uptime every second
    const uptimeIntervalId = setInterval(() => {
      setCurrentUptime(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(uptimeIntervalId);
  }, [status?.status]);

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m ${Math.floor(seconds % 60)}s`;
    }
  };

  const restartAgent = async () => {
    try {
      const response = await fetch('/api/pm2/restart', {
        method: 'POST'
      });
      
      if (response.ok) {
        toast.success('The AI Agent service has been restarted.');
        
        // Fetch the latest status after a short delay
        setTimeout(fetchStatus, 3000);
      } else {
        toast.error('There was an error restarting the AI Agent service.');
      }
    } catch (error) {
      console.error('Error restarting AI Agent:', error);
      toast.error('There was an error restarting the AI Agent service.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Server className="mr-2 h-5 w-5" />
          AI Agent Status
          <Badge variant="outline" className="ml-2 bg-amber-100 text-amber-800">ALPHA</Badge>
        </CardTitle>
        <CardDescription>
          Monitoring for the background AI Agent service
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
          </div>
        ) : status ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col space-y-1">
                <span className="text-sm text-muted-foreground">Status</span>
                <div className="flex items-center">
                  <Badge variant={status.status === 'running' ? 'default' : 'destructive'}>
                    {status.status === 'running' ? 'Running' : 'Stopped'}
                  </Badge>
                </div>
              </div>
              
              <div className="flex flex-col space-y-1">
                <span className="text-sm text-muted-foreground">Uptime</span>
                <div className="flex items-center">
                  <Clock className="mr-1 h-4 w-4 text-muted-foreground" />
                  <span>{formatUptime(currentUptime)}</span>
                  <span className="ml-2 relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                </div>
              </div>
              
              <div className="flex flex-col space-y-1">
                <span className="text-sm text-muted-foreground">Enabled Users</span>
                <div className="flex items-center">
                  <Users className="mr-1 h-4 w-4 text-muted-foreground" />
                  <span>{status.enabledUsers} / {status.totalUsers}</span>
                </div>
              </div>
            </div>
            
            <div className="flex justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchStatus}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-1 h-3 w-3" />
                    Refresh
                  </>
                )}
              </Button>
              
              <Button 
                variant="secondary" 
                size="sm"
                onClick={restartAgent}
                disabled={false}
                title="Restart the PM2 AI Agent service"
              >
                Restart Agent
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-muted-foreground">Agent service is not running</p>
            <Button 
              className="mt-2" 
              variant="outline"
              onClick={fetchStatus}
            >
              Check Again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 