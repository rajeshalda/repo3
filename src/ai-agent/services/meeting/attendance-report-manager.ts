import { AttendanceReportInfo, EnhancedAttendanceReport, AttendanceReportSelection, ReportValidationResult } from './types/attendance';
import { openAIClient } from '../../core/azure-openai/client';
import { DateTime } from 'luxon';

export class AttendanceReportManager {
    constructor() {}

    public async processAttendanceReports(
        reports: AttendanceReportInfo[],
        meetingDate: string,
        isRecurring: boolean
    ): Promise<AttendanceReportSelection> {
        // Create enhanced report structure
        const enhancedReport: EnhancedAttendanceReport = {
            reports,
            meetingDate,
            isRecurring
        };

        // Filter reports by date for recurring meetings
        const validReports = await this.validateReports(enhancedReport);
        
        if (validReports.length === 0) {
            return {
                selectedReportId: '',
                confidence: 0,
                reason: 'No valid reports found for the specified date',
                metadata: {
                    date: meetingDate,
                    duration: 0,
                    isRecurring,
                    totalReports: reports.length
                }
            };
        }

        // Use AI to select the most appropriate report
        const selection = await this.selectBestReport(validReports, meetingDate);
        
        return {
            selectedReportId: selection.reportId,
            confidence: selection.confidence,
            reason: selection.reason,
            metadata: {
                date: meetingDate,
                duration: selection.duration,
                isRecurring,
                totalReports: reports.length
            }
        };
    }

    // New method to process all valid reports for recurring meetings
    public async processAllValidReports(
        reports: AttendanceReportInfo[],
        meetingDate: string,
        isRecurring: boolean
    ): Promise<AttendanceReportSelection[]> {
        // Create enhanced report structure
        const enhancedReport: EnhancedAttendanceReport = {
            reports,
            meetingDate,
            isRecurring
        };

        // Filter reports by date for recurring meetings
        const validReports = await this.validateReports(enhancedReport);
        
        if (validReports.length === 0) {
            return [];
        }

        console.log(`
┌─────────────────────── ALL VALID REPORTS ───────────────────────┐
│ 📊 Found ${validReports.length} valid reports for processing              │
│ 📅 Meeting Date: ${meetingDate}                                 │
│ 🔄 Is Recurring: ${isRecurring}                                 │
└─────────────────────────────────────────────────────────────────┘`);

        // Process each valid report
        const allSelections: AttendanceReportSelection[] = [];
        
        for (const report of validReports) {
            const duration = (new Date(report.meetingEndDateTime).getTime() - 
                            new Date(report.meetingStartDateTime).getTime()) / 1000;
            
            const selection: AttendanceReportSelection = {
                selectedReportId: report.id,
                confidence: 1, // All reports are valid, so confidence is high
                reason: `Valid report instance from ${report.meetingStartDateTime}`,
                metadata: {
                    date: meetingDate,
                    duration,
                    isRecurring,
                    totalReports: reports.length
                }
            };
            
            allSelections.push(selection);
            
            console.log(`✅ Report ${report.id}: ${Math.floor(duration/60)}m ${duration%60}s`);
        }

        return allSelections;
    }

    private async validateReports(report: EnhancedAttendanceReport): Promise<AttendanceReportInfo[]> {
        const validReports: AttendanceReportInfo[] = [];

        for (const reportInfo of report.reports) {
            const validation = await this.validateReport(reportInfo, report.meetingDate);
            if (validation.isValid) {
                validReports.push(reportInfo);
            }
        }

        return validReports;
    }

    private async validateReport(
        report: AttendanceReportInfo,
        targetDate: string
    ): Promise<ReportValidationResult> {
        // Convert report date to IST time zone
        const reportDateIST = DateTime.fromISO(report.meetingStartDateTime).setZone('Asia/Kolkata');
        const reportDate = reportDateIST.toISODate() || '';
        
        // Convert target date to IST time zone
        const targetDateIST = DateTime.fromISO(targetDate).setZone('Asia/Kolkata');
        const targetDateStr = targetDateIST.toISODate() || '';
        
        console.log(`Report validation [IST]: Report date: ${reportDate}, Target date: ${targetDateStr}`);

        // Calculate duration in seconds
        const startTime = new Date(report.meetingStartDateTime).getTime();
        const endTime = new Date(report.meetingEndDateTime).getTime();
        const duration = (endTime - startTime) / 1000;

        // Validate the report
        // For early morning meetings (12:00 AM to 5:30 AM IST), the reportDate will be the same as targetDate
        // in IST timezone, even though they might be different in UTC
        if (reportDate !== targetDateStr) {
            // Additional check for early morning meetings crossing UTC day boundary
            const reportHourIST = reportDateIST.hour;
            const isEarlyMorning = reportHourIST >= 0 && reportHourIST < 5.5; // 12:00 AM to 5:30 AM
            
            // Special handling for the day boundary edge case
            // If the meeting is early morning and the target date is the previous day,
            // we'll check if they're only one day apart
            if (isEarlyMorning) {
                const dayDifference = Math.abs(targetDateIST.diff(reportDateIST, 'days').days);
                if (dayDifference <= 1) {
                    // Allow a 1-day difference for early morning meetings
                    console.log(`Early morning meeting detected (${reportHourIST} IST). Allowing despite date mismatch.`);
                    return {
                        isValid: true,
                        reason: 'Report is valid for early morning meeting (crossing day boundary)',
                        reportDate,
                        duration
                    };
                }
            }
            
            return {
                isValid: false,
                reason: 'Report date does not match target date',
                reportDate,
                duration
            };
        }

        if (duration <= 0) {
            return {
                isValid: false,
                reason: 'Invalid meeting duration',
                reportDate,
                duration
            };
        }

        return {
            isValid: true,
            reason: 'Report is valid for the specified date',
            reportDate,
            duration
        };
    }

    private async selectBestReport(
        reports: AttendanceReportInfo[],
        targetDate: string
    ): Promise<{
        reportId: string;
        confidence: number;
        reason: string;
        duration: number;
    }> {
        if (reports.length === 1) {
            const report = reports[0];
            const duration = (new Date(report.meetingEndDateTime).getTime() - 
                            new Date(report.meetingStartDateTime).getTime()) / 1000;
            
            return {
                reportId: report.id,
                confidence: 1,
                reason: 'Single valid report available',
                duration
            };
        }

        // Prepare meeting info for AI analysis
        const meetingInfo = {
            targetDate,
            totalReports: reports.length,
            isRecurring: true // This should come from meeting data
        };

        // Use OpenAI to select the best report
        const aiSelection = await openAIClient.selectAttendanceReport(meetingInfo, reports);

        if (!aiSelection.selectedReport) {
            // If AI couldn't make a selection, fall back to most recent
            const sortedReports = [...reports].sort((a, b) => 
                new Date(b.meetingStartDateTime).getTime() - new Date(a.meetingStartDateTime).getTime()
            );

            const selectedReport = sortedReports[0];
            const duration = (new Date(selectedReport.meetingEndDateTime).getTime() - 
                            new Date(selectedReport.meetingStartDateTime).getTime()) / 1000;

            return {
                reportId: selectedReport.id,
                confidence: 0.5,
                reason: 'Fallback to most recent report due to AI selection failure',
                duration
            };
        }

        // Use AI-selected report
        const selectedReport = reports.find(r => r.id === aiSelection.selectedReport!.id);
        if (!selectedReport) {
            throw new Error('AI selected a report that does not exist in the valid reports list');
        }

        const duration = (new Date(selectedReport.meetingEndDateTime).getTime() - 
                         new Date(selectedReport.meetingStartDateTime).getTime()) / 1000;

        return {
            reportId: selectedReport.id,
            confidence: aiSelection.selectedReport.confidence,
            reason: aiSelection.selectedReport.reason,
            duration
        };
    }
} 