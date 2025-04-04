import { toast } from 'sonner';

export async function handleApiResponse(response: Response) {
  if (response.status === 401) {
    toast.error("Session Expired - You will be redirected to login in a few seconds.", {
      duration: 5000,
      position: "top-center",
      style: {
        backgroundColor: "#fff",
        color: "#1a1a1a",
        fontSize: "16px",
        borderRadius: "8px",
        padding: "16px",
        border: "1px solid #e5e7eb",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
        width: "400px"
      }
    });
    
    // Redirect to login page after a short delay
    setTimeout(() => {
      window.location.href = '/';
    }, 3000);
    
    throw new Error('Session expired');
  }
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error || 'An error occurred');
  }
  
  return response;
} 