export interface AttendanceReportInfo {
    id: string;
    totalParticipantCount: number;
    meetingStartDateTime: string;
    meetingEndDateTime: string;
}

export interface EnhancedAttendanceReport {
    reports: AttendanceReportInfo[];
    meetingDate: string;
    isRecurring: boolean;
}

export interface AttendanceReportSelection {
    selectedReportId: string;
    confidence: number;
    reason: string;
    metadata: {
        date: string;
        duration: number;
        isRecurring: boolean;
        totalReports: number;
    }
}

export interface ReportValidationResult {
    isValid: boolean;
    reason: string;
    reportDate: string;
    duration: number;
} 