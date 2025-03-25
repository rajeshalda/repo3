import { toast } from 'sonner';

export async function handleApiResponse(response: Response) {
  if (response.status === 401) {
    toast.error("Session expired. Please refresh the page to continue.", {
      duration: 0,
      position: "top-center",
      style: {
        backgroundColor: "#fee2e2",
        color: "#b91c1c",
        fontSize: "16px",
        borderRadius: "8px",
        padding: "12px 24px",
        border: "1px solid #ef4444"
      }
    });
    throw new Error('Session expired');
  }
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error || 'An error occurred');
  }
  
  return response;
} 