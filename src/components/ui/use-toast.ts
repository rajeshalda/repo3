import { toast } from "sonner"
import { ExternalToast } from "sonner"

export { toast }
export const useToast = () => {
  return {
    toast,
    dismiss: toast.dismiss,
    error: (message: string, data?: ExternalToast) => toast.error(message, data),
    success: (message: string, data?: ExternalToast) => toast.success(message, data),
  }
} 